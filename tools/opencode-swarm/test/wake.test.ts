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
