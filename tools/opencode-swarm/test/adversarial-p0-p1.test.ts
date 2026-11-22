import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import swarmRuntimePlugin from "../index.js";
import { startBoardServer } from "../src/board-server.js";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";
import { checkPendingWakePosts } from "../src/mentions.js";
import { startStallMonitor } from "../src/monitor.js";
import { buildUninstallPlan, verifyUninstall } from "../src/uninstall.js";

function createTestHarness(repoDir: string, dbPath: string) {
  const tools = new Map<string, any>();
  const sessions = new Map<string, any>();
  const prompts: Array<{ sessionID: string; text: string }> = [];
  const permHooks: Array<(event: any) => Promise<void>> = [];
  let seq = 1;

  sessions.set("sess_coord", {
    id: "sess_coord",
    model: { providerID: "anthropic", id: "claude-sonnet-4-6" },
  });

  const ctx: any = {
    location: { directory: repoDir },
    options: { dbPath, boardServer: false, overrideShellAllow: true },
    model: {
      async list() {
        return [
          {
            providerID: "anthropic",
            id: "claude-sonnet-4-6",
            enabled: true,
            status: "active",
            variants: [{ id: "low" }, { id: "high" }],
          },
          {
            providerID: "openai",
            id: "gpt-5.4",
            enabled: true,
            status: "active",
            variants: [{ id: "medium" }, { id: "high" }],
          },
        ];
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
    permission: {
      async hook(name: string, fn: (event: any) => Promise<void>) {
        if (name === "evaluate") permHooks.push(fn);
      },
    },
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

  return { ctx, tools, prompts, permHooks };
}

describe("Adversarial Audit P0 & P1 Regressions", () => {
  test("P0-1 & P0-2: board-server requires bearer on GET, filters private channels, and blocks HTTP coordinator model switch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-p0-board-"));
    const sqlite = await openSqliteDatabase(join(dir, "board.db"));
    const db = new SwarmBoardDB(sqlite, dir);
    let switched = false;
    const handle = await startBoardServer(
      {
        db,
        getAvailableModels: async () => ({ models: [] }),
        switchMemberModel: async () => {
          switched = true;
          return { ok: true };
        },
        setRoleModelDefault: () => {},
        getRoleModelDefaults: () => ({}),
      },
      0,
    );

    try {
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Sec Swarm",
        objective: "Test board auth",
        coordinatorSessionId: "sess-c",
        workspaceDir: dir,
      });
      const worker = db.insertMember({
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
      db.createChannel(swarm.id, "secret", "private", "coordinator");
      db.addPost({
        swarmId: swarm.id,
        channel: "secret",
        authorName: "coordinator",
        mentions: [],
        channelMentions: [],
        isAll: false,
        body: "TOP_SECRET_BODY",
      });

      const base = `http://127.0.0.1:${handle.port}`;
      const unauth = await fetch(`${base}/api/swarm`);
      expect(unauth.status).toBe(401);

      const asWorker = await fetch(`${base}/api/swarm?conversationId=${worker.session_id}`, {
        headers: { Authorization: `Bearer ${handle.token}` },
      });
      expect(asWorker.status).toBe(200);
      const data = (await asWorker.json()) as { messages: Array<{ text: string }>; unseen: number[] };
      expect(data.messages.some((m) => m.text.includes("TOP_SECRET_BODY"))).toBe(false);
      expect(data.unseen.length).toBe(1);

      const switchCoord = await fetch(`${base}/api/member/model`, {
        method: "POST",
        headers: { Authorization: `Bearer ${handle.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ swarmId: swarm.id, name: "coordinator", model: "openai/gpt-5" }),
      });
      expect(switchCoord.status).toBe(403);
      expect(switched).toBe(false);
    } finally {
      await handle.close();
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("P0-2, P0-3, P0-4, P1-11, P1-12, P1-13: token hiding, deny preservation, RPC kill guard, channel auth, share claim refusal, wait abort", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-p0-plugin-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: repoDir, stdio: "ignore" });
    writeFileSync(join(repoDir, "README.md"), "hi\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir, stdio: "ignore" });

    const { ctx, tools, permHooks } = createTestHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const waitTool = tools.get("swarm_wait");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w1", workspace: "share", brief: "work in share" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(addW1.ok).toBe(true);
      const w1Sess = addW1.spawned[0].session_id as string;

      // P1-12: share mode rejects owned_globs at add AND claim
      const badShareAdd = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w2", workspace: "share", owned_globs: ["src/**"], brief: "bad" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(badShareAdd.ok).toBe(false);
      expect(badShareAdd.error).toContain("inherit");

      const claimShare = JSON.parse(
        (await swarmTool.execute({ action: "claim", globs: ["src/**"] }, { sessionID: w1Sess })).content,
      );
      expect(claimShare.ok).toBe(false);

      // P0-2: worker status hides open_board
      const w1Status = JSON.parse((await swarmTool.execute({ action: "status" }, { sessionID: w1Sess })).content);
      expect(w1Status.open_board).toBe("");

      // P0-3: overrideShellAllow preserves pre-computed deny
      const evDeny = { action: "shell", sessionID: "sess_coord", effect: "deny", resources: ["ls"] };
      await permHooks[0](evDeny);
      expect(evDeny.effect).toBe("deny");

      // P0-4: RPC killMember cannot kill coordinator
      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const killCoord = await handlers.killMember({ swarmId: snap.swarm.id, handle: "coordinator" });
      expect(killCoord.ok).toBe(false);

      // P1-11: verifier cannot self-subscribe to private channel; worker cannot unsubscribe coordinator
      await swarmTool.execute({ action: "channel", op: "create", channel: "priv" }, { sessionID: "sess_coord" });
      const addVer = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "verifier", role: "verifier", brief: "check" }, { sessionID: "sess_coord" })).content,
      );
      const verSess = addVer.spawned[0].session_id as string;
      const selfSub = JSON.parse(
        (await swarmTool.execute({ action: "channel", op: "subscribe", channel: "priv" }, { sessionID: verSess })).content,
      );
      expect(selfSub.ok).toBe(false);

      const unsubOther = JSON.parse(
        (
          await swarmTool.execute(
            { action: "channel", op: "unsubscribe", channel: "main", name: "verifier" },
            { sessionID: w1Sess },
          )
        ).content,
      );
      expect(unsubOther.ok).toBe(false);

      // P1-13: swarm_wait returns aborted:true when killed even if interrupt throws
      ctx.session.interrupt = async () => {
        throw new Error("interrupt failed");
      };
      const waitPromise = waitTool.execute({ mentions_only: true }, { sessionID: verSess });
      await swarmTool.execute({ action: "kill", name: "verifier" }, { sessionID: "sess_coord" });
      const waitRes = JSON.parse((await waitPromise).content);
      expect(waitRes.woken).toBe(false);
      expect(waitRes.aborted).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("P0-6, P1-1, P1-2: parallel duplicate share add & bad-model retry do not orphan branch/dir", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-p1-spawn-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: repoDir, stdio: "ignore" });
    writeFileSync(join(repoDir, "README.md"), "hi\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: repoDir, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir, stdio: "ignore" });

    const { ctx, tools } = createTestHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");

      // P1-2: invalid model fails before creating worktree/branch, so retry succeeds
      const bad = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "coder", workspace: "share", model: "bad/nope", brief: "code" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(bad.ok).toBe(false);
      const retry = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "coder", workspace: "share", brief: "code" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(retry.ok).toBe(true);

      // P0-6 + P1-1: parallel duplicate add rejects second while survivor's worktree stays intact
      const [r1, r2] = await Promise.all([
        swarmTool.execute({ action: "add", name: "dup", workspace: "share", brief: "d1" }, { sessionID: "sess_coord" }),
        swarmTool.execute({ action: "add", name: "dup", workspace: "share", brief: "d2" }, { sessionID: "sess_coord" }),
      ]);
      const p1 = JSON.parse(r1.content);
      const p2 = JSON.parse(r2.content);
      expect([p1.ok, p2.ok].filter(Boolean).length).toBe(1);
      const status = JSON.parse((await swarmTool.execute({ action: "status" }, { sessionID: "sess_coord" })).content);
      const dupMember = status.members.find((m: any) => m.name === "dup");
      expect(existsSync(dupMember.workspace_dir)).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("P0-8 & P0-9: checkPendingWakePosts finds mention past #100 and dead owner_pid reconciles on demand", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-p0-db-"));
    const sqlite1 = await openSqliteDatabase(join(dir, "board.db"));
    const db1 = new SwarmBoardDB(sqlite1, dir);

    const { swarm } = db1.createSwarmWithCoordinator({
      title: "Big Swarm",
      objective: "Test >100 posts",
      coordinatorSessionId: "sess-c",
      workspaceDir: dir,
    });
    const w1 = db1.insertMember({
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

    for (let i = 1; i <= 105; i++) {
      db1.addPost({
        swarmId: swarm.id,
        channel: "main",
        authorName: "coordinator",
        mentions: i === 103 ? ["w1"] : [],
        channelMentions: [],
        isAll: false,
        body: i === 103 ? "@w1 wake at 103" : `noise ${i}`,
      });
    }

    const woken = checkPendingWakePosts(db1, w1, 0, true);
    expect(woken.length).toBe(1);
    expect(woken[0].swarm_seq).toBe(103);

    // P0-9: simulate dead owner_pid and verify second DB instance recovers on createSwarmWithCoordinator
    sqlite1.prepare("UPDATE swarms SET owner_pid = 999999 WHERE id = ?").run(swarm.id);
    const sqlite2 = await openSqliteDatabase(join(dir, "board.db"));
    const db2 = new SwarmBoardDB(sqlite2, dir);
    const created2 = db2.createSwarmWithCoordinator({
      title: "Recovered Swarm",
      objective: "After crash",
      coordinatorSessionId: "sess-c2",
      workspaceDir: dir,
    });
    expect(created2.swarm.status).toBe("running");

    sqlite2.close();
    sqlite1.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("P1-3, P1-6, P1-7, P1-10: working guard, non-skipping mentions_only, prompt rollback, switch mutex", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-p1-wake-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts } = createTestHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "task 1" }, { sessionID: "sess_coord" })).content,
      );
      const addW2 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w2", brief: "task 2" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      const w2Sess = addW2.spawned[0].session_id as string;

      // P1-3: w1 is currently working -> two mentions queue 0 duplicate wake prompts
      const beforeW1 = prompts.filter((p) => p.sessionID === w1Sess).length;
      await postTool.execute({ text: "@w1 ping 1" }, { sessionID: "sess_coord" });
      await postTool.execute({ text: "@w1 ping 2" }, { sessionID: w2Sess });
      expect(prompts.filter((p) => p.sessionID === w1Sess).length).toBe(beforeW1);

      // P1-6: w2 posts to board; reading unread posts must still include coordinator's post before it
      const unread = JSON.parse((await readTool.execute({}, { sessionID: w2Sess })).content);
      expect(unread.posts.some((p: any) => p.text === "@w1 ping 1")).toBe(true);

      // P1-7: prompt failure resets w1 to waiting and rolls back cursor so next wake still delivers
      await postTool.execute({ text: "[done] finished" }, { sessionID: w1Sess });
      const origPrompt = ctx.session.prompt;
      let failOnce = true;
      ctx.session.prompt = async (arg: any) => {
        if (failOnce && arg.sessionID === w1Sess) {
          failOnce = false;
          throw new Error("transient prompt failure");
        }
        return await origPrompt(arg);
      };
      await postTool.execute({ text: "@w1 retry me" }, { sessionID: "sess_coord" });
      await postTool.execute({ text: "@w1 second try" }, { sessionID: "sess_coord" });
      expect(prompts.some((p) => p.sessionID === w1Sess && p.text.includes("@w1 retry me"))).toBe(true);

      // P1-10: concurrent setRoleModel switches serialize cleanly
      const [s1, s2] = await Promise.all([
        handlers.setRoleModel({ role: "worker", model: "openai/gpt-5.4#high", sessionId: "sess_coord" }),
        handlers.setRoleModel({ role: "worker", model: "anthropic/claude-sonnet-4-6#low", sessionId: "sess_coord" }),
      ]);
      expect(s1.ok).toBe(true);
      expect(s2.ok).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("P1-4 & P1-14: monitor ignores foreign owner_pid and isolates per-swarm errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-p1-mon-"));
    const sqlite = await openSqliteDatabase(join(dir, "board.db"));
    const db = new SwarmBoardDB(sqlite, dir);

    const foreign = db.createSwarmWithCoordinator({
      title: "Foreign",
      objective: "Other PID",
      coordinatorSessionId: "sess-f",
      workspaceDir: dir,
    });
    sqlite.prepare("UPDATE swarms SET owner_pid = ?, created_at = ? WHERE id = ?").run(process.pid + 12345, Date.now() - 60_000, foreign.swarm.id);

    const local1 = db.createSwarmWithCoordinator({
      title: "Local 1",
      objective: "Throws",
      coordinatorSessionId: "sess-l1",
      workspaceDir: dir,
    });
    sqlite.prepare("UPDATE swarms SET created_at = ? WHERE id = ?").run(Date.now() - 60_000, local1.swarm.id);
    sqlite.prepare("UPDATE members SET state = 'waiting', last_active_at = ? WHERE swarm_id = ?").run(Date.now() - 60_000, local1.swarm.id);

    const nudged: string[] = [];
    const stop = startStallMonitor(
      db,
      { stallTimeoutMs: 1000, monitorIntervalMs: 30 },
      async (swarmId, author, channel, body) => {
        nudged.push(swarmId);
        return db.addPost({ swarmId, authorName: author, channel, mentions: [], channelMentions: [], isAll: false, body });
      },
    );

    await new Promise((r) => setTimeout(r, 90));
    stop();
    expect(nudged.includes(foreign.swarm.id)).toBe(false);
    expect(nudged.includes(local1.swarm.id)).toBe(true);

    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("P1-8: verifyUninstall handles BOM configs cleanly and fails closed on corrupt config", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-p1-uninst-"));
    const homeDir = join(root, "home");
    const cfgDir = join(homeDir, ".config", "opencode");
    mkdirSync(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "opencode.json");

    // BOM-prefixed valid config with no swarm -> passes
    writeFileSync(cfgPath, "\uFEFF" + JSON.stringify({ plugins: ["@slkiser/opencode-quota"] }), "utf8");
    const env = { homeDir, tempDir: join(root, "tmp"), workspaceRoot: root, pluginRoot: root, globalConfigDirs: [cfgDir] };
    const plan = buildUninstallPlan(env);
    let checks = await verifyUninstall(plan, { pluginRegistration: true }, env);
    expect(checks[0].passed).toBe(true);

    // Corrupt config -> fails closed
    writeFileSync(cfgPath, "{ invalid json", "utf8");
    checks = await verifyUninstall(plan, { pluginRegistration: true }, env);
    expect(checks[0].passed).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
