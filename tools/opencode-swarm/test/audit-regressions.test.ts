import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import swarmRuntimePlugin from "../index.js";
import { buildSortedModelOptions, resolveRecommendedRoleModels } from "../src/gui/recommendedModels.js";
import { hasFreshVerifierPass } from "../src/monitor.js";
import { parseMentionsFromText } from "../src/mentions.js";
import { buildMemberOpeningPrompt, COORDINATOR_PROTOCOL } from "../src/prompts.js";

function createHarness(repoDir: string, dbPath: string) {
  const tools = new Map<string, any>();
  const sessions = new Map<string, any>();
  const prompts: Array<{ sessionID: string; text: string }> = [];
  const eventQueue: any[] = [];
  let resolveNextEvent: ((ev: IteratorResult<any>) => void) | null = null;
  let seq = 1;

  function pushEvent(ev: any) {
    if (resolveNextEvent) {
      const r = resolveNextEvent;
      resolveNextEvent = null;
      r({ value: ev, done: false });
    } else {
      eventQueue.push(ev);
    }
  }

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
      subscribe({ signal }: { signal?: AbortSignal } = {}) {
        return {
          async *[Symbol.asyncIterator]() {
            while (!signal?.aborted) {
              if (eventQueue.length > 0) {
                yield eventQueue.shift();
                continue;
              }
              const next = await new Promise<IteratorResult<any>>((resolve) => {
                resolveNextEvent = resolve;
                signal?.addEventListener(
                  "abort",
                  () => {
                    if (resolveNextEvent === resolve) resolveNextEvent = null;
                    resolve({ value: undefined, done: true });
                  },
                  { once: true },
                );
              });
              if (next.done) break;
              yield next.value;
            }
          },
        };
      },
    },
  };

  return { ctx, tools, prompts, pushEvent };
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

  test("post_message [done]/PASS, session.status events, and zero-spam instant coordinator completion handoff", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-fast-handoff-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;

    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;
      const rpcEvents = (ctx as any)._rpcEvents as Array<{ event: string; payload: any }>;

      const addWorker = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature A" }, { sessionID: "sess_coord" })).content,
      );
      const addVerifier = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "verifier", role: "verifier", brief: "Verify feature A" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      const w1Sess = addWorker.spawned[0].session_id as string;
      const verSess = addVerifier.spawned[0].session_id as string;

      // Worker finishes -> immediately waiting + track_status=done + emits member_state
      await postTool.execute({ text: "[done] @verifier please check feature A" }, { sessionID: w1Sess });
      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const w1Snap = snap.members.find((m: any) => m.name === "w1");
      expect(w1Snap.state).toBe("waiting");
      expect(w1Snap.track_status).toBe("done");
      expect(rpcEvents.some((e) => e.payload?.reason === "member_state" && e.payload?.handle === "w1")).toBe(true);

      // While @coordinator is still working, coordinator gets 0 handoff prompts
      expect(prompts.filter((p) => p.sessionID === "sess_coord").length).toBe(0);

      // Verifier finishes with PASS -> verifier transitions to waiting immediately
      await postTool.execute({ text: "@coordinator PASS all checks green" }, { sessionID: verSess });
      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verSnap = snap.members.find((m: any) => m.name === "verifier");
      expect(verSnap.state).toBe("waiting");
      expect(verSnap.track_status).toBe("done");
      expect(prompts.filter((p) => p.sessionID === "sess_coord").length).toBe(0);

      // Test session.status busy -> idle on verifier & idle on coordinator
      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "busy" } } });
      await new Promise((r) => setTimeout(r, 25));
      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.find((m: any) => m.name === "verifier").state).toBe("working");

      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 25));
      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.find((m: any) => m.name === "verifier").state).toBe("waiting");

      // Now @coordinator finishes its turn -> session.status idle wakes coordinator ONCE cleanly!
      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.length).toBe(1);
      expect(coordPrompts[0].text).not.toContain("[SWARM BOARD WAKE-UP");
      expect(coordPrompts[0].text).toContain("All swarm members finished");

      // Duplicate session.idle event MUST NOT re-wake coordinator for the same post
      pushEvent({ type: "session.idle", data: { sessionID: "sess_coord" } });
      await new Promise((r) => setTimeout(r, 25));
      expect(prompts.filter((p) => p.sessionID === "sess_coord").length).toBe(1);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("role-model persistence to role-models.json survives plugin restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-role-persist-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const h1 = createHarness(repoDir, dbPath);
    const cleanup1 = (await swarmRuntimePlugin.setup(h1.ctx)) as () => Promise<void>;
    try {
      const handlers1 = (h1.ctx as any)._rpcHandlers;
      const res = await handlers1.setRoleModel({ role: "worker", model: "openai/gpt-5.4#high" });
      expect(res.ok).toBe(true);
      expect(existsSync(join(root, "data", "role-models.json"))).toBe(true);
    } finally {
      await cleanup1();
    }

    const h2 = createHarness(repoDir, dbPath);
    const cleanup2 = (await swarmRuntimePlugin.setup(h2.ctx)) as () => Promise<void>;
    try {
      const handlers2 = (h2.ctx as any)._rpcHandlers;
      const cfg = await handlers2.getRoleConfig({});
      expect(cfg.roleModels.worker).toBe("openai/gpt-5.4#high");
    } finally {
      await cleanup2();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("buildSortedModelOptions sorts A-Z and resolveRecommendedRoleModels picks expected defaults", () => {
    const catalog = [
      { providerID: "zeta", id: "z-model", variants: ["low"] },
      { providerID: "opencode-go", id: "glm-5.3-flash", variants: ["fast"] },
      { providerID: "opencode-go", id: "deepseek-v4.1-flash", variants: ["low", "high", "max"] },
      { providerID: "opencode-go", id: "muse-spark-1.3-contributor", variants: ["default", "xhigh"] },
      { providerID: "alpha", id: "a-model", variants: [] },
    ];

    const sorted = buildSortedModelOptions(catalog);
    const labels = sorted.map((o) => o.label);
    const expected = [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
    expect(labels).toEqual(expected);

    const rec = resolveRecommendedRoleModels(catalog);
    expect(rec.coordinator).toBe("opencode-go/muse-spark-1.3-contributor#xhigh");
    expect(rec.worker).toBe("opencode-go/deepseek-v4.1-flash#high");
    expect(rec.verifier).toBe("opencode-go/deepseek-v4.1-flash#max");
    expect(rec.monitor).toBe("opencode-go/glm-5.3-flash");

    const manualOpts = buildSortedModelOptions(catalog, undefined, rec.worker);
    expect(manualOpts[0].spec).toBe(rec.worker);
    expect(manualOpts[0].isRecommended).toBe(true);
  });

  test("A: no verifier + worker [done] auto-spawns verifier, no coordinator complete handoff", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-a-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature A" }, { sessionID: "sess_coord" })).content,
      );
      expect(addW1.ok).toBe(true);
      const w1Sess = addW1.spawned[0].session_id as string;

      await postTool.execute({ text: "[done] finished feature A" }, { sessionID: w1Sess });

      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifiers = snap.members.filter((m: any) => m.role === "verifier");
      expect(verifiers.length).toBe(1);
      expect(verifiers[0].name).toBe("verifier");
      expect(verifiers[0].state).toBe("working");

      const verSess = verifiers[0].session_id as string;
      const verPrompts = prompts.filter((p) => p.sessionID === verSess);
      expect(verPrompts.length).toBeGreaterThan(0);
      expect(verPrompts.some((p) => /Verify/i.test(p.text))).toBe(true);

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.some((p) => /All swarm members finished/i.test(p.text))).toBe(false);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("B: existing idle verifier + worker [done] without mention wakes verifier with [verify], no duplicate", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-b-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature B" }, { sessionID: "sess_coord" })).content,
      );
      const addVer = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "verifier", role: "verifier", brief: "Verify feature B" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(addW1.ok).toBe(true);
      expect(addVer.ok).toBe(true);
      const w1Sess = addW1.spawned[0].session_id as string;
      const verSess = addVer.spawned[0].session_id as string;

      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 30));
      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.find((m: any) => m.name === "verifier").state).toBe("waiting");

      const promptsBefore = prompts.filter((p) => p.sessionID === verSess).length;
      await postTool.execute({ text: "[done] finished feature B" }, { sessionID: w1Sess });

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifiers = snap.members.filter((m: any) => m.role === "verifier");
      expect(verifiers.length).toBe(1);
      expect(verifiers[0].state).toBe("working");

      const verPrompts = prompts.filter((p) => p.sessionID === verSess);
      expect(verPrompts.length).toBeGreaterThan(promptsBefore);
      expect(verPrompts.some((p) => /\[verify\]/i.test(p.text))).toBe(true);

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.some((p) => /All swarm members finished/i.test(p.text))).toBe(false);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("C: idle re-entry does not duplicate verifier spawn/request per head seq", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-c-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature C" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature C" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(1);
      const headAfterSpawn = snap.head as number;

      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 30));
      pushEvent({ type: "session.idle", data: { sessionID: "sess_coord" } });
      await new Promise((r) => setTimeout(r, 30));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(1);

      await postTool.execute({ text: "[done] still done feature C" }, { sessionID: w1Sess });
      await new Promise((r) => setTimeout(r, 10));
      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(1);
      expect(snap.head).toBeGreaterThanOrEqual(headAfterSpawn);

      const verifierPosts = snap.board_posts.filter(
        (p: any) => /\[verify\]/i.test(p.body) && p.author === "coordinator",
      );
      expect(verifierPosts.length).toBeLessThanOrEqual(1);
      void prompts;
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("D: verifier PASS after auto-spawn hands complete to coordinator", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-d-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature D" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature D" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");
      expect(verifier).toBeDefined();
      const verSess = verifier.session_id as string;

      await postTool.execute({ text: "@coordinator PASS all checks green" }, { sessionID: verSess });
      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.length).toBe(1);
      expect(coordPrompts[0].text).toContain("complete");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("E: autoSpawnVerifier false disables auto verifier, handoff notes missing verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-e-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    (ctx as any).options.autoSpawnVerifier = false;
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature E" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature E" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(0);

      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(0);

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.length).toBe(1);
      expect(coordPrompts[0].text).toMatch(/Verification is NOT done|verification.*missing/i);
      expect(coordPrompts[0].text).toMatch(/verifier/i);
      expect(coordPrompts[0].text).not.toContain("All swarm members finished");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("F: monitor stall after verifier PASS nudges coordinator, not verifier, and does not re-trigger [verify]", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-no-reverify-mon-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    (ctx as any).options.stallTimeoutMs = 40;
    (ctx as any).options.monitorIntervalMs = 20;
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature F" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature F" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");
      expect(verifier).toBeDefined();
      const verSess = verifier.session_id as string;

      await postTool.execute({ text: "@coordinator PASS all checks green" }, { sessionID: verSess });
      // Coordinator reads the PASS post and goes idle without completing yet
      await readTool.execute({ since: 0 }, { sessionID: "sess_coord" });
      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });

      // Wait for monitor to fire at least once
      await new Promise((r) => setTimeout(r, 120));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(1);

      const monitorPosts = snap.board_posts.filter((p: any) => p.author === "monitor");
      expect(monitorPosts.length).toBeGreaterThanOrEqual(1);
      expect(monitorPosts[0].body).toContain("@coordinator");
      expect(monitorPosts[0].body).not.toContain("@verifier");

      const verifyPosts = snap.board_posts.filter((p: any) => /\[verify\]/i.test(p.body));
      expect(verifyPosts.length).toBe(0);
      void prompts;
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("G: worker PASS-acknowledgment after verifier PASS does not re-trigger [verify]", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-no-reverify-ack-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature G" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature G" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");
      const verSess = verifier.session_id as string;

      await postTool.execute({ text: "@coordinator PASS all checks green" }, { sessionID: verSess });
      await postTool.execute(
        { text: "[done] @coordinator — PASS acknowledged. No further action open on my side." },
        { sessionID: w1Sess },
      );

      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifyPosts = snap.board_posts.filter((p: any) => /\[verify\]/i.test(p.body));
      expect(verifyPosts.length).toBe(0);

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.some((p) => p.text.includes("complete"))).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("H: substantive worker post after verifier PASS re-triggers [verify]", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-reverify-fix-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature H" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature H" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");
      const verSess = verifier.session_id as string;

      await postTool.execute({ text: "@coordinator PASS initial check" }, { sessionID: verSess });
      // Wait for verifier to be idle so it can be woken by [verify]
      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 20));

      await postTool.execute({ text: "[done] fixed edge case in parser.ts" }, { sessionID: w1Sess });
      await new Promise((r) => setTimeout(r, 30));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifyPosts = snap.board_posts.filter((p: any) => /\[verify\]/i.test(p.body));
      expect(verifyPosts.length).toBe(1);
      void hasFreshVerifierPass;
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("I: double-load guard disposes previous active instance for the same dbPath", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-double-load-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const h1 = createHarness(repoDir, dbPath);
    let rpc1Disposed = false;
    const origRegister1 = h1.ctx.rpc.register;
    h1.ctx.rpc.register = async (def: any, handlers: any) => {
      const reg = await origRegister1(def, handlers);
      return {
        ...reg,
        dispose: () => {
          rpc1Disposed = true;
        },
      };
    };

    const cleanup1 = (await swarmRuntimePlugin.setup(h1.ctx)) as () => Promise<void>;
    const h2 = createHarness(repoDir, dbPath);
    const cleanup2 = (await swarmRuntimePlugin.setup(h2.ctx)) as () => Promise<void>;

    try {
      expect(rpc1Disposed).toBe(true);
      const swarmTool2 = h2.tools.get("swarm");
      const titleRes = JSON.parse(
        (await swarmTool2.execute({ action: "title", title: "Second Instance" }, { sessionID: "sess_coord" })).content,
      );
      expect(titleRes.ok).toBe(true);

      // Calling cleanup1 again must be a safe no-op
      await cleanup1();
      const statusRes = JSON.parse(
        (await swarmTool2.execute({ action: "status" }, { sessionID: "sess_coord" })).content,
      );
      expect(statusRes.swarm.title).toBe("Second Instance");
    } finally {
      await cleanup2();
      await cleanup1();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("J: prompts align coordinator and worker rules with the auto-verifier gate", () => {
    expect(COORDINATOR_PROTOCOL).not.toContain("(or all worker tracks finish)");
    expect(COORDINATOR_PROTOCOL).toMatch(/Do not call `swarm\{action:"complete"\}` until `@verifier` confirms `PASS`/);

    const workerPrompt = buildMemberOpeningPrompt({
      swarmId: "sw_test",
      name: "w1",
      role: "worker",
      brief: "Do work",
      workspaceMode: "inherit",
      workspaceDir: "/repo",
      ownedGlobs: [],
      channels: ["main"],
    });
    expect(workerPrompt).toContain("do not post acknowledgment replies");

    const verifierPrompt = buildMemberOpeningPrompt({
      swarmId: "sw_test",
      name: "verifier",
      role: "verifier",
      brief: "Verify work",
      workspaceMode: "inherit",
      workspaceDir: "/repo",
      ownedGlobs: [],
      channels: ["main"],
    });
    expect(verifierPrompt).not.toContain("do not post acknowledgment replies");
  });

  test("K: cleanup aborts parked swarm_wait instead of hanging forever", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-wait-cleanup-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const waitTool = tools.get("swarm_wait");

      await swarmTool.execute({ action: "title", title: "Wait Cleanup Test" }, { sessionID: "sess_coord" });
      const waitPromise = waitTool.execute({ since: 0, mentions_only: true }, { sessionID: "sess_coord" });
      await new Promise((r) => setTimeout(r, 20));

      await cleanup();
      const waitRes = JSON.parse((await waitPromise).content);
      expect(waitRes.woken).toBe(false);
      expect(waitRes.aborted).toBe(true);
      expect(waitRes.posts).toEqual([]);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("L: parked coordinator in swarm_wait wakes when verifier posts PASS without @coordinator", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-wait-pass-wake-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature L" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;

      const coordWaitPromise = waitTool.execute({ since: 1, mentions_only: true }, { sessionID: "sess_coord" });
      await new Promise((r) => setTimeout(r, 20));

      await postTool.execute({ text: "[done] finished feature L" }, { sessionID: w1Sess });
      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");
      expect(verifier).toBeDefined();

      // Verifier posts PASS without @coordinator mention
      await postTool.execute({ text: "PASS — all checks green" }, { sessionID: verifier.session_id });

      const waitRes = JSON.parse((await coordWaitPromise).content);
      expect(waitRes.woken).toBe(true);
      expect(waitRes.handoff).toContain('swarm{action:"complete"}');
      expect(waitRes.posts.some((p: any) => p.author === verifier.name && p.text.includes("PASS"))).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("M: late swarm_wait after PASS returns immediately with handoff, and markdown @mentions are parsed", async () => {
    const parsedMd = parseMentionsFromText("Done! **@coordinator** and `@verifier`—please check, cc user@example.com");
    expect(parsedMd.memberMentions).toEqual(["coordinator", "verifier"]);

    const root = mkdtempSync(join(tmpdir(), "swarm-late-wait-pass-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature M" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;

      await postTool.execute({ text: "[done] finished feature M" }, { sessionID: w1Sess });
      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");

      // Verifier posts PASS without @coordinator mention
      await postTool.execute({ text: "PASS — verified" }, { sessionID: verifier.session_id });

      const lateWaitRes = JSON.parse(
        (await waitTool.execute({ since: 1, mentions_only: true }, { sessionID: "sess_coord" })).content,
      );
      expect(lateWaitRes.woken).toBe(true);
      expect(lateWaitRes.handoff).toContain('swarm{action:"complete"}');
      expect(lateWaitRes.posts.some((p: any) => p.text.includes("PASS"))).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});
