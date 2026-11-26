import type { Rpc } from "@opencode/plugin/rpc";

export interface SwarmBoardInfo {
  url: string;
  token: string;
  swarmId: string;
  title: string;
  status: string;
  activeCount: number;
}

export interface SwarmSnapshotMember {
  id: string;
  handle: string;
  name: string;
  generation: number;
  role: string;
  model: string;
  variant: string | null;
  state: string;
  paused_quota: boolean;
  track_status: string;
  session_id: string | null;
  owned_globs: string[];
  workspace_mode: string;
  last_active_at: number | null;
  activity: string | null;
}

export interface SwarmSnapshotPost {
  seq: number;
  channel: string;
  author: string;
  mentions: string[];
  channel_mentions: string[];
  is_all: boolean;
  body: string;
  created_at: number;
}

export interface SwarmSnapshotFileLock {
  id: number;
  glob_pattern: string;
  owner_handle: string;
  owner_member_id: string;
  claimed_at: number;
}

export interface SwarmSnapshot {
  swarm: {
    id: string;
    title: string;
    objective: string | null;
    status: string;
    created_at: number;
    updated_at: number;
  } | null;
  boardUrl: string;
  head: number;
  stalled?: boolean;
  members: SwarmSnapshotMember[];
  board_posts: SwarmSnapshotPost[];
  file_locks: SwarmSnapshotFileLock[];
}

export interface SwarmListItem {
  id: string;
  title: string;
  status: string;
  created_at: number;
  updated_at: number;
  member_count: number;
  post_count: number;
}

export type SwarmChangedEvent = {
  swarmId: string;
  reason: string;
  seq?: number;
  handle?: string;
  summary?: string;
};

export interface SwarmModelCatalogItem {
  providerID: string;
  id: string;
  name?: string;
  variants: string[];
}

export interface SwarmRoleConfig {
  swarmId: string | null;
  swarmTitle: string | null;
  swarmStatus: string;
  autoSpawnVerifier?: boolean;
  roleModels: {
    coordinator: string;
    worker: string;
    verifier: string;
    monitor: string;
    narrator?: string;
  };
  models: SwarmModelCatalogItem[];
}

export interface SetRoleModelResult {
  ok: boolean;
  role: string;
  model: string;
  switchedMembers: string[];
  rerunMembers: string[];
  error?: string;
}

export type UninstallCategoryId =
  | "pluginRegistration"
  | "gitWorktreesAndBranches"
  | "runtimeData"
  | "buildArtifacts"
  | "tempFiles";

export type UninstallSelection = Record<UninstallCategoryId, boolean>;

export interface UninstallPlanItem {
  path: string;
  kind: "edit-config" | "delete-file" | "delete-dir" | "git-worktree" | "git-branch";
  detail: string;
  sizeBytes?: number;
}

export interface UninstallPlanCategory {
  id: UninstallCategoryId;
  title: string;
  description: string;
  defaultChecked: boolean;
  items: UninstallPlanItem[];
}

export interface UninstallPlan {
  workspaceRoot: string;
  pluginRoot: string;
  runtimeDataDir: string;
  categories: UninstallPlanCategory[];
  preserved: string[];
  reloadCommands: string[];
}

export interface UninstallVerificationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface UninstallResult {
  ok: boolean;
  removed: string[];
  edited: string[];
  skipped: string[];
  errors: string[];
  verification: UninstallVerificationCheck[];
  nextSteps: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function standardSchema<T>(validate: (value: unknown) => string | null) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "opencode-swarm",
      validate(value: unknown): { value: T } | { issues: readonly { message: string }[] } {
        const issue = validate(value);
        return issue ? { issues: [{ message: issue }] } : { value: value as T };
      },
    },
  };
}

function optionalObjectSchema<T>(validate: (value: Record<string, unknown>) => string | null) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "opencode-swarm",
      validate(value: unknown): { value: T } | { issues: readonly { message: string }[] } {
        const normalized = value === undefined ? {} : value;
        if (!isObject(normalized)) {
          return { issues: [{ message: "input must be an object" }] };
        }
        const issue = validate(normalized);
        return issue ? { issues: [{ message: issue }] } : { value: normalized as T };
      },
    },
  };
}

export const SWARM_RPC_DEF = {
  id: "local.opencode-swarm",
  methods: {
    getBoardInfo: {
      input: optionalObjectSchema<Record<string, never>>(() => null),
      output: standardSchema<SwarmBoardInfo>((v) =>
        isObject(v) && typeof v.url === "string" && typeof v.swarmId === "string"
          ? null
          : "output must be SwarmBoardInfo",
      ),
    },
    getSwarmSnapshot: {
      input: optionalObjectSchema<{ sessionId?: string; swarmId?: string }>((v) => {
        if (v.sessionId !== undefined && typeof v.sessionId !== "string") {
          return "sessionId must be a string";
        }
        if (v.swarmId !== undefined && typeof v.swarmId !== "string") {
          return "swarmId must be a string";
        }
        return null;
      }),
      output: standardSchema<SwarmSnapshot>((v) =>
        isObject(v) && Array.isArray(v.members) && Array.isArray(v.board_posts) && Array.isArray(v.file_locks)
          ? null
          : "output must be SwarmSnapshot",
      ),
    },
    listSwarms: {
      input: optionalObjectSchema<{ limit?: number }>((v) =>
        v.limit !== undefined && typeof v.limit !== "number" ? "limit must be a number" : null,
      ),
      output: standardSchema<{ swarms: SwarmListItem[] }>((v) =>
        isObject(v) && Array.isArray(v.swarms) ? null : "output must contain swarms array",
      ),
    },
    completeSwarm: {
      input: optionalObjectSchema<{
        swarmId: string;
        summary?: string;
        callerSessionId?: string;
        exitSession?: boolean;
        sessionId?: string;
      }>((v) => {
        if (typeof v.swarmId !== "string") return "swarmId must be a string";
        if (v.callerSessionId !== undefined && typeof v.callerSessionId !== "string") {
          return "callerSessionId must be a string";
        }
        if (v.exitSession !== undefined && typeof v.exitSession !== "boolean") {
          return "exitSession must be a boolean";
        }
        if (v.sessionId !== undefined && typeof v.sessionId !== "string") {
          return "sessionId must be a string";
        }
        return null;
      }),
      output: standardSchema<{ ok: boolean; error?: string }>((v) =>
        isObject(v) && typeof v.ok === "boolean" ? null : "output must contain ok boolean",
      ),
    },
    killMember: {
      input: optionalObjectSchema<{ swarmId: string; handle: string; reason?: string; callerSessionId?: string }>((v) => {
        if (typeof v.swarmId !== "string") return "swarmId must be a string";
        if (typeof v.handle !== "string") return "handle must be a string";
        if (v.callerSessionId !== undefined && typeof v.callerSessionId !== "string") {
          return "callerSessionId must be a string";
        }
        return null;
      }),
      output: standardSchema<{ ok: boolean; error?: string }>((v) =>
        isObject(v) && typeof v.ok === "boolean" ? null : "output must contain ok boolean",
      ),
    },
    getRoleConfig: {
      input: optionalObjectSchema<{ sessionId?: string; swarmId?: string }>((v) => {
        if (v.sessionId !== undefined && typeof v.sessionId !== "string") {
          return "sessionId must be a string";
        }
        if (v.swarmId !== undefined && typeof v.swarmId !== "string") {
          return "swarmId must be a string";
        }
        return null;
      }),
      output: standardSchema<SwarmRoleConfig>((v) =>
        isObject(v) && isObject(v.roleModels) && Array.isArray(v.models) ? null : "output must be SwarmRoleConfig",
      ),
    },
    setRoleModel: {
      input: optionalObjectSchema<{ role: string; model: string; swarmId?: string; sessionId?: string }>((v) => {
        if (typeof v.role !== "string") return "role must be a string";
        if (typeof v.model !== "string") return "model must be a string";
        if (v.swarmId !== undefined && typeof v.swarmId !== "string") return "swarmId must be a string";
        if (v.sessionId !== undefined && typeof v.sessionId !== "string") return "sessionId must be a string";
        return null;
      }),
      output: standardSchema<SetRoleModelResult>((v) =>
        isObject(v) && typeof v.ok === "boolean" ? null : "output must be SetRoleModelResult",
      ),
    },
    setAutoSpawnVerifier: {
      input: optionalObjectSchema<{ enabled: boolean }>((v) =>
        typeof v.enabled === "boolean" ? null : "enabled must be a boolean",
      ),
      output: standardSchema<{ ok: boolean; autoSpawnVerifier: boolean }>((v) =>
        isObject(v) && typeof v.ok === "boolean" && typeof v.autoSpawnVerifier === "boolean"
          ? null
          : "output must contain ok and autoSpawnVerifier booleans",
      ),
    },
    previewUninstall: {
      input: optionalObjectSchema<Record<string, never>>(() => null),
      output: standardSchema<UninstallPlan>((v) =>
        isObject(v) && Array.isArray(v.categories) && Array.isArray(v.preserved)
          ? null
          : "output must be UninstallPlan",
      ),
    },
    executeUninstall: {
      input: optionalObjectSchema<{ categories?: Partial<UninstallSelection> }>((v) => {
        if (v.categories !== undefined && !isObject(v.categories)) {
          return "categories must be an object";
        }
        return null;
      }),
      output: standardSchema<UninstallResult>((v) =>
        isObject(v) && typeof v.ok === "boolean" && Array.isArray(v.verification)
          ? null
          : "output must be UninstallResult",
      ),
    },
  },
  events: {
    changed: {
      schema: standardSchema<SwarmChangedEvent>((v) =>
        isObject(v) && typeof v.swarmId === "string" && typeof v.reason === "string"
          ? null
          : "event must contain swarmId and reason",
      ),
    },
  },
} as const satisfies Rpc.PortableDefinition;

export default SWARM_RPC_DEF;
