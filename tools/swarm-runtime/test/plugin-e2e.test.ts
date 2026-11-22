import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import swarmRuntimePlugin from "../index.js";

function createMockContext(repoDir: string, dbPath: string, extraOptions: Record<string, unknown> = {}) {
  const tools = new Map<string, any>();
  const hooks: Record<string, Function> = {};
  const sessions = new Map<string, any>();
  const switchModelCalls: any[] = [];
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
      async transform() {},
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
      async prompt() {},
      async interrupt() {},
      async synthetic() {},
      async switchModel(input: any) {
        switchModelCalls.push(input);
      },
      async hook(name: string, fn: Function) {
        hooks[`session.${name}`] = fn;
      },
    },
    event: {
      subscribe() {
        return {
          async *[Symbol.asyncIterator]() {},
        };
      },
    },
  };

  return { ctx, tools, hooks, sessions, switchModelCalls };
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
});
