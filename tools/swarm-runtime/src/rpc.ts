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

export interface SwarmChangedEvent {
  swarmId: string;
  reason: string;
  seq?: number;
  handle?: string;
  summary?: string;
}

export const SWARM_RPC_DEF = {
  id: "local.swarm-runtime",
  methods: {
    getBoardInfo: {
      input: { type: "object", properties: {} } as const,
      output: {
        type: "object",
        properties: {
          url: { type: "string" },
          token: { type: "string" },
          swarmId: { type: "string" },
          title: { type: "string" },
          status: { type: "string" },
          activeCount: { type: "number" },
        },
        required: ["url", "token", "swarmId", "title", "status", "activeCount"],
      } as const,
    },
    getSwarmSnapshot: {
      input: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          swarmId: { type: "string" },
        },
      } as const,
      output: {
        type: "object",
        properties: {
          swarm: {
            type: ["object", "null"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              objective: { type: ["string", "null"] },
              status: { type: "string" },
              created_at: { type: "number" },
              updated_at: { type: "number" },
            },
            required: ["id", "title", "objective", "status", "created_at", "updated_at"],
          },
          boardUrl: { type: "string" },
          head: { type: "number" },
          members: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                handle: { type: "string" },
                name: { type: "string" },
                generation: { type: "number" },
                role: { type: "string" },
                model: { type: "string" },
                variant: { type: ["string", "null"] },
                state: { type: "string" },
                paused_quota: { type: "boolean" },
                track_status: { type: "string" },
                session_id: { type: ["string", "null"] },
                owned_globs: { type: "array", items: { type: "string" } },
                workspace_mode: { type: "string" },
                last_active_at: { type: ["number", "null"] },
                activity: { type: ["string", "null"] },
              },
              required: [
                "id",
                "handle",
                "name",
                "generation",
                "role",
                "model",
                "variant",
                "state",
                "paused_quota",
                "track_status",
                "session_id",
                "owned_globs",
                "workspace_mode",
                "last_active_at",
                "activity",
              ],
            },
          },
          board_posts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                seq: { type: "number" },
                channel: { type: "string" },
                author: { type: "string" },
                mentions: { type: "array", items: { type: "string" } },
                channel_mentions: { type: "array", items: { type: "string" } },
                is_all: { type: "boolean" },
                body: { type: "string" },
                created_at: { type: "number" },
              },
              required: [
                "seq",
                "channel",
                "author",
                "mentions",
                "channel_mentions",
                "is_all",
                "body",
                "created_at",
              ],
            },
          },
          file_locks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                glob_pattern: { type: "string" },
                owner_handle: { type: "string" },
                owner_member_id: { type: "string" },
                claimed_at: { type: "number" },
              },
              required: ["id", "glob_pattern", "owner_handle", "owner_member_id", "claimed_at"],
            },
          },
        },
        required: ["swarm", "boardUrl", "head", "members", "board_posts", "file_locks"],
      } as const,
    },
    listSwarms: {
      input: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      } as const,
      output: {
        type: "object",
        properties: {
          swarms: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                status: { type: "string" },
                created_at: { type: "number" },
                updated_at: { type: "number" },
                member_count: { type: "number" },
                post_count: { type: "number" },
              },
              required: ["id", "title", "status", "created_at", "updated_at", "member_count", "post_count"],
            },
          },
        },
        required: ["swarms"],
      } as const,
    },
    completeSwarm: {
      input: {
        type: "object",
        properties: {
          swarmId: { type: "string" },
          summary: { type: "string" },
        },
        required: ["swarmId"],
      } as const,
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          error: { type: "string" },
        },
        required: ["ok"],
      } as const,
    },
    killMember: {
      input: {
        type: "object",
        properties: {
          swarmId: { type: "string" },
          handle: { type: "string" },
          reason: { type: "string" },
        },
        required: ["swarmId", "handle"],
      } as const,
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          error: { type: "string" },
        },
        required: ["ok"],
      } as const,
    },
  },
  events: {
    changed: {
      type: "object",
      properties: {
        swarmId: { type: "string" },
        reason: { type: "string" },
        seq: { type: "number" },
        handle: { type: "string" },
        summary: { type: "string" },
      },
      required: ["swarmId", "reason"],
    } as const,
  },
} as const;

export default SWARM_RPC_DEF;
