import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import swarmRuntimePlugin from "../index.js";
import { startBoardServer } from "../src/board-server.js";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";
import { normalizeSwarmSnapshot } from "../src/gui/types.js";
import { checkPendingWakePosts } from "../src/mentions.js";
import { startStallMonitor } from "../src/monitor.js";
import { resolveSafeWorkspacePath, validateMemberName } from "../src/security.js";

function createTestHarness(repoDir: string, dbPath: string) {
  const tools = new Map<string, any>();
  const sessions = new Map<string, any>();
  const prompts: Array<{ sessionID: string; text: string }> = [];
  let seq = 1;

  sessions.set("sess_coord", {
    id: "sess_coord",
    model: { providerID: "anthropic", id: "claude-sonnet-4-6" },
  });

  const ctx: any = {
    location: { directory: repoDir },
    options: { dbPath, boardServer: false },
    model: {
      async list() {
        return [];
      },
      async default() {
        return { providerID: "anthropic", modelID: "claude-sonnet-4-6" };
      },
    },
    tool: {
      async transform(fn: Function) {
        fn({
          add(def: any) {
            tools.set(def.name, def);
          },
        });
      },
      async hook() {},
    },
    command: { async transform() {} },
    rpc: {
      async register(_def: unknown, handlers: Record<string, any>) {
        (ctx as any)._rpcHandlers = handlers;
        return { events: { async emit() {} }, dispose() {} };
      },
    },
    permission: { async hook() {} },
    session: {
      async create(input: any) {
        const id = `sess_${seq++}`;
        sessions.set(id, { id, ...input });
        return { id };
      },
      async get({ sessionID }: { sessionID: string }) {
        return sessions.get(sessionID);
      },
      async update() {},
      async prompt(input: { sessionID: string; text: string }) {
        prompts.push({ sessionID: input.sessionID, text: input.text });
      },
      async interrupt() {},
      async synthetic() {},
      async switchModel() {},
      async hook() {},
    },
    event: {
      subscribe() {
        return { async *[Symbol.asyncIterator]() {} };
      },
    },
  };

  return { ctx, tools, prompts };
}

describe("Adversarial Audit P2 Hardening Regressions", () => {
  test("P2-1: hung onPost on one swarm times out without blocking monitoring of other swarms", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-p2-mon-"));
    const sqlite = await openSqliteDatabase(join(dir, "board.db"));
    const db = new SwarmBoardDB(sqlite, dir);

    const s1 = db.createSwarmWithCoordinator({
      title: "Hung Swarm",
      objective: "Hangs",
      coordinatorSessionId: "sess-1",
      workspaceDir: dir,
    });
    const staleAt = Date.now() - 60_000;
    const s2Id = "sw_healthy_2";
    sqlite
      .prepare(
        `INSERT INTO swarms (id, title, objective, status, owner_pid, created_at, updated_at, last_monitor_nudge_seq, monitor_nudge_count)
         VALUES (?, 'Healthy Swarm', 'Nudges', 'running', ?, ?, ?, 0, 0)`,
      )
      .run(s2Id, process.pid, staleAt, staleAt);
    sqlite
      .prepare(
        `INSERT INTO channels (swarm_id, name, topic, created_by, archived, created_at) VALUES (?, 'main', '', 'coordinator', 0, ?)`,
      )
      .run(s2Id, staleAt);
    sqlite
      .prepare(
        `INSERT INTO members (id, swarm_id, name, generation, session_id, role, added_by, group_prefix, workspace_mode, workspace_dir, brief, state, wake_mode, wait_since, last_read_seq, last_post_seq, steps, paused_quota, track_status, last_active_at)
         VALUES ('mb_healthy_2', ?, 'coordinator', 1, 'sess-2', 'coordinator', 'user', NULL, 'inherit', ?, 'Nudges', 'waiting', 'mentions', 0, 0, 0, 0, 0, 'open', ?)`,
      )
      .run(s2Id, dir, staleAt);
    sqlite.prepare("UPDATE swarms SET created_at = ?").run(staleAt);
    sqlite.prepare("UPDATE members SET state = 'waiting', last_active_at = ?").run(staleAt);

    let s2Nudged = false;
    const stop = startStallMonitor(
      db,
      { stallTimeoutMs: 500, monitorIntervalMs: 120 },
      async (swarmId, author, channel, body) => {
        if (swarmId === s1.swarm.id) {
          return await new Promise<never>(() => {}); // Never settles
        }
        s2Nudged = true;
        return db.addPost({ swarmId, authorName: author, channel, mentions: [], channelMentions: [], isAll: false, body });
      },
    );

    await new Promise((r) => setTimeout(r, 400));
    stop();
    expect(s2Nudged).toBe(true);

    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("P2-4, P2-5, P2-9, P2-17: boardServer isAlive + dir/raw fields, members.json sync, and corrupt mentions_json safety", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-p2-board-"));
    const sqlite = await openSqliteDatabase(join(dir, "board.db"));
    const db = new SwarmBoardDB(sqlite, dir);

    const { swarm, coordinator } = db.createSwarmWithCoordinator({
      title: "Board P2",
      objective: "Raw + sync",
      coordinatorSessionId: "sess-c",
      workspaceDir: dir,
    });
    const w1 = db.insertMember({
      swarmId: swarm.id,
      name: "w1",
      sessionId: "sess-w1",
      role: "worker",
      addedBy: "coordinator",
      workspaceMode: "inherit",
      workspaceDir: dir,
      brief: "work",
      channels: ["main"],
    });
    db.setMemberWait(w1.id, "any", 0);
    db.setTrackStatus(w1.id, "done");
    db.advanceReadCursor(coordinator.id, 1);

    const membersJson = JSON.parse(readFileSync(join(db.getSwarmDir(swarm.id), "members.json"), "utf8"));
    expect(membersJson.members.w1.wake_mode).toBe("any");
    expect(membersJson.members.coordinator.last_read_seq).toBe(1);

    const post = db.addPost({
      swarmId: swarm.id,
      channel: "main",
      authorName: "coordinator",
      mentions: ["w1"],
      channelMentions: [],
      isAll: false,
      body: "hello raw tab",
    });
    // Corrupt mentions_json on DB row -> must not crash checkPendingWakePosts or /api/swarm
    sqlite.prepare("UPDATE board_posts SET mentions_json = '{bad-json' WHERE seq = ?").run(post.seq);
    expect(() => checkPendingWakePosts(db, w1, 0, true)).not.toThrow();

    const handle = await startBoardServer(
      {
        db,
        getAvailableModels: async () => ({ models: [] }),
        switchMemberModel: async () => ({ ok: true }),
        setRoleModelDefault: () => {},
        getRoleModelDefaults: () => ({}),
      },
      0,
    );
    expect(handle.isAlive()).toBe(true);

    const res = await fetch(`http://127.0.0.1:${handle.port}/api/swarm`, {
      headers: { Authorization: `Bearer ${handle.token}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      dir?: string;
      raw?: { board?: string; members?: string; view?: string };
    };
    expect(typeof data.dir).toBe("string");
    expect(typeof data.raw).toBe("object");
    expect(data.raw?.board).toContain("hello raw tab");
    expect(data.raw?.view).toBe("");

    await handle.close();
    expect(handle.isAlive()).toBe(false);
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("P2-3, P2-8, P2-15, P2-16, P2-17: pre-aborted swarm_wait, snapshot stalled flag, normalized group_prefix, reserved role names", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-p2-plugin-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts } = createTestHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");
      const handlers = (ctx as any)._rpcHandlers;

      // P2-16: worker cannot claim reserved role name 'verifier', while verifier role can
      const badName = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "verifier", role: "worker", brief: "impersonate" }, { sessionID: "sess_coord" })).content,
      );
      expect(badName.ok).toBe(false);

      // P2-15: uppercase baseName "Bob" normalizes group_prefix to "bob" so @bob wakes shards
      const addGroup = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "Bob", n: 2, brief: "work" }, { sessionID: "sess_coord" })).content,
      );
      expect(addGroup.ok).toBe(true);
      const bob1Sess = addGroup.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] ready" }, { sessionID: bob1Sess });

      const promptsBefore = prompts.filter((p) => p.sessionID === bob1Sess).length;
      await postTool.execute({ text: "@bob please sync" }, { sessionID: "sess_coord" });
      expect(prompts.filter((p) => p.sessionID === bob1Sess).length).toBe(promptsBefore + 1);

      // P2-3: pre-aborted signal returns immediately with aborted: true
      const ac = new AbortController();
      ac.abort();
      const abortRes = JSON.parse((await waitTool.execute({}, { sessionID: bob1Sess, signal: ac.signal })).content);
      expect(abortRes.woken).toBe(false);
      expect(abortRes.aborted).toBe(true);

      // P2-8: stalled flag propagated through getSwarmSnapshot -> normalizeSwarmSnapshot
      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(typeof snap.stalled).toBe("boolean");
      const norm = normalizeSwarmSnapshot({ ...snap, stalled: true });
      expect(norm?.stalled).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("P2-16 & P2-18: validateMemberName reserves role names and Windows ADS ':' is blocked", () => {
    expect(() => validateMemberName("verifier", "worker")).toThrow();
    expect(validateMemberName("verifier", "verifier")).toBe("verifier");

    if (process.platform === "win32") {
      const root = mkdtempSync(join(tmpdir(), "swarm-p2-ads-"));
      try {
        expect(() => resolveSafeWorkspacePath(root, "a.txt:evil")).toThrow(/Alternate Data Streams/i);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});
