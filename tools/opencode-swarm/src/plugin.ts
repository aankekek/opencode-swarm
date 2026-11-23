import { Plugin } from "@opencode/plugin";

type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { startBoardServer, type BoardServerHandle } from "./board-server.js";
import { SWARM_RPC_DEF, type SwarmChangedEvent, type UninstallSelection } from "./rpc.js";
import { openSqliteDatabase, SwarmBoardDB } from "./db.js";
import { formatModelSpec, listAvailableModels, parseModelSpec, resolveAndValidateModel } from "./models.js";
import { startStallMonitor } from "./monitor.js";
import { buildRolePermissions, evaluateActionForMember, SHELL_TOOLS, WRITE_TOOLS } from "./policy.js";
import { buildMemberOpeningPrompt, COORDINATOR_PROTOCOL } from "./prompts.js";
import { createRpcHandlers } from "./rpc-handlers.js";
import { extractTargetPaths, normalizeHandle, tightenEffect, validateMemberName } from "./security.js";
import { registerSwarmTools } from "./tools.js";
import type {
  BoardPostRow,
  CachedCall,
  MemberRole,
  MemberRow,
  ModelSelection,
  PluginOptions,
  WorkspaceMode,
} from "./types.js";
import { createWakeController, type WaiterEntry } from "./wake.js";
import { cleanupMemberWorkspace, provisionMemberWorkspace } from "./workspace.js";

const IS_WINDOWS = process.platform === "win32";

function toolJson(payload: unknown): { content: string } {
  return { content: JSON.stringify(payload, null, 2) };
}

function isQuotaOrRateLimitError(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  return /(429|quota|rate[\s_-]?limit|insufficient_quota|usage limit|resource_exhausted)/i.test(text);
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function cloneToolInput(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return undefined;
  try {
    return structuredClone(input) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    } catch {
      return { ...(input as Record<string, unknown>) };
    }
  }
}

const activePluginInstances = new Map<string, () => Promise<void>>();

export const swarmRuntimePlugin = Plugin.define({
  id: "local.opencode-swarm",

  async setup(ctx: Context) {
    const workspaceRoot = resolve(ctx.location.directory);
    const canonicalWorkspaceRoot = existsSync(workspaceRoot) ? realpathSync(workspaceRoot) : workspaceRoot;

    const options = (ctx.options ?? {}) as PluginOptions;
    const stallTimeoutMs = options.stallTimeoutMs ?? 180_000;
    const monitorIntervalMs = options.monitorIntervalMs ?? 30_000;
    const debugEvents = options.debugEvents ?? false;
    const debugHooks = options.debugHooks ?? false;
    let autoSpawnVerifier = options.autoSpawnVerifier !== false;

    const repoHash = createHash("sha256")
      .update(IS_WINDOWS ? canonicalWorkspaceRoot.toLowerCase() : canonicalWorkspaceRoot)
      .digest("hex")
      .slice(0, 12);
    const dataDir = options.dbPath
      ? dirname(resolve(options.dbPath))
      : join(homedir(), ".opencode-swarm", repoHash);
    const dbPath = options.dbPath ? resolve(options.dbPath) : join(dataDir, "board.db");
    const instanceKey = IS_WINDOWS ? dbPath.toLowerCase() : dbPath;
    if (activePluginInstances.has(instanceKey)) {
      const prevCleanup = activePluginInstances.get(instanceKey)!;
      activePluginInstances.delete(instanceKey);
      console.warn(
        `[opencode-swarm] Duplicate plugin load detected for ${canonicalWorkspaceRoot}; disposing previous instance.`,
      );
      try {
        await prevCleanup();
      } catch (err) {
        console.warn("[opencode-swarm] Error disposing previous instance:", err);
      }
    }
    mkdirSync(dataDir, { recursive: true });

    const roleModelsPath = options.dbPath
      ? join(dataDir, "role-models.json")
      : join(homedir(), ".opencode-swarm", "role-models.json");
    mkdirSync(dirname(roleModelsPath), { recursive: true });

    const VALID_ROLE_KEYS = new Set<MemberRole>(["coordinator", "worker", "verifier", "monitor"]);
    const roleModels: Partial<Record<MemberRole, string>> = {};
    try {
      if (existsSync(roleModelsPath)) {
        const parsed = JSON.parse(readFileSync(roleModelsPath, "utf8")) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (VALID_ROLE_KEYS.has(k as MemberRole) && typeof v === "string" && v.trim()) {
              roleModels[k as MemberRole] = v.trim();
            }
          }
        }
      }
    } catch {
      // Ignore missing or malformed role-models.json
    }
    if (options.roleModels) {
      for (const [k, v] of Object.entries(options.roleModels)) {
        if (VALID_ROLE_KEYS.has(k as MemberRole) && typeof v === "string" && v.trim()) {
          roleModels[k as MemberRole] = v.trim();
        }
      }
    }

    function persistRoleModels() {
      const tmpPath = `${roleModelsPath}.${process.pid}.${Date.now()}.tmp`;
      try {
        writeFileSync(tmpPath, JSON.stringify(roleModels, null, 2), "utf8");
        renameSync(tmpPath, roleModelsPath);
      } catch (err) {
        console.warn("[opencode-swarm] Failed to persist role-models.json:", err);
        try {
          writeFileSync(roleModelsPath, JSON.stringify(roleModels, null, 2), "utf8");
        } catch {
          // Ignore fallback write error
        }
      }
    }

    const eventDebugLogPath = join(dataDir, "events.debug.jsonl");
    const hookDebugLogPath = join(dataDir, "hooks.debug.jsonl");

    function logDebug(filePath: string, record: Record<string, unknown>) {
      try {
        appendFileSync(filePath, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n", "utf8");
      } catch {
        // Ignore debug write errors
      }
    }

    const sqlite = await openSqliteDatabase(dbPath);
    const db = new SwarmBoardDB(sqlite, dataDir);
    let dbClosed = false;
    let boardServerClosed = false;

    const reconciled = db.reconcileStaleSwarmsOnStartup();
    if (reconciled.length > 0) {
      console.warn(
        `[opencode-swarm] Reconciled ${reconciled.length} stale swarm(s) on startup (${reconciled.map((s) => s.id).join(", ")}); all locks released.`,
      );
      // SEC-H7: Clear/restore session permissions for the current session if it was part of reconciled swarms
      try {
        const anyCtx = ctx as unknown as { sessionID?: string };
        if (anyCtx.sessionID) {
          await ctx.session.update({
            sessionID: anyCtx.sessionID,
            permissions: [],
          });
        }
      } catch {
        // Ignore if unsupported or sessionID not present
      }
    }

    // Bounded call-ID cache bridging tool.execute.before -> permission.evaluate
    const pendingCalls = new Map<string, CachedCall>();
    const MAX_PENDING_CALLS = 500;
    function cachePendingCall(callId: string, entry: CachedCall) {
      if (pendingCalls.size >= MAX_PENDING_CALLS) {
        const cutoff = Date.now() - 10 * 60_000;
        for (const [k, v] of pendingCalls) {
          if (v.ts < cutoff) pendingCalls.delete(k);
        }
        // If still at capacity, drop the oldest entry
        if (pendingCalls.size >= MAX_PENDING_CALLS) {
          const firstKey = pendingCalls.keys().next().value;
          if (firstKey) pendingCalls.delete(firstKey);
        }
      }
      pendingCalls.set(callId, entry);
    }

    // Waiter resolvers for swarm_wait(since, mentions_only)
    const waiters = new Map<string, WaiterEntry>();
    const spawningMembers = new Set<string>();
    const memberSwitchLocks = new Map<string, Promise<unknown>>();
    const activeToolCounts = new Map<string, number>();
    const quiesceResolvers = new Map<string, Array<() => void>>();
    const pendingKillCleanup = new Map<string, () => void>();

    function notifySessionQuiesced(sessionId: string) {
      const resolvers = quiesceResolvers.get(sessionId);
      if (resolvers) {
        quiesceResolvers.delete(sessionId);
        for (const fn of resolvers) fn();
      }
      const deferred = pendingKillCleanup.get(sessionId);
      if (deferred) {
        pendingKillCleanup.delete(sessionId);
        try {
          deferred();
        } catch {
          // Ignore deferred cleanup error
        }
      }
    }

    function incrementActiveTool(sessionId: string) {
      activeToolCounts.set(sessionId, (activeToolCounts.get(sessionId) ?? 0) + 1);
    }

    function decrementActiveTool(sessionId: string) {
      const cur = activeToolCounts.get(sessionId) ?? 0;
      if (cur <= 1) {
        activeToolCounts.delete(sessionId);
        notifySessionQuiesced(sessionId);
      } else {
        activeToolCounts.set(sessionId, cur - 1);
      }
    }

    function clearActiveTools(sessionId: string) {
      if (activeToolCounts.has(sessionId) || pendingKillCleanup.has(sessionId) || quiesceResolvers.has(sessionId)) {
        activeToolCounts.delete(sessionId);
        notifySessionQuiesced(sessionId);
      }
    }

    function waitForQuiesce(sessionId: string, timeoutMs = 400): Promise<boolean> {
      if ((activeToolCounts.get(sessionId) ?? 0) === 0) return Promise.resolve(true);
      return new Promise<boolean>((resolveWait) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolveWait((activeToolCounts.get(sessionId) ?? 0) === 0);
        }, timeoutMs);
        const list = quiesceResolvers.get(sessionId) ?? [];
        list.push(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolveWait(true);
        });
        quiesceResolvers.set(sessionId, list);
      });
    }

    function resolveWaiterAborted(memberId: string) {
      const w = waiters.get(memberId);
      if (w) {
        waiters.delete(memberId);
        w.resolve({ posts: [], aborted: true });
      }
    }

    function abortAllWaiters() {
      for (const memberId of Array.from(waiters.keys())) {
        resolveWaiterAborted(memberId);
      }
      waiters.clear();
    }

    async function getSessionModel(sessionId: string): Promise<ModelSelection | undefined> {
      try {
        const info = await ctx.session.get({ sessionID: sessionId });
        if (info?.model?.providerID && info?.model?.id) {
          return {
            providerID: info.model.providerID,
            id: info.model.id,
            ...(info.model.variant ? { variant: info.model.variant } : {}),
          };
        }
      } catch {
        // Ignore
      }
      return undefined;
    }

    async function ensureCoordinator(sessionId: string, title = "Swarm"): Promise<{ swarmId: string; coordinator: MemberRow }> {
      const existing = db.getActiveMemberBySession(sessionId);
      if (existing) {
        return { swarmId: existing.swarm_id, coordinator: existing };
      }
      const sessionModel = await getSessionModel(sessionId);
      // Manual coordinator default (e.g. a durable $60+ tier). The coordinator is the
      // caller's own session, so apply the pick by switching that session's model.
      let model = sessionModel;
      const coordinatorSpec = roleModels.coordinator;
      if (coordinatorSpec) {
        try {
          model = await resolveAndValidateModel(ctx, coordinatorSpec, undefined, sessionModel);
        } catch (err) {
          console.warn(
            `[opencode-swarm] Ignoring invalid roleModels.coordinator "${coordinatorSpec}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      const created = db.createSwarmWithCoordinator({
        title,
        objective: title,
        coordinatorSessionId: sessionId,
        workspaceDir: canonicalWorkspaceRoot,
        model,
      });
      emitSwarmChanged({ swarmId: created.swarm.id, reason: "swarm_created", summary: title });
      const changedModel =
        !!model &&
        !!sessionModel &&
        (sessionModel.providerID !== model.providerID ||
          sessionModel.id !== model.id ||
          (sessionModel.variant ?? undefined) !== (model.variant ?? undefined));
      if (model && (changedModel || !sessionModel)) {
        try {
          await ctx.session.switchModel({
            sessionID: sessionId,
            model: {
              providerID: model.providerID,
              id: model.id,
              ...(model.variant ? { variant: model.variant } : {}),
            },
          });
        } catch (err) {
          console.warn(
            `[opencode-swarm] Could not switch coordinator model to ${model.providerID}/${model.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      // Apply coordinator permissions to current session
      try {
        await ctx.session.update({
          sessionID: sessionId,
          permissions: buildRolePermissions("coordinator", options),
        });
      } catch {
        // Ignore if session update unsupported
      }
      return { swarmId: created.swarm.id, coordinator: created.coordinator };
    }

    type RpcReg = {
      dispose?: () => Promise<void> | void;
      events?: { emit?: (event: string, payload: unknown) => void };
    };
    let rpcReg: RpcReg | undefined;
    const emitSwarmChanged = (event: SwarmChangedEvent) => {
      try {
        void Promise.resolve(rpcReg?.events?.emit?.("changed", event)).catch(() => {});
      } catch {
        // Ignore if host runtime does not expose events.emit
      }
    };

    const wake = createWakeController({
      db,
      getAutoSpawnVerifier: () => autoSpawnVerifier,
      waiters,
      promptSession: (args) => ctx.session.prompt(args),
      emitSwarmChanged,
      spawnVerifier: (args) =>
        spawnSingleMember({
          ...args,
          role: "verifier",
          workspace: "inherit",
          channels: ["main"],
        }),
    });
    const { maybeWakeIdleCoordinator, postToBoard } = wake;

    async function switchMemberModelInPlace(
      swarmId: string,
      memberName: string,
      modelInput?: string,
      variantInput?: string,
      opts?: { interruptAndRerunIfWorking?: boolean },
    ) {
      const lockKey = `${swarmId}:${memberName}`;
      const prev = memberSwitchLocks.get(lockKey) ?? Promise.resolve();
      const next = prev
        .catch(() => {})
        .then(async () => {
          const target = db.getMemberByName(swarmId, memberName);
          if (!target) throw new Error(`Member "@${memberName}" not found in swarm "${swarmId}".`);
          if (target.state === "killed") throw new Error(`Cannot switch model of killed member "@${memberName}".`);
          const wasWorking = target.state === "working";
          const wasPausedQuota = target.paused_quota === 1;
          if (wasWorking && !opts?.interruptAndRerunIfWorking) {
            throw new Error(`Member "@${memberName}" is currently working. Wait until it is waiting before switching models.`);
          }

          const currentModel: ModelSelection | undefined =
            target.model_provider && target.model_id
              ? {
                  providerID: target.model_provider,
                  id: target.model_id,
                  ...(target.model_variant ? { variant: target.model_variant } : {}),
                }
              : await getSessionModel(target.session_id);

          const resolved = await resolveAndValidateModel(ctx, modelInput, variantInput, currentModel);
          if (!resolved) {
            throw new Error(`No model or variant specified for "@${memberName}".`);
          }

          if (wasWorking && opts?.interruptAndRerunIfWorking) {
            await ctx.session.interrupt({ sessionID: target.session_id }).catch(() => {});
          }

          await ctx.session.switchModel({
            sessionID: target.session_id,
            model: {
              providerID: resolved.providerID,
              id: resolved.id,
              ...(resolved.variant ? { variant: resolved.variant } : {}),
            },
          });
          db.setMemberModel(target.id, resolved);

          const shouldRerun = Boolean(opts?.interruptAndRerunIfWorking && (wasWorking || wasPausedQuota) && target.role !== "coordinator");
          if (shouldRerun) {
            const rerunPrompt = [
              `[SWARM MODEL SWITCHED for @${target.name} — Swarm ${target.swarm_id}]`,
              `Your model was changed to ${formatModelSpec(resolved)}.`,
              `Immediately rerun/resume your current assignment and report via \`post_message\`:`,
              ``,
              target.brief || "Continue your assigned swarm task.",
            ].join("\n");
            db.setMemberState(target.id, "working");
            await ctx.session.prompt({
              sessionID: target.session_id,
              text: rerunPrompt,
              delivery: "queue",
            });
          }

          emitSwarmChanged({
            swarmId: target.swarm_id,
            reason: "member_model_changed",
            handle: target.name,
          });

          return {
            name: target.name,
            model: formatModelSpec(resolved),
            preserved_history: true,
            rerun: shouldRerun,
          };
        });
      memberSwitchLocks.set(lockKey, next);
      try {
        return await next;
      } finally {
        if (memberSwitchLocks.get(lockKey) === next) {
          memberSwitchLocks.delete(lockKey);
        }
      }
    }

    async function spawnSingleMember(args: {
      swarmId: string;
      caller: MemberRow;
      name: string;
      role: MemberRole;
      brief: string;
      model?: string;
      variant?: string;
      workspace?: WorkspaceMode;
      fork?: string;
      channels?: string[];
      ownedGlobs?: string[];
      groupPrefix?: string | null;
    }) {
      const cleanName = validateMemberName(args.name, args.role);
      const spawnKey = `${args.swarmId}:${cleanName}`;
      if (spawningMembers.has(spawnKey)) {
        throw new Error(`Member "@${cleanName}" is already being spawned in swarm "${args.swarmId}".`);
      }
      spawningMembers.add(spawnKey);

      let provisioned: { mode: WorkspaceMode; dir: string; branch: string | null } | undefined;
      let insertedMember: MemberRow | undefined;
      let childSessionId: string | undefined;

      try {
        const existing = db.getMemberByName(args.swarmId, cleanName);
        if (existing) {
          throw new Error(
            `Member "@${cleanName}" already exists in swarm "${args.swarmId}" (state: ${existing.state}). Killed names cannot be reused.`,
          );
        }

        const wsMode: WorkspaceMode = args.workspace ?? "inherit";
        const ownedGlobs = args.role === "worker" ? (args.ownedGlobs ?? []) : [];
        if (wsMode !== "inherit" && ownedGlobs.length > 0) {
          throw new Error(
            `owned_globs is only supported in workspace:"inherit" mode (got workspace:"${wsMode}" for @${cleanName}).`,
          );
        }

        // Validate model & fork target BEFORE provisioning workspace/git branches
        const roleDefaultSpec = roleModels[args.role];
        const roleDefault = roleDefaultSpec ? parseModelSpec(roleDefaultSpec) : undefined;
        const callerModel: ModelSelection | undefined =
          args.caller.model_provider && args.caller.model_id
            ? {
                providerID: args.caller.model_provider,
                id: args.caller.model_id,
                ...(args.caller.model_variant ? { variant: args.caller.model_variant } : {}),
              }
            : await getSessionModel(args.caller.session_id);

        const fallbackModel =
          roleDefault?.providerID && roleDefault?.id
            ? (roleDefault as ModelSelection)
            : callerModel;

        const resolvedModel = await resolveAndValidateModel(ctx, args.model, args.variant, fallbackModel);

        if (args.fork) {
          if (args.caller.role !== "coordinator") {
            throw new Error(`Only @coordinator may fork conversations.`);
          }
          if (args.fork === "coordinator") {
            throw new Error(`Forking coordinator context is not permitted.`);
          }
          const forkTarget = db.getMemberByName(args.swarmId, args.fork);
          if (!forkTarget) {
            throw new Error(`Fork target "${args.fork}" not found in swarm "${args.swarmId}".`);
          }
          if (forkTarget.role === "coordinator") {
            throw new Error(`Forking coordinator context is not permitted.`);
          }
          const forkFn = (ctx.session as unknown as { fork?: (args: { sessionID: string }) => Promise<{ id: string }> }).fork;
          if (typeof forkFn !== "function") {
            throw new Error(`ctx.session.fork is not available in this OpenCode runtime.`);
          }
          provisioned = provisionMemberWorkspace({
            mode: wsMode,
            repoRoot: canonicalWorkspaceRoot,
            dataDir,
            swarmId: args.swarmId,
            memberName: cleanName,
          });
          const forked = await forkFn({ sessionID: forkTarget.session_id });
          childSessionId = forked.id;
        } else {
          provisioned = provisionMemberWorkspace({
            mode: wsMode,
            repoRoot: canonicalWorkspaceRoot,
            dataDir,
            swarmId: args.swarmId,
            memberName: cleanName,
          });
          const created = await ctx.session.create({
            title: `[swarm:${args.swarmId}] @${cleanName}`,
            location: { directory: provisioned.dir },
            permissions: buildRolePermissions(args.role, options),
            ...(resolvedModel
              ? {
                  model: {
                    providerID: resolvedModel.providerID,
                    id: resolvedModel.id,
                    ...(resolvedModel.variant ? { variant: resolvedModel.variant } : {}),
                  },
                }
              : {}),
          });
          childSessionId = created.id;
        }

        const channels = args.channels && args.channels.length > 0 ? args.channels : ["main"];
        const latestPost = db.getLatestPost(args.swarmId);
        insertedMember = db.insertMember({
          swarmId: args.swarmId,
          name: cleanName,
          sessionId: childSessionId,
          role: args.role,
          addedBy: args.caller.name,
          groupPrefix: args.groupPrefix ?? null,
          model: resolvedModel,
          workspaceMode: wsMode,
          workspaceDir: provisioned.dir,
          workspaceBranch: provisioned.branch,
          brief: args.brief,
          state: "working",
          lastReadSeq: latestPost?.swarm_seq ?? 0,
          channels,
        });

        if (ownedGlobs.length > 0) {
          const lockRes = db.claimLocksAtomic(args.swarmId, insertedMember.id, cleanName, ownedGlobs);
          if (lockRes.conflicts.length > 0) {
            throw new Error(
              `File-lock conflict for @${cleanName}: ${lockRes.conflicts
                .map((c) => `${c.requested} overlaps ${c.existing} (@${c.owner})`)
                .join("; ")}`,
            );
          }
        }

        const primaryChannel = channels[0] ?? "main";
        const spawnPost = await postToBoard(
          args.swarmId,
          args.caller.name,
          primaryChannel,
          `@${cleanName} ${args.brief}`,
          new Set([insertedMember.id]),
        );
        wake.recordWakeSeq(insertedMember.id, spawnPost.swarm_seq);
        db.advanceReadCursor(insertedMember.id, spawnPost.swarm_seq);
        emitSwarmChanged({ swarmId: args.swarmId, reason: "member_spawned", handle: cleanName });

        const openingPrompt = buildMemberOpeningPrompt({
          swarmId: args.swarmId,
          name: cleanName,
          role: args.role,
          brief: args.brief,
          workspaceMode: wsMode,
          workspaceDir: provisioned.dir,
          ownedGlobs,
          channels,
        });

        await ctx.session.prompt({
          sessionID: childSessionId,
          text: openingPrompt,
          delivery: "queue",
        });

        return insertedMember;
      } catch (err) {
        if (childSessionId) {
          await ctx.session.interrupt({ sessionID: childSessionId }).catch(() => {});
          const sessionApi = ctx.session as unknown as {
            remove?: (a: { sessionID: string }) => Promise<unknown>;
            delete?: (a: { sessionID: string }) => Promise<unknown>;
          };
          await (sessionApi.remove?.({ sessionID: childSessionId }) ?? sessionApi.delete?.({ sessionID: childSessionId }))?.catch?.(() => {});
        }
        if (insertedMember) {
          db.setMemberState(insertedMember.id, "killed");
          db.releaseLocksForMember(insertedMember.id);
        }
        if (provisioned) {
          cleanupMemberWorkspace({
            mode: provisioned.mode,
            dir: provisioned.dir,
            branch: provisioned.branch,
            repoRoot: canonicalWorkspaceRoot,
            deleteBranch: true,
          });
        }
        throw err;
      } finally {
        spawningMembers.delete(spawnKey);
      }
    }

    // Start Swarm Board web server (if enabled)
    let boardServer: BoardServerHandle | undefined;
    if (options.boardServer !== false) {
      try {
        boardServer = await startBoardServer(
          {
            db,
            getAvailableModels: () => listAvailableModels(ctx, { all: false }),
            switchMemberModel: (swarmId, memberName, model, variant) =>
              switchMemberModelInPlace(swarmId, memberName, model, variant, { interruptAndRerunIfWorking: true }),
            setRoleModelDefault: (role, spec) => {
              roleModels[role] = spec;
              persistRoleModels();
            },
            getRoleModelDefaults: () => ({ ...roleModels }),
          },
          options.boardPort ?? 0,
        );
      } catch (err) {
        console.warn("[opencode-swarm] Failed to start board server:", err);
      }
    }

    const getBoardUrl = () => (boardServer && !boardServerClosed && boardServer.isAlive() ? boardServer.url : "");

    let rpcCleanup: (() => Promise<void> | void) | undefined;
    try {
      const rpcHandlers = createRpcHandlers({
        ctx,
        db,
        isDbClosed: () => dbClosed,
        getBoardUrl,
        getBoardToken: () => boardServer?.token ?? "",
        canonicalWorkspaceRoot,
        roleModels,
        persistRoleModels,
        getAutoSpawnVerifier: () => autoSpawnVerifier,
        setAutoSpawnVerifier: (enabled) => {
          autoSpawnVerifier = enabled;
        },
        emitSwarmChanged,
        resolveWaiterAborted,
        waitForQuiesce,
        pendingKillCleanup,
        switchMemberModelInPlace,
        beforeUninstallRuntimeDataDelete: async () => {
          stopMonitor();
          abortController.abort();
          pendingCalls.clear();
          abortAllWaiters();
          wake.clearCoordinatorWakeSeq();
          if (!dbClosed) {
            for (const activeSwarm of db.getActiveSwarms()) {
              for (const m of db.listMembers(activeSwarm.id, false)) {
                try {
                  await ctx.session.interrupt({ sessionID: m.session_id });
                } catch {
                  // Ignore
                }
              }
              db.releaseAllLocksForSwarm(activeSwarm.id);
            }
          }
          if (boardServer && !boardServerClosed) {
            boardServerClosed = true;
            await boardServer.close().catch(() => {});
          }
          if (!dbClosed) {
            dbClosed = true;
            try {
              db.close();
            } catch {
              // Ignore
            }
          }
        },
      });
      rpcReg = await (ctx as unknown as {
        rpc?: {
          register?: (
            def: unknown,
            handlers: Record<string, (args?: Record<string, unknown>) => Promise<unknown>>,
          ) => Promise<RpcReg | void>;
        };
      }).rpc?.register?.(SWARM_RPC_DEF, rpcHandlers) ?? undefined;
      if (rpcReg && typeof rpcReg === "object" && "dispose" in rpcReg && typeof rpcReg.dispose === "function") {
        rpcCleanup = () => rpcReg!.dispose!();
      }
    } catch (err) {
      console.warn("[opencode-swarm] Failed to register RPC domain:", err);
    }

    // -----------------------------------------------------------------------
    // 1. Register 4 Antigravity Core Tools: swarm, post_message, read_board, swarm_wait
    // -----------------------------------------------------------------------
    await registerSwarmTools(ctx, {
      db,
      canonicalWorkspaceRoot,
      roleModels,
      waiters,
      pendingKillCleanup,
      getBoardUrl,
      emitSwarmChanged,
      ensureCoordinator,
      spawnSingleMember,
      switchMemberModelInPlace,
      postToBoard,
      maybeWakeIdleCoordinator,
      getLastWakeSeq: wake.getLastWakeSeq,
      recordWakeSeq: wake.recordWakeSeq,
      resolveWaiterAborted,
      waitForQuiesce,
    });

    // -----------------------------------------------------------------------
    // 2. Register V2 Slash Commands: /swarm and /swarm-models
    // -----------------------------------------------------------------------
    await ctx.command.transform((cmds) => {
      cmds.add({
        name: "swarm",
        description: "Start a 1:1 Antigravity-style parallel swarm with manual model/variant control.",
        async execute(invocation) {
          const rawPrompt = invocation.prompt as unknown;
          const text =
            typeof rawPrompt === "string"
              ? rawPrompt
              : rawPrompt && typeof rawPrompt === "object" && "text" in rawPrompt
                ? String((rawPrompt as { text?: unknown }).text ?? "")
                : JSON.stringify(rawPrompt ?? "");
          const cleanTitle = text.trim().split(/\r?\n/)[0]?.slice(0, 64) || "Swarm";
          try {
            await ensureCoordinator(invocation.sessionID, cleanTitle);
          } catch {
            // Ignore if session already belongs to an active swarm or cannot initialize yet
          }
          await ctx.session.prompt({
            sessionID: invocation.sessionID,
            text: `${COORDINATOR_PROTOCOL}\n\nUser request:\n${text}`,
            delivery: invocation.delivery,
          });
        },
      });

      cmds.add({
        name: "swarm-models",
        description: "List available models & variants or manually assign role/member models.",
        async execute(invocation) {
          const catalog = await listAvailableModels(ctx, { all: false });
          const lines = [
            `Available Models & Variants (manual pick):`,
            ...catalog.models.map(
              (m) => `- ${m.spec}${m.variants.length > 0 ? ` [variants: ${m.variants.join(", ")}]` : ""}`,
            ),
          ];
          await ctx.session.synthetic({
            sessionID: invocation.sessionID,
            text: lines.join("\n"),
          });
        },
      });
    });

    // -----------------------------------------------------------------------
    // 3. Tool Execute Hook (Call-ID Cache + Defense-in-Depth)
    // -----------------------------------------------------------------------
    await ctx.tool.hook("execute.before", async (event) => {
      const toolName = String(event.tool ?? "").toLowerCase();
      if (event.id) {
        cachePendingCall(event.id, {
          tool: toolName,
          input: cloneToolInput(event.input),
          sessionID: event.sessionID,
          ts: Date.now(),
        });
      }

      if (debugHooks) {
        logDebug(hookDebugLogPath, {
          hook: "tool.execute.before",
          id: event.id,
          tool: toolName,
          sessionID: event.sessionID,
        });
      }

      if (db.getActiveSwarms().length === 0) return;

      // SEC-M4: Fail closed without sessionID when swarms are active
      if (!event.sessionID) {
        if (WRITE_TOOLS.has(toolName) || SHELL_TOOLS.has(toolName)) {
          throw new Error(`[SWARM] Blocked '${toolName}': missing sessionID while active swarm is running.`);
        }
        return;
      }

      const member = db.getMemberForActiveSwarmPolicy(event.sessionID);
      // SEC-M3: If session is not part of swarm, only enforce if it is attempting write or shell in the workspace
      if (!member) {
        return;
      }

      if (member.state === "killed") {
        throw new Error(`[SWARM] Blocked '${toolName}': @${member.name} has been killed.`);
      }
      if (WRITE_TOOLS.has(toolName) || SHELL_TOOLS.has(toolName)) {
        incrementActiveTool(event.sessionID);
      }

      // SEC-H3: For read-only roles, deny write and shell tools or any unapproved tool
      const isReadOnlyRole = member.role === "verifier" || member.role === "monitor" || member.role === "narrator";
      const isKnownWrite = WRITE_TOOLS.has(toolName);
      const isKnownShell = SHELL_TOOLS.has(toolName);

      if (isReadOnlyRole) {
        if (isKnownWrite || isKnownShell || toolName.includes("write") || toolName.includes("edit") || toolName.includes("exec")) {
          const swarm = db.getSwarm(member.swarm_id);
          if (swarm) {
            const targets = extractTargetPaths(toolName, event.input);
            const verdict = evaluateActionForMember(db, canonicalWorkspaceRoot, member, swarm, toolName, targets, options);
            if (verdict.decision === "deny") {
              throw new Error(verdict.reason ?? `[SWARM] Blocked '${toolName}' for read-only @${member.name}.`);
            }
          }
        }
        return;
      }

      if (!isKnownWrite && !isKnownShell) return;

      const swarm = db.getSwarm(member.swarm_id);
      if (!swarm) return;

      const targets = extractTargetPaths(toolName, event.input);
      const verdict = evaluateActionForMember(db, canonicalWorkspaceRoot, member, swarm, toolName, targets, options);
      if (verdict.decision === "deny") {
        throw new Error(verdict.reason ?? `[SWARM] Blocked '${toolName}' for @${member.name}.`);
      }
    });

    // -----------------------------------------------------------------------
    // 4. Permission Evaluate Hook (In-Place Mutation)
    // -----------------------------------------------------------------------
    await ctx.permission.hook("evaluate", async (event) => {
      const action = String(event.action ?? "").toLowerCase();
      if (action !== "edit" && action !== "shell" && action !== "external_directory") return;

      const effectBefore = event.effect;
      if (db.getActiveSwarms().length === 0) return;

      const source = event.source as { id?: string } | undefined;
      const callId = typeof source?.id === "string" ? source.id : undefined;
      const cached = callId ? pendingCalls.get(callId) : undefined;
      const sessionId = event.sessionID || cached?.sessionID;

      let reason: string | undefined;
      if (!sessionId) {
        event.effect = tightenEffect(event.effect, "deny");
        reason = "[SWARM FAIL-CLOSED] permission.evaluate had no sessionID while a swarm is active.";
      } else {
        const member = db.getMemberForActiveSwarmPolicy(sessionId);
        if (!member) {
          // If session is unregistered, fail closed for actions within active swarms
          event.effect = tightenEffect(event.effect, "deny");
          reason = "[SWARM] Denied action from unregistered session while an active swarm is running.";
        } else {
          const swarm = db.getSwarm(member.swarm_id);
          if (swarm) {
            const targetSet = new Set<string>([
              ...(event.resources ?? []),
              ...(cached ? extractTargetPaths(cached.tool, cached.input) : []),
            ]);
            const verdict = evaluateActionForMember(
              db,
              canonicalWorkspaceRoot,
              member,
              swarm,
              action,
              Array.from(targetSet),
              options,
            );

            // Shell override support:
            // when action === "shell" and the member's resolved shell policy is "allow"
            // AND overrideShellAllow === true (for live non-killed members), explicitly set event.effect = "allow",
            // while keeping edit and external_directory strictly fenced via tightenEffect.
            const overrideShell = options.overrideShellAllow ?? true;
            if (
              action === "shell" &&
              overrideShell &&
              event.effect !== "deny" &&
              verdict.decision === "allow" &&
              member.state !== "killed" &&
              member.state !== "stopped" &&
              member.paused_quota !== 1
            ) {
              event.effect = "allow";
            } else {
              event.effect = tightenEffect(event.effect, verdict.decision);
            }
            reason = verdict.reason;
          }
        }
      }

      if (reason && event.effect === "deny") {
        event.message = reason;
      }

      if (debugHooks) {
        logDebug(hookDebugLogPath, {
          hook: "permission.evaluate",
          action,
          callId: callId ?? null,
          hasCachedInput: Boolean(cached),
          sessionId: sessionId ?? null,
          resources: event.resources,
          effectBefore,
          effectAfter: event.effect,
          reason: reason ?? null,
        });
      }
    });

    // -----------------------------------------------------------------------
    // 5. Compaction Hook
    // -----------------------------------------------------------------------
    await ctx.session.hook("compaction", async (event) => {
      const member = db.getActiveMemberBySession(event.sessionID);
      if (!member) return;
      const locks = db
        .listLocks(member.swarm_id)
        .filter((l) => l.owner_member_id === member.id)
        .map((l) => l.glob_pattern);
      const modelSpec = formatModelSpec(
        member.model_provider && member.model_id
          ? { providerID: member.model_provider, id: member.model_id, variant: member.model_variant ?? undefined }
          : undefined,
      );
      event.system.push({
        type: "text",
        text: `Preserve in compaction summary: Swarm=${member.swarm_id}, Member=@${member.name}, Role=${member.role}, Model=${modelSpec}, Workspace=${member.workspace_mode}:${member.workspace_dir}, OwnedGlobs=[${locks.join(", ")}], LastReadSeq=${member.last_read_seq}.`,
      });
    });

    // -----------------------------------------------------------------------
    // 6. Event Stream Consumer
    // -----------------------------------------------------------------------
    const abortController = new AbortController();
    void (async () => {
      let backoffMs = 250;
      while (!abortController.signal.aborted) {
        try {
          const stream = ctx.event.subscribe({ signal: abortController.signal });
          backoffMs = 250;
          for await (const rawEvent of stream) {
            if (abortController.signal.aborted) break;
            try {
              if (debugEvents) logDebug(eventDebugLogPath, { event: rawEvent });

              const ev = rawEvent as unknown as { type?: string; data?: Record<string, unknown> };
              const eventType = String(ev.type ?? "");
              const data = ev.data ?? {};
              const sessionId = typeof data.sessionID === "string" ? data.sessionID : undefined;
              if (!sessionId) continue;

              if (eventType === "session.tool.success" || eventType === "session.tool.failed") {
                decrementActiveTool(sessionId);
              } else if (
                eventType === "session.idle" ||
                eventType === "session.execution.succeeded" ||
                eventType === "session.execution.interrupted" ||
                eventType === "session.execution.failed" ||
                eventType === "session.deleted" ||
                (eventType === "session.status" &&
                  (data.status as { type?: string } | undefined)?.type === "idle")
              ) {
                clearActiveTools(sessionId);
              }

              const member = db.getActiveMemberBySession(sessionId);
              if (!member) continue;

              if (eventType === "session.status") {
                const statusObj = data.status as { type?: string; message?: string } | undefined;
                if (statusObj?.type === "idle") {
                  db.setMemberState(member.id, "waiting", { activity: null, pausedQuota: false });
                  emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
                  await maybeWakeIdleCoordinator(member.swarm_id);
                } else if (statusObj?.type === "busy") {
                  db.setMemberState(member.id, "working", { pausedQuota: false });
                  emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
                } else if (statusObj?.type === "retry") {
                  if (isQuotaOrRateLimitError(statusObj.message ?? data)) {
                    db.setMemberState(member.id, "waiting", {
                      activity: null,
                      error: "Quota/rate limit reached",
                      pausedQuota: true,
                    });
                    emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
                  }
                }
              } else if (eventType === "session.execution.started") {
                db.setMemberState(member.id, "working", { pausedQuota: false });
                emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
              } else if (eventType === "session.idle" || eventType === "session.execution.succeeded") {
                db.setMemberState(member.id, "waiting", { activity: null, pausedQuota: false });
                emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
                await maybeWakeIdleCoordinator(member.swarm_id);
              } else if (eventType === "session.execution.interrupted") {
                db.setMemberState(member.id, "stopped", { activity: null });
                emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
              } else if (eventType === "session.execution.failed") {
                const isQuota = isQuotaOrRateLimitError(data.error ?? data);
                db.setMemberState(member.id, "waiting", {
                  activity: null,
                  error: isQuota ? "Quota/rate limit reached" : String(data.error ?? "Execution failed"),
                  pausedQuota: isQuota,
                });
                emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
              } else if (eventType === "session.step.started") {
                db.incrementMemberSteps(member.id, "Thinking...");
              } else if (eventType === "session.tool.called") {
                const toolLabel = pendingCalls.get(String(data.id))?.tool ?? String(data.tool ?? "tool");
                db.incrementMemberSteps(member.id, `Running ${toolLabel}`, "tool");
              } else if (eventType === "session.deleted") {
                db.setMemberState(member.id, "killed");
                db.releaseLocksForMember(member.id);
                emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
              }
            } catch (evErr) {
              console.warn("[opencode-swarm] Event handler error:", evErr);
            }
          }
          // Stream ended cleanly (e.g. test mock or graceful shutdown)
          break;
        } catch (err) {
          if (abortController.signal.aborted) break;
          console.warn("[opencode-swarm] Event stream error, resubscribing:", err);
          await new Promise<void>((resolveDelay) => {
            const t = setTimeout(resolveDelay, backoffMs);
            abortController.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                resolveDelay();
              },
              { once: true },
            );
          });
          backoffMs = Math.min(backoffMs * 2, 5000);
        }
      }
    })();

    // -----------------------------------------------------------------------
    // 7. Stall Monitor
    // -----------------------------------------------------------------------
    const stopMonitor = startStallMonitor(
      db,
      { stallTimeoutMs, monitorIntervalMs },
      (swarmId, authorName, channel, text) => postToBoard(swarmId, authorName, channel, text),
    );

    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (activePluginInstances.get(instanceKey) === cleanup) {
        activePluginInstances.delete(instanceKey);
      }
      stopMonitor();
      abortController.abort();
      pendingCalls.clear();
      abortAllWaiters();
      wake.clearState();
      spawningMembers.clear();
      activeToolCounts.clear();
      quiesceResolvers.clear();
      pendingKillCleanup.clear();
      if (rpcCleanup) {
        try {
          await rpcCleanup();
        } catch (err) {
          console.warn("[opencode-swarm] rpcCleanup error during shutdown:", err);
        }
      }
      if (boardServer && !boardServerClosed) {
        boardServerClosed = true;
        try {
          await boardServer.close();
        } catch (err) {
          console.warn("[opencode-swarm] boardServer.close error during shutdown:", err);
        }
      }
      if (!dbClosed) {
        dbClosed = true;
        try {
          db.close();
        } catch (err) {
          console.warn("[opencode-swarm] db.close error during shutdown:", err);
        }
      }
    };
    activePluginInstances.set(instanceKey, cleanup);
    return cleanup;
  },
});

export default swarmRuntimePlugin;
