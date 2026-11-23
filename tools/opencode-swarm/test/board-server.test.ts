import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBoardServer, type BoardServerDeps } from "../src/board-server.js";
import { createRpcHandlers, type RpcHandlerDeps } from "../src/rpc-handlers.js";
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
function createRpcDeps(db: SwarmBoardDB, boardUrl: string): RpcHandlerDeps {
  return {
    ctx: {} as never,
    db,
    isDbClosed: () => false,
    getBoardUrl: () => boardUrl,
    getBoardToken: () => "secret-token",
    canonicalWorkspaceRoot: "",
    roleModels: {},
    persistRoleModels: () => {},
    getAutoSpawnVerifier: () => false,
    setAutoSpawnVerifier: () => {},
    emitSwarmChanged: () => {},
    resolveWaiterAborted: () => {},
    waitForQuiesce: async () => true,
    pendingKillCleanup: new Map(),
    switchMemberModelInPlace: async () => ({ name: "", model: "", preserved_history: false, rerun: false }),
    beforeUninstallRuntimeDataDelete: async () => {},
  };
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
      // P0-1: Unauthenticated GET /api/swarm must return 401
      const unauth = await fetch(`http://127.0.0.1:${handle.port}/api/swarm`);
      expect(unauth.status).toBe(401);

      const res = await fetch(`http://127.0.0.1:${handle.port}/api/swarm`, {
        headers: { Authorization: `Bearer ${handle.token}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        swarm: string;
        head: number;
        hasMore: boolean;
        etag: string;
        messages: Array<{ seq: number }>;
      };
      expect(data.swarm).toBe(swarm.id);
      expect(data.head).toBe(505);
      expect(data.hasMore).toBe(true);
      expect(data.messages.length).toBe(500);
      expect(data.messages[0].seq).toBe(6);
      expect(data.messages[data.messages.length - 1].seq).toBe(505);

      // K2: unchanged fast path must include member
      const unchangedRes = await fetch(`http://127.0.0.1:${handle.port}/api/swarm?etag=${data.etag}`, {
        headers: { Authorization: `Bearer ${handle.token}` },
      });
      const unchangedData = (await unchangedRes.json()) as { unchanged: boolean; member: string | null };
      expect(unchangedData.unchanged).toBe(true);
      expect("member" in unchangedData).toBe(true);
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not resurrect a completed historical swarm without params, but explicit swarmId still works", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-history-"));
    const { db, sqlite, deps } = await createTestDeps(dir);
    const { swarm } = db.createSwarmWithCoordinator({
      title: "Completed Swarm",
      objective: "Historical only",
      coordinatorSessionId: "sess-completed",
      workspaceDir: dir,
    });
    db.setSwarmStatus(swarm.id, "completed");
    const handle = await startBoardServer(deps, 0);
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      // No active swarm and no params: must NOT fall back to the most recent historical swarm.
      const res = await fetch(`${base}/api/swarm`, {
        headers: { Authorization: `Bearer ${handle.token}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { swarm: null };
      expect(data.swarm).toBeNull();

      // Explicit swarmId remains a supported history-browsing path.
      const hist = await fetch(`${base}/api/swarm?swarmId=${swarm.id}`, {
        headers: { Authorization: `Bearer ${handle.token}` },
      });
      expect(hist.status).toBe(200);
      const histData = (await hist.json()) as { swarm: string; members: unknown[] };
      expect(histData.swarm).toBe(swarm.id);
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns the active swarm when no params are supplied (positive control)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-active-"));
    const { db, sqlite, deps } = await createTestDeps(dir);
    const { swarm } = db.createSwarmWithCoordinator({
      title: "Active Swarm",
      objective: "Active default",
      coordinatorSessionId: "sess-active",
      workspaceDir: dir,
    });
    const handle = await startBoardServer(deps, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/api/swarm`, {
        headers: { Authorization: `Bearer ${handle.token}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { swarm: string };
      expect(data.swarm).toBe(swarm.id);
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("getSwarmSnapshot appends swarmId to boardUrl, preserving token; zero-swarm URL unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-board-snap-url-"));
    const { db, sqlite } = await createTestDeps(dir);
    try {
      const boardUrl = "http://127.0.0.1:4321/?token=secret-token&foo=bar";
      const handlers = createRpcHandlers(createRpcDeps(db, boardUrl));

      // No swarm resolved: boardUrl must stay untouched (no swarmId injected).
      const empty = (await handlers.getSwarmSnapshot({})) as { swarm: null; boardUrl: string };
      expect(empty.swarm).toBeNull();
      expect(empty.boardUrl).toBe(boardUrl);

      const { swarm } = db.createSwarmWithCoordinator({
        title: "Snapshot Swarm",
        objective: "boardUrl carries swarmId",
        coordinatorSessionId: "sess-snap",
        workspaceDir: dir,
      });
      const snap = (await handlers.getSwarmSnapshot({ swarmId: swarm.id })) as { boardUrl: string };
      const parsed = new URL(snap.boardUrl);
      expect(parsed.origin).toBe("http://127.0.0.1:4321");
      expect(parsed.pathname).toBe("/");
      expect(parsed.searchParams.get("token")).toBe("secret-token");
      expect(parsed.searchParams.get("foo")).toBe("bar");
      expect(parsed.searchParams.get("swarmId")).toBe(swarm.id);
    } finally {
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
