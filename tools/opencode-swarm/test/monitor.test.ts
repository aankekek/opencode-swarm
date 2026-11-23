import { describe, expect, test } from "bun:test";
import type { SwarmBoardDB } from "../src/db.js";
import { startStallMonitor } from "../src/monitor.js";
import type { BoardPostRow, MemberRow, SwarmRow } from "../src/types.js";

function makeSwarm(overrides: Partial<SwarmRow> = {}): SwarmRow {
  const staleAt = Date.now() - 60_000;
  return {
    id: "sw_monitor",
    title: "Monitor Swarm",
    objective: "Nudge bookkeeping",
    status: "running",
    owner_pid: process.pid,
    created_at: staleAt,
    updated_at: staleAt,
    last_monitor_nudge_seq: 0,
    monitor_nudge_count: 0,
    ...overrides,
  };
}

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  const staleAt = Date.now() - 60_000;
  return {
    id: "m_coordinator",
    swarm_id: "sw_monitor",
    name: "coordinator",
    generation: 1,
    session_id: "sess_coordinator",
    role: "coordinator",
    added_by: "user",
    group_prefix: null,
    model_provider: null,
    model_id: null,
    model_variant: null,
    workspace_mode: "inherit",
    workspace_dir: "C:/repo",
    workspace_branch: null,
    brief: "coordinate",
    state: "waiting",
    wake_mode: "any",
    wait_since: 0,
    last_read_seq: 0,
    last_post_seq: 0,
    last_post_time: null,
    steps: 0,
    activity: null,
    activity_kind: null,
    last_error: null,
    paused_quota: 0,
    track_status: "open",
    last_active_at: staleAt,
    ...overrides,
  };
}

function makePost(overrides: Partial<BoardPostRow> = {}): BoardPostRow {
  return {
    seq: 1,
    swarm_id: "sw_monitor",
    swarm_seq: 10,
    channel: "main",
    author_name: "coordinator",
    mentions_json: "[]",
    channel_mentions_json: "[]",
    is_all: 0,
    body: "existing board traffic",
    created_at: Date.now() - 60_000,
    ...overrides,
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return predicate();
}

describe("stall monitor nudge bookkeeping", () => {
  test("a post that outlives the race timeout commits its seq without a duplicate nudge", async () => {
    const swarm = makeSwarm();
    const coordinator = makeMember();
    const posts: BoardPostRow[] = [makePost()];
    const nudgeUpdates: Array<{ seq: number; count: number }> = [];
    let onPostCalls = 0;

    const db = {
      getActiveSwarms: () => [swarm],
      listMembers: () => [coordinator],
      getLatestPost: (_swarmId: string) => posts[posts.length - 1] ?? null,
      getLatestPostsWindow: () => ({ posts: [...posts], hasMore: false }),
      updateMonitorNudge: (_swarmId: string, seq: number, count: number) => {
        nudgeUpdates.push({ seq, count });
        swarm.last_monitor_nudge_seq = seq;
        swarm.monitor_nudge_count = count;
      },
    } as unknown as SwarmBoardDB;

    const stop = startStallMonitor(
      db,
      // monitorIntervalMs drives postTimeoutMs (floor of 100ms).
      { stallTimeoutMs: 500, monitorIntervalMs: 20 },
      async (swarmId, authorName, channel, body) => {
        onPostCalls += 1;
        // The real post settles well after the 100ms race timeout.
        await new Promise((r) => setTimeout(r, 150));
        const committed = makePost({
          seq: 100 + onPostCalls,
          swarm_seq: 101,
          author_name: authorName,
          body,
          created_at: Date.now(),
          swarm_id: swarmId,
          channel,
        });
        posts.push(committed);
        return committed;
      },
    );

    try {
      // 1) While the first post is still pending (after the 100ms race timeout
      //    but before its 150ms settle), a later tick must not start a second post.
      const sawSecondWhilePending = await waitUntil(() => onPostCalls > 1, 135);
      expect(onPostCalls).toBe(1);
      expect(sawSecondWhilePending).toBe(false);

      // 2) The real post's seq is recorded once the underlying promise settles.
      const recordedRealSeq = await waitUntil(() => nudgeUpdates.some((u) => u.seq === 101), 400);
      expect(recordedRealSeq).toBe(true);
      const realSeqUpdates = nudgeUpdates.filter((u) => u.seq === 101);
      expect(realSeqUpdates.length).toBe(1);
      expect(realSeqUpdates[0]).toEqual({ seq: 101, count: 1 });

      // 3) No duplicate nudge overall once the board moved to the committed post.
      await new Promise((r) => setTimeout(r, 120));
      expect(onPostCalls).toBe(1);
    } finally {
      stop();
    }
  });
});
