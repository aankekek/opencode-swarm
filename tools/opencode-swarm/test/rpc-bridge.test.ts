import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SwarmBoardDB } from "../src/db.js";
import { COORDINATOR_PROTOCOL } from "../src/prompts.js";
import { SWARM_RPC_DEF } from "../src/rpc.js";
import { swarmRuntimePlugin } from "../src/plugin.js";

type RpcHandler = (args?: Record<string, unknown>) => Promise<unknown>;
type RegisteredTool = { name: string; execute: (args: Record<string, unknown>, ctx: unknown) => Promise<string> };

function parseToolResult(value: unknown): Record<string, any> {
  return JSON.parse((value as { content: string }).content);
}

async function createBridgeHarness(tempDir: string, pluginOptions: Record<string, unknown> = {}) {
  let registeredHandlers: Record<string, RpcHandler> = {};
  const emittedEvents: Array<{ event: string; payload: unknown }> = [];
  const registeredTools = new Map<string, RegisteredTool>();
  let disposed = false;

  let sessionCounter = 0;
  const mockCtx = {
    options: pluginOptions,
    location: { directory: tempDir },
    directory: tempDir,
    worktree: tempDir,
    rpc: {
      register: async (_def: unknown, handlers: Record<string, RpcHandler>) => {
        registeredHandlers = handlers;
        return {
          events: {
            emit: (event: string, payload: unknown) => {
              emittedEvents.push({ event, payload });
            },
          },
          dispose: () => {
            disposed = true;
          },
        };
      },
    },
    tool: {
      transform: async (cb: (tools: { add: (t: RegisteredTool) => void }) => void) => {
        cb({
          add: (t) => {
            registeredTools.set(t.name as string, t);
          },
        });
      },
      hook: async () => () => {},
    },
    command: {
      transform: async () => {},
    },
    permission: {
      hook: async () => () => {},
    },
    session: {
      create: async () => {
        const id = `worker-sess-${++sessionCounter}`;
        return { id, data: { id } };
      },
      prompt: async () => ({}),
      interrupt: async () => ({}),
      update: async () => ({}),
      hook: async () => () => {},
    },
    event: {
      subscribe: () => () => {},
    },
    model: {
      list: async () => ({ data: [] }),
      default: async () => ({ data: undefined }),
    },
  };

  const hooks = await (swarmRuntimePlugin as unknown as {
    setup: (ctx: unknown, opts?: unknown) => Promise<unknown>;
  }).setup(mockCtx, {
    dbPath: join(tempDir, "board.db"),
    boardPort: 0,
    ...pluginOptions,
  });

  return { registeredHandlers, registeredTools, emittedEvents, hooks, isDisposed: () => disposed };
}

type BridgeHarness = Awaited<ReturnType<typeof createBridgeHarness>>;

async function withBridgeHarness(
  fn: (harness: BridgeHarness) => Promise<void>,
  pluginOptions: Record<string, unknown> = {},
) {
  const tempDir = mkdtempSync(join(tmpdir(), "swarm-rpc-bridge-"));
  const prevUserProfile = process.env.USERPROFILE;
  const prevHome = process.env.HOME;
  process.env.USERPROFILE = tempDir;
  process.env.HOME = tempDir;
  try {
    const harness = await createBridgeHarness(tempDir, pluginOptions);
    await fn(harness);
    await (harness.hooks as { dispose?: () => Promise<void> } | undefined)?.dispose?.();
  } finally {
    process.env.USERPROFILE = prevUserProfile;
    process.env.HOME = prevHome;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore Windows SQLite file lock on temp dir cleanup
    }
  }
}

describe("SWARM_RPC_DEF and RPC bridge", () => {
  test("SWARM_RPC_DEF defines id, 10 methods, and changed event", () => {
    expect(SWARM_RPC_DEF.id).toBe("local.opencode-swarm");
    expect(Object.keys(SWARM_RPC_DEF.methods)).toEqual([
      "getBoardInfo",
      "getSwarmSnapshot",
      "listSwarms",
      "completeSwarm",
      "killMember",
      "getRoleConfig",
      "setRoleModel",
      "setAutoSpawnVerifier",
      "previewUninstall",
      "executeUninstall",
    ]);
    expect(SWARM_RPC_DEF.events.changed).toBeDefined();
  });

  test("registers all 5 RPC handlers and emits changed events", async () => {
    await withBridgeHarness(async ({ registeredHandlers, registeredTools, emittedEvents }) => {
      // 1. Initially no active swarm
      const initialInfo = (await registeredHandlers.getBoardInfo()) as { swarmId: string; activeCount: number };
      expect(initialInfo.swarmId).toBe("");
      expect(initialInfo.activeCount).toBe(0);

      const emptySnap = (await registeredHandlers.getSwarmSnapshot({})) as { swarm: unknown; head: number };
      expect(emptySnap.swarm).toBeNull();
      expect(emptySnap.head).toBe(0);

      // 2. Create a swarm via swarm tool (title) and post a message
      const swarmTool = registeredTools.get("swarm")!;
      const postTool = registeredTools.get("post_message")!;
      expect(swarmTool).toBeDefined();
      expect(postTool).toBeDefined();

      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "RPC Test Swarm" }, toolCtx);
      await postTool.execute({ text: "Hello board from coordinator" }, toolCtx);

      // Verify changed event emitted for board_post
      expect(emittedEvents.some((e) => e.event === "changed" && (e.payload as { reason: string }).reason === "board_post")).toBe(true);

      // 3. getBoardInfo
      const info = (await registeredHandlers.getBoardInfo()) as { swarmId: string; title: string; status: string; activeCount: number };
      expect(info.swarmId).not.toBe("");
      expect(info.title).toBe("RPC Test Swarm");
      expect(info.status).toBe("running");
      expect(info.activeCount).toBe(1);

      // 4. getSwarmSnapshot by swarmId and by sessionId
      const snapById = (await registeredHandlers.getSwarmSnapshot({ swarmId: info.swarmId })) as {
        swarm: { id: string; title: string } | null;
        head: number;
        members: Array<{ handle: string; role: string }>;
        board_posts: Array<{ seq: number; body: string }>;
      };
      expect(snapById.swarm?.id).toBe(info.swarmId);
      expect(snapById.head).toBeGreaterThanOrEqual(1);
      expect(snapById.members.some((m) => m.handle === "coordinator")).toBe(true);
      expect(snapById.board_posts.some((p) => p.body === "Hello board from coordinator")).toBe(true);

      const snapBySession = (await registeredHandlers.getSwarmSnapshot({ sessionId: "coord-sess-1" })) as {
        swarm: { id: string } | null;
      };
      expect(snapBySession.swarm?.id).toBe(info.swarmId);

      // 5. listSwarms
      const listed = (await registeredHandlers.listSwarms({ limit: 10 })) as {
        swarms: Array<{ id: string; title: string; member_count: number; post_count: number }>;
      };
      expect(listed.swarms.length).toBe(1);
      expect(listed.swarms[0].id).toBe(info.swarmId);
      expect(listed.swarms[0].member_count).toBe(1);
      expect(listed.swarms[0].post_count).toBeGreaterThanOrEqual(1);

      // 6. killMember (missing member returns ok: false)
      const killMissing = (await registeredHandlers.killMember({
        swarmId: info.swarmId,
        handle: "nonexistent",
      })) as { ok: boolean; error?: string };
      expect(killMissing.ok).toBe(false);
      expect(killMissing.error).toBeDefined();

      // 7. setAutoSpawnVerifier toggles runtime flag and reflects in getRoleConfig
      const initialCfg = (await registeredHandlers.getRoleConfig({})) as { autoSpawnVerifier?: boolean };
      expect(initialCfg.autoSpawnVerifier).toBe(true);
      const disabledRes = (await registeredHandlers.setAutoSpawnVerifier({ enabled: false })) as {
        ok: boolean;
        autoSpawnVerifier: boolean;
      };
      expect(disabledRes).toEqual({ ok: true, autoSpawnVerifier: false });
      const disabledCfg = (await registeredHandlers.getRoleConfig({})) as { autoSpawnVerifier?: boolean };
      expect(disabledCfg.autoSpawnVerifier).toBe(false);
      const reenabledRes = (await registeredHandlers.setAutoSpawnVerifier({ enabled: true })) as {
        ok: boolean;
        autoSpawnVerifier: boolean;
      };
      expect(reenabledRes).toEqual({ ok: true, autoSpawnVerifier: true });

      // 8. completeSwarm
      const completed = (await registeredHandlers.completeSwarm({
        swarmId: info.swarmId,
        summary: "All done",
      })) as { ok: boolean };
      expect(completed.ok).toBe(true);
      expect(
        emittedEvents.some(
          (e) =>
            e.event === "changed" &&
            (e.payload as { reason: string; summary?: string }).reason === "swarm_completed" &&
            (e.payload as { summary?: string }).summary === "All done",
        ),
      ).toBe(true);
    });
  });

  test("completeSwarm reaches completed and releases locks when a member teardown throws", async () => {
    await withBridgeHarness(async ({ registeredHandlers, registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };

      await swarmTool.execute({ action: "title", title: "RPC failure containment" }, toolCtx);
      await swarmTool.execute({ action: "add", name: "worker-a", brief: "work" }, toolCtx);
      const claim = JSON.parse(
        ((await swarmTool.execute({ action: "claim", globs: ["src/**/*.ts"] }, toolCtx)) as unknown as { content: string })
          .content,
      );
      expect(claim.ok).toBe(true);

      const before = (await registeredHandlers.getSwarmSnapshot({ sessionId: "coord-sess-1" })) as {
        swarm: { id: string; status: string };
        file_locks: unknown[];
      };
      expect(before.swarm.status).toBe("running");
      expect(before.file_locks.length).toBeGreaterThan(0);

      const originalSetMemberState = SwarmBoardDB.prototype.setMemberState;
      let injected = false;
      try {
        SwarmBoardDB.prototype.setMemberState = function patchedSetMemberState(
          this: SwarmBoardDB,
          ...args: Parameters<typeof originalSetMemberState>
        ) {
          if (!injected) {
            injected = true;
            throw new Error("injected setMemberState failure");
          }
          return originalSetMemberState.apply(this, args);
        };

        const res = (await registeredHandlers.completeSwarm({
          swarmId: before.swarm.id,
          summary: "partial",
        })) as { ok: boolean; error?: string; swarm_id?: string; status?: string; partial?: boolean };

        expect(injected).toBe(true);
        expect(res.ok).toBe(false);
        expect(res.partial).toBe(true);
        expect(res.status).toBe("completed");
        expect(res.swarm_id).toBe(before.swarm.id);
        expect(res.error).toContain("injected setMemberState failure");
      } finally {
        SwarmBoardDB.prototype.setMemberState = originalSetMemberState;
      }

      const after = (await registeredHandlers.getSwarmSnapshot({ swarmId: before.swarm.id })) as {
        swarm: { status: string };
        file_locks: unknown[];
      };
      expect(after.swarm.status).toBe("completed");
      expect(after.file_locks).toEqual([]);
      const info = (await registeredHandlers.getBoardInfo()) as { activeCount: number };
      expect(info.activeCount).toBe(0);
    });
  });

  test("resolves a swarm only via explicit swarmId or a member sessionId", async () => {
    await withBridgeHarness(async ({ registeredHandlers, registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Historical Swarm" }, toolCtx);

      // (c) positive control: a running swarm resolves through its coordinator sessionId
      const running = (await registeredHandlers.getSwarmSnapshot({ sessionId: "coord-sess-1" })) as {
        swarm: { id: string; status: string } | null;
      };
      expect(running.swarm?.status).toBe("running");
      const swarmId = running.swarm!.id;

      const completed = (await registeredHandlers.completeSwarm({ swarmId, summary: "done" })) as { ok: boolean };
      expect(completed.ok).toBe(true);

      // (a) a completed/historical swarm with no sessionId must not be invented by the GUI
      const noIdentity = (await registeredHandlers.getSwarmSnapshot({})) as { swarm: unknown };
      expect(noIdentity.swarm).toBeNull();

      // (b) a session that is not a member must not attach to the historical swarm
      const unrelated = (await registeredHandlers.getSwarmSnapshot({ sessionId: "not-a-member" })) as { swarm: unknown };
      expect(unrelated.swarm).toBeNull();

      // (d) explicit swarmId still browses history
      const byId = (await registeredHandlers.getSwarmSnapshot({ swarmId })) as {
        swarm: { id: string; status: string } | null;
      };
      expect(byId.swarm?.id).toBe(swarmId);
      expect(byId.swarm?.status).toBe("completed");
    });
  });

  test("coordinator protocol sizes the swarm from an explicit unit list", () => {
    expect(COORDINATOR_PROTOCOL).toContain("## Sizing the swarm");
    expect(COORDINATOR_PROTOCOL).toMatch(/N items is N units/i);
    expect(COORDINATOR_PROTOCOL).toMatch(/group by area/i);
    expect(COORDINATOR_PROTOCOL).toMatch(/maxWorkers/);
    expect(COORDINATOR_PROTOCOL).toMatch(/maxShardsPerAdd/);
    expect(COORDINATOR_PROTOCOL).toMatch(/do not retry blindly/i);
    expect(COORDINATOR_PROTOCOL).toMatch(/one worker per unit|one unit means one worker/i);
    expect(COORDINATOR_PROTOCOL).toContain('swarm{action:"plan"');
    expect(COORDINATOR_PROTOCOL).toMatch(/unassigned_units/);
    expect(COORDINATOR_PROTOCOL).toMatch(/more than 2 units/i);
    expect(COORDINATOR_PROTOCOL.toLowerCase()).not.toContain("do not spawn a swarm");
    expect(COORDINATOR_PROTOCOL.match(/## Finish/g)).toHaveLength(1);
  });

  test("add rejects more shards than the default shard cap", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Shard cap" }, toolCtx);

      const res = parseToolResult(await swarmTool.execute({ action: "add", name: "lint", brief: "fix", n: 9 }, toolCtx));
      expect(res.ok).toBe(false);
      expect(String(res.error)).toContain("At most 8 shards");

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.members.filter((m: { role: string }) => m.role === "worker")).toHaveLength(0);
    });
  });

  test("plan records units, posts one board message, and rejects empty tasks", async () => {
    await withBridgeHarness(async ({ registeredTools, registeredHandlers }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Planned Swarm" }, toolCtx);

      const empty = parseToolResult(await swarmTool.execute({ action: "plan", tasks: [] }, toolCtx));
      expect(empty.ok).toBe(false);
      expect(String(empty.error)).toContain("non-empty");

      const res = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["write parser", "add tests", "update docs"] }, toolCtx),
      );
      expect(res.ok).toBe(true);
      expect(res.units).toBe(3);
      expect(res.task_ids).toHaveLength(3);
      expect(res.open_board).toBeDefined();

      const snap = (await registeredHandlers.getSwarmSnapshot({ sessionId: "coord-sess-1" })) as {
        swarm: { id: string };
        board_posts: Array<{ seq: number; body: string; author_name: string }>;
      };
      const planPosts = snap.board_posts.filter((p) => p.body.includes("#plan "));
      expect(planPosts).toHaveLength(1);
      expect(planPosts[0].body).toContain("#plan Planned Swarm");
      expect(planPosts[0].body).toContain("1. write parser");
      expect(planPosts[0].body).toContain("2. add tests");
      expect(planPosts[0].body).toContain("3. update docs");

      // A second plan while units are still open replaces the open list.
      const again = parseToolResult(await swarmTool.execute({ action: "plan", tasks: ["only"] }, toolCtx));
      expect(again.ok).toBe(true);
      expect(again.units).toBe(1);
    });
  });

  test("plan is denied for non-coordinators", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const coordCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Plan Guard" }, coordCtx);
      const add = parseToolResult(
        await swarmTool.execute({ action: "add", name: "worker-a", brief: "work" }, coordCtx),
      );
      expect(add.ok).toBe(true);
      const workerCtx = { sessionID: add.spawned[0].session_id };

      const res = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["a", "b"] }, workerCtx),
      );
      expect(res.ok).toBe(false);
      expect(String(res.error)).toContain("Only @coordinator");
    });
  });

  test("add with tasks spawns one worker per slice and reports budget", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Slices" }, toolCtx);

      const res = parseToolResult(
        await swarmTool.execute({ action: "add", name: "slice", brief: "work", tasks: ["a", "b", "c"] }, toolCtx),
      );
      expect(res.ok).toBe(true);
      expect(res.spawned).toHaveLength(3);
      expect(res.workers).toBe(3);
      expect(res.cap).toBe(6);
      expect(res.open_tracks).toBe(3);
      expect(res.shard_cap).toBe(8);
    });
  });

  test("add rejects spawns beyond a configured worker cap", async () => {
    await withBridgeHarness(
      async ({ registeredTools }) => {
        const swarmTool = registeredTools.get("swarm")!;
        const toolCtx = { sessionID: "coord-sess-1" };
        await swarmTool.execute({ action: "title", title: "Worker cap" }, toolCtx);

        const first = parseToolResult(
          await swarmTool.execute({ action: "add", name: "pair", brief: "work", tasks: ["a", "b"] }, toolCtx),
        );
        expect(first.ok).toBe(true);
        expect(first.workers).toBe(2);

        const second = parseToolResult(await swarmTool.execute({ action: "add", name: "extra", brief: "work" }, toolCtx));
        expect(second.ok).toBe(false);
        expect(String(second.error)).toContain("Worker cap 2 reached");
        expect(second.workers).toBe(2);
        expect(second.cap).toBe(2);
      },
      { maxWorkers: 2 },
    );
  });

  test("verifier spawns are not blocked by or counted against the worker cap", async () => {
    await withBridgeHarness(
      async ({ registeredTools }) => {
        const swarmTool = registeredTools.get("swarm")!;
        const toolCtx = { sessionID: "coord-sess-1" };
        await swarmTool.execute({ action: "title", title: "Verifier cap" }, toolCtx);

        const worker = parseToolResult(
          await swarmTool.execute({ action: "add", name: "only", brief: "work" }, toolCtx),
        );
        expect(worker.ok).toBe(true);

        const verifier = parseToolResult(
          await swarmTool.execute({ action: "add", name: "check", role: "verifier", brief: "verify" }, toolCtx),
        );
        expect(verifier.ok).toBe(true);
        expect(verifier.workers).toBe(1);

        const second = parseToolResult(
          await swarmTool.execute({ action: "add", name: "second", brief: "work" }, toolCtx),
        );
        expect(second.ok).toBe(true);
        expect(second.workers).toBe(2);

        const third = parseToolResult(
          await swarmTool.execute({ action: "add", name: "third", brief: "work" }, toolCtx),
        );
        expect(third.ok).toBe(false);
        expect(String(third.error)).toContain("Worker cap 2 reached");
        expect(third.workers).toBe(2);
      },
      { maxWorkers: 2 },
    );
  });

  test("add assigns the first open plan unit when no task_ids are given", async () => {
    await withBridgeHarness(async ({ registeredTools, registeredHandlers }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Auto assign" }, toolCtx);
      const plan = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["write parser", "add tests", "update docs"] }, toolCtx),
      );
      expect(plan.ok).toBe(true);

      const res = parseToolResult(await swarmTool.execute({ action: "add", name: "alpha", brief: "work" }, toolCtx));
      expect(res.ok).toBe(true);
      expect(res.total_units).toBe(3);
      expect(res.assigned_units).toBe(1);
      expect(res.unassigned_units).toBe(2);
      expect(res.done_units).toBe(0);

      // The worker's brief names the unit it owns.
      const snap = (await registeredHandlers.getSwarmSnapshot({ sessionId: "coord-sess-1" })) as {
        board_posts: Array<{ body: string }>;
      };
      expect(snap.board_posts.some((p) => p.body.includes("Assigned unit: write parser"))).toBe(true);

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.tasks).toHaveLength(3);
      const first = status.tasks.find((t: { id: number }) => t.id === plan.task_ids[0]);
      expect(first.status).toBe("assigned");
      expect(first.assignee).toBe("alpha");
      expect(status.tasks.filter((t: { status: string }) => t.status === "open")).toHaveLength(2);
    });
  });

  test("add with tasks assigns the first N open units to the shard batch", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Batch assign" }, toolCtx);
      const plan = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["unit one", "unit two", "unit three"] }, toolCtx),
      );

      const res = parseToolResult(
        await swarmTool.execute({ action: "add", name: "pair", brief: "work", tasks: ["a", "b"] }, toolCtx),
      );
      expect(res.ok).toBe(true);
      expect(res.spawned).toHaveLength(2);
      expect(res.assigned_units).toBe(2);
      expect(res.unassigned_units).toBe(1);

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.tasks.find((t: { id: number }) => t.id === plan.task_ids[0]).status).toBe("assigned");
      expect(status.tasks.find((t: { id: number }) => t.id === plan.task_ids[1]).status).toBe("assigned");
      expect(status.tasks.find((t: { id: number }) => t.id === plan.task_ids[2]).status).toBe("open");
    });
  });

  test("explicit task_ids assigns exactly that unit and leaves earlier units open", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Explicit ids" }, toolCtx);
      const plan = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["first", "second", "third"] }, toolCtx),
      );

      const res = parseToolResult(
        await swarmTool.execute(
          { action: "add", name: "picked", brief: "work", task_ids: [plan.task_ids[1]] },
          toolCtx,
        ),
      );
      expect(res.ok).toBe(true);
      expect(res.assigned_units).toBe(1);
      expect(res.unassigned_units).toBe(2);

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      const second = status.tasks.find((t: { id: number }) => t.id === plan.task_ids[1]);
      expect(second.status).toBe("assigned");
      expect(second.assignee).toBe("picked");
      expect(status.tasks.find((t: { id: number }) => t.id === plan.task_ids[0]).status).toBe("open");
    });
  });

  test("add rejects mismatched task_ids and task_ids on non-workers without spawning", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Id guards" }, toolCtx);
      const plan = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["one", "two", "three"] }, toolCtx),
      );

      const mismatch = parseToolResult(
        await swarmTool.execute(
          { action: "add", name: "pair", brief: "work", tasks: ["a", "b"], task_ids: [plan.task_ids[0]] },
          toolCtx,
        ),
      );
      expect(mismatch.ok).toBe(false);
      expect(String(mismatch.error)).toContain("provide exactly one id per member");

      const nonInteger = parseToolResult(
        await swarmTool.execute({ action: "add", name: "bad", brief: "work", task_ids: ["1"] }, toolCtx),
      );
      expect(nonInteger.ok).toBe(false);
      expect(String(nonInteger.error)).toContain("array of integer unit ids");

      const verifier = parseToolResult(
        await swarmTool.execute(
          { action: "add", name: "check", role: "verifier", brief: "verify", task_ids: [plan.task_ids[0]] },
          toolCtx,
        ),
      );
      expect(verifier.ok).toBe(false);
      expect(String(verifier.error)).toContain("only be assigned to workers");

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.members.filter((m: { role: string }) => m.role === "worker")).toHaveLength(0);
      expect(status.members.filter((m: { role: string }) => m.role === "verifier")).toHaveLength(0);
      expect(status.assigned_units).toBe(0);
    });
  });

  test("add rejects more workers than open units in the plan", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Unit shortage" }, toolCtx);
      await swarmTool.execute({ action: "plan", tasks: ["only unit"] }, toolCtx);

      const res = parseToolResult(
        await swarmTool.execute({ action: "add", name: "extra", brief: "work", tasks: ["a", "b"] }, toolCtx),
      );
      expect(res.ok).toBe(false);
      expect(String(res.error)).toContain("would leave some without a unit");

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.members.filter((m: { role: string }) => m.role === "worker")).toHaveLength(0);
      expect(status.unassigned_units).toBe(1);
    });
  });

  test("verifier spawn with a plan and no ids consumes no unit", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Verifier plan" }, toolCtx);
      await swarmTool.execute({ action: "plan", tasks: ["one", "two", "three"] }, toolCtx);

      const res = parseToolResult(
        await swarmTool.execute({ action: "add", name: "check", role: "verifier", brief: "verify" }, toolCtx),
      );
      expect(res.ok).toBe(true);
      expect(res.total_units).toBe(3);
      expect(res.assigned_units).toBe(0);
      expect(res.unassigned_units).toBe(3);

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.tasks.every((t: { status: string }) => t.status === "open")).toBe(true);
    });
  });

  test("worker completion marks its plan units done and moves counts", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const postTool = registeredTools.get("post_message")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "Done counts" }, toolCtx);
      const plan = parseToolResult(
        await swarmTool.execute({ action: "plan", tasks: ["finish me", "leave me"] }, toolCtx),
      );

      const add = parseToolResult(await swarmTool.execute({ action: "add", name: "solo", brief: "work" }, toolCtx));
      expect(add.ok).toBe(true);
      expect(add.assigned_units).toBe(1);

      const workerCtx = { sessionID: add.spawned[0].session_id };
      const done = parseToolResult(await postTool.execute({ text: "[done] finished", mark_done: true }, workerCtx));
      expect(done.ok).toBe(true);

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.total_units).toBe(2);
      expect(status.assigned_units).toBe(0);
      expect(status.done_units).toBe(1);
      expect(status.open_units).toBe(1);
      expect(status.unassigned_units).toBe(1);
      expect(status.tasks.find((t: { id: number }) => t.id === plan.task_ids[0]).status).toBe("done");
      expect(status.tasks.find((t: { id: number }) => t.id === plan.task_ids[1]).status).toBe("open");
    });
  });

  test("status reports zero units and an empty task list with no plan", async () => {
    await withBridgeHarness(async ({ registeredTools }) => {
      const swarmTool = registeredTools.get("swarm")!;
      const toolCtx = { sessionID: "coord-sess-1" };
      await swarmTool.execute({ action: "title", title: "No plan" }, toolCtx);

      const status = parseToolResult(await swarmTool.execute({ action: "status" }, toolCtx));
      expect(status.total_units).toBe(0);
      expect(status.open_units).toBe(0);
      expect(status.assigned_units).toBe(0);
      expect(status.done_units).toBe(0);
      expect(status.unassigned_units).toBe(0);
      expect(status.tasks).toEqual([]);
      expect(status.tasks_truncated).toBe(false);
    });
  });

  test("invalid worker and shard options fall back to defaults", async () => {
    await withBridgeHarness(
      async ({ registeredTools }) => {
        const swarmTool = registeredTools.get("swarm")!;
        const toolCtx = { sessionID: "coord-sess-1" };
        await swarmTool.execute({ action: "title", title: "Invalid options" }, toolCtx);

        const tooMany = parseToolResult(
          await swarmTool.execute({ action: "add", name: "lint", brief: "fix", n: 9 }, toolCtx),
        );
        expect(tooMany.ok).toBe(false);
        expect(String(tooMany.error)).toContain("At most 8 shards");

        const six = parseToolResult(
          await swarmTool.execute({
            action: "add",
            name: "unit",
            brief: "work",
            tasks: ["a", "b", "c", "d", "e", "f"],
          }, toolCtx),
        );
        expect(six.ok).toBe(true);
        expect(six.cap).toBe(6);
        expect(six.workers).toBe(6);
      },
      { maxWorkers: 0, maxShardsPerAdd: -3 },
    );
  });
});
