import type { SetupContext } from "@opencode/plugin/gui";
import { Schema } from "effect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SwarmGuiContext = SetupContext<any>;

export const SWARM_SETTINGS_PAGE_ID = "swarm-board";

export const SwarmSettingsSchema = Schema.Struct({
  sidebarShow: Schema.Boolean,
  pillbarShow: Schema.Boolean,
  showWhenIdle: Schema.Boolean,
  composerPill: Schema.Boolean,
  bottomStrip: Schema.Boolean,
  withSidePanel: Schema.Boolean,
  toastEnabled: Schema.Boolean,
});

export type SwarmSettings = typeof SwarmSettingsSchema.Type;

export const DEFAULT_SWARM_SETTINGS: SwarmSettings = {
  sidebarShow: true,
  pillbarShow: true,
  showWhenIdle: true,
  composerPill: true,
  bottomStrip: false,
  withSidePanel: false,
  toastEnabled: true,
};

export interface SwarmSummary {
  id: string;
  title: string;
  status: string;
  activeCount?: number;
  waitingCount?: number;
  postCount?: number;
  pausedQuota?: boolean;
  stalled?: boolean;
  updatedAt?: string;
}

export interface SwarmMember {
  handle: string;
  role?: string;
  state: string;
  model?: string;
  variant?: string;
  trackStatus?: string;
  ownedGlobs?: string[];
  sessionId?: string;
  session_id?: string;
  server?: string;
}

export interface SwarmBoardPost {
  id: string | number;
  seq?: number;
  author: string;
  body: string;
  createdAt?: string;
  created_at?: string;
  mentions?: string[];
}

export interface SwarmFileLock {
  glob: string;
  owner: string;
  acquiredAt?: string;
}

export interface SwarmHandoff {
  from: string;
  to: string;
  summary?: string;
  at?: string;
}

export interface SwarmSnapshot {
  swarmId: string;
  title: string;
  status: string;
  boardUrl?: string;
  pausedQuota?: boolean;
  paused_quota?: boolean;
  stalled?: boolean;
  verifierStatus?: string;
  members: SwarmMember[];
  posts: SwarmBoardPost[];
  locks: SwarmFileLock[];
  handoffs?: SwarmHandoff[];
}

export function unwrapRpcOutput<T>(res: unknown): T | null {
  if (!res || typeof res !== "object") return null;
  if ("output" in res) {
    return (res as { output: T }).output;
  }
  return res as T;
}

export function normalizeSwarmList(raw: unknown): SwarmSummary[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { swarms?: unknown }).swarms)
      ? (raw as { swarms: unknown[] }).swarms
      : [];
  return arr.map((item: any) => ({
    id: String(item.id ?? ""),
    title: String(item.title ?? item.id ?? "Swarm"),
    status: String(item.status ?? "running"),
    activeCount: typeof item.activeCount === "number" ? item.activeCount : undefined,
    waitingCount: typeof item.waitingCount === "number" ? item.waitingCount : undefined,
    postCount: typeof item.postCount === "number" ? item.postCount : typeof item.post_count === "number" ? item.post_count : undefined,
    updatedAt: item.updatedAt ?? (typeof item.updated_at === "number" ? new Date(item.updated_at).toISOString() : undefined),
  }));
}

export function normalizeSwarmSnapshot(raw: unknown): SwarmSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;

  // Already normalized shape
  if (typeof r.swarmId === "string" && Array.isArray(r.posts)) {
    return r as SwarmSnapshot;
  }

  // Exact src/rpc.ts SwarmSnapshot shape: { swarm, boardUrl, head, members, board_posts, file_locks }
  const swarm = r.swarm as Record<string, any> | null | undefined;
  if (!swarm || typeof swarm !== "object") return null;

  const rawMembers = Array.isArray(r.members) ? r.members : [];
  const rawPosts = Array.isArray(r.board_posts) ? r.board_posts : Array.isArray(r.posts) ? r.posts : [];
  const rawLocks = Array.isArray(r.file_locks) ? r.file_locks : Array.isArray(r.locks) ? r.locks : [];

  const members: SwarmMember[] = rawMembers.map((m: any) => ({
    handle: String(m.handle ?? m.name ?? ""),
    role: typeof m.role === "string" ? m.role : undefined,
    state: String(m.state ?? "waiting"),
    model: typeof m.model === "string" ? m.model : undefined,
    variant: typeof m.variant === "string" ? m.variant : undefined,
    trackStatus: typeof m.track_status === "string" ? m.track_status : m.trackStatus,
    ownedGlobs: Array.isArray(m.owned_globs) ? m.owned_globs : Array.isArray(m.ownedGlobs) ? m.ownedGlobs : [],
    sessionId: typeof m.session_id === "string" ? m.session_id : m.sessionId,
    session_id: typeof m.session_id === "string" ? m.session_id : m.sessionId,
  }));

  const posts: SwarmBoardPost[] = rawPosts.map((p: any) => ({
    id: p.seq ?? p.id ?? 0,
    seq: typeof p.seq === "number" ? p.seq : undefined,
    author: String(p.author ?? ""),
    body: String(p.body ?? ""),
    createdAt: typeof p.created_at === "number" ? new Date(p.created_at).toISOString() : p.createdAt,
    created_at: typeof p.created_at === "number" ? new Date(p.created_at).toISOString() : p.created_at,
    mentions: Array.isArray(p.mentions) ? p.mentions : [],
  }));

  const locks: SwarmFileLock[] = rawLocks.map((l: any) => ({
    glob: String(l.glob_pattern ?? l.glob ?? ""),
    owner: String(l.owner_handle ?? l.owner ?? ""),
    acquiredAt: typeof l.claimed_at === "number" ? new Date(l.claimed_at).toISOString() : l.acquiredAt,
  }));

  const pausedQuota = rawMembers.some((m: any) => Boolean(m.paused_quota));
  const latestVerifier = [...posts]
    .reverse()
    .find((p) => p.author.replace(/^@/, "").toLowerCase() === "verifier");
  const verifierStatus = latestVerifier
    ? /\bFAIL\b/i.test(latestVerifier.body)
      ? "FAIL"
      : /\bPASS\b/i.test(latestVerifier.body)
        ? "PASS"
        : undefined
    : undefined;

  const handoffs: SwarmHandoff[] = [];
  for (const p of posts) {
    if (p.mentions && p.mentions.length > 0) {
      for (const target of p.mentions) {
        handoffs.push({
          from: p.author,
          to: target.startsWith("@") ? target : `@${target}`,
          summary: p.body.slice(0, 80),
          at: p.createdAt,
        });
      }
    }
  }

  return {
    swarmId: String(swarm.id ?? ""),
    title: String(swarm.title ?? swarm.id ?? "Swarm"),
    status: String(swarm.status ?? "running"),
    boardUrl: typeof r.boardUrl === "string" ? r.boardUrl : undefined,
    pausedQuota,
    paused_quota: pausedQuota,
    verifierStatus,
    members,
    posts,
    locks,
    handoffs,
  };
}
