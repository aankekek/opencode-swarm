import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SWARM_RPC_DEF } from "../src/rpc.js";
import { swarmRuntimePlugin } from "../src/plugin.js";

describe("SWARM_RPC_DEF and RPC bridge", () => {
  test("SWARM_RPC_DEF defines id, 7 methods, and changed event", () => {
    expect(SWARM_RPC_DEF.id).toBe("local.swarm-runtime");
    expect(Object.keys(SWARM_RPC_DEF.methods)).toEqual([
      "getBoardInfo",
      "getSwarmSnapshot",
      "listSwarms",
      "completeSwarm",
      "killMember",
      "getRoleConfig",
      "setRoleModel",
    ]);
    expect(SWARM_RPC_DEF.events.changed).toBeDefined();
  });

  test("registers all 5 RPC handlers and emits changed events", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "swarm-rpc-bridge-"));
    const prevUserProfile = process.env.USERPROFILE;
    const prevHome = process.env.HOME;
    process.env.USERPROFILE = tempDir;
    process.env.HOME = tempDir;
    try {
      let registeredHandlers: Record<string, (args?: Record<string, unknown>) => Promise<unknown>> = {};
      const emittedEvents: Array<{ event: string; payload: unknown }> = [];
      const registeredTools = new Map<string, { execute: (args: Record<string, unknown>, ctx: unknown) => Promise<string> }>();
      let disposed = false;

      const mockCtx = {
        location: { directory: tempDir },
        directory: tempDir,
        worktree: tempDir,
        rpc: {
          register: async (_def: unknown, handlers: Record<string, (args?: Record<string, unknown>) => Promise<unknown>>) => {
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
          transform: async (cb: (tools: { add: (t: { name: string; execute: (args: Record<string, unknown>, ctx: unknown) => Promise<string> }) => void }) => void) => {
            cb({
              add: (t) => {
                registeredTools.set(t.name, t);
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
          create: async () => ({ data: { id: "worker-sess-1" } }),
          prompt: async () => ({}),
          interrupt: async () => ({}),
          update: async () => ({}),
          hook: async () => () => {},
        },
        event: {
          subscribe: () => () => {},
        },
      };

      const hooks = await (swarmRuntimePlugin as unknown as {
        setup: (ctx: unknown, opts?: unknown) => Promise<unknown>;
      }).setup(mockCtx, {
        dbPath: join(tempDir, "board.db"),
        boardPort: 0,
      });

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

      // 7. completeSwarm
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

      await (hooks as { dispose?: () => Promise<void> } | undefined)?.dispose?.();
    } finally {
      process.env.USERPROFILE = prevUserProfile;
      process.env.HOME = prevHome;
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows SQLite file lock on temp dir cleanup
      }
    }
  });
});
