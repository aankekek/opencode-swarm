import { Plugin } from "@opencode/plugin";

type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { startBoardServer, type BoardServerHandle } from "./board-server.js";
import { SWARM_RPC_DEF, type SwarmChangedEvent } from "./rpc.js";
import { openSqliteDatabase, SwarmBoardDB } from "./db.js";
import { checkPendingWakePosts, parseMentionsFromText, resolveWakeTargets } from "./mentions.js";
import { formatModelSpec, listAvailableModels, parseModelSpec, resolveAndValidateModel } from "./models.js";
import { startStallMonitor } from "./monitor.js";
import { buildRolePermissions, evaluateActionForMember, SHELL_TOOLS, WRITE_TOOLS } from "./policy.js";
import { buildMemberOpeningPrompt, COORDINATOR_PROTOCOL } from "./prompts.js";
import { extractTargetPaths, normalizeHandle, tightenEffect, validateMemberName } from "./security.js";
import type {
  BoardPostRow,
  CachedCall,
  MemberRole,
  MemberRow,
  ModelSelection,
  PluginOptions,
  WorkspaceMode,
} from "./types.js";
import { cleanupMemberWorkspace, provisionMemberWorkspace } from "./workspace.js";

const IS_WINDOWS = process.platform === "win32";

function toolJson(payload: unknown): { content: string } {
  return { content: JSON.stringify(payload, null, 2) };
}

function isQuotaOrRateLimitError(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  return /(429|quota|rate[\s_-]?limit|insufficient_quota|usage limit|resource_exhausted)/i.test(text);
}

export const swarmRuntimePlugin = Plugin.define({
  id: "local.swarm-runtime",

  async setup(ctx: Context) {
    const workspaceRoot = resolve(ctx.location.directory);
    const canonicalWorkspaceRoot = existsSync(workspaceRoot) ? realpathSync(workspaceRoot) : workspaceRoot;

    const options = (ctx.options ?? {}) as PluginOptions;
    const stallTimeoutMs = options.stallTimeoutMs ?? 180_000;
    const monitorIntervalMs = options.monitorIntervalMs ?? 30_000;
    const debugEvents = options.debugEvents ?? false;
    const debugHooks = options.debugHooks ?? false;
    const roleModels: Partial<Record<MemberRole, string>> = { ...(options.roleModels ?? {}) };

    const repoHash = createHash("sha256")
      .update(IS_WINDOWS ? canonicalWorkspaceRoot.toLowerCase() : canonicalWorkspaceRoot)
      .digest("hex")
      .slice(0, 12);
    const dataDir = options.dbPath
      ? dirname(resolve(options.dbPath))
      : join(homedir(), ".opencode-swarm", repoHash);
    const dbPath = options.dbPath ? resolve(options.dbPath) : join(dataDir, "board.db");
    mkdirSync(dataDir, { recursive: true });

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

    const reconciled = db.reconcileStaleSwarmsOnStartup();
    if (reconciled.length > 0) {
      console.warn(
        `[swarm-runtime] Reconciled ${reconciled.length} stale swarm(s) on startup (${reconciled.map((s) => s.id).join(", ")}); all locks released.`,
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
    const waiters = new Map<string, { resolve: (posts: BoardPostRow[]) => void; sinceSeq: number; mentionsOnly: boolean }>();

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
            `[swarm-runtime] Ignoring invalid roleModels.coordinator "${coordinatorSpec}": ${err instanceof Error ? err.message : String(err)}`,
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
            `[swarm-runtime] Could not switch coordinator model to ${model.providerID}/${model.id}: ${err instanceof Error ? err.message : String(err)}`,
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

    async function wakeMember(member: MemberRow, triggerPost: BoardPostRow) {
      const swarm = db.getSwarm(member.swarm_id);
      if (!swarm || swarm.status !== "running") return;

      // If member is parked on swarm_wait in-process, resolve its waiter directly
      const waiter = waiters.get(member.id);
      if (waiter) {
        const matched = checkPendingWakePosts(db, member, waiter.sinceSeq, waiter.mentionsOnly);
        if (matched.length > 0) {
          waiters.delete(member.id);
          db.setMemberState(member.id, "working");
          db.advanceReadCursor(member.id, matched[matched.length - 1].swarm_seq);
          waiter.resolve(matched);
          return;
        }
        // If the waiter did not match the trigger post (e.g. unsubscribed channel or not mentioned),
        // do not fall through to session.prompt to avoid double-waking a parked member.
        return;
      }

      // Never inject [SWARM BOARD WAKE-UP] prompts into the user's coordinator chat.
      // When @coordinator is parked in swarm_wait, the waiter branch above wakes it silently.
      if (member.role === "coordinator") {
        return;
      }

      const fresh = db.getMemberById(member.id);
      if (!fresh || fresh.state === "killed" || fresh.last_read_seq >= triggerPost.swarm_seq) {
        return;
      }

      // Medium 7: channel-isolated fallback feed (no cross-channel leaks)
      const isGlobal = fresh.role === "monitor" || fresh.role === "narrator";
      const memberChannels = isGlobal ? "*" : db.getMemberChannels(fresh.swarm_id, fresh.id);
      const { posts } = db.getPostsPage(fresh.swarm_id, fresh.last_read_seq, 25, memberChannels);
      if (posts.length === 0) return;
      const lastSeq = posts[posts.length - 1].swarm_seq;

      const feed = posts
        .map((p) => `[#${p.swarm_seq} #${p.channel}] @${p.author_name}:\n${p.body}`)
        .join("\n\n");

      const promptText = [
        `[SWARM BOARD WAKE-UP for @${fresh.name} — Swarm ${fresh.swarm_id}]`,
        `New board traffic:`,
        feed,
        ``,
        `Act on your assignment and report via \`post_message\`.`,
      ].join("\n");

      db.setMemberState(fresh.id, "working");
      db.advanceReadCursor(fresh.id, lastSeq);
      try {
        await ctx.session.prompt({
          sessionID: fresh.session_id,
          text: promptText,
          delivery: "queue",
        });
      } catch (err) {
        // Reset state to waiting on prompt failure so member is not stuck in working
        db.setMemberState(fresh.id, "waiting", {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }

    async function postToBoard(
      swarmId: string,
      authorName: string,
      channel: string,
      text: string,
      excludeMemberIds?: Set<string>,
    ): Promise<BoardPostRow> {
      const ch = db.getChannel(swarmId, channel);
      if (!ch) throw new Error(`Unknown channel "#${channel}".`);
      if (ch.archived) throw new Error(`Channel "#${channel}" is archived.`);

      // Medium 6: Channel isolation check on postToBoard
      const author = db.getMemberByName(swarmId, authorName);
      if (author) {
        const isGlobal = author.role === "coordinator" || author.role === "monitor" || author.role === "narrator";
        if (!isGlobal && channel !== "main") {
          const authorChannels = db.getMemberChannels(swarmId, author.id);
          if (!authorChannels.includes(channel)) {
            throw new Error(`Member @${authorName} is not subscribed to channel "#${channel}".`);
          }
        }
      }

      const parsed = parseMentionsFromText(text);
      const post = db.addPost({
        swarmId,
        authorName,
        channel,
        mentions: parsed.memberMentions,
        channelMentions: parsed.channelMentions,
        isAll: parsed.isAll,
        body: text,
      });
      emitSwarmChanged({
        swarmId,
        reason: "board_post",
        seq: post.swarm_seq,
        handle: authorName,
      });

      const targets = resolveWakeTargets(db, swarmId, authorName, channel, parsed);
      const isMonitorAuthor = authorName === "monitor";
      for (const target of targets) {
        if (excludeMemberIds?.has(target.id)) continue;
        // RT-M5: Monitor nudges bypass paused_quota so stall breaks can proceed
        if (target.paused_quota === 1 && !isMonitorAuthor) continue;
        try {
          await wakeMember(target, post);
        } catch {
          // Wake error recorded on member if needed
        }
      }

      return post;
    }

    async function switchMemberModelInPlace(
      swarmId: string,
      memberName: string,
      modelInput?: string,
      variantInput?: string,
    ) {
      const target = db.getMemberByName(swarmId, memberName);
      if (!target) throw new Error(`Member "@${memberName}" not found in swarm "${swarmId}".`);
      if (target.state === "killed") throw new Error(`Cannot switch model of killed member "@${memberName}".`);
      if (target.state === "working") {
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

      await ctx.session.switchModel({
        sessionID: target.session_id,
        model: {
          providerID: resolved.providerID,
          id: resolved.id,
          ...(resolved.variant ? { variant: resolved.variant } : {}),
        },
      });
      db.setMemberModel(target.id, resolved);
      emitSwarmChanged({
        swarmId: target.swarm_id,
        reason: "member_model_changed",
        handle: target.name,
      });

      return {
        name: target.name,
        model: formatModelSpec(resolved),
        preserved_history: true,
      };
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
      const cleanName = validateMemberName(args.name);
      const existing = db.getMemberByName(args.swarmId, cleanName);
      if (existing) {
        throw new Error(
          `Member "@${cleanName}" already exists in swarm "${args.swarmId}" (state: ${existing.state}). Killed names cannot be reused.`,
        );
      }

      const wsMode: WorkspaceMode = args.workspace ?? "inherit";
      const provisioned = provisionMemberWorkspace({
        mode: wsMode,
        repoRoot: canonicalWorkspaceRoot,
        dataDir,
        swarmId: args.swarmId,
        memberName: cleanName,
      });

      // Manual model + variant resolution: inherit caller/role default unless explicitly picked
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

      let childSessionId: string;
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
        const forked = await forkFn({ sessionID: forkTarget.session_id });
        childSessionId = forked.id;
      } else {
        const created = await ctx.session.create({
          parentID: args.caller.session_id,
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
      const member = db.insertMember({
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

      const ownedGlobs = args.role === "worker" ? (args.ownedGlobs ?? []) : [];
      if (ownedGlobs.length > 0) {
        const lockRes = db.claimLocksAtomic(args.swarmId, member.id, cleanName, ownedGlobs);
        if (lockRes.conflicts.length > 0) {
          db.setMemberState(member.id, "killed");
          cleanupMemberWorkspace({
            mode: wsMode,
            dir: provisioned.dir,
            branch: provisioned.branch,
            repoRoot: canonicalWorkspaceRoot,
          });
          throw new Error(
            `File-lock conflict for @${cleanName}: ${lockRes.conflicts
              .map((c) => `${c.requested} overlaps ${c.existing} (@${c.owner})`)
              .join("; ")}`,
          );
        }
      }

      const primaryChannel = channels[0] ?? "main";
      await postToBoard(args.swarmId, args.caller.name, primaryChannel, `@${cleanName} ${args.brief}`, new Set([member.id]));
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

      try {
        await ctx.session.prompt({
          sessionID: childSessionId,
          text: openingPrompt,
          delivery: "queue",
        });
      } catch (err) {
        await ctx.session.interrupt({ sessionID: childSessionId }).catch(() => {});
        db.setMemberState(member.id, "killed");
        db.releaseLocksForMember(member.id);
        cleanupMemberWorkspace({
          mode: wsMode,
          dir: provisioned.dir,
          branch: provisioned.branch,
          repoRoot: canonicalWorkspaceRoot,
        });
        throw err;
      }

      return member;
    }

    // Start Swarm Board web server (if enabled)
    let boardServer: BoardServerHandle | undefined;
    if (options.boardServer !== false) {
      try {
        boardServer = await startBoardServer(
          {
            db,
            getAvailableModels: () => listAvailableModels(ctx, { all: false }),
            switchMemberModel: switchMemberModelInPlace,
            setRoleModelDefault: (role, spec) => {
              roleModels[role] = spec;
            },
            getRoleModelDefaults: () => ({ ...roleModels }),
          },
          options.boardPort ?? 0,
        );
      } catch (err) {
        console.warn("[swarm-runtime] Failed to start board server:", err);
      }
    }

    let rpcCleanup: (() => Promise<void> | void) | undefined;
    try {
      rpcReg = await (ctx as unknown as {
        rpc?: {
          register?: (
            def: unknown,
            handlers: Record<string, (args?: Record<string, unknown>) => Promise<unknown>>,
          ) => Promise<RpcReg | void>;
        };
      }).rpc?.register?.(SWARM_RPC_DEF, {
        getBoardInfo: async () => {
          const active = db.getActiveSwarms()[0];
          const members = active ? db.listMembers(active.id, false) : [];
          return {
            url: boardServer?.url ?? "",
            token: boardServer?.token ?? "",
            swarmId: active?.id ?? "",
            title: active?.title ?? "Swarm Board",
            status: active?.status ?? "idle",
            activeCount: members.length,
          };
        },
        getSwarmSnapshot: async (args?: Record<string, unknown>) => {
          const swarmIdArg = typeof args?.swarmId === "string" ? args.swarmId : undefined;
          const sessionIdArg = typeof args?.sessionId === "string" ? args.sessionId : undefined;
          let swarm = swarmIdArg ? db.getSwarm(swarmIdArg) : undefined;
          if (!swarm && sessionIdArg) {
            const member = db.getActiveMemberBySession(sessionIdArg) ?? db.getLatestMemberBySession(sessionIdArg);
            if (member) {
              swarm = db.getSwarm(member.swarm_id);
            }
          }
          if (!swarm && !swarmIdArg) {
            swarm = db.getActiveSwarms()[0];
          }
          if (!swarm && !swarmIdArg) {
            const latestSummary = db.listSwarms(1)[0];
            if (latestSummary) {
              swarm = db.getSwarm(latestSummary.id);
            }
          }
          if (!swarm) {
            return {
              swarm: null,
              boardUrl: boardServer?.url ?? "",
              head: 0,
              members: [],
              board_posts: [],
              file_locks: [],
            };
          }
          const rawLocks = db.listLocks(swarm.id);
          const globsByMember = new Map<string, string[]>();
          for (const l of rawLocks) {
            const arr = globsByMember.get(l.owner_member_id) ?? [];
            arr.push(l.glob_pattern);
            globsByMember.set(l.owner_member_id, arr);
          }
          const members = db.listMembers(swarm.id, true).map((m) => ({
            id: m.id,
            handle: m.name,
            name: m.name,
            generation: m.generation,
            role: m.role,
            model: m.model_provider && m.model_id ? `${m.model_provider}/${m.model_id}` : "",
            variant: m.model_variant ?? null,
            state: m.state,
            paused_quota: Boolean(m.paused_quota),
            track_status: m.track_status,
            session_id: m.session_id ?? null,
            owned_globs: globsByMember.get(m.id) ?? [],
            workspace_mode: m.workspace_mode,
            last_active_at: m.last_active_at ?? null,
            activity: m.activity ?? null,
          }));
          const board_posts = db.getLatestPostsWindow(swarm.id, 500, "*").posts.map((p) => ({
            seq: p.swarm_seq,
            channel: p.channel,
            author: p.author_name,
            mentions: JSON.parse(p.mentions_json || "[]") as string[],
            channel_mentions: JSON.parse(p.channel_mentions_json || "[]") as string[],
            is_all: Boolean(p.is_all),
            body: p.body,
            created_at: p.created_at,
          }));
          const latest = db.getLatestPost(swarm.id);
          const file_locks = rawLocks.map((l) => ({
            id: l.id,
            glob_pattern: l.glob_pattern,
            owner_handle: l.owner_name,
            owner_member_id: l.owner_member_id,
            claimed_at: l.claimed_at,
          }));
          return {
            swarm: {
              id: swarm.id,
              title: swarm.title,
              objective: swarm.objective ?? null,
              status: swarm.status,
              created_at: swarm.created_at,
              updated_at: swarm.updated_at,
            },
            boardUrl: boardServer?.url ?? "",
            head: latest?.swarm_seq ?? 0,
            members,
            board_posts,
            file_locks,
          };
        },
        listSwarms: async (args?: Record<string, unknown>) => {
          const limit = typeof args?.limit === "number" ? args.limit : 50;
          return { swarms: db.listSwarms(limit) };
        },
        completeSwarm: async (args?: Record<string, unknown>) => {
          const swarmId = typeof args?.swarmId === "string" ? args.swarmId : "";
          const summary = typeof args?.summary === "string" ? args.summary : undefined;
          const swarm = db.getSwarm(swarmId);
          if (!swarm) {
            return { ok: false, error: `Swarm '${swarmId}' not found.` };
          }
          db.setSwarmStatus(swarm.id, "completing");
          const members = db.listMembers(swarm.id, false);
          for (const m of members) {
            try {
              await ctx.session.interrupt({ sessionID: m.session_id });
            } catch {
              // Ignore
            }
            db.setMemberState(m.id, "killed");
            cleanupMemberWorkspace({
              mode: m.workspace_mode,
              dir: m.workspace_dir,
              branch: m.workspace_branch,
              repoRoot: canonicalWorkspaceRoot,
            });
          }
          db.releaseAllLocksForSwarm(swarm.id);
          db.setSwarmStatus(swarm.id, "completed");
          emitSwarmChanged({ swarmId: swarm.id, reason: "swarm_completed", summary });
          return { ok: true };
        },
        killMember: async (args?: Record<string, unknown>) => {
          const swarmId = typeof args?.swarmId === "string" ? args.swarmId : "";
          const handle = typeof args?.handle === "string" ? args.handle : "";
          const reason = typeof args?.reason === "string" ? args.reason : undefined;
          const swarm = db.getSwarm(swarmId);
          if (!swarm) {
            return { ok: false, error: `Swarm '${swarmId}' not found.` };
          }
          const target = db
            .listMembers(swarm.id, false)
            .find((m) => m.name === handle);
          if (!target) {
            return { ok: false, error: `Active member '${handle}' not found in swarm '${swarmId}'.` };
          }
          try {
            await ctx.session.interrupt({ sessionID: target.session_id });
          } catch {
            // Already idle
          }
          db.setMemberState(target.id, "killed");
          db.releaseLocksForMember(target.id);
          cleanupMemberWorkspace({
            mode: target.workspace_mode,
            dir: target.workspace_dir,
            branch: target.workspace_branch,
            repoRoot: canonicalWorkspaceRoot,
          });
          emitSwarmChanged({ swarmId: swarm.id, reason: "member_killed", handle: target.name, summary: reason });
          return { ok: true };
        },
      }) ?? undefined;
      if (rpcReg && typeof rpcReg === "object" && "dispose" in rpcReg && typeof rpcReg.dispose === "function") {
        rpcCleanup = () => rpcReg!.dispose!();
      }
    } catch (err) {
      console.warn("[swarm-runtime] Failed to register RPC domain:", err);
    }

    // -----------------------------------------------------------------------
    // 1. Register 4 Antigravity Core Tools: swarm, post_message, read_board, swarm_wait
    // -----------------------------------------------------------------------
    await ctx.tool.transform((tools) => {
      tools.add({
        name: "swarm",
        description:
          "Manage the swarm: status, models (list models + variants), add (spawn worker/group), model (live in-place model/variant switch), kill, title, channel, claim, complete.",
        input: {
          type: "object",
          required: ["action"],
          properties: {
            action: {
              type: "string",
              enum: ["status", "models", "add", "model", "kill", "title", "channel", "claim", "complete"],
            },
            all: { type: "boolean", description: "For models: include disabled/deprecated models." },
            name: { type: "string", description: "Worker name for add, model, or kill." },
            role: { type: "string", enum: ["worker", "verifier", "monitor", "narrator"] },
            brief: { type: "string", description: "Assignment brief for add." },
            model: { type: "string", description: "Manual 'providerID/modelID' or 'providerID/modelID#variant'." },
            variant: { type: "string", description: "Optional reasoning/effort variant ID." },
            workspace: { type: "string", enum: ["inherit", "share", "branch"] },
            fork: { type: "string", description: "Fork conversation history from member name or 'coordinator'." },
            n: { type: "number", description: "Spawn N homogeneous copies (<name>-1..<name>-N)." },
            tasks: { type: "array", items: { type: "string" }, description: "Per-worker slice targets." },
            channels: { type: "array", items: { type: "string" } },
            owned_globs: { type: "array", items: { type: "string" } },
            title: { type: "string", description: "Swarm title for action:'title'." },
            op: { type: "string", enum: ["create", "subscribe", "unsubscribe", "list", "archive"] },
            channel: { type: "string" },
            topic: { type: "string" },
            globs: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const input = rawInput as Record<string, unknown>;
          const action = String(input.action ?? "");

          if (action === "models") {
            const catalog = await listAvailableModels(ctx, { all: Boolean(input.all) });
            return toolJson({
              ok: true,
              default_model: catalog.defaultModel,
              role_defaults: roleModels,
              models: catalog.models,
            });
          }

          if (action === "title") {
            const title = String(input.title ?? "").trim();
            if (!title) return toolJson({ ok: false, error: "title is required." });
            const { swarmId, coordinator } = await ensureCoordinator(toolCtx.sessionID, title);
            const caller = db.getActiveMemberBySession(toolCtx.sessionID) ?? coordinator;
            if (caller.role !== "coordinator") {
              return toolJson({ ok: false, error: "Only @coordinator may change the swarm title." });
            }
            db.setSwarmTitle(swarmId, title);
            emitSwarmChanged({ swarmId, reason: "swarm_updated", summary: title });
            return toolJson({ ok: true, swarm_id: swarmId, title, open_board: boardServer?.url ?? "" });
          }

          if (action === "status") {
            const caller = db.getLatestMemberBySession(toolCtx.sessionID);
            if (!caller) {
              return toolJson({ ok: true, swarm: null, open_board: boardServer?.url ?? "" });
            }
            const swarm = db.getSwarm(caller.swarm_id);
            const members = db.listMembers(caller.swarm_id, true);
            const locks = db.listLocks(caller.swarm_id);
            return toolJson({
              ok: true,
              swarm,
              open_board: boardServer?.url ?? "",
              members: members.map((m) => ({
                name: m.name,
                role: m.role,
                state: m.state,
                paused_quota: m.paused_quota === 1,
                model: formatModelSpec(
                  m.model_provider && m.model_id
                    ? { providerID: m.model_provider, id: m.model_id, variant: m.model_variant ?? undefined }
                    : undefined,
                ),
                workspace: m.workspace_mode,
                workspace_dir: m.workspace_dir,
                channels: db.getMemberChannels(caller.swarm_id, m.id),
                owned_globs: locks.filter((l) => l.owner_member_id === m.id).map((l) => l.glob_pattern),
                added_by: m.added_by,
              })),
            });
          }

          if (action === "add") {
            const { swarmId, coordinator } = await ensureCoordinator(toolCtx.sessionID);
            const caller = db.getActiveMemberBySession(toolCtx.sessionID) ?? coordinator;
            if (caller.role !== "coordinator") {
              return toolJson({ ok: false, error: "Only @coordinator may spawn swarm members." });
            }
            const baseName = String(input.name ?? "").trim();
            const brief = String(input.brief ?? "").trim();
            if (!baseName || !brief) {
              return toolJson({ ok: false, error: "name and brief are required for action:'add'." });
            }

            const rawRole = input.role !== undefined ? String(input.role).trim().toLowerCase() : "worker";
            const allowedRoles: MemberRole[] = ["worker", "verifier", "monitor", "narrator"];
            if (!allowedRoles.includes(rawRole as MemberRole)) {
              return toolJson({
                ok: false,
                error: `Invalid role "${rawRole}". Allowed roles for spawn: ${allowedRoles.join(", ")}. Coordinator cannot be spawned.`,
              });
            }
            const role = rawRole as MemberRole;
            const tasks = Array.isArray(input.tasks) ? (input.tasks as string[]) : undefined;
            const n = typeof input.n === "number" && input.n > 1 ? Math.floor(input.n) : undefined;
            const count = tasks ? tasks.length : n;

            const spawned: Array<{ name: string; session_id: string; model: string; workspace: string }> = [];
            const spawnedMembers: MemberRow[] = [];
            try {
              if (count && count > 1) {
                const wsMode = (input.workspace as WorkspaceMode | undefined) ?? "inherit";
                const globs = (input.owned_globs as string[] | undefined) ?? [];
                if (globs.length > 0 && wsMode === "inherit") {
                  return toolJson({
                    ok: false,
                    error:
                      "Cannot assign identical owned_globs to multiple inherit-mode shards; spawn individually with disjoint owned_globs or use workspace:'share'.",
                  });
                }
                for (let i = 0; i < count; i++) {
                  const shardName = validateMemberName(`${baseName}-${i + 1}`);
                  const existing = db.getMemberByName(swarmId, shardName);
                  if (existing) {
                    return toolJson({
                      ok: false,
                      error: `Member @${shardName} already exists in swarm ${swarmId} (state: ${existing.state}).`,
                    });
                  }
                }
                for (let i = 0; i < count; i++) {
                  const sliceBrief = tasks ? `${brief}\n\nAssigned slice: ${tasks[i]}` : brief;
                  const m = await spawnSingleMember({
                    swarmId,
                    caller,
                    name: `${baseName}-${i + 1}`,
                    role,
                    brief: sliceBrief,
                    model: input.model as string | undefined,
                    variant: input.variant as string | undefined,
                    workspace: input.workspace as WorkspaceMode | undefined,
                    fork: input.fork as string | undefined,
                    channels: input.channels as string[] | undefined,
                    ownedGlobs: input.owned_globs as string[] | undefined,
                    groupPrefix: baseName,
                  });
                  spawnedMembers.push(m);
                  spawned.push({
                    name: m.name,
                    session_id: m.session_id,
                    model: formatModelSpec(
                      m.model_provider && m.model_id
                        ? { providerID: m.model_provider, id: m.model_id, variant: m.model_variant ?? undefined }
                        : undefined,
                    ),
                    workspace: m.workspace_mode,
                  });
                }
              } else {
                const m = await spawnSingleMember({
                  swarmId,
                  caller,
                  name: baseName,
                  role,
                  brief,
                  model: input.model as string | undefined,
                  variant: input.variant as string | undefined,
                  workspace: input.workspace as WorkspaceMode | undefined,
                  fork: input.fork as string | undefined,
                  channels: input.channels as string[] | undefined,
                  ownedGlobs: input.owned_globs as string[] | undefined,
                });
                spawnedMembers.push(m);
                spawned.push({
                  name: m.name,
                  session_id: m.session_id,
                  model: formatModelSpec(
                    m.model_provider && m.model_id
                      ? { providerID: m.model_provider, id: m.model_id, variant: m.model_variant ?? undefined }
                      : undefined,
                  ),
                  workspace: m.workspace_mode,
                });
              }
              return toolJson({ ok: true, swarm_id: swarmId, spawned, open_board: boardServer?.url ?? "" });
            } catch (err) {
              for (const m of spawnedMembers) {
                await ctx.session.interrupt({ sessionID: m.session_id }).catch(() => {});
                db.setMemberState(m.id, "killed");
                db.releaseLocksForMember(m.id);
                cleanupMemberWorkspace({
                  mode: m.workspace_mode,
                  dir: m.workspace_dir,
                  branch: m.workspace_branch,
                  repoRoot: canonicalWorkspaceRoot,
                });
              }
              return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
            }
          }

          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller) {
            return toolJson({ ok: false, error: "Session is not part of an active swarm." });
          }

          if (action === "model") {
            const targetName = String(input.name ?? caller.name).trim();
            if (caller.role !== "coordinator" && targetName !== caller.name) {
              const target = db.getMemberByName(caller.swarm_id, targetName);
              if (!target || target.added_by !== caller.name) {
                return toolJson({
                  ok: false,
                  error: `Only @coordinator or the member that added @${targetName} may switch its model.`,
                });
              }
            }
            try {
              const res = await switchMemberModelInPlace(
                caller.swarm_id,
                targetName,
                input.model as string | undefined,
                input.variant as string | undefined,
              );
              return toolJson({ ok: true, ...res });
            } catch (err) {
              return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
            }
          }

          if (action === "kill") {
            const rawTargetName = String(input.name ?? "").trim();
            if (!rawTargetName) return toolJson({ ok: false, error: "name is required for action:'kill'." });
            let targetName: string;
            try {
              targetName = normalizeHandle(rawTargetName);
            } catch {
              targetName = rawTargetName.toLowerCase();
            }
            const allMembers = db.listMembers(caller.swarm_id, false);
            const targets = allMembers.filter(
              (m) => m.name === targetName || m.group_prefix === targetName,
            );
            if (targets.length === 0) {
              return toolJson({ ok: false, error: `No live member found for "${rawTargetName}".` });
            }
            const killed: string[] = [];
            for (const t of targets) {
              if (t.role === "coordinator") {
                return toolJson({ ok: false, error: "Cannot kill @coordinator." });
              }
              if (caller.role !== "coordinator" && t.added_by !== caller.name) {
                return toolJson({
                  ok: false,
                  error: `@${caller.name} can only kill helpers it added (not @${t.name}).`,
                });
              }
              try {
                await ctx.session.interrupt({ sessionID: t.session_id });
              } catch {
                // Already idle
              }
              db.setMemberState(t.id, "killed");
              db.releaseLocksForMember(t.id);
              emitSwarmChanged({
                swarmId: t.swarm_id,
                reason: "member_killed",
                handle: t.name,
              });
              cleanupMemberWorkspace({
                mode: t.workspace_mode,
                dir: t.workspace_dir,
                branch: t.workspace_branch,
                repoRoot: canonicalWorkspaceRoot,
              });
              killed.push(t.name);
            }
            if (killed.length > 0) {
              emitSwarmChanged({ swarmId: caller.swarm_id, reason: "member_killed" });
            }
            return toolJson({ ok: true, killed });
          }

          if (action === "channel") {
            const op = String(input.op ?? "list");
            const chName = String(input.channel ?? "");
            try {
              if (op === "list") {
                return toolJson({ ok: true, channels: db.listChannels(caller.swarm_id) });
              }
              if (op === "create") {
                if (caller.role !== "coordinator") {
                  return toolJson({ ok: false, error: "Only @coordinator may create channels." });
                }
                const created = db.createChannel(caller.swarm_id, chName, String(input.topic ?? ""), caller.name);
                return toolJson({ ok: true, channel: created });
              }
              if (op === "archive") {
                if (caller.role !== "coordinator") {
                  return toolJson({ ok: false, error: "Only @coordinator may archive channels." });
                }
                db.archiveChannel(caller.swarm_id, chName);
                return toolJson({ ok: true, archived: chName });
              }
              if (op === "subscribe" || op === "unsubscribe") {
                const targetName = String(input.name ?? caller.name);
                const target = db.getMemberByName(caller.swarm_id, targetName);
                if (!target) return toolJson({ ok: false, error: `Member "${targetName}" not found.` });
                if (op === "subscribe") db.subscribeMemberToChannel(caller.swarm_id, chName, target.id);
                else db.unsubscribeMemberFromChannel(caller.swarm_id, chName, target.id);
                return toolJson({ ok: true, member: target.name, channels: db.getMemberChannels(caller.swarm_id, target.id) });
              }
              return toolJson({ ok: false, error: `Unknown channel op "${op}".` });
            } catch (err) {
              return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
            }
          }

          if (action === "claim") {
            if (caller.role !== "coordinator" && caller.role !== "worker") {
              return toolJson({ ok: false, error: `Member @${caller.name} with role '${caller.role}' cannot claim locks.` });
            }
            const globs = Array.isArray(input.globs) ? (input.globs as string[]) : [];
            if (globs.length === 0) return toolJson({ ok: false, error: "globs array is required." });
            try {
              const res = db.claimLocksAtomic(caller.swarm_id, caller.id, caller.name, globs);
              if (res.claimed.length > 0) {
                emitSwarmChanged({
                  swarmId: caller.swarm_id,
                  reason: "lock_changed",
                  handle: caller.name,
                });
              }
              if (res.conflicts.length > 0) return toolJson({ ok: false, conflicts: res.conflicts });
              return toolJson({ ok: true, claimed: res.claimed });
            } catch (err) {
              return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
            }
          }

          if (action === "complete") {
            if (caller.role !== "coordinator") {
              return toolJson({ ok: false, error: "Only @coordinator may complete the swarm." });
            }
            db.setSwarmStatus(caller.swarm_id, "completing");
            const children = db.listMembers(caller.swarm_id, false).filter((m) => m.role !== "coordinator");
            for (const c of children) {
              try {
                await ctx.session.interrupt({ sessionID: c.session_id });
              } catch {
                // Ignore
              }
              db.setMemberState(c.id, "killed");
              cleanupMemberWorkspace({
                mode: c.workspace_mode,
                dir: c.workspace_dir,
                branch: c.workspace_branch,
                repoRoot: canonicalWorkspaceRoot,
              });
            }
            db.setMemberState(caller.id, "killed");
            db.releaseAllLocksForSwarm(caller.swarm_id);
            db.setSwarmStatus(caller.swarm_id, "completed");
            emitSwarmChanged({ swarmId: caller.swarm_id, reason: "swarm_completed" });
            emitSwarmChanged({
              swarmId: caller.swarm_id,
              reason: "swarm_completed",
            });

            // SEC-H7: Clear/restore coordinator session permissions
            try {
              await ctx.session.update({
                sessionID: caller.session_id,
                permissions: [],
              });
            } catch {
              // Ignore if session update unsupported
            }

            return toolJson({ ok: true, swarm_id: caller.swarm_id, status: "completed" });
          }

          return toolJson({ ok: false, error: `Unknown swarm action "${action}".` });
        },
      });

      tools.add({
        name: "post_message",
        description: "Post a message to the shared swarm board and wake @mentioned members.",
        input: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string" },
            channel: { type: "string", description: "Target channel (defaults to 'main')." },
            mark_done: { type: "boolean" },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller) return toolJson({ ok: false, error: "Session is not an active swarm member." });
          const input = rawInput as { text: string; channel?: string; mark_done?: boolean };
          if (input.mark_done || /^\s*\[done\]/i.test(input.text) || /@\S+\s+\[done\]/i.test(input.text)) {
            db.setTrackStatus(caller.id, "done");
          }
          try {
            const post = await postToBoard(caller.swarm_id, caller.name, input.channel ?? "main", input.text);
            db.advanceReadCursor(caller.id, post.swarm_seq);
            return toolJson({ ok: true, seq: post.swarm_seq, channel: post.channel });
          } catch (err) {
            return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        },
      });

      tools.add({
        name: "read_board",
        description: "Read posts from the shared swarm board or inspect member status.",
        input: {
          type: "object",
          properties: {
            since: { type: "number" },
            limit: { type: "number" },
            channel: { type: "string", description: "Filter by channel name or '*' for all." },
            status: { type: "boolean", description: "Return member status summary instead of posts." },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getLatestMemberBySession(toolCtx.sessionID);
          if (!caller) return toolJson({ ok: false, error: "Session is not registered in any swarm." });
          const input = (rawInput ?? {}) as { since?: number; limit?: number; channel?: string; status?: boolean };

          if (input.status) {
            const members = db.listMembers(caller.swarm_id, true);
            return toolJson({
              swarm_id: caller.swarm_id,
              members: members.map((m) => ({
                name: m.name,
                role: m.role,
                state: m.state,
                wake_mode: m.wake_mode,
                wait_since: m.wait_since,
                last_read_seq: m.last_read_seq,
                last_post_seq: m.last_post_seq,
                channels: db.getMemberChannels(caller.swarm_id, m.id),
              })),
            });
          }

          const since = typeof input.since === "number" ? input.since : caller.last_read_seq;
          const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
          const isGlobal = caller.role === "coordinator" || caller.role === "monitor" || caller.role === "narrator";
          const myChannels = db.getMemberChannels(caller.swarm_id, caller.id);

          // Medium 6: Channel isolation on read_board
          let filter: string[] | "*";
          if (isGlobal) {
            filter = input.channel === "*" || !input.channel ? "*" : [normalizeHandle(input.channel)];
          } else {
            if (input.channel === "*") {
              filter = myChannels;
            } else if (input.channel) {
              const reqChan = normalizeHandle(input.channel);
              if (!myChannels.includes(reqChan)) {
                return toolJson({ ok: false, error: `Member @${caller.name} is not subscribed to channel "#${reqChan}".` });
              }
              filter = [reqChan];
            } else {
              filter = myChannels;
            }
          }

          const { posts, hasMore } = db.getPostsPage(caller.swarm_id, since, limit, filter);
          const readingAllVisible = !input.channel || input.channel === "*";
          if (posts.length > 0 && readingAllVisible) {
            db.advanceReadCursor(caller.id, posts[posts.length - 1].swarm_seq);
          }
          return toolJson({
            swarm_id: caller.swarm_id,
            has_more: hasMore,
            posts: posts.map((p) => ({
              seq: p.swarm_seq,
              channel: p.channel,
              author: p.author_name,
              text: p.body,
              time: new Date(p.created_at).toISOString(),
            })),
          });
        },
      });

      tools.add({
        name: "swarm_wait",
        description: "Sleep at 0 tokens until a matching post arrives on the board after `since`.",
        input: {
          type: "object",
          properties: {
            since: { type: "number" },
            mentions_only: { type: "boolean" },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller) return toolJson({ ok: false, error: "Session is not an active swarm member." });
          const input = (rawInput ?? {}) as { since?: number; mentions_only?: boolean };
          const sinceSeq = typeof input.since === "number" ? input.since : caller.last_read_seq;
          const mentionsOnly = input.mentions_only ?? true;

          // Race-free check: if matching posts already exist after sinceSeq, return immediately
          const immediate = checkPendingWakePosts(db, caller, sinceSeq, mentionsOnly);
          if (immediate.length > 0) {
            db.advanceReadCursor(caller.id, immediate[immediate.length - 1].swarm_seq);
            return toolJson({
              woken: true,
              posts: immediate.map((p) => ({
                seq: p.swarm_seq,
                channel: p.channel,
                author: p.author_name,
                text: p.body,
              })),
            });
          }

          const prevWaiter = waiters.get(caller.id);
          if (prevWaiter) {
            waiters.delete(caller.id);
            prevWaiter.resolve([]);
          }

          db.setMemberWait(caller.id, mentionsOnly ? "mentions" : "any", sinceSeq);

          const wokenPosts = await new Promise<BoardPostRow[]>((resolveWait) => {
            const onAbort = () => {
              waiters.delete(caller.id);
              resolveWait([]);
            };
            toolCtx.signal?.addEventListener("abort", onAbort, { once: true });
            waiters.set(caller.id, {
              sinceSeq,
              mentionsOnly,
              resolve: (posts) => {
                toolCtx.signal?.removeEventListener("abort", onAbort);
                resolveWait(posts);
              },
            });
          });

          if (wokenPosts.length > 0) {
            db.advanceReadCursor(caller.id, wokenPosts[wokenPosts.length - 1].swarm_seq);
          }

          return toolJson({
            woken: wokenPosts.length > 0,
            posts: wokenPosts.map((p) => ({
              seq: p.swarm_seq,
              channel: p.channel,
              author: p.author_name,
              text: p.body,
            })),
          });
        },
      });
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
          input: event.input,
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
      if (callId && cached) {
        pendingCalls.delete(callId);
      }
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
      try {
        const stream = ctx.event.subscribe({ signal: abortController.signal });
        for await (const rawEvent of stream) {
          if (abortController.signal.aborted) break;
          if (debugEvents) logDebug(eventDebugLogPath, { event: rawEvent });

          const ev = rawEvent as unknown as { type?: string; data?: Record<string, unknown> };
          const eventType = String(ev.type ?? "");
          const data = ev.data ?? {};
          const sessionId = typeof data.sessionID === "string" ? data.sessionID : undefined;
          if (!sessionId) continue;

          const member = db.getActiveMemberBySession(sessionId);
          if (!member) continue;

          if (eventType === "session.execution.started") {
            db.setMemberState(member.id, "working", { pausedQuota: false });
          } else if (eventType === "session.idle" || eventType === "session.execution.succeeded") {
            db.setMemberState(member.id, "waiting", { activity: null, pausedQuota: false });
          } else if (eventType === "session.execution.interrupted") {
            db.setMemberState(member.id, "stopped", { activity: null });
          } else if (eventType === "session.execution.failed") {
            const isQuota = isQuotaOrRateLimitError(data.error ?? data);
            db.setMemberState(member.id, "waiting", {
              activity: null,
              error: isQuota ? "Quota/rate limit reached" : String(data.error ?? "Execution failed"),
              pausedQuota: isQuota,
            });
          } else if (eventType === "session.step.started") {
            db.incrementMemberSteps(member.id, "Thinking...");
          } else if (eventType === "session.tool.called") {
            const toolLabel = pendingCalls.get(String(data.id))?.tool ?? String(data.tool ?? "tool");
            db.incrementMemberSteps(member.id, `Running ${toolLabel}`, "tool");
          } else if (eventType === "session.deleted") {
            db.setMemberState(member.id, "killed");
            db.releaseLocksForMember(member.id);
          }
        }
      } catch {
        // Stream closed
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

    return async () => {
      stopMonitor();
      abortController.abort();
      pendingCalls.clear();
      waiters.clear();
      if (rpcCleanup) {
        await rpcCleanup();
      }
      if (boardServer) {
        await boardServer.close();
      }
      db.close();
    };
  },
});

export default swarmRuntimePlugin;
