import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBoardServer, type BoardServerDeps } from "../src/board-server.js";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";

async function createTestDeps(rootDir: string) {
  const sqlite = await openSqliteDatabase(join(rootDir, "board.db"));
  const db = new SwarmBoardDB(sqlite, rootDir);
  const calls: Array<{ swarmId: string; name: string; model?: string; variant?: string }> = [];
  const deps: BoardServerDeps = {
    db,
    getAvailableModels: async () => ({
      defaultModel: { providerID: "openai", modelID: "gpt-5" },
      models: [{ spec: "openai/gpt-5", providerID: "openai", id: "gpt-5", enabled: true, status: "active", variants: ["low", "high"] }],
    }),
    switchMemberModel: async (swarmId, name, model, variant) => {
      calls.push({ swarmId, name, model, variant });
      return { ok: true };
    },
    setRoleModelDefault: () => {},
    getRoleModelDefaults: () => ({}),
  };
  return { db, sqlite, deps, calls };
}

describe("board-server", () => {
  test("rejects on EADDRINUSE instead of hanging (RT-H2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-eaddr-"));
    const { sqlite, deps } = await createTestDeps(dir);
    const first = await startBoardServer(deps, 0);
    try {
      await expect(startBoardServer(deps, first.port)).rejects.toThrow(/EADDRINUSE|address already in use|port .* in use/i);
    } finally {
      await first.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("enforces bearer token, Content-Type, 64KB limit, and Host/Origin checks (RT-H3)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-sec-"));
    const { sqlite, deps, calls } = await createTestDeps(dir);
    const handle = await startBoardServer(deps, 0);
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      expect(handle.url).toBe(`${base}/?token=${handle.token}`);

      // Missing bearer token -> 401
      const noAuth = await fetch(`${base}/api/member/model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ swarmId: "s1", name: "worker-1", model: "openai/gpt-5" }),
      });
      expect(noAuth.status).toBe(401);

      // Wrong Content-Type -> 415
      const badCt = await fetch(`${base}/api/member/model`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${handle.token}`,
          "Content-Type": "text/plain",
        },
        body: "{}",
      });
      expect(badCt.status).toBe(415);

      // >64KB body -> 413
      const huge = await fetch(`${base}/api/member/model`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${handle.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pad: "x".repeat(70_000) }),
      });
      expect(huge.status).toBe(413);

      // Cross-origin -> 403
      const badOrigin = await fetch(`${base}/api/swarm`, {
        headers: { Origin: "https://evil.example" },
      });
      expect(badOrigin.status).toBe(403);

      // DNS rebind Host -> 403
      const badHost = await fetch(`${base}/api/swarm`, {
        headers: { Host: `evil.example:${handle.port}` },
      });
      expect(badHost.status).toBe(403);

      // Valid authenticated POST -> 200
      const ok = await fetch(`${base}/api/member/model`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${handle.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ swarmId: "s1", name: "worker-1", model: "openai/gpt-5", variant: "high" }),
      });
      expect(ok.status).toBe(200);
      expect(calls.length).toBe(1);
      expect(calls[0]).toEqual({ swarmId: "s1", name: "worker-1", model: "openai/gpt-5", variant: "high" });
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("computes head from db.getLatestPost() above 500 posts (RT-M5)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-head-"));
    const { db, sqlite, deps } = await createTestDeps(dir);
    const { swarm } = db.createSwarmWithCoordinator({
      title: "Large Swarm",
      objective: "Test >500 posts",
      coordinatorSessionId: "sess-coord",
      workspaceDir: dir,
    });
    for (let i = 1; i <= 505; i++) {
      db.addPost({
        swarmId: swarm.id,
        channel: "main",
        authorName: "coordinator",
        mentions: [],
        channelMentions: [],
        isAll: false,
        body: `post #${i}`,
      });
    }
    const handle = await startBoardServer(deps, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/api/swarm`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { swarm: string; head: number; messages: unknown[] };
      expect(data.swarm).toBe(swarm.id);
      expect(data.head).toBe(505);
      expect(data.messages.length).toBe(500);
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("serves static swarm_board assets and preload.js with CSP header", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-static-"));
    const { sqlite, deps } = await createTestDeps(dir);
    const handle = await startBoardServer(deps, 0);
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      for (const [path, expectedType] of [
        ["/", "text/html"],
        ["/preload.js", "application/javascript"],
        ["/styles.css", "text/css"],
        ["/hive.css", "text/css"],
        ["/hive.js", "application/javascript"],
        ["/app.js", "application/javascript"],
        ["/gif.js", "application/javascript"],
      ]) {
        const res = await fetch(`${base}${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain(expectedType);
        expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      }
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
