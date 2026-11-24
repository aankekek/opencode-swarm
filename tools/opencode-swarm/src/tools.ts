import type { Plugin } from "@opencode/plugin";
import type { SwarmBoardDB } from "./db.js";
import { checkPendingWakePosts, parseMentionsFromText } from "./mentions.js";
import { formatModelSpec, listAvailableModels } from "./models.js";
import { hasFreshVerifierPass } from "./monitor.js";
import type { SwarmChangedEvent } from "./rpc.js";
import { normalizeHandle, validateMemberName } from "./security.js";
import type {
  BoardPostRow,
  MemberRole,
  MemberRow,
  PluginOptions,
  SwarmTaskRow,
  WorkspaceMode,
} from "./types.js";
import type { WaiterEntry } from "./wake.js";
import { cleanupMemberWorkspace } from "./workspace.js";

type PluginContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];

export const MAX_POST_MESSAGE_BYTES = 65_536;
export const MAX_BRIEF_BYTES = 262_144;
export const MAX_CHANNEL_TOPIC_BYTES = 1_024;
export const POST_RATE_LIMIT_PER_MINUTE = 60;
const POST_RATE_WINDOW_MS = 60_000;

function toolJson(payload: unknown): { content: string } {
  return { content: JSON.stringify(payload, null, 2) };
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export interface SwarmToolsDeps {
  db: SwarmBoardDB;
  options: PluginOptions;
  canonicalWorkspaceRoot: string;
  roleModels: Partial<Record<MemberRole, string>>;
  waiters: Map<string, WaiterEntry>;
  pendingKillCleanup: Map<string, () => void>;
  getBoardUrl: () => string;
  emitSwarmChanged: (event: SwarmChangedEvent) => void;
  ensureCoordinator: (sessionId: string, title?: string) => Promise<{ swarmId: string; coordinator: MemberRow }>;
  spawnSingleMember: (args: {
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
    groupPrefix?: string;
  }) => Promise<MemberRow>;
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
  postToBoard: (
    swarmId: string,
    authorName: string,
    channel: string,
    text: string,
    excludeMemberIds?: Set<string>,
  ) => Promise<BoardPostRow>;
  maybeWakeIdleCoordinator: (swarmId: string, triggerPost?: BoardPostRow) => Promise<void>;
  getLastWakeSeq: (memberId: string) => number;
  recordWakeSeq: (memberId: string, seq: number) => void;
  resolveWaiterAborted: (memberId: string) => void;
  waitForQuiesce: (sessionId: string, timeoutMs?: number) => Promise<boolean>;
}

export async function registerSwarmTools(ctx: PluginContext, deps: SwarmToolsDeps): Promise<void> {
  const { db, waiters, emitSwarmChanged } = deps;
  const memberPostTimestamps = new Map<string, number[]>();

  await ctx.tool.transform((tools) => {
    tools.add({
      name: "swarm",
      description:
        "Manage the swarm: status, models (list models + variants), plan (record the unit list), add (spawn worker/group), model (live in-place model/variant switch), kill, title, channel, claim, complete.",
      input: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["status", "models", "plan", "add", "model", "kill", "title", "channel", "claim", "complete"],
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
          tasks: {
            type: "array",
            items: { type: "string" },
            description: "Per-worker slice targets, or the unit labels for action:'plan'.",
          },
          task_ids: {
            type: "array",
            items: { type: "number" },
            description: "Unit ids from swarm{action:\"plan\"} to assign to this add.",
          },
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
            role_defaults: deps.roleModels,
            models: catalog.models,
          });
        }

        if (action === "title") {
          const title = String(input.title ?? "").trim();
          if (!title) return toolJson({ ok: false, error: "title is required." });
          const { swarmId, coordinator } = await deps.ensureCoordinator(toolCtx.sessionID, title);
          const caller = db.getActiveMemberBySession(toolCtx.sessionID) ?? coordinator;
          if (caller.role !== "coordinator") {
            return toolJson({ ok: false, error: "Only @coordinator may change the swarm title." });
          }
          db.setSwarmTitle(swarmId, title);
          emitSwarmChanged({ swarmId, reason: "swarm_updated", summary: title });
          return toolJson({ ok: true, swarm_id: swarmId, title, open_board: deps.getBoardUrl() });
        }

        if (action === "plan") {
          const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
          const units = (rawTasks as unknown[])
            .map((t) => String(t).trim())
            .filter((t) => t.length > 0);
          if (units.length === 0) {
            return toolJson({ ok: false, error: "tasks must be a non-empty array of unit labels for action:'plan'." });
          }
          const { swarmId, coordinator } = await deps.ensureCoordinator(toolCtx.sessionID);
          const caller = db.getActiveMemberBySession(toolCtx.sessionID) ?? coordinator;
          if (caller.role !== "coordinator") {
            return toolJson({ ok: false, error: "Only @coordinator may record the swarm plan." });
          }
          try {
            const tasks = db.createPlan(swarmId, units);
            const title = db.getSwarm(swarmId)?.title || swarmId;
            const header = `#plan ${title}`;
            let body = header;
            for (const task of tasks) {
              const label = task.label.length > 200 ? `${task.label.slice(0, 197)}...` : task.label;
              const line = `\n${task.seq}. ${label}`;
              if (body.length + line.length > 4000) break;
              body += line;
            }
            db.addPost({
              swarmId,
              authorName: caller.name,
              channel: "main",
              mentions: [],
              channelMentions: [],
              isAll: false,
              body,
            });
            emitSwarmChanged({ swarmId, reason: "board_post", summary: body });
            return toolJson({
              ok: true,
              units: tasks.length,
              task_ids: tasks.map((t) => t.id),
              open_board: deps.getBoardUrl(),
            });
          } catch (err) {
            return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }

        if (action === "status") {
          const caller = db.getLatestMemberBySession(toolCtx.sessionID);
          if (!caller) {
            return toolJson({
              ok: true,
              swarm: null,
              open_board: "",
              total_units: 0,
              open_units: 0,
              assigned_units: 0,
              done_units: 0,
              unassigned_units: 0,
              tasks: [],
              tasks_truncated: false,
            });
          }
          const swarm = db.getSwarm(caller.swarm_id);
          const members = db.listMembers(caller.swarm_id, true);
          const locks = db.listLocks(caller.swarm_id);
          const planTasks = db.listTasks(caller.swarm_id);
          const counts = db.getTaskCounts(caller.swarm_id);
          const visibleTasks = planTasks.slice(0, 100).map((t) => ({
            id: t.id,
            seq: t.seq,
            label: t.label,
            status: t.status,
            assignee: t.assignee_name,
          }));
          return toolJson({
            ok: true,
            swarm,
            open_board: caller.role === "coordinator" ? deps.getBoardUrl() : "",
            total_units: counts.total,
            open_units: counts.open,
            assigned_units: counts.assigned,
            done_units: counts.done,
            unassigned_units: counts.open,
            tasks: visibleTasks,
            tasks_truncated: planTasks.length > visibleTasks.length,
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
          const { swarmId, coordinator } = await deps.ensureCoordinator(toolCtx.sessionID);
          const caller = db.getActiveMemberBySession(toolCtx.sessionID) ?? coordinator;
          if (caller.role !== "coordinator") {
            return toolJson({ ok: false, error: "Only @coordinator may spawn swarm members." });
          }
          const baseName = String(input.name ?? "").trim();
          const brief = String(input.brief ?? "").trim();
          if (!baseName || !brief) {
            return toolJson({ ok: false, error: "name and brief are required for action:'add'." });
          }
          const briefBytes = Buffer.byteLength(brief, "utf8");
          if (briefBytes > MAX_BRIEF_BYTES) {
            return toolJson({
              ok: false,
              error: `brief too large; post a summary and write details to a file (${briefBytes} bytes, limit ${MAX_BRIEF_BYTES})`,
            });
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
          if (tasks && tasks.length === 0) {
            return toolJson({
              ok: false,
              error: "tasks must contain at least one slice; omit it for a single worker.",
            });
          }
          const n = typeof input.n === "number" && input.n > 1 ? Math.floor(input.n) : undefined;
          const count = tasks ? tasks.length : n;
          let requestedTaskIds: number[] | undefined;
          if (input.task_ids !== undefined) {
            if (!Array.isArray(input.task_ids)) {
              return toolJson({ ok: false, error: "task_ids must be an array of integer unit ids." });
            }
            const rawIds = input.task_ids as unknown[];
            if (!rawIds.every((id) => typeof id === "number" && Number.isInteger(id))) {
              return toolJson({ ok: false, error: "task_ids must be an array of integer unit ids." });
            }
            requestedTaskIds = rawIds as number[];
          }
          if (requestedTaskIds && role !== "worker") {
            return toolJson({
              ok: false,
              error: `task_ids can only be assigned to workers; ${role}s do not own units.`,
            });
          }
          if (requestedTaskIds && requestedTaskIds.length === 0) {
            return toolJson({ ok: false, error: "task_ids must contain at least one unit id." });
          }
          const uniqueTaskIds = requestedTaskIds ? Array.from(new Set(requestedTaskIds)) : undefined;
          const cap = positiveInt(deps.options.maxWorkers) ?? 6;
          const shardCap = positiveInt(deps.options.maxShardsPerAdd) ?? 8;

          if (count !== undefined && count > shardCap) {
            return toolJson({
              ok: false,
              error: `At most ${shardCap} shards per add. Group the units into batches of <=${shardCap} with tasks, or spawn groups sequentially.`,
            });
          }

          const requested = count ?? 1;
          if (uniqueTaskIds && requested > 1 && uniqueTaskIds.length !== requested) {
            return toolJson({
              ok: false,
              error: `task_ids has ${uniqueTaskIds.length} unique id(s) but ${requested} member(s) will be spawned; provide exactly one id per member (or spawn 1 worker to group multiple ids).`,
            });
          }
          const activeWorkersBefore = db
            .listMembers(swarmId, false)
            .filter((m) => m.role === "worker" && m.track_status === "open");
          if (role === "worker" && activeWorkersBefore.length + requested > cap) {
            return toolJson({
              ok: false,
              error: `Worker cap ${cap} reached (${activeWorkersBefore.length} active + ${requested} requested). Group units or finish tracks first.`,
              workers: activeWorkersBefore.length,
              cap,
            });
          }

          // Resolve which plan units this add owns before spawning anything.
          const planTasks = db.listTasks(swarmId);
          let unitByIndex: SwarmTaskRow[][] = [];
          if (uniqueTaskIds) {
            const byId = new Map(planTasks.map((t) => [t.id, t]));
            const missing = uniqueTaskIds.filter((id) => !byId.has(id));
            if (missing.length > 0) {
              return toolJson({
                ok: false,
                error: `task_ids not found in this swarm's plan: ${missing.join(", ")}.`,
              });
            }
            const unavailable = uniqueTaskIds.filter((id) => byId.get(id)!.status !== "open");
            if (unavailable.length > 0) {
              return toolJson({
                ok: false,
                error: `task_ids already taken: ${unavailable
                  .map((id) => `${id} (${byId.get(id)!.status})`)
                  .join(", ")}.`,
              });
            }
            if (requested === 1) {
              unitByIndex = [uniqueTaskIds.map((id) => byId.get(id)!)];
            } else {
              unitByIndex = uniqueTaskIds.map((id) => [byId.get(id)!]);
            }
          } else if (planTasks.length > 0 && role === "worker") {
            const openTasks = planTasks.filter((t) => t.status === "open");
            if (openTasks.length < requested) {
              return toolJson({
                ok: false,
                error: `Plan has ${openTasks.length} open unit(s); spawning ${requested} worker(s) would leave some without a unit. Reduce the batch, add units, or spawn without a plan.`,
              });
            }
            unitByIndex = openTasks.slice(0, requested).map((t) => [t]);
          }
          const briefFor = (index: number): string => {
            if (tasks && typeof tasks[index] === "string") {
              return `${brief}\n\nAssigned slice: ${tasks[index]}`;
            }
            const units = unitByIndex[index] ?? [];
            if (units.length === 1) return `${brief}\n\nAssigned unit: ${units[0].label}`;
            if (units.length > 1) {
              return `${brief}\n\nAssigned units:\n${units.map((u) => `- ${u.label}`).join("\n")}`;
            }
            return brief;
          };

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
                const sliceBriefBytes = Buffer.byteLength(briefFor(i), "utf8");
                if (sliceBriefBytes > MAX_BRIEF_BYTES) {
                  return toolJson({
                    ok: false,
                    error: `brief too large; post a summary and write details to a file (${sliceBriefBytes} bytes, limit ${MAX_BRIEF_BYTES})`,
                  });
                }
                const shardName = validateMemberName(`${baseName}-${i + 1}`, role);
                const existing = db.getMemberByName(swarmId, shardName);
                if (existing) {
                  return toolJson({
                    ok: false,
                    error: `Member @${shardName} already exists in swarm ${swarmId} (state: ${existing.state}).`,
                  });
                }
              }
              const normalizedPrefix = normalizeHandle(baseName);
              for (let i = 0; i < count; i++) {
                const sliceBrief = briefFor(i);
                const m = await deps.spawnSingleMember({
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
                  groupPrefix: normalizedPrefix,
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
              const m = await deps.spawnSingleMember({
                swarmId,
                caller,
                name: baseName,
                role,
                brief: briefFor(0),
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
            for (let i = 0; i < spawnedMembers.length; i++) {
              const units = unitByIndex[i];
              if (!units || units.length === 0) continue;
              db.assignTasks(
                swarmId,
                spawnedMembers[i].id,
                spawnedMembers[i].name,
                units.map((u) => u.id),
              );
            }
            const liveWorkersAfter = db.listMembers(swarmId, false).filter((m) => m.role === "worker");
            const counts = db.getTaskCounts(swarmId);
            return toolJson({
              ok: true,
              swarm_id: swarmId,
              spawned,
              workers: liveWorkersAfter.length,
              cap,
              open_tracks: liveWorkersAfter.filter((m) => m.track_status === "open").length,
              shard_cap: shardCap,
              total_units: counts.total,
              open_units: counts.open,
              assigned_units: counts.assigned,
              done_units: counts.done,
              unassigned_units: counts.open,
              open_board: deps.getBoardUrl(),
            });
          } catch (err) {
            for (const m of spawnedMembers) {
              await ctx.session.interrupt({ sessionID: m.session_id }).catch(() => {});
              db.setMemberState(m.id, "killed");
              db.releaseLocksForMember(m.id);
              try {
                db.releaseTasksForMember(m.id);
              } catch (releaseErr) {
                console.warn("[opencode-swarm] Failed to release plan units for member:", releaseErr);
              }
              cleanupMemberWorkspace({
                mode: m.workspace_mode,
                dir: m.workspace_dir,
                branch: m.workspace_branch,
                repoRoot: deps.canonicalWorkspaceRoot,
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
            const res = await deps.switchMemberModelInPlace(
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
            db.setMemberState(t.id, "killed");
            try {
              db.releaseTasksForMember(t.id);
            } catch (err) {
              console.warn("[opencode-swarm] Failed to release plan units for killed member:", err);
            }
            deps.resolveWaiterAborted(t.id);
            try {
              await ctx.session.interrupt({ sessionID: t.session_id });
            } catch {
              // Already idle
            }
            const finishKillCleanup = () => {
              db.releaseLocksForMember(t.id);
              cleanupMemberWorkspace({
                mode: t.workspace_mode,
                dir: t.workspace_dir,
                branch: t.workspace_branch,
                repoRoot: deps.canonicalWorkspaceRoot,
              });
            };
            const quiesced = await deps.waitForQuiesce(t.session_id, 400);
            if (quiesced) {
              finishKillCleanup();
            } else {
              deps.pendingKillCleanup.set(t.session_id, finishKillCleanup);
              // Safety net: if the session never quiesces (e.g. the runtime
              // never emits tool.success/failed) release the locks and the
              // workspace after 15s instead of leaking them forever.
              const safety = setTimeout(() => {
                if (deps.pendingKillCleanup.get(t.session_id) !== finishKillCleanup) return;
                deps.pendingKillCleanup.delete(t.session_id);
                try {
                  finishKillCleanup();
                } catch {
                  // Best-effort deferred cleanup
                }
              }, 15_000);
              safety.unref?.();
            }
            emitSwarmChanged({
              swarmId: t.swarm_id,
              reason: "member_killed",
              handle: t.name,
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
              const topic = String(input.topic ?? "");
              const topicBytes = Buffer.byteLength(topic, "utf8");
              if (topicBytes > MAX_CHANNEL_TOPIC_BYTES) {
                return toolJson({
                  ok: false,
                  error: `topic is longer than ${MAX_CHANNEL_TOPIC_BYTES} bytes (${topicBytes} bytes)`,
                });
              }
              if (/[@\r\n]/.test(topic)) {
                return toolJson({ ok: false, error: "a topic may not contain '@' or line breaks" });
              }
              const created = db.createChannel(caller.swarm_id, chName, topic, caller.name);
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
              if (op === "subscribe") {
                if (caller.role !== "coordinator") {
                  return toolJson({ ok: false, error: "Only @coordinator may subscribe members to channels." });
                }
                db.subscribeMemberToChannel(caller.swarm_id, chName, target.id);
              } else {
                if (caller.role !== "coordinator" && target.id !== caller.id) {
                  return toolJson({ ok: false, error: `Only @coordinator or @${target.name} may unsubscribe @${target.name}.` });
                }
                db.unsubscribeMemberFromChannel(caller.swarm_id, chName, target.id);
              }
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
          if (caller.workspace_mode !== "inherit") {
            return toolJson({
              ok: false,
              error: `action:'claim' is only supported in workspace:'inherit' mode (got '${caller.workspace_mode}').`,
            });
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
          // Completion contract: teardown is best-effort per step and always attempts
          // the terminal state. The swarm is marked `completing`, every child is torn
          // down independently (one DB error must not skip the rest), and the
          // finalization (kill coordinator, release locks, mark `completed`) runs in a
          // `finally` with each step individually guarded. On any failure the result is
          // `{ok:false, partial:true}` while the swarm still ends `completed` and its
          // locks are released, so `getActiveSwarms()` never stays blocked.
          const failures: string[] = [];
          const recordFailure = (step: string, err: unknown) => {
            failures.push(`${step}: ${err instanceof Error ? err.message : String(err)}`);
          };
          try {
            try {
              db.setSwarmStatus(caller.swarm_id, "completing");
            } catch (err) {
              recordFailure("setSwarmStatus(completing)", err);
            }
            let children: MemberRow[] = [];
            try {
              children = db.listMembers(caller.swarm_id, false).filter((m) => m.role !== "coordinator");
            } catch (err) {
              recordFailure("listMembers", err);
            }
            for (const c of children) {
              try {
                deps.resolveWaiterAborted(c.id);
              } catch (err) {
                recordFailure(`resolveWaiterAborted(${c.name})`, err);
              }
              try {
                await ctx.session.interrupt({ sessionID: c.session_id });
              } catch {
                // Ignore
              }
              try {
                db.setMemberState(c.id, "killed");
              } catch (err) {
                recordFailure(`setMemberState(${c.name})`, err);
              }
              try {
                cleanupMemberWorkspace({
                  mode: c.workspace_mode,
                  dir: c.workspace_dir,
                  branch: c.workspace_branch,
                  repoRoot: deps.canonicalWorkspaceRoot,
                });
              } catch (err) {
                recordFailure(`cleanupMemberWorkspace(${c.name})`, err);
              }
            }
          } catch (err) {
            recordFailure("teardown", err);
          } finally {
            try {
              db.setMemberState(caller.id, "killed");
            } catch (err) {
              recordFailure("setMemberState(coordinator)", err);
            }
            try {
              db.releaseAllLocksForSwarm(caller.swarm_id);
            } catch (err) {
              recordFailure("releaseAllLocksForSwarm", err);
            }
            try {
              db.setSwarmStatus(caller.swarm_id, "completed");
            } catch (err) {
              recordFailure("setSwarmStatus(completed)", err);
            }
            try {
              emitSwarmChanged({ swarmId: caller.swarm_id, reason: "swarm_completed" });
            } catch (err) {
              recordFailure("emitSwarmChanged", err);
            }

            // SEC-H7: Clear/restore coordinator session permissions
            try {
              await ctx.session.update({
                sessionID: caller.session_id,
                permissions: [],
              });
            } catch {
              // Ignore if session update unsupported
            }
          }

          if (failures.length > 0) {
            return toolJson({
              ok: false,
              error: failures.join("; "),
              swarm_id: caller.swarm_id,
              status: "completed",
              partial: true,
            });
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
        if (toolCtx.signal?.aborted) {
          return toolJson({ woken: false, aborted: true, posts: [] });
        }
        const caller = db.getActiveMemberBySession(toolCtx.sessionID);
        if (!caller) return toolJson({ ok: false, error: "Session is not an active swarm member." });
        const input = rawInput as { text: string; channel?: string; mark_done?: boolean };
        const text = typeof input.text === "string" ? input.text : "";
        const textBytes = Buffer.byteLength(text, "utf8");
        if (textBytes > MAX_POST_MESSAGE_BYTES) {
          return toolJson({
            ok: false,
            error: `message too large; post a summary and write details to a file (${textBytes} bytes, limit ${MAX_POST_MESSAGE_BYTES})`,
          });
        }
        const now = Date.now();
        const cutoff = now - POST_RATE_WINDOW_MS;
        const recent = (memberPostTimestamps.get(caller.id) ?? []).filter((ts) => ts > cutoff);
        if (recent.length >= POST_RATE_LIMIT_PER_MINUTE) {
          memberPostTimestamps.set(caller.id, recent);
          return toolJson({
            ok: false,
            error: `posting too fast; slow down and retry (limit ${POST_RATE_LIMIT_PER_MINUTE} posts a minute)`,
          });
        }
        recent.push(now);
        memberPostTimestamps.set(caller.id, recent);

        const isDonePost =
          Boolean(input.mark_done) ||
          /^\s*\[done\]/i.test(text) ||
          /@\S+\s+\[done\]/i.test(text);
        const isVerifierPass = caller.role === "verifier" && /\bPASS\b/i.test(text);
        const isVerifierFail = caller.role === "verifier" && /\bFAIL\b/i.test(text);

        if (isDonePost || isVerifierPass) {
          db.setTrackStatus(caller.id, "done");
          if (caller.role === "worker") {
            try {
              db.completeTasksForMember(caller.id);
            } catch (err) {
              console.warn("[opencode-swarm] Failed to complete plan units for member:", err);
            }
          }
        }
        if (caller.role !== "coordinator" && (isDonePost || isVerifierPass || isVerifierFail)) {
          db.setMemberState(caller.id, "waiting", { activity: null, pausedQuota: false });
          emitSwarmChanged({ swarmId: caller.swarm_id, reason: "member_state", handle: caller.name });
        }
        try {
          const post = await deps.postToBoard(caller.swarm_id, caller.name, input.channel ?? "main", text);
          deps.recordWakeSeq(caller.id, post.swarm_seq);
          await deps.maybeWakeIdleCoordinator(caller.swarm_id, post);
          const parsed = parseMentionsFromText(text);
          const warnings: string[] = [];
          for (const ch of parsed.channelMentions) {
            const chRow = db.getChannel(caller.swarm_id, ch);
            if (!chRow) {
              warnings.push(`@#${ch} addressed nobody (unknown channel)`);
            } else if (chRow.archived) {
              warnings.push(`@#${ch} addressed nobody (archived channel)`);
            }
          }
          return toolJson({
            ok: true,
            seq: post.swarm_seq,
            channel: post.channel,
            ...(warnings.length > 0 ? { warnings } : {}),
          });
        } catch (err) {
          if (recent[recent.length - 1] === now) {
            recent.pop();
          }
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
      description:
        "Block at 0 tokens until a matching board post arrives after board sequence number `since`. NOT a timer/sleep — do NOT call mid-task while you still have assigned work; finish and post [done] or PASS/FAIL (or [blocked] naming who you need) first.",
      input: {
        type: "object",
        properties: {
          since: {
            type: "number",
            description:
              "Board post sequence number (seq, e.g. 12) you have actually read — NOT seconds/ms and NOT the unread board head. Omit to use your current read/wake cursor.",
          },
          mentions_only: {
            type: "boolean",
            description: "Wait only for posts that @mention you (default true). Set false to wake on any board post.",
          },
        },
      },
      options: { codemode: false },
      async execute(rawInput, toolCtx) {
        if (toolCtx.signal?.aborted) {
          return toolJson({ woken: false, aborted: true, posts: [] });
        }
        const caller = db.getActiveMemberBySession(toolCtx.sessionID);
        if (!caller) return toolJson({ ok: false, error: "Session is not an active swarm member." });
        const input = (rawInput ?? {}) as { since?: number; mentions_only?: boolean };
        const mentionsOnly = input.mentions_only ?? true;
        const latestSeq = db.getLatestPost(caller.swarm_id)?.swarm_seq ?? 0;
        const readFloor = Math.max(caller.last_read_seq, mentionsOnly ? deps.getLastWakeSeq(caller.id) : 0);
        const rawSince =
          typeof input.since === "number" && Number.isFinite(input.since)
            ? Math.max(0, Math.floor(input.since))
            : readFloor;
        const sinceSeq = Math.min(rawSince, latestSeq);

        // Race-free check: if matching posts already exist after sinceSeq, return immediately
        const immediate = checkPendingWakePosts(db, caller, sinceSeq, mentionsOnly);
        if (immediate.length > 0) {
          const maxSeq = immediate[immediate.length - 1].swarm_seq;
          deps.recordWakeSeq(caller.id, maxSeq);
          if (!mentionsOnly) {
            db.advanceReadCursor(caller.id, maxSeq);
          }
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

        // Park guard: prevent an agent from passing an unread board head as `since`
        // and sleeping right past unread matching posts between readFloor and sinceSeq.
        if (sinceSeq > readFloor) {
          const missed = checkPendingWakePosts(db, caller, readFloor, mentionsOnly);
          if (missed.length > 0) {
            const maxSeq = missed[missed.length - 1].swarm_seq;
            deps.recordWakeSeq(caller.id, maxSeq);
            if (!mentionsOnly) {
              db.advanceReadCursor(caller.id, maxSeq);
            }
            return toolJson({
              woken: true,
              guard: "[board] new messages arrived before your requested `since`; read_board before waiting again.",
              posts: missed.map((p) => ({
                seq: p.swarm_seq,
                channel: p.channel,
                author: p.author_name,
                text: p.body,
              })),
            });
          }
        }

        if (caller.role === "coordinator") {
          const members = db.listMembers(caller.swarm_id, false);
          const nonCoord = members.filter(
            (m) => m.role !== "coordinator" && m.role !== "monitor" && m.role !== "narrator",
          );
          const anyWorking = nonCoord.some((m) => m.state === "working");
          const workers = nonCoord.filter((m) => m.role === "worker");
          const allWorkersDone = workers.length > 0 && workers.every((w) => w.track_status === "done");
          const openPlanUnits = db.getTaskCounts(caller.swarm_id).open;
          if (allWorkersDone && openPlanUnits === 0 && !anyWorking && hasFreshVerifierPass(db, caller.swarm_id, members)) {
            const unread = db
              .getPostsPage(caller.swarm_id, sinceSeq, 50, "*")
              .posts.filter((p) => p.author_name !== caller.name);
            const latestPost = db.getLatestPost(caller.swarm_id);
            const posts =
              unread.length > 0
                ? unread
                : latestPost && latestPost.author_name !== caller.name
                  ? [latestPost]
                  : [];
            if (posts.length > 0) {
              const maxSeq = posts[posts.length - 1].swarm_seq;
              deps.recordWakeSeq(caller.id, maxSeq);
              db.advanceReadCursor(caller.id, maxSeq);
            }
            return toolJson({
              woken: true,
              handoff:
                'All swarm members finished and @verifier posted PASS. Present the final summary to the user and call swarm{action:"complete"}.',
              posts: posts.map((p) => ({
                seq: p.swarm_seq,
                channel: p.channel,
                author: p.author_name,
                text: p.body,
              })),
            });
          }
        }

        const prevWaiter = waiters.get(caller.id);
        if (prevWaiter) {
          waiters.delete(caller.id);
          prevWaiter.resolve({ posts: [], aborted: true });
        }

        db.setMemberWait(caller.id, mentionsOnly ? "mentions" : "any", sinceSeq);
        emitSwarmChanged({ swarmId: caller.swarm_id, reason: "member_state", handle: caller.name });
        if (caller.role !== "coordinator") {
          void deps.maybeWakeIdleCoordinator(caller.swarm_id).catch((err) => {
            console.warn("[opencode-swarm] coordinator wake error:", err);
          });
        }

        const waitResult = await new Promise<{ posts: BoardPostRow[]; aborted?: boolean; handoff?: string }>(
          (resolveWait) => {
            const onAbort = () => {
              waiters.delete(caller.id);
              resolveWait({ posts: [], aborted: true });
            };
            toolCtx.signal?.addEventListener("abort", onAbort, { once: true });
            waiters.set(caller.id, {
              sinceSeq,
              mentionsOnly,
              resolve: (res) => {
                toolCtx.signal?.removeEventListener("abort", onAbort);
                resolveWait(res);
              },
            });
          },
        );

        const wokenPosts = waitResult.posts;
        if (wokenPosts.length > 0) {
          const maxSeq = wokenPosts[wokenPosts.length - 1].swarm_seq;
          deps.recordWakeSeq(caller.id, maxSeq);
          if (!mentionsOnly) {
            db.advanceReadCursor(caller.id, maxSeq);
          }
        }

        return toolJson({
          woken: wokenPosts.length > 0,
          ...(waitResult.aborted ? { aborted: true } : {}),
          ...(waitResult.handoff ? { handoff: waitResult.handoff } : {}),
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
}
