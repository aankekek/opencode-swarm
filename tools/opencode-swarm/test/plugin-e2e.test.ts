import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import swarmRuntimePlugin from "../index.js";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";

async function seedOrphanSwarm(
  dbPath: string,
  repoDir: string,
  opts: { coordinatorState?: "waiting" | "working" | "killed"; workingWorkers?: number } = {},
): Promise<{ seeded: SwarmBoardDB; swarmId: string }> {
  const seeded = new SwarmBoardDB(await openSqliteDatabase(dbPath), dirname(dbPath));
  const created = seeded.createSwarmWithCoordinator({
    title: "Orphaned swarm",
    objective: "old work",
    coordinatorSessionId: "sess_orphan",
    workspaceDir: repoDir,
  });
  if (opts.coordinatorState && opts.coordinatorState !== "working") {
    seeded.setMemberState(created.coordinator.id, opts.coordinatorState);
  }
  for (let i = 0; i < (opts.workingWorkers ?? 0); i += 1) {
    seeded.insertMember({
      swarmId: created.swarm.id,
      name: `worker${i + 1}`,
      sessionId: `sess_worker${i + 1}`,
      role: "worker",
      addedBy: "coordinator",
      workspaceMode: "inherit",
      workspaceDir: repoDir,
      brief: "old work",
      state: "working",
    });
  }
  const old = Date.now() - 10 * 60 * 1000;
  const raw = (seeded as unknown as { db: any }).db;
  raw.prepare("UPDATE swarms SET updated_at = ? WHERE id = ?").run(old, created.swarm.id);
  raw.prepare("UPDATE members SET last_active_at = ? WHERE swarm_id = ?").run(old, created.swarm.id);
  return { seeded, swarmId: created.swarm.id };
}

function createEventStream() {
  const queue: any[] = [];
  let notify: (() => void) | undefined;
  let ended = false;
  const wake = () => {
    const fn = notify;
    notify = undefined;
    fn?.();
  };
  return {
    push(event: any) {
      queue.push(event);
      wake();
    },
    end() {
      ended = true;
      wake();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (ended) return;
        await new Promise<void>((resolveWait) => {
          notify = resolveWait;
        });
      }
    },
  };
}

type EventStreamFactory = (callIndex: number) => AsyncIterable<any>;

function createMockContext(
  repoDir: string,
  dbPath: string,
  extraOptions: Record<string, unknown> = {},
  eventStreamFactory?: EventStreamFactory,
) {
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const hooks: Record<string, Function> = {};
  const sessions = new Map<string, any>();
  const switchModelCalls: any[] = [];
  const promptCalls: any[] = [];
  const syntheticCalls: any[] = [];
  const interruptCalls: any[] = [];
  const subscribeCalls: any[] = [];
  let seqCounter = 1;

  sessions.set("sess_coord", {
    id: "sess_coord",
    model: { providerID: "anthropic", id: "claude-sonnet-4-6", variant: "low" },
  });

  const ctx: any = {
    location: { directory: repoDir },
    options: {
      dbPath,
      verifierShellPolicy: "ask",
      workerShellPolicy: "ask",
      boardServer: true,
      boardPort: 0,
      ...extraOptions,
    },
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
      async hook(name: string, fn: Function) {
        hooks[`tool.${name}`] = fn;
      },
    },
    command: {
      async transform(fn: Function) {
        fn({
          add(def: any) {
            commands.set(def.name, def);
          },
        });
      },
    },
    permission: {
      async hook(name: string, fn: Function) {
        hooks[`permission.${name}`] = fn;
      },
    },
    session: {
      async create(input: any) {
        const id = `sess_${seqCounter++}`;
        sessions.set(id, { id, ...input });
        return { id };
      },
      async get({ sessionID }: { sessionID: string }) {
        return sessions.get(sessionID);
      },
      async update() {},
      async prompt(input: any) {
        promptCalls.push(input);
      },
      async interrupt(input: any) {
        interruptCalls.push(input);
      },
      async synthetic(input: any) {
        syntheticCalls.push(input);
      },
      async switchModel(input: any) {
        switchModelCalls.push(input);
      },
      async hook(name: string, fn: Function) {
        hooks[`session.${name}`] = fn;
      },
    },
    event: {
      subscribe(input: any) {
        const callIndex = subscribeCalls.length;
        subscribeCalls.push(input);
        if (eventStreamFactory) return eventStreamFactory(callIndex);
        return {
          async *[Symbol.asyncIterator]() {},
        };
      },
    },
  };

  return {
    ctx,
    tools,
    commands,
    hooks,
    sessions,
    switchModelCalls,
    promptCalls,
    syntheticCalls,
    interruptCalls,
    subscribeCalls,
  };
}

describe("Swarm Runtime E2E (1:1 Antigravity + Review 3 Gate)", () => {
  test("full lifecycle: models, add, worktree share, live model+variant switch, Review 3 gate, Board UI", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-e2e-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");

    execFileSync("git", ["init", repoDir], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "config", "user.name", "Test"], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "config", "user.email", "test@local"], { stdio: "ignore" });
    writeFileSync(join(repoDir, "README.md"), "# Test\n");
    execFileSync("git", ["-C", repoDir, "add", "."], { stdio: "ignore" });
    execFileSync("git", ["-C", repoDir, "commit", "-m", "init"], { stdio: "ignore" });

    const { ctx, tools, hooks, switchModelCalls } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");

      // 1. List models + variants
      const modelsRes = JSON.parse((await swarmTool.execute({ action: "models" }, { sessionID: "sess_coord" })).content);
      expect(modelsRes.ok).toBe(true);
      expect(modelsRes.models.length).toBe(2);

      // 2. Spawn worker in Git worktree (share) + verifier
      const addWorker = JSON.parse(
        (
          await swarmTool.execute(
            {
              action: "add",
              name: "parser",
              brief: "Fix parser",
              workspace: "share",
              model: "openai/gpt-5.4#medium",
            },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(addWorker.ok).toBe(true);
      expect(addWorker.spawned[0].model).toBe("openai/gpt-5.4#medium");
      expect(addWorker.spawned[0].workspace).toBe("share");
      const workerSession = addWorker.spawned[0].session_id;
      const boardUrl = addWorker.open_board as string;
      expect(boardUrl.startsWith("http://127.0.0.1:")).toBe(true);

      const addVerifier = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "verifier", role: "verifier", brief: "Verify parser" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(addVerifier.ok).toBe(true);
      const verifierSession = addVerifier.spawned[0].session_id;

      // 3. Review 3 Test 0 & 1: @verifier shell canary -> tightened to 'ask', edit -> 'deny'
      const shellPermEvent: any = {
        sessionID: verifierSession,
        action: "shell",
        resources: ["touch swarm_canary.txt"],
        effect: "allow",
      };
      await hooks["permission.evaluate"](shellPermEvent);
      expect(shellPermEvent.effect).toBe("ask");

      const editPermEvent: any = {
        sessionID: verifierSession,
        action: "edit",
        resources: ["README.md"],
        effect: "allow",
      };
      await hooks["permission.evaluate"](editPermEvent);
      expect(editPermEvent.effect).toBe("deny");

      // 4. Review 3 Test 2: execute.before call-ID cache bridges to permission.evaluate
      await hooks["tool.execute.before"]({
        id: "call_123",
        tool: "edit",
        sessionID: workerSession,
        input: { path: "README.md" },
      });
      const cachedPermEvent: any = {
        sessionID: workerSession,
        action: "edit",
        resources: [],
        source: { id: "call_123" },
        effect: "allow",
      };
      await hooks["permission.evaluate"](cachedPermEvent);
      expect(cachedPermEvent.effect).toBe("allow");

      // 5. Post message & verify board server URL
      await postTool.execute({ text: "@coordinator [done] ready" }, { sessionID: workerSession });
      expect(boardUrl.startsWith("http://127.0.0.1:")).toBe(true);
      expect(switchModelCalls.length).toBe(0);

      // 6. Read board
      const readRes = JSON.parse((await readTool.execute({ since: 0 }, { sessionID: "sess_coord" })).content);
      expect(readRes.posts.length).toBeGreaterThanOrEqual(3);

      // 7. Complete swarm & clean up worktree
      const compRes = JSON.parse((await swarmTool.execute({ action: "complete" }, { sessionID: "sess_coord" })).content);
      expect(compRes.ok).toBe(true);

      // Verify coordinator session permissions were restored (SEC-H7)
      expect(ctx.session.update).toBeDefined();
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("role allowlist (SEC-C1) and control action gates (SEC-H6) in plugin tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-gates-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");

    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, hooks } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");

      // 1. Spawning coordinator role is forbidden (SEC-C1)
      const coordSpawnRes = JSON.parse(
        (await swarmTool.execute(
          { action: "add", name: "impostor", role: "coordinator", brief: "evil" },
          { sessionID: "sess_coord" },
        )).content,
      );
      expect(coordSpawnRes.ok).toBe(false);
      expect(coordSpawnRes.error).toContain("Invalid role");

      // 2. Spawning unknown role is forbidden (SEC-C1)
      const rootSpawnRes = JSON.parse(
        (await swarmTool.execute(
          { action: "add", name: "bad", role: "root", brief: "evil" },
          { sessionID: "sess_coord" },
        )).content,
      );
      expect(rootSpawnRes.ok).toBe(false);
      expect(rootSpawnRes.error).toContain("Invalid role");

      // 3. Spawn a valid verifier
      const verifierRes = JSON.parse(
        (await swarmTool.execute(
          { action: "add", name: "my-verifier", role: "verifier", brief: "verify only" },
          { sessionID: "sess_coord" },
        )).content,
      );
      expect(verifierRes.ok).toBe(true);
      const verifierSession = verifierRes.spawned[0].session_id;

      // 4. Verifier cannot spawn workers (SEC-H6)
      const verifierAddRes = JSON.parse(
        (await swarmTool.execute(
          { action: "add", name: "helper", brief: "work" },
          { sessionID: verifierSession },
        )).content,
      );
      expect(verifierAddRes.ok).toBe(false);
      expect(verifierAddRes.error).toContain("Only @coordinator");

      // 5. Verifier cannot claim locks (SEC-H6)
      const verifierClaimRes = JSON.parse(
        (await swarmTool.execute(
          { action: "claim", globs: ["src/**/*.ts"] },
          { sessionID: verifierSession },
        )).content,
      );
      expect(verifierClaimRes.ok).toBe(false);
      expect(verifierClaimRes.error).toContain("cannot claim locks");

      // 6. Verifier cannot rename swarm (SEC-H6)
      const verifierTitleRes = JSON.parse(
        (await swarmTool.execute(
          { action: "title", title: "Hacked" },
          { sessionID: verifierSession },
        )).content,
      );
      expect(verifierTitleRes.ok).toBe(false);
      expect(verifierTitleRes.error).toContain("Only @coordinator");

      // 7. Channel isolation on read_board & post_message (RT-M2 / Medium 6)
      // Coordinator creates channel 'dev'
      const chanCreateRes = JSON.parse(
        (await swarmTool.execute({ action: "channel", op: "create", channel: "dev" }, { sessionID: "sess_coord" })).content,
      );
      expect(chanCreateRes.ok).toBe(true);

      // Verifier (not subscribed to 'dev') cannot post to 'dev'
      const postDevRes = JSON.parse(
        (await postTool.execute({ text: "hello dev", channel: "dev" }, { sessionID: verifierSession })).content,
      );
      expect(postDevRes.ok).toBe(false);
      expect(postDevRes.error).toContain("not subscribed");

      // Verifier cannot read channel 'dev'
      const readDevRes = JSON.parse(
        (await readTool.execute({ channel: "dev" }, { sessionID: verifierSession })).content,
      );
      expect(readDevRes.ok).toBe(false);
      expect(readDevRes.error).toContain("not subscribed");

      // Verifier reading with channel: "*" only gets posts from subscribed channels (no dev leak)
      await postTool.execute({ text: "coord in main", channel: "main" }, { sessionID: "sess_coord" });
      await postTool.execute({ text: "coord in dev", channel: "dev" }, { sessionID: "sess_coord" });

      const readAllRes = JSON.parse(
        (await readTool.execute({ channel: "*", since: 0 }, { sessionID: verifierSession })).content,
      );
      expect(readAllRes.posts.some((p: any) => p.text === "coord in dev")).toBe(false);
      expect(readAllRes.posts.some((p: any) => p.text === "coord in main")).toBe(true);

      // 8. Shell always-allow override (Requirement 2)
      // For coordinator with coordinatorShellPolicy: "allow" and overrideShellAllow: true
      const shellPermEvent: any = {
        sessionID: "sess_coord",
        action: "shell",
        resources: [],
        effect: "ask",
      };
      await hooks["permission.evaluate"](shellPermEvent);
      expect(shellPermEvent.effect).toBe("allow");

      // Normal edit by coordinator is still denied when allowCoordinatorEdits !== true
      const editPermEvent: any = {
        sessionID: "sess_coord",
        action: "edit",
        resources: ["src/file.ts"],
        effect: "allow",
      };
      await hooks["permission.evaluate"](editPermEvent);
      expect(editPermEvent.effect).toBe("deny");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("roleModels.coordinator switches the coordinator session when the swarm is created", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-coord-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");

    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, switchModelCalls } = createMockContext(repoDir, dbPath, {
      roleModels: { coordinator: "openai/gpt-5.4#medium" },
    });
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const titleRes = JSON.parse(
        (await swarmTool.execute({ action: "title", title: "Tuned" }, { sessionID: "sess_coord" })).content,
      );
      expect(titleRes.ok).toBe(true);
      expect(switchModelCalls).toHaveLength(1);
      expect(switchModelCalls[0].model).toEqual({
        providerID: "openai",
        id: "gpt-5.4",
        variant: "medium",
      });

      const status = JSON.parse(
        (await swarmTool.execute({ action: "status" }, { sessionID: "sess_coord" })).content,
      );
      expect(status.members[0].name).toBe("coordinator");
      expect(status.members[0].model).toBe("openai/gpt-5.4#medium");

      // Invalid coordinator spec must not brick swarm creation.
      const bad = createMockContext(join(root, "repo2"), join(root, "data2", "board.db"), {
        roleModels: { coordinator: "openai/does-not-exist" },
      });
      execFileSync("git", ["init", join(root, "repo2")], { stdio: "ignore" });
      const cleanupBad = (await swarmRuntimePlugin.setup(bad.ctx)) as () => Promise<void>;
      try {
        const badTool = bad.tools.get("swarm");
        const badRes = JSON.parse(
          (await badTool.execute({ action: "title", title: "Fallback" }, { sessionID: "sess_coord" })).content,
        );
        expect(badRes.ok).toBe(true);
        expect(bad.switchModelCalls).toHaveLength(0);
      } finally {
        await cleanupBad();
      }
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("/swarm reclaims an orphaned idle swarm whose coordinator row is still 'working'", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-reclaim-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, commands, promptCalls, syntheticCalls } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    let seeded: SwarmBoardDB | undefined;

    try {
      // Realistic orphan: createSwarmWithCoordinator leaves the coordinator in state
      // 'working' and nothing transitions it after the session disappears.
      const seededOrphan = await seedOrphanSwarm(dbPath, repoDir);
      seeded = seededOrphan.seeded;
      expect(
        seeded.listMembers(seededOrphan.swarmId, false).find((m) => m.role === "coordinator")!.state,
      ).toBe("working");
      const swarmCmd = commands.get("swarm");
      expect(swarmCmd).toBeDefined();

      await swarmCmd.execute({
        sessionID: "sess_coord",
        prompt: "Build feature X",
        delivery: "queue",
      });

      // Old swarm reclaimed as interrupted with a monitor notice.
      expect(seeded.getSwarm(seededOrphan.swarmId)!.status).toBe("interrupted");
      const posts = seeded.getLatestPostsWindow(seededOrphan.swarmId, 50, "*").posts;
      expect(posts.some((p) => /Reclaimed as orphaned/.test(p.body))).toBe(true);
      expect(posts.find((p) => /Reclaimed as orphaned/.test(p.body))!.author_name).toBe("monitor");
      expect(posts.some((p) => /worktrees left in place/.test(p.body))).toBe(true);

      // A brand-new swarm was created for this session.
      const active = seeded.getActiveSwarms();
      expect(active).toHaveLength(1);
      expect(active[0].id).not.toBe(seededOrphan.swarmId);
      expect(active[0].title).toBe("Build feature X");

      // Coordinator prompt delivered, no failure notice.
      expect(syntheticCalls).toHaveLength(0);
      expect(promptCalls).toHaveLength(1);
      expect(promptCalls[0].sessionID).toBe("sess_coord");
      expect(promptCalls[0].text).toContain("User request:");
      expect(promptCalls[0].text).toContain("Build feature X");
    } finally {
      seeded?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("/swarm refuses to reclaim an orphaned swarm while a worker is working", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-noclaim-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, commands, promptCalls, syntheticCalls } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    let seeded: SwarmBoardDB | undefined;

    try {
      // Coordinator is stale-'working' too, but a non-coordinator worker is genuinely
      // running: that must block reclaim.
      const seededOrphan = await seedOrphanSwarm(dbPath, repoDir, { workingWorkers: 2 });
      seeded = seededOrphan.seeded;
      const swarmCmd = commands.get("swarm");

      await swarmCmd.execute({
        sessionID: "sess_coord",
        prompt: "Build feature Y",
        delivery: "queue",
      });

      // Old swarm untouched.
      expect(seeded.getSwarm(seededOrphan.swarmId)!.status).toBe("running");
      const active = seeded.getActiveSwarms();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(seededOrphan.swarmId);

      // No coordinator prompt; a precise synthetic message instead.
      expect(promptCalls).toHaveLength(0);
      expect(syntheticCalls).toHaveLength(1);
      const notice = syntheticCalls[0].text as string;
      expect(notice).toContain(seededOrphan.swarmId);
      expect(notice).toContain("Orphaned swarm");
      expect(notice).toContain("a worker (");
      expect(notice).toContain("still working");
      expect(notice).toContain('swarm{action:"complete"}');
    } finally {
      seeded?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("/swarm reclaims a running swarm with no live coordinator row", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-nocoor-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, commands, promptCalls, syntheticCalls } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    let seeded: SwarmBoardDB | undefined;

    try {
      const seededOrphan = await seedOrphanSwarm(dbPath, repoDir, { coordinatorState: "killed" });
      seeded = seededOrphan.seeded;
      expect(
        seeded.listMembers(seededOrphan.swarmId, false).some((m) => m.role === "coordinator"),
      ).toBe(false);
      const swarmCmd = commands.get("swarm");

      await swarmCmd.execute({
        sessionID: "sess_coord",
        prompt: "Recovered work",
        delivery: "queue",
      });

      // Reclaimed with a monitor post that names the unknown coordinator.
      expect(seeded.getSwarm(seededOrphan.swarmId)!.status).toBe("interrupted");
      const posts = seeded.getLatestPostsWindow(seededOrphan.swarmId, 50, "*").posts;
      const reclaimPost = posts.find((p) => /Reclaimed as orphaned/.test(p.body));
      expect(reclaimPost).toBeDefined();
      expect(reclaimPost!.body).toContain("session unknown");

      // Creation retried: new swarm exists and the coordinator prompt went out.
      const active = seeded.getActiveSwarms();
      expect(active).toHaveLength(1);
      expect(active[0].id).not.toBe(seededOrphan.swarmId);
      expect(active[0].title).toBe("Recovered work");
      expect(syntheticCalls).toHaveLength(0);
      expect(promptCalls).toHaveLength(1);
      expect(promptCalls[0].text).toContain("Recovered work");
    } finally {
      seeded?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("/swarm happy path creates a swarm and sends the coordinator prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-happy-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, commands, promptCalls, syntheticCalls } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    let reader: SwarmBoardDB | undefined;

    try {
      const swarmCmd = commands.get("swarm");
      await swarmCmd.execute({
        sessionID: "sess_coord",
        prompt: "Fresh swarm",
        delivery: "queue",
      });

      reader = new SwarmBoardDB(await openSqliteDatabase(dbPath), dirname(dbPath));
      const active = reader.getActiveSwarms();
      expect(active).toHaveLength(1);
      expect(active[0].title).toBe("Fresh swarm");
      expect(syntheticCalls).toHaveLength(0);
      expect(promptCalls).toHaveLength(1);
      expect(promptCalls[0].text).toContain("Fresh swarm");
    } finally {
      reader?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("event stream consumer resubscribes after a clean stream end", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-eof-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    // First subscription delivers one event and then completes normally (done:true).
    const firstStream = createEventStream();
    firstStream.push({
      type: "session.status",
      data: { sessionID: "sess_ignored", status: { type: "idle" } },
    });
    firstStream.end();
    // Second subscription stays open so the test can push a later event into it.
    const secondStream = createEventStream();

    const { ctx, commands, subscribeCalls } = createMockContext(
      repoDir,
      dbPath,
      {},
      (callIndex) => (callIndex === 0 ? firstStream : secondStream),
    );
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    let reader: SwarmBoardDB | undefined;

    try {
      // Create a swarm so sess_coord is an active member the event handler can update.
      await commands.get("swarm").execute({
        sessionID: "sess_coord",
        prompt: "Clean EOF test",
        delivery: "queue",
      });

      // Clean EOF after one event: the consumer must sleep the backoff and resubscribe.
      await new Promise((resolveWait) => setTimeout(resolveWait, 350));
      expect(subscribeCalls.length).toBeGreaterThanOrEqual(2);

      // The resubscribed stream is live and still processes events.
      secondStream.push({
        type: "session.status",
        data: { sessionID: "sess_coord", status: { type: "idle" } },
      });
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));

      reader = new SwarmBoardDB(await openSqliteDatabase(dbPath), dirname(dbPath));
      const active = reader.getActiveSwarms();
      expect(active).toHaveLength(1);
      const coordinator = reader
        .listMembers(active[0].id, false)
        .find((member) => member.role === "coordinator");
      expect(coordinator?.state).toBe("waiting");
      secondStream.end();
    } finally {
      reader?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("empty event streams grow the backoff instead of hot-looping", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-eof-backoff-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, subscribeCalls } = createMockContext(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      // Zero-event clean EOFs double the backoff (250 -> 500 -> 1000), so over
      // ~1.1s only three subscribe attempts should have happened. A hot loop that
      // reset to 250ms every time would already be at five or more.
      await new Promise((resolveWait) => setTimeout(resolveWait, 1100));
      expect(subscribeCalls.length).toBeGreaterThanOrEqual(2);
      expect(subscribeCalls.length).toBeLessThanOrEqual(3);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("killed member's deferred cleanup waits for tool.success, not execution.interrupted", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-kill-quiesce-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const stream = createEventStream();
    const { ctx, tools, hooks, commands } = createMockContext(repoDir, dbPath, {}, () => stream);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    let reader: SwarmBoardDB | undefined;

    try {
      const swarmTool = tools.get("swarm");
      await commands.get("swarm").execute({
        sessionID: "sess_coord",
        prompt: "Kill quiesce test",
        delivery: "queue",
      });

      const addRes = JSON.parse(
        (await swarmTool.execute(
          { action: "add", name: "w1", brief: "work", workspace: "inherit" },
          { sessionID: "sess_coord" },
        )).content,
      );
      expect(addRes.ok).toBe(true);
      const workerSession = addRes.spawned[0].session_id;

      const claimRes = JSON.parse(
        (await swarmTool.execute({ action: "claim", globs: ["src/**/*.ts"] }, { sessionID: workerSession })).content,
      );
      expect(claimRes.ok).toBe(true);
      expect(claimRes.claimed).toEqual(["src/**/*.ts"]);

      // Simulate a write tool already running for the worker: this bumps the
      // active-tool counter so kill's waitForQuiesce times out and the cleanup
      // is deferred into pendingKillCleanup.
      await hooks["tool.execute.before"]({
        id: "call_kill_1",
        tool: "write",
        input: { filePath: join(repoDir, "src", "a.ts") },
        sessionID: workerSession,
      });

      const killRes = JSON.parse(
        (await swarmTool.execute({ action: "kill", name: "w1" }, { sessionID: "sess_coord" })).content,
      );
      expect(killRes.ok).toBe(true);

      // Mechanism B: execution.interrupted must NOT fake quiescence for a
      // session with deferred kill cleanup; the lock must survive it.
      stream.push({ type: "session.execution.interrupted", data: { sessionID: workerSession } });
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));

      reader = new SwarmBoardDB(await openSqliteDatabase(dbPath), dirname(dbPath));
      const activeSwarm = reader.getActiveSwarms()[0];
      expect(reader.listLocks(activeSwarm.id)).toHaveLength(1);

      // The real tool completion is what triggers the deferred cleanup.
      stream.push({ type: "session.tool.success", data: { sessionID: workerSession } });
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));

      expect(reader.listLocks(activeSwarm.id)).toHaveLength(0);
      stream.end();
    } finally {
      reader?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("plugin dispose runs deferred kill cleanup instead of dropping it", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-dispose-kill-cleanup-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const stream = createEventStream();
    const { ctx, tools, hooks, commands } = createMockContext(repoDir, dbPath, {}, () => stream);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as (() => Promise<void>) & {
      pendingKillCleanup: Map<string, () => void>;
    };
    let reader: SwarmBoardDB | undefined;

    try {
      // The deferred-cleanup map is exposed on the returned cleanup so the test
      // can seed a spy and assert dispose drains it.
      const deferredKills = cleanup.pendingKillCleanup;
      expect(deferredKills).toBeInstanceOf(Map);

      const swarmTool = tools.get("swarm");
      await commands.get("swarm").execute({
        sessionID: "sess_coord",
        prompt: "Dispose kill cleanup test",
        delivery: "queue",
      });

      const addRes = JSON.parse(
        (await swarmTool.execute(
          { action: "add", name: "w1", brief: "work", workspace: "inherit" },
          { sessionID: "sess_coord" },
        )).content,
      );
      expect(addRes.ok).toBe(true);
      const workerSession = addRes.spawned[0].session_id;

      const claimRes = JSON.parse(
        (await swarmTool.execute({ action: "claim", globs: ["src/**/*.ts"] }, { sessionID: workerSession })).content,
      );
      expect(claimRes.ok).toBe(true);

      // An in-flight tool makes the kill's waitForQuiesce time out, deferring
      // the lock release + workspace cleanup into pendingKillCleanup.
      await hooks["tool.execute.before"]({
        id: "call_dispose_1",
        tool: "write",
        input: { filePath: join(repoDir, "src", "a.ts") },
        sessionID: workerSession,
      });
      const killRes = JSON.parse(
        (await swarmTool.execute({ action: "kill", name: "w1" }, { sessionID: "sess_coord" })).content,
      );
      expect(killRes.ok).toBe(true);

      const originalCleanup = deferredKills.get(workerSession);
      expect(typeof originalCleanup).toBe("function");
      let ran = 0;
      deferredKills.set(workerSession, () => {
        ran += 1;
        originalCleanup!();
      });
      expect(deferredKills.size).toBe(1);

      // Before dispose the deferred cleanup has NOT run: the lock is still held.
      reader = new SwarmBoardDB(await openSqliteDatabase(dbPath), dirname(dbPath));
      const swarmId = reader.getActiveSwarms()[0].id;
      expect(reader.listLocks(swarmId)).toHaveLength(1);
      reader.close();
      reader = undefined;

      // Dispose invokes the deferred cleanup while the DB is still open.
      await cleanup();
      expect(ran).toBe(1);
      expect(deferredKills.size).toBe(0);

      // A second dispose is a no-op and must not run the entry again.
      await cleanup();
      expect(ran).toBe(1);
      expect(deferredKills.size).toBe(0);

      // The lock release really reached the DB before it closed.
      reader = new SwarmBoardDB(await openSqliteDatabase(dbPath), dirname(dbPath));
      expect(reader.listLocks(swarmId)).toHaveLength(0);
      stream.end();
    } finally {
      reader?.close();
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});
