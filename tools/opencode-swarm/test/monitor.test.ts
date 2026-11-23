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
      getTaskCounts: () => ({ total: 0, open: 0, assigned: 0, done: 0 }),
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

interface CoverageFixture {
  swarm: SwarmRow;
  members: MemberRow[];
  posts: BoardPostRow[];
  counts: { total: number; open: number; assigned: number; done: number };
  bodies: string[];
}

function makeCoverageFixture(overrides: {
  swarm?: Partial<SwarmRow>;
  members?: MemberRow[];
  open?: number;
} = {}): CoverageFixture {
  const swarm = makeSwarm(overrides.swarm);
  const members = overrides.members ?? [makeMember(), makeMember({
    id: "m_worker",
    name: "worker-1",
    role: "worker",
    session_id: "sess_worker",
  })];
  const posts: BoardPostRow[] = [makePost({ swarm_seq: 10 })];
  const open = overrides.open ?? 5;
  return {
    swarm,
    members,
    posts,
    bodies: [],
    counts: { total: open, open, assigned: 0, done: 0 },
  };
}

function startCoverageMonitor(fixture: CoverageFixture, maxWorkers = 6): () => void {
  const db = {
    getActiveSwarms: () => [fixture.swarm],
    listMembers: () => fixture.members,
    getLatestPost: () => fixture.posts[fixture.posts.length - 1] ?? null,
    getLatestPostsWindow: () => ({ posts: [...fixture.posts], hasMore: false }),
    getTaskCounts: () => fixture.counts,
    updateMonitorNudge: (_swarmId: string, seq: number, count: number) => {
      fixture.swarm.last_monitor_nudge_seq = seq;
      fixture.swarm.monitor_nudge_count = count;
    },
  } as unknown as SwarmBoardDB;

  return startStallMonitor(
    db,
    { stallTimeoutMs: 500, monitorIntervalMs: 20, maxWorkers },
    async (swarmId, authorName, channel, body) => {
      fixture.bodies.push(body);
      const committed = makePost({
        seq: 100 + fixture.bodies.length,
        swarm_seq: 101 + fixture.bodies.length - 1,
        author_name: authorName,
        body,
        created_at: Date.now() - 60_000,
        swarm_id: swarmId,
        channel,
      });
      fixture.posts.push(committed);
      return committed;
    },
  );
}

function coverageBodies(fixture: CoverageFixture): string[] {
  return fixture.bodies.filter((b) => b.includes("[coverage]"));
}

describe("stall monitor coverage nudge", () => {
  test("nudges once for an under-sized worker pool, then only after board movement", async () => {
    const fixture = makeCoverageFixture({ open: 5 });
    const stop = startCoverageMonitor(fixture, 6);
    try {
      expect(await waitUntil(() => coverageBodies(fixture).length === 1, 1000)).toBe(true);
      const first = coverageBodies(fixture)[0];
      expect(first).toContain("5 unit(s) unassigned");
      expect(first).toContain("cap 6");
      expect(first).toContain("1 worker(s) live");

      // No board movement: further ticks must stay silent.
      await new Promise((r) => setTimeout(r, 120));
      expect(coverageBodies(fixture).length).toBe(1);

      // A real board post moves latestSeq and earns a fresh nudge.
      fixture.posts.push(makePost({ seq: 200, swarm_seq: 110, body: "board moved", created_at: Date.now() - 60_000 }));
      expect(await waitUntil(() => coverageBodies(fixture).length === 2, 1000)).toBe(true);
      await new Promise((r) => setTimeout(r, 120));
      expect(coverageBodies(fixture).length).toBe(2);
    } finally {
      stop();
    }
  });

  test("uses the at-cap message when live workers reach maxWorkers", async () => {
    const workers = Array.from({ length: 6 }, (_, i) =>
      makeMember({
        id: `m_worker_${i}`,
        name: `worker-${i + 1}`,
        role: "worker",
        session_id: `sess_worker_${i}`,
        track_status: "done",
      }),
    );
    const fixture = makeCoverageFixture({ open: 4, members: [makeMember(), ...workers] });
    const stop = startCoverageMonitor(fixture, 6);
    try {
      expect(await waitUntil(() => coverageBodies(fixture).length === 1, 1000)).toBe(true);
      const body = coverageBodies(fixture)[0];
      expect(body).toContain("4 unit(s) unassigned");
      expect(body).toContain("cap 6 is reached");
    } finally {
      stop();
    }
  });

  test("does not nudge while a member is working", async () => {
    const working = makeMember({
      id: "m_worker",
      name: "worker-1",
      role: "worker",
      session_id: "sess_worker",
      state: "working",
      last_active_at: Date.now(),
    });
    const fixture = makeCoverageFixture({ open: 5, members: [makeMember(), working] });
    const stop = startCoverageMonitor(fixture, 6);
    try {
      await new Promise((r) => setTimeout(r, 150));
      expect(coverageBodies(fixture).length).toBe(0);
    } finally {
      stop();
    }
  });

  test("does not nudge below the open-unit threshold", async () => {
    const fixture = makeCoverageFixture({ open: 2 });
    const stop = startCoverageMonitor(fixture, 6);
    try {
      await new Promise((r) => setTimeout(r, 150));
      expect(coverageBodies(fixture).length).toBe(0);
    } finally {
      stop();
    }
  });

  test("does not nudge a swarm that is not running", async () => {
    const fixture = makeCoverageFixture({ open: 5, swarm: { status: "completed" } });
    const stop = startCoverageMonitor(fixture, 6);
    try {
      await new Promise((r) => setTimeout(r, 150));
      expect(coverageBodies(fixture).length).toBe(0);
    } finally {
      stop();
    }
  });
});
