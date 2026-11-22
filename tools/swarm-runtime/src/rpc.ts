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
  roleModels: {
    coordinator: string;
    worker: string;
    verifier: string;
    monitor: string;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function standardSchema<T>(validate: (value: unknown) => string | null) {
  return {
    "~standard": {
      version: 1 as const,
      vendor: "swarm-runtime",
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
      vendor: "swarm-runtime",
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
  id: "local.swarm-runtime",
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
      input: optionalObjectSchema<{ swarmId: string; summary?: string }>((v) =>
        typeof v.swarmId === "string" ? null : "swarmId must be a string",
      ),
      output: standardSchema<{ ok: boolean; error?: string }>((v) =>
        isObject(v) && typeof v.ok === "boolean" ? null : "output must contain ok boolean",
      ),
    },
    killMember: {
      input: optionalObjectSchema<{ swarmId: string; handle: string; reason?: string }>((v) => {
        if (typeof v.swarmId !== "string") return "swarmId must be a string";
        if (typeof v.handle !== "string") return "handle must be a string";
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
