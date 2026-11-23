export type MemberRole = "coordinator" | "worker" | "verifier" | "monitor" | "narrator";

/** 1:1 Antigravity external member states */
export type MemberState = "waiting" | "working" | "stopped" | "killed";

export type SwarmStatus = "running" | "completing" | "completed" | "interrupted";
export type WorkspaceMode = "inherit" | "share" | "branch";
export type WakeMode = "mentions" | "any";
export type TrackStatus = "open" | "done";
export type ShellPolicy = "deny" | "ask" | "allow";
export type PermissionEffect = "allow" | "ask" | "deny";

export interface ModelSelection {
  providerID: string;
  id: string;
  variant?: string;
}

export interface PluginOptions {
  stallTimeoutMs?: number;
  monitorIntervalMs?: number;
  allowCoordinatorEdits?: boolean;
  /** Always allow shell execution when resolved shell policy is "allow" (default: true). */
  overrideShellAllow?: boolean;
  /** Coordinator shell policy ("allow" when overrideShellAllow: true, "ask" otherwise). */
  coordinatorShellPolicy?: ShellPolicy;
  /** "deny" or "ask" recommended unless workers run in isolated Git worktrees. */
  workerShellPolicy?: ShellPolicy;
  /** "ask" lets you approve read-only test commands; "deny" enforces strict read-only. */
  verifierShellPolicy?: ShellPolicy;
  /** Optional manual default "provider/model#variant" per role (coordinator included; applied on swarm creation). */
  roleModels?: Partial<Record<MemberRole, string>>;
  /** Start realtime Swarm Board HTTP UI (default: true). */
  boardServer?: boolean;
  /** Port for Swarm Board HTTP UI on 127.0.0.1 (default: 0 = ephemeral). */
  boardPort?: number;
  /** Optional explicit SQLite path; defaults outside workspace under ~/.opencode-swarm/<hash>/board.db. */
  dbPath?: string;
  /** Logs raw ctx.event.subscribe payloads to events.debug.jsonl. */
  debugEvents?: boolean;
  /** Logs permission.evaluate and execute.before payloads to hooks.debug.jsonl. */
  debugHooks?: boolean;
  /** Auto-spawn a verifier when all worker tracks are done and no verification ran (default: true). */
  autoSpawnVerifier?: boolean;
  /** Maximum live workers per swarm; extra units must be grouped (default: 6). */
  maxWorkers?: number;
  /** Maximum members spawned by one `add` call; split into sequential batches (default: 8). */
  maxShardsPerAdd?: number;
}

export interface SwarmRow {
  id: string;
  title: string;
  objective: string;
  status: SwarmStatus;
  owner_pid?: number | null;
  created_at: number;
  updated_at: number;
  last_monitor_nudge_seq: number;
  monitor_nudge_count: number;
}

export interface ChannelRow {
  swarm_id: string;
  name: string;
  topic: string;
  created_by: string;
  archived: number;
  created_at: number;
}

export interface MemberRow {
  id: string;
  swarm_id: string;
  name: string;
  generation: number;
  session_id: string;
  role: MemberRole;
  added_by: string;
  group_prefix: string | null;
  model_provider: string | null;
  model_id: string | null;
  model_variant: string | null;
  workspace_mode: WorkspaceMode;
  workspace_dir: string;
  workspace_branch: string | null;
  brief: string;
  state: MemberState;
  wake_mode: WakeMode;
  wait_since: number;
  last_read_seq: number;
  last_post_seq: number;
  last_post_time: number | null;
  steps: number;
  activity: string | null;
  activity_kind: string | null;
  last_error: string | null;
  paused_quota: number;
  track_status: TrackStatus;
  last_active_at: number;
}

export interface BoardPostRow {
  seq: number;
  swarm_id: string;
  swarm_seq: number;
  channel: string;
  author_name: string;
  mentions_json: string;
  channel_mentions_json: string;
  is_all: number;
  body: string;
  created_at: number;
}

export interface FileLockRow {
  id: number;
  swarm_id: string;
  glob_pattern: string;
  owner_name: string;
  owner_member_id: string;
  claimed_at: number;
}

export interface CachedCall {
  tool: string;
  input: unknown;
  sessionID?: string;
  ts: number;
}
