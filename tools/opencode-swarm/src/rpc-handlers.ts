import type { Plugin } from "@opencode/plugin";
import type { SwarmBoardDB } from "./db.js";
import { formatModelSpec, listAvailableModels, resolveAndValidateModel } from "./models.js";
import type { SwarmChangedEvent, UninstallSelection } from "./rpc.js";
import type { MemberRole, ModelSelection } from "./types.js";
import { buildUninstallPlan, executeUninstallPlan } from "./uninstall.js";
import { cleanupMemberWorkspace } from "./workspace.js";

type PluginContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface RpcHandlerDeps {
  ctx: PluginContext;
  db: SwarmBoardDB;
  isDbClosed: () => boolean;
  getBoardUrl: () => string;
  getBoardToken: () => string;
  canonicalWorkspaceRoot: string;
  roleModels: Partial<Record<MemberRole, string>>;
  persistRoleModels: () => void;
  getAutoSpawnVerifier: () => boolean;
  setAutoSpawnVerifier: (enabled: boolean) => void;
  emitSwarmChanged: (event: SwarmChangedEvent) => void;
  resolveWaiterAborted: (memberId: string) => void;
  waitForQuiesce: (sessionId: string, timeoutMs?: number) => Promise<boolean>;
  pendingKillCleanup: Map<string, () => void>;
  switchMemberModelInPlace: (
    swarmId: string,
    memberName: string,
    modelSpec?: string,
    variantArg?: string,
    opts?: { interruptAndRerunIfWorking?: boolean },
  ) => Promise<{
    name: string;
    model: string;
    preserved_history: boolean;
    rerun: boolean;
  }>;
  beforeUninstallRuntimeDataDelete: () => Promise<void>;
}

export function createRpcHandlers(deps: RpcHandlerDeps): Record<string, (args?: Record<string, unknown>) => Promise<unknown>> {
  const { ctx, db } = deps;

  return {
    getBoardInfo: async () => {
      if (deps.isDbClosed()) {
        return { url: "", token: "", swarmId: "", title: "Swarm Board", status: "idle", activeCount: 0 };
      }
      const active = db.getActiveSwarms()[0];
      const members = active ? db.listMembers(active.id, false) : [];
      return {
        url: deps.getBoardUrl(),
        token: deps.getBoardToken(),
        swarmId: active?.id ?? "",
        title: active?.title ?? "Swarm Board",
        status: active?.status ?? "idle",
        activeCount: members.length,
      };
    },
    getSwarmSnapshot: async (args?: Record<string, unknown>) => {
      if (deps.isDbClosed()) {
        return { swarm: null, boardUrl: "", head: 0, stalled: false, members: [], board_posts: [], file_locks: [] };
      }
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
          boardUrl: deps.getBoardUrl(),
          head: 0,
          stalled: false,
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
        mentions: safeParseStringArray(p.mentions_json),
        channel_mentions: safeParseStringArray(p.channel_mentions_json),
        is_all: Boolean(p.is_all),
        body: p.body,
        created_at: p.created_at,
      }));
      const latest = db.getLatestPost(swarm.id);
      const head = latest?.swarm_seq ?? 0;
      const stalled =
        swarm.status === "running" &&
        swarm.monitor_nudge_count > 0 &&
        head <= swarm.last_monitor_nudge_seq;
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
        boardUrl: deps.getBoardUrl(),
        head,
        stalled,
        members,
        board_posts,
        file_locks,
      };
    },
    listSwarms: async (args?: Record<string, unknown>) => {
      if (deps.isDbClosed()) return { swarms: [] };
      const limit = typeof args?.limit === "number" ? args.limit : 50;
      return { swarms: db.listSwarms(limit) };
    },
    completeSwarm: async (args?: Record<string, unknown>) => {
      if (deps.isDbClosed()) return { ok: false, error: "Swarm database is closed." };
      const swarmId = typeof args?.swarmId === "string" ? args.swarmId : "";
      const summary = typeof args?.summary === "string" ? args.summary : undefined;
      const callerSessionId = typeof args?.callerSessionId === "string" ? args.callerSessionId : undefined;
      const swarm = db.getSwarm(swarmId);
      if (!swarm) {
        return { ok: false, error: `Swarm '${swarmId}' not found.` };
      }
      if (callerSessionId) {
        const caller = db.getActiveMemberBySession(callerSessionId);
        if (!caller || caller.swarm_id !== swarm.id || caller.role !== "coordinator") {
          return { ok: false, error: "Only @coordinator may complete the swarm." };
        }
      }
      db.setSwarmStatus(swarm.id, "completing");
      const members = db.listMembers(swarm.id, false);
      for (const m of members) {
        deps.resolveWaiterAborted(m.id);
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
          repoRoot: deps.canonicalWorkspaceRoot,
        });
      }
      db.releaseAllLocksForSwarm(swarm.id);
      db.setSwarmStatus(swarm.id, "completed");
      deps.emitSwarmChanged({ swarmId: swarm.id, reason: "swarm_completed", summary });
      return { ok: true };
    },
    killMember: async (args?: Record<string, unknown>) => {
      if (deps.isDbClosed()) return { ok: false, error: "Swarm database is closed." };
      const swarmId = typeof args?.swarmId === "string" ? args.swarmId : "";
      const handle = typeof args?.handle === "string" ? args.handle : "";
      const reason = typeof args?.reason === "string" ? args.reason : undefined;
      const callerSessionId = typeof args?.callerSessionId === "string" ? args.callerSessionId : undefined;
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
      if (target.role === "coordinator") {
        return { ok: false, error: "Cannot kill @coordinator." };
      }
      if (callerSessionId) {
        const caller = db.getActiveMemberBySession(callerSessionId);
        if (!caller || caller.swarm_id !== swarm.id || (caller.role !== "coordinator" && target.added_by !== caller.name)) {
          return { ok: false, error: `Only @coordinator or the member that added @${target.name} may kill it.` };
        }
      }
      db.setMemberState(target.id, "killed");
      deps.resolveWaiterAborted(target.id);
      try {
        await ctx.session.interrupt({ sessionID: target.session_id });
      } catch {
        // Already idle
      }
      const finishKillCleanup = () => {
        db.releaseLocksForMember(target.id);
        cleanupMemberWorkspace({
          mode: target.workspace_mode,
          dir: target.workspace_dir,
          branch: target.workspace_branch,
          repoRoot: deps.canonicalWorkspaceRoot,
        });
      };
      const quiesced = await deps.waitForQuiesce(target.session_id, 400);
      if (quiesced) {
        finishKillCleanup();
      } else {
        deps.pendingKillCleanup.set(target.session_id, finishKillCleanup);
      }
      deps.emitSwarmChanged({ swarmId: swarm.id, reason: "member_killed", handle: target.name, summary: reason });
      return { ok: true };
    },
    getRoleConfig: async (args?: Record<string, unknown>) => {
      if (deps.isDbClosed()) {
        return {
          swarmId: null,
          swarmTitle: null,
          swarmStatus: "idle",
          autoSpawnVerifier: deps.getAutoSpawnVerifier(),
          roleModels: {
            coordinator: deps.roleModels.coordinator ?? "",
            worker: deps.roleModels.worker ?? "",
            verifier: deps.roleModels.verifier ?? "",
            monitor: deps.roleModels.monitor ?? "",
          },
          models: [],
        };
      }
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
        if (latestSummary) swarm = db.getSwarm(latestSummary.id);
      }

      const catalog = await listAvailableModels(ctx, { all: false });
      const defaultSpec = catalog.defaultModel
        ? `${catalog.defaultModel.providerID}/${catalog.defaultModel.modelID}`
        : catalog.models[0]
          ? `${catalog.models[0].providerID}/${catalog.models[0].id}`
          : "";
      const liveMembers = swarm ? db.listMembers(swarm.id, false) : [];
      const pickRoleModel = (role: "coordinator" | "worker" | "verifier" | "monitor") => {
        const member = liveMembers.find((m) => m.role === role);
        if (member?.model_provider && member?.model_id) {
          return formatModelSpec({
            providerID: member.model_provider,
            id: member.model_id,
            ...(member.model_variant ? { variant: member.model_variant } : {}),
          });
        }
        return deps.roleModels[role] ?? defaultSpec;
      };

      return {
        swarmId: swarm?.id ?? null,
        swarmTitle: swarm?.title ?? null,
        swarmStatus: swarm?.status ?? "idle",
        autoSpawnVerifier: deps.getAutoSpawnVerifier(),
        roleModels: {
          coordinator: pickRoleModel("coordinator"),
          worker: pickRoleModel("worker"),
          verifier: pickRoleModel("verifier"),
          monitor: pickRoleModel("monitor"),
        },
        models: catalog.models.map((m) => ({
          providerID: m.providerID,
          id: m.id,
          variants: m.variants,
        })),
      };
    },
    setRoleModel: async (args?: Record<string, unknown>) => {
      const roleArg = typeof args?.role === "string" ? args.role.trim().toLowerCase() : "";
      const modelArg = typeof args?.model === "string" ? args.model.trim() : "";
      const swarmIdArg = typeof args?.swarmId === "string" ? args.swarmId : undefined;
      const sessionIdArg = typeof args?.sessionId === "string" ? args.sessionId : undefined;

      if (!["coordinator", "worker", "verifier", "monitor"].includes(roleArg)) {
        return {
          ok: false,
          role: roleArg,
          model: modelArg,
          switchedMembers: [],
          rerunMembers: [],
          error: `Unsupported role "${roleArg}".`,
        };
      }

      let resolved: ModelSelection | undefined;
      try {
        resolved = await resolveAndValidateModel(ctx, modelArg, undefined, undefined);
      } catch (err) {
        return {
          ok: false,
          role: roleArg,
          model: modelArg,
          switchedMembers: [],
          rerunMembers: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
      if (!resolved) {
        return {
          ok: false,
          role: roleArg,
          model: modelArg,
          switchedMembers: [],
          rerunMembers: [],
          error: "Model must be specified.",
        };
      }

      const spec = formatModelSpec(resolved);
      deps.roleModels[roleArg as MemberRole] = spec;
      deps.persistRoleModels();

      let swarm = swarmIdArg ? db.getSwarm(swarmIdArg) : undefined;
      if (!swarm && sessionIdArg) {
        const member = db.getActiveMemberBySession(sessionIdArg);
        if (member) swarm = db.getSwarm(member.swarm_id);
      }
      if (!swarm && !swarmIdArg) {
        swarm = db.getActiveSwarms()[0];
      }

      const switchedMembers: string[] = [];
      const rerunMembers: string[] = [];
      if (swarm) {
        const liveRoleMembers = db
          .listMembers(swarm.id, false)
          .filter((m) => m.role === roleArg);
        for (const m of liveRoleMembers) {
          const res = await deps.switchMemberModelInPlace(swarm.id, m.name, spec, undefined, {
            interruptAndRerunIfWorking: true,
          });
          switchedMembers.push(m.name);
          if (res.rerun) {
            rerunMembers.push(m.name);
          }
        }
      }

      if (roleArg === "coordinator" && switchedMembers.length === 0 && sessionIdArg) {
        await ctx.session
          .switchModel({
            sessionID: sessionIdArg,
            model: {
              providerID: resolved.providerID,
              id: resolved.id,
              ...(resolved.variant ? { variant: resolved.variant } : {}),
            },
          })
          .catch(() => {});
      }

      deps.emitSwarmChanged({
        swarmId: swarm?.id ?? "",
        reason: "role_model_changed",
        handle: roleArg,
        summary: spec,
      });

      return {
        ok: true,
        role: roleArg,
        model: spec,
        switchedMembers,
        rerunMembers,
      };
    },
    setAutoSpawnVerifier: async (args?: Record<string, unknown>) => {
      if (typeof args?.enabled !== "boolean") {
        throw new Error("enabled must be a boolean");
      }
      deps.setAutoSpawnVerifier(args.enabled);
      deps.emitSwarmChanged({
        swarmId: "",
        reason: "settings_changed",
        handle: "autoSpawnVerifier",
        summary: String(args.enabled),
      });
      return {
        ok: true,
        autoSpawnVerifier: deps.getAutoSpawnVerifier(),
      };
    },
    previewUninstall: async () => {
      const boardUrl = deps.getBoardUrl();
      return buildUninstallPlan({
        workspaceRoot: deps.canonicalWorkspaceRoot,
        boardUrl: boardUrl || undefined,
      });
    },
    executeUninstall: async (args?: Record<string, unknown>) => {
      const categories = (
        args?.categories && typeof args.categories === "object" && !Array.isArray(args.categories)
          ? args.categories
          : {}
      ) as Partial<UninstallSelection>;
      const prevBoardUrl = deps.getBoardUrl() || undefined;
      const plan = buildUninstallPlan({
        workspaceRoot: deps.canonicalWorkspaceRoot,
        boardUrl: prevBoardUrl,
      });
      return await executeUninstallPlan(plan, categories, {
        env: {
          workspaceRoot: deps.canonicalWorkspaceRoot,
          boardUrl: prevBoardUrl,
        },
        beforeRuntimeDataDelete: deps.beforeUninstallRuntimeDataDelete,
      });
    },
  };
}
