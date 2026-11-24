import { describe, expect, test } from "bun:test";
import type { SwarmBoardDB } from "../src/db.js";
import type { BoardPostRow, MemberRow } from "../src/types.js";
import { createWakeController, type WaiterEntry } from "../src/wake.js";

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "m_worker",
    swarm_id: "sw1",
    name: "worker1",
    generation: 1,
    session_id: "sess_worker1",
    role: "worker",
    added_by: "coordinator",
    group_prefix: null,
    model_provider: null,
    model_id: null,
    model_variant: null,
    workspace_mode: "inherit",
    workspace_dir: "/tmp/repo",
    workspace_branch: null,
    brief: "work",
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
    track_status: "done",
    last_active_at: 0,
    ...overrides,
  };
}

function makePost(overrides: Partial<BoardPostRow> = {}): BoardPostRow {
  return {
    seq: 1,
    swarm_id: "sw1",
    swarm_seq: 5,
    channel: "main",
    author_name: "coordinator",
    mentions_json: "[]",
    channel_mentions_json: "[]",
    is_all: 0,
    body: "latest board traffic",
    created_at: 0,
    ...overrides,
  };
}

interface StubOptions {
  setMemberState?: (id: string, state: string) => void;
  advanceReadCursor?: (id: string, seq: number) => void;
  getPostsPage?: () => { posts: BoardPostRow[]; hasMore: boolean };
}

function makeDeps(options: StubOptions = {}) {
  const worker = makeMember();
  const coord = makeMember({
    id: "m_coord",
    name: "coordinator",
    role: "coordinator",
    session_id: "sess_coord",
  });
  const latestPost = makePost({ author_name: "worker" });
  const dbStub = {
    getSwarm: () => ({ id: "sw1", status: "running" }),
    getMemberById: (id: string) => (id === coord.id ? coord : worker),
    getMemberChannels: () => ["main"],
    getMemberByName: (_swarmId: string, name: string) => (name === coord.name ? coord : worker),
    listMembers: () => [coord, worker],
    getLatestPostsWindow: () => ({ posts: [] }),
    getLatestPost: () => latestPost,
    getTaskCounts: () => ({ total: 0, open: 0, assigned: 0, done: 0 }),
    getPostsPage: options.getPostsPage ?? (() => ({ posts: [latestPost], hasMore: false })),
    setMemberState: options.setMemberState ?? (() => {}),
    advanceReadCursor: options.advanceReadCursor ?? (() => {}),
    addPost: () => makePost(),
  };
  const waiters = new Map<string, WaiterEntry>();
  const emitted: unknown[] = [];
  const controller = createWakeController({
    db: dbStub as unknown as SwarmBoardDB,
    getAutoSpawnVerifier: () => false,
    waiters,
    promptSession: async () => undefined,
    emitSwarmChanged: (event) => {
      emitted.push(event);
    },
    spawnVerifier: async () => undefined,
  });
  return { controller, waiters, worker, coord, latestPost, emitted };
}

function parkWaiter(
  waiters: Map<string, WaiterEntry>,
  memberId: string,
  sinceSeq = 0,
  mentionsOnly = false,
) {
  const resolved: Array<{ posts: BoardPostRow[]; aborted?: boolean; handoff?: string }> = [];
  waiters.set(memberId, {
    sinceSeq,
    mentionsOnly,
    resolve: (res) => resolved.push(res),
  });
  return resolved;
}

describe("wake controller settles parked waiters even when DB work throws", () => {
  test("wakeMember resolves a parked waiter when db.setMemberState throws", async () => {
    const { controller, waiters, worker, latestPost } = makeDeps({
      setMemberState: () => {
        throw new Error("setMemberState failed");
      },
    });
    const resolved = parkWaiter(waiters, worker.id);

    await expect(controller.wakeMember(worker, latestPost)).resolves.toBeUndefined();

    expect(waiters.has(worker.id)).toBe(false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].posts).toHaveLength(1);
    expect(resolved[0].posts[0].swarm_seq).toBe(latestPost.swarm_seq);
  });

  test("wakeMember resolves a parked waiter when db.advanceReadCursor throws", async () => {
    const { controller, waiters, worker, latestPost } = makeDeps({
      advanceReadCursor: () => {
        throw new Error("advanceReadCursor failed");
      },
    });
    const resolved = parkWaiter(waiters, worker.id);

    await expect(controller.wakeMember(worker, latestPost)).resolves.toBeUndefined();

    expect(waiters.has(worker.id)).toBe(false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].posts[0].swarm_seq).toBe(latestPost.swarm_seq);
    expect(resolved[0].aborted).toBeUndefined();
  });

  test("maybeWakeIdleCoordinator resolves a parked coordinator when db.getPostsPage throws", async () => {
    const { controller, waiters, coord, latestPost } = makeDeps({
      getPostsPage: () => {
        throw new Error("getPostsPage failed");
      },
    });
    const resolved = parkWaiter(waiters, coord.id);

    await expect(controller.maybeWakeIdleCoordinator("sw1", latestPost)).resolves.toBeUndefined();

    // The coordinator waiter must be removed and resolved, not left orphaned.
    expect(waiters.has(coord.id)).toBe(false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].handoff).toBeDefined();
    expect(resolved[0].posts).toHaveLength(1);
    expect(resolved[0].posts[0].swarm_seq).toBe(latestPost.swarm_seq);
  });

  test("maybeWakeIdleCoordinator resolves a parked coordinator when db.advanceReadCursor throws", async () => {
    const { controller, waiters, coord, latestPost } = makeDeps({
      advanceReadCursor: () => {
        throw new Error("advanceReadCursor failed");
      },
    });
    const resolved = parkWaiter(waiters, coord.id);

    await expect(controller.maybeWakeIdleCoordinator("sw1", latestPost)).resolves.toBeUndefined();

    expect(waiters.has(coord.id)).toBe(false);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].handoff).toBeDefined();
  });
});

describe("verification requests are serialized per swarm", () => {
  test("concurrent ensureVerifierForCompletedWork posts [verify] exactly once", async () => {
    const coord = makeMember({
      id: "m_coord",
      name: "coordinator",
      role: "coordinator",
      session_id: "sess_coord",
    });
    // Stub deliberately keeps the verifier in "waiting": member-state writes are
    // not persisted, so both overlapping calls reach the dedupe guards instead of
    // short-circuiting on the transient "working" state.
    const verifier = makeMember({
      id: "m_ver",
      name: "verifier",
      role: "verifier",
      session_id: "sess_ver",
      wake_mode: "any",
      state: "waiting",
    });
    const latestPost = makePost({ author_name: "worker1", swarm_seq: 5 });
    const addedPosts: Array<{ body: string; swarm_seq: number }> = [];

    const dbStub = {
      getSwarm: () => ({ id: "sw1", status: "running" }),
      getMemberById: (id: string) => (id === coord.id ? coord : verifier),
      getMemberByName: (_swarmId: string, name: string) =>
        name === coord.name ? coord : name === verifier.name ? verifier : undefined,
      getMemberChannels: () => ["main"],
      getChannel: () => ({ id: "ch_main", swarm_id: "sw1", name: "main", archived: 0 }),
      listMembers: () => [coord, verifier],
      getLatestPost: () => latestPost,
      getPostsPage: () => ({
        posts: [makePost({ author_name: "coordinator", swarm_seq: 6, body: "@verifier [verify]" })],
        hasMore: false,
      }),
      setMemberState: () => {},
      advanceReadCursor: () => {},
      addPost: (args: { body: string }) => {
        const post = makePost({ author_name: "coordinator", swarm_seq: 6, body: args.body });
        addedPosts.push({ body: post.body, swarm_seq: post.swarm_seq });
        return post;
      },
    };

    const controller = createWakeController({
      db: dbStub as unknown as SwarmBoardDB,
      getAutoSpawnVerifier: () => true,
      waiters: new Map<string, WaiterEntry>(),
      // Delay inside postToBoard's wake delivery keeps the request in flight.
      promptSession: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      emitSwarmChanged: () => {},
      spawnVerifier: async () => undefined,
    });

    const outcomes = await Promise.all([
      controller.ensureVerifierForCompletedWork("sw1", coord, latestPost),
      controller.ensureVerifierForCompletedWork("sw1", coord, latestPost),
    ]);

    expect(addedPosts.filter((p) => p.body.includes("[verify]"))).toHaveLength(1);
    expect(outcomes.filter((o) => o === "requested")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "in_progress")).toHaveLength(1);
    expect(outcomes.sort()).toEqual(["in_progress", "requested"]);

    // The seq guard still suppresses a later request for the same post.
    await expect(controller.ensureVerifierForCompletedWork("sw1", coord, latestPost)).resolves.toBe(
      "in_progress",
    );
    expect(addedPosts.filter((p) => p.body.includes("[verify]"))).toHaveLength(1);
  });
});
