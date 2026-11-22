import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import swarmRuntimePlugin from "../index.js";

function createHarness(repoDir: string, dbPath: string) {
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
    _interrupted: [] as string[],
    _switched: [] as Array<{ sessionID: string; model: any }>,
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
    command: {
      async transform(fn: Function) {
        const cmds = new Map<string, any>();
        fn({
          add(def: any) {
            cmds.set(def.name, def);
          },
        });
        (ctx as any)._cmds = cmds;
      },
    },
    rpc: {
      async register(_def: unknown, handlers: Record<string, any>) {
        const events: Array<{ event: string; payload: any }> = [];
        (ctx as any)._rpcEvents = events;
        (ctx as any)._rpcHandlers = handlers;
        return {
          events: {
            async emit(event: string, payload: any) {
              events.push({ event, payload });
            },
          },
          dispose() {},
        };
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
      async interrupt({ sessionID }: { sessionID: string }) {
        (ctx as any)._interrupted.push(sessionID);
      },
      async synthetic() {},
      async switchModel(input: { sessionID: string; model: any }) {
        (ctx as any)._switched.push(input);
      },
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

describe("Concurrency, State & Contract Audit Regressions", () => {
  test("C1, C2/C3, C4, C5, K3, and coordinator wake-spam suppression", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-audit-reg-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");
      const waitTool = tools.get("swarm_wait");

      // C1: n>1 + owned_globs in inherit mode fails upfront with 0 partial shards
      const badShards = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w", n: 3, brief: "work", owned_globs: ["src/**"] },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(badShards.ok).toBe(false);
      expect(badShards.error).toContain("owned_globs");

      // C3: spawning a member delivers ONLY 1 prompt (the opening prompt, NOT a wake-up)
      const addW1 = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w1", brief: "Do task 1", channels: ["main"] },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(addW1.ok).toBe(true);
      const w1Sess = addW1.spawned[0].session_id as string;
      const w1Prompts = prompts.filter((p) => p.sessionID === w1Sess);
      expect(w1Prompts.length).toBe(1);
      expect(w1Prompts[0].text).not.toContain("[SWARM BOARD WAKE-UP");

      // Coordinator wake suppression: posting @coordinator when not parked sends 0 prompts to sess_coord
      await postTool.execute({ text: "@coordinator [done] finished" }, { sessionID: w1Sess });
      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.length).toBe(0);

      // C4: two concurrent swarm_wait calls from the same session settle the first cleanly
      const wait1Promise = waitTool.execute({ mentions_only: true }, { sessionID: w1Sess });
      const wait2Promise = waitTool.execute({ mentions_only: true }, { sessionID: w1Sess });
      const wait1Res = JSON.parse((await wait1Promise).content);
      expect(wait1Res.woken).toBe(false);
      await postTool.execute({ text: "@w1 wake up" }, { sessionID: "sess_coord" });
      const wait2Res = JSON.parse((await wait2Promise).content);
      expect(wait2Res.woken).toBe(true);

      // C5 & K3: create #dev channel, post @w1 in #dev (w1 is only in #main) -> no wake, no leak
      await swarmTool.execute({ action: "channel", op: "create", channel: "dev", topic: "dev" }, { sessionID: "sess_coord" });
      const beforePrompts = prompts.filter((p) => p.sessionID === w1Sess).length;
      await postTool.execute({ channel: "dev", text: "@w1 secret dev msg" }, { sessionID: "sess_coord" });
      await postTool.execute({ channel: "main", text: "public main msg" }, { sessionID: "sess_coord" });
      const afterPrompts = prompts.filter((p) => p.sessionID === w1Sess).length;
      expect(afterPrompts).toBe(beforePrompts);

      // K3: w2 subscribed to main+dev; reading channel:"main" must NOT skip unread #dev post
      const addW2 = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w2", brief: "Do task 2", channels: ["main", "dev"] },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      if (!addW2.ok) throw new Error(`addW2 failed: ${addW2.error}`);
      const w2Sess = addW2.spawned[0].session_id as string;
      await postTool.execute({ channel: "dev", text: "dev msg for w2" }, { sessionID: "sess_coord" });
      await postTool.execute({ channel: "main", text: "main msg for w2" }, { sessionID: "sess_coord" });
      const mainRead = JSON.parse((await readTool.execute({ channel: "main", since: 0 }, { sessionID: w2Sess })).content);
      expect(mainRead.posts.some((p: any) => p.text === "main msg for w2")).toBe(true);
      const devRead = JSON.parse((await readTool.execute({ channel: "dev" }, { sessionID: w2Sess })).content);
      expect(devRead.posts.some((p: any) => p.text === "dev msg for w2")).toBe(true);

      // Verify RPC events were emitted for lifecycle transitions
      const rpcEvents = (ctx as any)._rpcEvents as Array<{ event: string; payload: any }>;
      expect(rpcEvents.some((e) => e.payload?.reason === "swarm_created")).toBe(true);
      expect(rpcEvents.some((e) => e.payload?.reason === "member_spawned")).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("/swarm slash command immediately initializes swarm and emits swarm_created", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-cmd-init-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmCmd = (ctx as any)._cmds.get("swarm");
      expect(swarmCmd).toBeDefined();
      await swarmCmd.execute({
        sessionID: "sess_coord",
        prompt: { text: "Build feature X\nwith tests" },
        delivery: "queue",
      });

      const swarmTool = tools.get("swarm");
      const statusRes = JSON.parse((await swarmTool.execute({ action: "status" }, { sessionID: "sess_coord" })).content);
      expect(statusRes.ok).toBe(true);
      expect(statusRes.swarm?.status).toBe("running");
      expect(statusRes.swarm?.title).toBe("Build feature X");

      const rpcEvents = (ctx as any)._rpcEvents as Array<{ event: string; payload: any }>;
      expect(rpcEvents.some((e) => e.payload?.reason === "swarm_created")).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("setRoleModel interrupts working worker, switches model, and reruns task mid-swarm", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-role-switch-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts } = createHarness(repoDir, dbPath);
    let capturedCreateInput: any = null;
    const origCreate = ctx.session.create;
    ctx.session.create = async (input: any) => {
      capturedCreateInput = input;
      return await origCreate(input);
    };
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const addRes = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "coder", brief: "Implement feature Z" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(addRes.ok).toBe(true);
      const coderSess = addRes.spawned[0].session_id as string;

      // Worker session must omit parentID so built-in subagent pill does not appear
      expect(capturedCreateInput.parentID).toBeUndefined();

      const handlers = (ctx as any)._rpcHandlers;
      const roleCfg = await handlers.getRoleConfig({ sessionId: "sess_coord" });
      expect(roleCfg.models.length).toBe(2);

      const promptsBefore = prompts.filter((p) => p.sessionID === coderSess).length;
      const switchRes = await handlers.setRoleModel({
        role: "worker",
        model: "openai/gpt-5.4#high",
        sessionId: "sess_coord",
      });

      expect(switchRes.ok).toBe(true);
      expect(switchRes.model).toBe("openai/gpt-5.4#high");
      expect(switchRes.switchedMembers).toContain("coder");
      expect(switchRes.rerunMembers).toContain("coder");
      expect((ctx as any)._interrupted).toContain(coderSess);
      expect((ctx as any)._switched.some((s: any) => s.sessionID === coderSess && s.model.id === "gpt-5.4")).toBe(true);

      const promptsAfter = prompts.filter((p) => p.sessionID === coderSess);
      expect(promptsAfter.length).toBe(promptsBefore + 1);
      expect(promptsAfter[promptsAfter.length - 1].text).toContain("SWARM MODEL SWITCHED");
      expect(promptsAfter[promptsAfter.length - 1].text).toContain("Implement feature Z");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});
