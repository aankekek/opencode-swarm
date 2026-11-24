import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import swarmRuntimePlugin from "../index.js";
import { parseQuotaRetryDelayMs } from "../src/plugin.js";
import { buildSortedModelOptions, resolveRecommendedRoleModels } from "../src/gui/recommendedModels.js";
import { buildVerificationIncompleteNudge, findUnansweredMentionTarget, hasFreshVerifierPass } from "../src/monitor.js";
import { parseMentionsFromText } from "../src/mentions.js";
import { buildMemberOpeningPrompt, COORDINATOR_PROTOCOL } from "../src/prompts.js";
import { validateChannelName, validateMemberName } from "../src/security.js";
import { cleanupMemberWorkspace, DIRCOPY_MARKER_FILE, provisionMemberWorkspace } from "../src/workspace.js";

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

  test("N: killed auto-spawned verifier is respawned on new completed work without duplicates", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-n-"));
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
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature N" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;

      await postTool.execute({ text: "[done] finished feature N" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      let liveVerifiers = snap.members.filter((m: any) => m.role === "verifier" && m.state !== "killed");
      expect(liveVerifiers.length).toBe(1);
      expect(liveVerifiers[0].name).toBe("verifier");

      // Kill the auto-spawned verifier before it posts PASS.
      const killRes = JSON.parse(
        (await swarmTool.execute({ action: "kill", name: "verifier" }, { sessionID: "sess_coord" })).content,
      );
      expect(killRes.ok).toBe(true);
      expect(killRes.killed).toContain("verifier");

      // New completed work must auto-verify again (previously blocked by the permanent Set).
      await postTool.execute({ text: "[done] finished feature N round 2" }, { sessionID: w1Sess });

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      liveVerifiers = snap.members.filter((m: any) => m.role === "verifier" && m.state !== "killed");
      expect(liveVerifiers.length).toBe(1);
      expect(liveVerifiers[0].name).toBe("verifier-2");
      expect(snap.members.filter((m: any) => m.name === "verifier-2").length).toBe(1);

      // An extra idle event while verifier-2 is live must not duplicate it.
      pushEvent({ type: "session.status", data: { sessionID: w1Sess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.name === "verifier-2").length).toBe(1);
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(2);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("O: auto-verifier respawn attempts are bounded and hand off verification-missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-auto-v-o-"));
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
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature O" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;

      const killVerifier = async (name: string) => {
        const res = JSON.parse(
          (await swarmTool.execute({ action: "kill", name }, { sessionID: "sess_coord" })).content,
        );
        expect(res.ok).toBe(true);
        expect(res.killed).toContain(name);
      };

      // Spawns 1..3, each killed before PASS, then one more completed-work post.
      await postTool.execute({ text: "[done] finished feature O round 1" }, { sessionID: w1Sess });
      await killVerifier("verifier");
      await postTool.execute({ text: "[done] finished feature O round 2" }, { sessionID: w1Sess });
      await killVerifier("verifier-2");
      await postTool.execute({ text: "[done] finished feature O round 3" }, { sessionID: w1Sess });
      await killVerifier("verifier-3");
      await postTool.execute({ text: "[done] finished feature O round 4" }, { sessionID: w1Sess });

      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifierMembers = snap.members.filter((m: any) => m.role === "verifier");
      expect(verifierMembers.map((m: any) => m.name)).toEqual(["verifier", "verifier-2", "verifier-3"]);
      expect(verifierMembers.every((m: any) => m.state === "killed")).toBe(true);
      expect(snap.members.filter((m: any) => m.role === "verifier" && m.state !== "killed").length).toBe(0);

      // Once the coordinator goes idle, it gets a verification-missing handoff, not completion.
      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.length).toBe(1);
      expect(coordPrompts[0].text).toMatch(/Verification is NOT done|verification.*(missing|incomplete)/i);
      expect(coordPrompts[0].text).toMatch(/verifier/i);
      expect(coordPrompts[0].text).not.toContain("All swarm members finished");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("P: monitor stall without verifier PASS never invites completion", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-mon-no-pass-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    (ctx as any).options.stallTimeoutMs = 40;
    (ctx as any).options.monitorIntervalMs = 20;
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Build feature P" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;
      await postTool.execute({ text: "[done] finished feature P" }, { sessionID: w1Sess });

      let snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifier = snap.members.find((m: any) => m.role === "verifier");
      expect(verifier).toBeDefined();

      // Kill the verifier before PASS so no live verifier remains.
      const killRes = JSON.parse(
        (await swarmTool.execute({ action: "kill", name: verifier.name }, { sessionID: "sess_coord" })).content,
      );
      expect(killRes.ok).toBe(true);

      // Coordinator catches up so the monitor does not take the "unread post" branch.
      await readTool.execute({ since: 0 }, { sessionID: "sess_coord" });

      await new Promise((r) => setTimeout(r, 120));

      snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier" && m.state !== "killed").length).toBe(0);

      const monitorPosts = snap.board_posts.filter((p: any) => p.author === "monitor");
      expect(monitorPosts.length).toBeGreaterThanOrEqual(1);
      for (const p of monitorPosts) {
        expect(p.body).not.toContain('call swarm{action:"complete"}');
        expect(p.body).not.toContain("call swarm{action:'complete'}");
      }
      expect(monitorPosts[0].body).toContain("@coordinator");
      expect(monitorPosts[0].body).toContain("verifier");
      expect(monitorPosts[0].body).toContain("no live verifier");

      // Pure helper: both variants must describe the missing verification without inviting complete.
      const noVerifier = buildVerificationIncompleteNudge("sw_demo");
      expect(noVerifier).toContain("no live verifier");
      expect(noVerifier).not.toContain('call swarm{action:"complete"}');
      expect(noVerifier).not.toContain("call swarm{action:'complete'}");

      const stalledVerifier = buildVerificationIncompleteNudge("sw_demo", {
        name: "verifier-2",
        state: "stopped",
      } as any);
      expect(stalledVerifier).toContain("verifier-2");
      expect(stalledVerifier).toContain("stopped");
      expect(stalledVerifier).not.toContain("no live verifier");
      expect(stalledVerifier).not.toContain('call swarm{action:"complete"}');
      expect(stalledVerifier).not.toContain("call swarm{action:'complete'}");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("Q: open plan units suppress auto-verifier and complete handoff when batch finishes", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-open-units-gate-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      await swarmTool.execute({ action: "title", title: "Batched Plan" }, { sessionID: "sess_coord" });
      await swarmTool.execute(
        { action: "plan", tasks: ["unit-1", "unit-2", "unit-3"] },
        { sessionID: "sess_coord" },
      );

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Do unit 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW1.spawned[0].session_id as string;

      await postTool.execute({ text: "[done] finished unit 1" }, { sessionID: w1Sess });
      pushEvent({ type: "session.status", data: { sessionID: "sess_coord", status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 40));

      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snap.members.filter((m: any) => m.role === "verifier").length).toBe(0);

      const coordPrompts = prompts.filter((p) => p.sessionID === "sess_coord");
      expect(coordPrompts.length).toBe(1);
      expect(coordPrompts[0].text).toContain("2 plan unit(s) still open");
      expect(coordPrompts[0].text).not.toContain('swarm{action:"complete"}');
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("R: setRoleModel with unchanged model does not interrupt or rerun a working worker", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-noop-role-switch-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const handlers = (ctx as any)._rpcHandlers;

      const addRes = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "coder", brief: "Keep running" }, { sessionID: "sess_coord" }))
          .content,
      );
      const coderSess = addRes.spawned[0].session_id as string;
      const promptsBefore = prompts.filter((p) => p.sessionID === coderSess).length;

      // Apply the exact same model the working worker is already running
      const noopRes = await handlers.setRoleModel({
        role: "worker",
        model: "anthropic/claude-sonnet-4-6",
        sessionId: "sess_coord",
      });

      expect(noopRes.ok).toBe(true);
      expect(noopRes.switchedMembers).toEqual([]);
      expect(noopRes.rerunMembers).toEqual([]);
      expect((ctx as any)._interrupted).not.toContain(coderSess);
      expect((ctx as any)._switched.some((s: any) => s.sessionID === coderSess)).toBe(false);
      expect(prompts.filter((p) => p.sessionID === coderSess).length).toBe(promptsBefore);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("S1: swarm_wait clamps out-of-range since to latestSeq so @mention still wakes member", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-s1-clamp-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");

      const addRes = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "build-a", brief: "Build A" }, { sessionID: "sess_coord" }))
          .content,
      );
      const wSess = addRes.spawned[0].session_id as string;

      // Worker mistakenly passes since: 450 (e.g. seconds) when board is only at seq 1
      const waitPromise = waitTool.execute({ since: 450 }, { sessionID: wSess });
      await new Promise((r) => setTimeout(r, 20));

      await postTool.execute({ text: "@build-a please continue" }, { sessionID: "sess_coord" });
      const waitRes = JSON.parse((await waitPromise).content);

      expect(waitRes.woken).toBe(true);
      expect(waitRes.posts.some((p: any) => p.text.includes("@build-a please continue"))).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("S2: parked verifier in swarm_wait is woken when [verify] is posted", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-s2-parked-verifier-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;

      const addV = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "verifier", role: "verifier", brief: "Verify work" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      const verSess = addV.spawned[0].session_id as string;

      // Verifier finishes initial turn and parks in swarm_wait
      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 20));
      const verWaitPromise = waitTool.execute({}, { sessionID: verSess });
      await new Promise((r) => setTimeout(r, 20));

      // Worker posts [done] -> ensureVerifierForCompletedWork must post @verifier [verify] and wake the parked waiter
      await postTool.execute({ text: "[done] w1 finished" }, { sessionID: w1Sess });
      const verWaitRes = JSON.parse((await verWaitPromise).content);

      expect(verWaitRes.woken).toBe(true);
      expect(verWaitRes.posts.some((p: any) => p.text.includes("[verify]"))).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("S3: incremental verification spawns verifier when 2 of 4 workers finish, then sends final [verify] when all 4 finish", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-s3-incremental-verify-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const readTool = tools.get("read_board");
      const handlers = (ctx as any)._rpcHandlers;

      const sessions: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const res = JSON.parse(
          (await swarmTool.execute({ action: "add", name: `w${i}`, brief: `Task ${i}` }, { sessionID: "sess_coord" }))
            .content,
        );
        sessions.push(res.spawned[0].session_id as string);
      }

      // 2 of 4 workers finish while w3 and w4 are still working/open
      await postTool.execute({ text: "[done] w1 complete" }, { sessionID: sessions[0] });
      await postTool.execute({ text: "[done] w2 complete" }, { sessionID: sessions[1] });
      await new Promise((r) => setTimeout(r, 30));

      const snapMid = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const verifiersMid = snapMid.members.filter((m: any) => m.role === "verifier");
      expect(verifiersMid.length).toBe(1);
      const verSess = verifiersMid[0].session_id as string;

      // Verifier finishes incremental check and goes idle
      await postTool.execute({ text: "OK @coordinator verified w1 and w2" }, { sessionID: verSess });
      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 20));

      // Remaining 2 workers finish
      await postTool.execute({ text: "[done] w3 complete" }, { sessionID: sessions[2] });
      await postTool.execute({ text: "[done] w4 complete" }, { sessionID: sessions[3] });
      // Verifier finishes its incremental turn for w3 and goes idle -> final [verify] is posted
      pushEvent({ type: "session.status", data: { sessionID: verSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 30));

      const board = JSON.parse((await readTool.execute({ since: 0, limit: 50 }, { sessionID: "sess_coord" })).content);
      const finalVerifyPosts = board.posts.filter(
        (p: any) => p.text.includes("[verify]") && p.text.includes("All worker tracks are complete"),
      );
      expect(finalVerifyPosts.length).toBe(1);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("S4: missed @mention while worker is working is delivered when worker goes idle", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-s4-idle-rewake-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "coder", brief: "Code" }, { sessionID: "sess_coord" })).content,
      );
      const coderSess = addW.spawned[0].session_id as string;
      const promptsBefore = prompts.filter((p) => p.sessionID === coderSess).length;

      // Worker is currently "working", so @mention cannot prompt immediately
      await postTool.execute({ text: "@coder please also check edge case X" }, { sessionID: "sess_coord" });
      expect(prompts.filter((p) => p.sessionID === coderSess).length).toBe(promptsBefore);

      // Worker finishes turn and emits idle -> missed @mention must be delivered now
      pushEvent({ type: "session.status", data: { sessionID: coderSess, status: { type: "idle" } } });
      await new Promise((r) => setTimeout(r, 30));

      const coderPrompts = prompts.filter((p) => p.sessionID === coderSess);
      expect(coderPrompts.length).toBe(promptsBefore + 1);
      expect(coderPrompts[coderPrompts.length - 1].text).toContain("please also check edge case X");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("S5: slash-separated @mentions are parsed while emails remain ignored", () => {
    const parsed = parseMentionsFromText("waiting on @build-a/@build-b/@build-c, cc user@example.com");
    expect(parsed.memberMentions).toEqual(["build-a", "build-b", "build-c"]);
  });

  test("T1: completeSwarm with exitSession completes swarm, restores coordinator permissions, emits session_exited, and clears session snapshot", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-t1-exit-session-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const updatedPermissions: Array<{ sessionID: string; permissions: unknown }> = [];
    const origUpdate = ctx.session.update;
    ctx.session.update = async (arg: any) => {
      updatedPermissions.push({ sessionID: arg.sessionID, permissions: arg.permissions });
      return origUpdate ? await origUpdate(arg) : undefined;
    };

    const emittedEvents: any[] = [];
    const rpcEvents = (ctx as any)._rpcEvents;
    if (Array.isArray(rpcEvents)) {
      // harness captures emitted events if supported; also wrap rpc.register if needed
    }
    const origRegister = (ctx as any).rpc?.register;
    if (origRegister) {
      (ctx as any).rpc.register = async (def: any, handlersArg: any) => {
        const reg = await origRegister(def, handlersArg);
        const origEmit = reg?.events?.emit;
        if (reg?.events) {
          reg.events.emit = (evName: string, payload: unknown) => {
            emittedEvents.push({ evName, payload });
            return origEmit?.(evName, payload);
          };
        }
        return reg;
      };
    }

    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const handlers = (ctx as any)._rpcHandlers;

      const addW1 = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      expect(addW1.ok).toBe(true);

      const snapBefore = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snapBefore.swarm).not.toBeNull();
      const swarmId = snapBefore.swarm.id as string;

      const exitRes = await handlers.completeSwarm({
        swarmId,
        exitSession: true,
        sessionId: "sess_coord",
        summary: "User exited",
      });
      expect(exitRes.ok).toBe(true);
      expect(exitRes.status).toBe("completed");

      expect(updatedPermissions.some((u) => u.sessionID === "sess_coord" && Array.isArray(u.permissions) && u.permissions.length === 0)).toBe(true);
      expect(emittedEvents.some((e) => e.evName === "changed" && e.payload?.reason === "session_exited" && e.payload?.handle === "sess_coord")).toBe(true);

      const snapAfter = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      expect(snapAfter.swarm).toBeNull();
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("T2: running /swarm again in an exited session clears the exit flag and returns the new swarm snapshot", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-t2-reenter-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const handlers = (ctx as any)._rpcHandlers;
      const cmds = (ctx as any)._cmds as Map<string, any>;
      const swarmCmd = cmds.get("swarm");
      expect(swarmCmd).toBeDefined();

      await swarmCmd.execute({ sessionID: "sess_reenter", prompt: "First task" });
      const firstSnap = await handlers.getSwarmSnapshot({ sessionId: "sess_reenter" });
      expect(firstSnap.swarm).not.toBeNull();

      await handlers.completeSwarm({
        swarmId: firstSnap.swarm.id,
        exitSession: true,
        sessionId: "sess_reenter",
      });
      const exitedSnap = await handlers.getSwarmSnapshot({ sessionId: "sess_reenter" });
      expect(exitedSnap.swarm).toBeNull();

      await swarmCmd.execute({ sessionID: "sess_reenter", prompt: "Second task" });
      const secondSnap = await handlers.getSwarmSnapshot({ sessionId: "sess_reenter" });
      expect(secondSnap.swarm).not.toBeNull();
      expect(secondSnap.swarm.id).not.toBe(firstSnap.swarm.id);
      expect(secondSnap.swarm.status).toBe("running");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("T3: /swarm stop and /swarm-stop exit Swarm mode without starting a new swarm", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-t3-commands-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx } = createHarness(repoDir, dbPath);
    const synthetics: Array<{ sessionID: string; text: string }> = [];
    const origSynth = ctx.session.synthetic;
    ctx.session.synthetic = async (arg: any) => {
      synthetics.push({ sessionID: arg.sessionID, text: arg.text });
      return origSynth ? await origSynth(arg) : undefined;
    };

    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const handlers = (ctx as any)._rpcHandlers;
      const cmds = (ctx as any)._cmds as Map<string, any>;
      const swarmCmd = cmds.get("swarm");
      const swarmStopCmd = cmds.get("swarm-stop");
      expect(swarmCmd).toBeDefined();
      expect(swarmStopCmd).toBeDefined();

      // `/swarm stop` on an active swarm stops and exits without creating another swarm
      await swarmCmd.execute({ sessionID: "sess_cmd", prompt: "Build feature" });
      const listBefore = await handlers.listSwarms({});
      expect(listBefore.swarms.length).toBe(1);

      await swarmCmd.execute({ sessionID: "sess_cmd", prompt: "stop" });
      const listAfterStop = await handlers.listSwarms({});
      expect(listAfterStop.swarms.length).toBe(1);
      expect(listAfterStop.swarms[0].status).toBe("completed");
      expect((await handlers.getSwarmSnapshot({ sessionId: "sess_cmd" })).swarm).toBeNull();
      expect(synthetics.some((s) => s.sessionID === "sess_cmd" && s.text.includes("Exited Swarm mode"))).toBe(true);

      // Start again, then use `/swarm-stop`
      await swarmCmd.execute({ sessionID: "sess_cmd", prompt: "Build feature 2" });
      expect((await handlers.getSwarmSnapshot({ sessionId: "sess_cmd" })).swarm?.status).toBe("running");

      await swarmStopCmd.execute({ sessionID: "sess_cmd", prompt: "" });
      const listAfterCmd = await handlers.listSwarms({});
      expect(listAfterCmd.swarms.length).toBe(2);
      expect(listAfterCmd.swarms.every((s: any) => s.status === "completed")).toBe(true);
      expect((await handlers.getSwarmSnapshot({ sessionId: "sess_cmd" })).swarm).toBeNull();
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("U1: swarm_park_guard blocks sleeping past unread @mention when caller passes board head as since", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-u1-park-guard-mentions-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;

      // Coordinator posts @w1 mention at seq 2 and another post at seq 3 while w1 is working
      await postTool.execute({ text: "@w1 fix edge case" }, { sessionID: "sess_coord" });
      await postTool.execute({ text: "general status update" }, { sessionID: "sess_coord" });

      // w1 mistakenly passes board head (since: 3) without reading seq 2 -> park guard must wake immediately with seq 2
      const waitRes = JSON.parse((await waitTool.execute({ since: 3 }, { sessionID: w1Sess })).content);
      expect(waitRes.woken).toBe(true);
      expect(String(waitRes.guard)).toContain("read_board before waiting again");
      expect(waitRes.posts.some((p: any) => p.seq === 2 && p.text.includes("@w1 fix edge case"))).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("U2: swarm_park_guard with mentions_only:false blocks sleeping past unread posts, then parks once caught up", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-u2-park-guard-any-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const waitTool = tools.get("swarm_wait");

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;

      // Coordinator posts a general message without mentioning w1 (seq 2)
      await postTool.execute({ text: "unmentioned board post" }, { sessionID: "sess_coord" });

      // w1 calls swarm_wait({ since: 2, mentions_only: false }) -> park guard returns seq 2 immediately and advances cursor
      const guardedRes = JSON.parse(
        (await waitTool.execute({ since: 2, mentions_only: false }, { sessionID: w1Sess })).content,
      );
      expect(guardedRes.woken).toBe(true);
      expect(String(guardedRes.guard)).toContain("read_board before waiting again");
      expect(guardedRes.posts.some((p: any) => p.seq === 2 && p.text === "unmentioned board post")).toBe(true);

      // Now w1 is caught up to seq 2 -> calling swarm_wait({ since: 2, mentions_only: false }) parks and wakes on seq 3
      const waitPromise = waitTool.execute({ since: 2, mentions_only: false }, { sessionID: w1Sess });
      await new Promise((r) => setTimeout(r, 20));
      await postTool.execute({ text: "next board update" }, { sessionID: "sess_coord" });
      const wokenRes = JSON.parse((await waitPromise).content);
      expect(wokenRes.woken).toBe(true);
      expect(wokenRes.guard).toBeUndefined();
      expect(wokenRes.posts.some((p: any) => p.seq === 3 && p.text === "next board update")).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("V1: post_message rejects payloads > 64 KiB before mutating worker state, and accepts <= 64 KiB", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-v1-post-size-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      const handlers = (ctx as any)._rpcHandlers;

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;

      const oversized = "[done] " + "x".repeat(65_536);
      const rejectRes = JSON.parse((await postTool.execute({ text: oversized }, { sessionID: w1Sess })).content);
      expect(rejectRes.ok).toBe(false);
      expect(String(rejectRes.error)).toContain("message too large");

      // Worker must remain working / open track because oversized [done] was rejected
      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const w1 = snap.members.find((m: any) => m.name === "w1");
      expect(w1.state).toBe("working");
      expect(w1.track_status).toBe("open");

      const exact = "[done] " + "y".repeat(65_536 - 7);
      const okRes = JSON.parse((await postTool.execute({ text: exact }, { sessionID: w1Sess })).content);
      expect(okRes.ok).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("V2: post_message enforces 60 posts/minute per-member rate limit without blocking other members", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-v2-rate-limit-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;

      for (let i = 1; i <= 60; i++) {
        const res = JSON.parse((await postTool.execute({ text: `update ${i}` }, { sessionID: w1Sess })).content);
        expect(res.ok).toBe(true);
      }

      const overRes = JSON.parse((await postTool.execute({ text: "update 61" }, { sessionID: w1Sess })).content);
      expect(overRes.ok).toBe(false);
      expect(String(overRes.error)).toContain("posting too fast");
      expect(String(overRes.error)).toContain("60 posts a minute");

      // Coordinator has its own per-member window and can still post
      const coordRes = JSON.parse((await postTool.execute({ text: "coord ok" }, { sessionID: "sess_coord" })).content);
      expect(coordRes.ok).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("V3: add enforces 256 KiB brief cap and channel create enforces 1024-byte topic cap without '@' or newlines", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-v3-brief-topic-caps-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");

      const bigBriefRes = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w1", brief: "b".repeat(262_145) },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(bigBriefRes.ok).toBe(false);
      expect(String(bigBriefRes.error)).toContain("brief too large");

      // Spawn a valid worker to initialize the swarm before channel tests
      const okAdd = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Valid brief" }, { sessionID: "sess_coord" }))
          .content,
      );
      expect(okAdd.ok).toBe(true);

      const longTopic = JSON.parse(
        (
          await swarmTool.execute(
            { action: "channel", op: "create", channel: "ui", topic: "t".repeat(1025) },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(longTopic.ok).toBe(false);
      expect(String(longTopic.error)).toContain("1024 bytes");

      const atTopic = JSON.parse(
        (
          await swarmTool.execute(
            { action: "channel", op: "create", channel: "ui", topic: "ping @w1" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(atTopic.ok).toBe(false);
      expect(String(atTopic.error)).toContain("may not contain '@'");

      const nlTopic = JSON.parse(
        (
          await swarmTool.execute(
            { action: "channel", op: "create", channel: "ui", topic: "line1\nline2" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(nlTopic.ok).toBe(false);
      expect(String(nlTopic.error)).toContain("line breaks");

      const okTopic = JSON.parse(
        (
          await swarmTool.execute(
            { action: "channel", op: "create", channel: "ui", topic: "UI layout and components" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(okTopic.ok).toBe(true);
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("W1: worker paused on quota/rate-limit auto-resumes after delay and catches up on board", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-w1-quota-resume-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, prompts, pushEvent } = createHarness(repoDir, dbPath);
    ctx.options.quotaResumeDelayMs = 30;

    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const handlers = (ctx as any)._rpcHandlers;

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;
      const promptsBefore = prompts.filter((p) => p.sessionID === w1Sess).length;

      pushEvent({
        type: "session.execution.failed",
        data: { sessionID: w1Sess, error: "429 rate limit exceeded" },
      });
      await new Promise((r) => setTimeout(r, 15));

      const pausedSnap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const pausedW1 = pausedSnap.members.find((m: any) => m.name === "w1");
      expect(pausedW1.paused_quota).toBe(true);
      expect(pausedW1.state).toBe("waiting");

      // Wait for auto-resume timer (30ms) to fire
      await new Promise((r) => setTimeout(r, 60));

      const resumedSnap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const resumedW1 = resumedSnap.members.find((m: any) => m.name === "w1");
      expect(resumedW1.paused_quota).toBe(false);
      expect(resumedW1.state).toBe("working");

      const w1Prompts = prompts.filter((p) => p.sessionID === w1Sess);
      expect(w1Prompts.length).toBe(promptsBefore + 1);
      expect(w1Prompts[w1Prompts.length - 1].text).toContain("[SWARM QUOTA RESUME");
      expect(w1Prompts[w1Prompts.length - 1].text).toContain("read_board");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("W2: bounded quota auto-resume exhausts after 3 failed attempts and parseQuotaRetryDelayMs parses retry hints", async () => {
    expect(parseQuotaRetryDelayMs("rate limit, retry in 45s")).toBe(45_000);
    expect(parseQuotaRetryDelayMs("quota reached, try again in 2 minutes")).toBe(120_000);

    const root = mkdtempSync(join(tmpdir(), "swarm-w2-quota-exhaust-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, pushEvent } = createHarness(repoDir, dbPath);
    ctx.options.quotaResumeDelayMs = 12;

    let resumePromptAttempts = 0;
    const origPrompt = ctx.session.prompt;
    let w1Sess = "";
    ctx.session.prompt = async (arg: any) => {
      if (w1Sess && arg.sessionID === w1Sess && String(arg.text).includes("[SWARM QUOTA RESUME")) {
        resumePromptAttempts++;
        throw new Error("429 quota exceeded");
      }
      return await origPrompt(arg);
    };

    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const handlers = (ctx as any)._rpcHandlers;

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      w1Sess = addW.spawned[0].session_id as string;

      pushEvent({
        type: "session.execution.failed",
        data: { sessionID: w1Sess, error: "429 quota exceeded" },
      });

      // Backoff: 12ms + 24ms + 48ms = 84ms -> wait 180ms for all 3 attempts to complete and exhaust
      await new Promise((r) => setTimeout(r, 180));

      expect(resumePromptAttempts).toBe(3);
      const snap = await handlers.getSwarmSnapshot({ sessionId: "sess_coord" });
      const w1 = snap.members.find((m: any) => m.name === "w1");
      expect(w1.paused_quota).toBe(true);
      expect(w1.state).toBe("waiting");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("X1: findUnansweredMentionTarget uses board truth regardless of wait_since", () => {
    const w1: any = {
      id: "m_w1",
      swarm_id: "sw1",
      name: "w1",
      role: "worker",
      group_prefix: null,
      state: "waiting",
      wait_since: 10, // wait_since moved past mention #5
      last_post_seq: 0,
      track_status: "open",
    };
    const posts: any[] = [
      {
        seq: 5,
        swarm_id: "sw1",
        swarm_seq: 5,
        channel: "main",
        author_name: "coordinator",
        mentions_json: JSON.stringify(["w1"]),
        channel_mentions_json: "[]",
        is_all: 0,
        body: "@w1 please fix parser",
        created_at: 100,
      },
    ];
    const hit = findUnansweredMentionTarget([w1], posts);
    expect(hit?.member.name).toBe("w1");
    expect(hit?.mentionPost.swarm_seq).toBe(5);

    // Once w1 posts #6, mention #5 is answered
    posts.push({
      seq: 6,
      swarm_id: "sw1",
      swarm_seq: 6,
      channel: "main",
      author_name: "w1",
      mentions_json: JSON.stringify(["coordinator"]),
      channel_mentions_json: "[]",
      is_all: 0,
      body: "@coordinator [done] fixed",
      created_at: 200,
    });
    expect(findUnansweredMentionTarget([w1], posts)).toBeUndefined();
  });

  test("X2: stall monitor re-pings unanswered @worker once, then escalates to @coordinator on next tick", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-x2-monitor-escalate-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "data", "board.db");
    execFileSync("git", ["init", repoDir], { stdio: "ignore" });

    const { ctx, tools, pushEvent } = createHarness(repoDir, dbPath);
    ctx.options.stallTimeoutMs = 35;
    ctx.options.monitorIntervalMs = 20;

    const cleanup = (await swarmRuntimePlugin.setup(ctx)) as () => Promise<void>;
    try {
      const swarmTool = tools.get("swarm");
      const readTool = tools.get("read_board");

      const addW = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "Work 1" }, { sessionID: "sess_coord" })).content,
      );
      const w1Sess = addW.spawned[0].session_id as string;

      // w1 goes idle without posting; coordinator is caught up
      pushEvent({ type: "session.status", data: { sessionID: w1Sess, status: { type: "idle" } } });
      await readTool.execute({ since: 0 }, { sessionID: "sess_coord" });

      // Wait for tick 1 (re-ping @w1)
      await new Promise((r) => setTimeout(r, 65));
      // w1 finishes/parks after the re-ping without posting
      pushEvent({ type: "session.status", data: { sessionID: w1Sess, status: { type: "idle" } } });
      // Wait for tick 2 (escalate to @coordinator)
      await new Promise((r) => setTimeout(r, 65));

      const board = JSON.parse((await readTool.execute({ since: 0, limit: 50 }, { sessionID: "sess_coord" })).content);
      const monitorPosts = board.posts.filter((p: any) => p.author === "monitor");
      expect(monitorPosts.length).toBeGreaterThanOrEqual(2);
      expect(monitorPosts[0].text).toMatch(/^@w1 \[stall\] #1/);
      expect(monitorPosts[1].text).toMatch(/^@coordinator \[stall\] @w1 has not answered #1/);
      expect(monitorPosts[1].text).toContain("direct re-ping");
      expect(monitorPosts[1].text).toContain("switch its model");
    } finally {
      await cleanup();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("Y1: prompts enforce board hygiene, #seq citations, no greetings/acks, and same-turn post+wait", () => {
    expect(COORDINATOR_PROTOCOL).toContain("Cite earlier posts by `#seq`");
    expect(COORDINATOR_PROTOCOL).toContain("never copy-paste or summarize one worker's report");

    const workerPrompt = buildMemberOpeningPrompt({
      swarmId: "sw_1",
      name: "w1",
      role: "worker",
      brief: "Do work",
      workspaceMode: "inherit",
      workspaceDir: "/repo",
      ownedGlobs: [],
      channels: ["main"],
    });
    expect(workerPrompt).toContain("cite earlier posts by `#seq`");
    expect(workerPrompt).toContain("Never post greetings or acknowledgments");
    expect(workerPrompt).toContain("call `post_message` and `swarm_wait` in the same turn");

    const verifierPrompt = buildMemberOpeningPrompt({
      swarmId: "sw_1",
      name: "verifier",
      role: "verifier",
      brief: "Verify work",
      workspaceMode: "inherit",
      workspaceDir: "/repo",
      ownedGlobs: [],
      channels: ["main"],
    });
    expect(verifierPrompt).toContain("cite earlier posts by `#seq`");
    expect(verifierPrompt).toContain("Do not post greetings or acknowledgments");
    expect(verifierPrompt).toContain("call `post_message` and `swarm_wait` in the same turn");
  });

  test("Z1: non-git workspace:branch copies safely within caps, skips nested dataDir, and aborts over limits", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-nongit-"));
    const dataDir = join(root, ".swarm-data");
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(root, "README.md"), "hello", "utf8");
      writeFileSync(join(root, "src", "app.ts"), "export const x = 1;\n", "utf8");
      writeFileSync(join(dataDir, "ignored.db"), "should-not-copy", "utf8");

      const okWs = provisionMemberWorkspace({
        mode: "branch",
        repoRoot: root,
        dataDir,
        swarmId: "sw_z1",
        memberName: "w1",
      });
      expect(okWs.mode).toBe("branch");
      expect(okWs.branch).toBeNull();
      expect(readFileSync(join(okWs.dir, "README.md"), "utf8")).toBe("hello");
      expect(readFileSync(join(okWs.dir, "src", "app.ts"), "utf8")).toBe("export const x = 1;\n");
      expect(existsSync(join(okWs.dir, ".swarm-data"))).toBe(false);

      const cleaned = cleanupMemberWorkspace({
        mode: okWs.mode,
        dir: okWs.dir,
        branch: okWs.branch,
        repoRoot: root,
      });
      expect(cleaned.ok).toBe(true);
      expect(existsSync(okWs.dir)).toBe(false);

      expect(() =>
        provisionMemberWorkspace({
          mode: "branch",
          repoRoot: root,
          dataDir,
          swarmId: "sw_z1",
          memberName: "w_entries",
          copyLimits: { maxEntries: 2, maxBytes: 1024 * 1024 },
        }),
      ).toThrow(/exceeds non-git copy limits/);
      expect(existsSync(join(dataDir, "clones", "sw_z1", "w_entries"))).toBe(false);

      expect(() =>
        provisionMemberWorkspace({
          mode: "branch",
          repoRoot: root,
          dataDir,
          swarmId: "sw_z1",
          memberName: "w_bytes",
          copyLimits: { maxEntries: 100, maxBytes: 10 },
        }),
      ).toThrow(/exceeds non-git copy limits/);
      expect(existsSync(join(dataDir, "clones", "sw_z1", "w_bytes"))).toBe(false);

      expect(() =>
        provisionMemberWorkspace({
          mode: "share",
          repoRoot: root,
          dataDir,
          swarmId: "sw_z1",
          memberName: "w_share",
        }),
      ).toThrow(/requires a Git repository/);
    } finally {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("Z2: validateChannelName and swarm channel creation enforce [a-z][a-z0-9-]{0,23}", async () => {
    expect(validateChannelName("dev-ops-1")).toBe("dev-ops-1");
    expect(validateChannelName("#UI-Build")).toBe("ui-build");
    expect(validateChannelName("a".repeat(24))).toBe("a".repeat(24));

    for (const bad of ["1dev", "dev_ops", "dev ops", "a".repeat(25), ""]) {
      expect(() => validateChannelName(bad)).toThrow(/Invalid channel name/);
    }
    for (const reserved of ["main", "all", "#MAIN"]) {
      expect(() => validateChannelName(reserved)).toThrow(/reserved/);
    }

    const root = mkdtempSync(join(tmpdir(), "swarm-chanval-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "board.db");
    mkdirSync(repoDir, { recursive: true });
    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = await swarmRuntimePlugin.setup(ctx);
    try {
      const swarmTool = tools.get("swarm");
      await swarmTool.execute({ action: "add", name: "w1", brief: "init" }, { sessionID: "sess_coord" });
      const badRes = JSON.parse(
        (await swarmTool.execute({ action: "channel", op: "create", channel: "bad_name" }, { sessionID: "sess_coord" }))
          .content,
      );
      expect(badRes.ok).toBe(false);
      expect(badRes.error).toContain("Invalid channel name");

      const okRes = JSON.parse(
        (await swarmTool.execute({ action: "channel", op: "create", channel: "dev-ops" }, { sessionID: "sess_coord" }))
          .content,
      );
      expect(okRes.ok).toBe(true);
      expect(okRes.channel.name).toBe("dev-ops");
    } finally {
      await cleanup?.();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("Z3: post_message returns warnings for unknown and archived @#channel mentions", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-chanwarn-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "board.db");
    mkdirSync(repoDir, { recursive: true });
    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = await swarmRuntimePlugin.setup(ctx);
    try {
      const swarmTool = tools.get("swarm");
      const postTool = tools.get("post_message");
      await swarmTool.execute({ action: "add", name: "w1", brief: "init" }, { sessionID: "sess_coord" });

      await swarmTool.execute({ action: "channel", op: "create", channel: "live" }, { sessionID: "sess_coord" });
      await swarmTool.execute({ action: "channel", op: "create", channel: "old" }, { sessionID: "sess_coord" });
      await swarmTool.execute({ action: "channel", op: "archive", channel: "old" }, { sessionID: "sess_coord" });

      const unknownRes = JSON.parse(
        (await postTool.execute({ text: "hello @#ghost" }, { sessionID: "sess_coord" })).content,
      );
      expect(unknownRes.ok).toBe(true);
      expect(unknownRes.warnings).toEqual(["@#ghost addressed nobody (unknown channel)"]);

      const archivedRes = JSON.parse(
        (await postTool.execute({ text: "ping @#old" }, { sessionID: "sess_coord" })).content,
      );
      expect(archivedRes.ok).toBe(true);
      expect(archivedRes.warnings).toEqual(["@#old addressed nobody (archived channel)"]);

      const liveRes = JSON.parse(
        (await postTool.execute({ text: "ping @#live" }, { sessionID: "sess_coord" })).content,
      );
      expect(liveRes.ok).toBe(true);
      expect(liveRes.warnings).toBeUndefined();
    } finally {
      await cleanup?.();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("AA1: validateMemberName reserves monitor-N and narrator-N for their matching roles", () => {
    expect(() => validateMemberName("monitor-1", "worker")).toThrow(/Reserved role name/);
    expect(() => validateMemberName("narrator-2", "worker")).toThrow(/Reserved role name/);
    expect(() => validateMemberName("monitor", "verifier")).toThrow(/Reserved role name/);
    expect(validateMemberName("monitor-1", "monitor")).toBe("monitor-1");
    expect(validateMemberName("narrator-2", "narrator")).toBe("narrator-2");
    expect(validateMemberName("monitor-ops", "worker")).toBe("monitor-ops");
  });

  test("AA2: swarm add rejects invalid n, mismatched n vs tasks, and empty task slices", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-addval-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "board.db");
    mkdirSync(repoDir, { recursive: true });
    const { ctx, tools } = createHarness(repoDir, dbPath);
    const cleanup = await swarmRuntimePlugin.setup(ctx);
    try {
      const swarmTool = tools.get("swarm");

      const badN = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w", brief: "do work", n: 0 }, { sessionID: "sess_coord" }))
          .content,
      );
      expect(badN.ok).toBe(false);
      expect(badN.error).toContain("n must be at least 1");

      const mismatch = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w", brief: "do work", n: 3, tasks: ["a", "b"] },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(mismatch.ok).toBe(false);
      expect(mismatch.error).toContain("must match len(tasks)");

      const blankSlice = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w", brief: "do work", tasks: ["ok", "   "] },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(blankSlice.ok).toBe(false);
      expect(blankSlice.error).toContain("tasks[1] is empty");
    } finally {
      await cleanup?.();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("AA3: non-git workspace:branch writes .swarm-dircopy marker and respects PluginOptions copy limits", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-dircopy-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "board.db");
    mkdirSync(repoDir, { recursive: true });
    writeFileSync(join(repoDir, "a.txt"), "alpha", "utf8");
    writeFileSync(join(repoDir, "b.txt"), "beta", "utf8");

    const { ctx, tools } = createHarness(repoDir, dbPath);
    ctx.options.branchCopyMaxEntries = 1;
    const cleanup = await swarmRuntimePlugin.setup(ctx);
    try {
      const swarmTool = tools.get("swarm");
      const overCap = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w1", brief: "copy work", workspace: "branch" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(overCap.ok).toBe(false);
      expect(overCap.error).toContain("exceeds non-git copy limits");

      ctx.options.branchCopyMaxEntries = 20;
      const okSpawn = JSON.parse(
        (
          await swarmTool.execute(
            { action: "add", name: "w2", brief: "copy work", workspace: "branch" },
            { sessionID: "sess_coord" },
          )
        ).content,
      );
      expect(okSpawn.ok).toBe(true);
      const statusRes = JSON.parse(
        (await swarmTool.execute({ action: "status" }, { sessionID: "sess_coord" })).content,
      );
      const w2Member = statusRes.members.find((m: any) => m.name === "w2");
      const wsDir = w2Member.workspace_dir;
      expect(existsSync(join(wsDir, DIRCOPY_MARKER_FILE))).toBe(true);
      const marker = JSON.parse(readFileSync(join(wsDir, DIRCOPY_MARKER_FILE), "utf8"));
      expect(marker.kind).toBe("dircopy");
    } finally {
      await cleanup?.();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("AA4: quota auto-resume posts [quota] pause, resume, and exhaustion notices on the board", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-quotapost-"));
    const repoDir = join(root, "repo");
    const dbPath = join(root, "board.db");
    mkdirSync(repoDir, { recursive: true });
    const { ctx, tools, pushEvent } = createHarness(repoDir, dbPath);
    ctx.options.quotaResumeDelayMs = 20;
    const origPrompt = ctx.session.prompt;
    ctx.session.prompt = async (input: { sessionID: string; text: string }) => {
      if (input.text.includes("SWARM QUOTA RESUME")) {
        throw new Error("429 quota exceeded");
      }
      return origPrompt(input);
    };
    const cleanup = await swarmRuntimePlugin.setup(ctx);
    try {
      const swarmTool = tools.get("swarm");
      const readTool = tools.get("read_board");
      const added = JSON.parse(
        (await swarmTool.execute({ action: "add", name: "w1", brief: "do work" }, { sessionID: "sess_coord" })).content,
      );
      const workerSession = added.spawned[0].session_id;

      pushEvent({
        type: "session.execution.failed",
        data: { sessionID: workerSession, error: "429 quota exceeded" },
      });
      await new Promise((r) => setTimeout(r, 240));

      const board = JSON.parse((await readTool.execute({ since: 0, limit: 50 }, { sessionID: "sess_coord" })).content);
      const quotaPosts = (board.posts as Array<{ text: string }>).map((p) => p.text).filter((t) => t.startsWith("[quota]"));
      expect(quotaPosts.some((t) => t.includes("paused on quota/rate limit (auto-resume 1/3"))).toBe(true);
      expect(quotaPosts.some((t) => t.includes("resuming after quota pause (attempt 1/3)"))).toBe(true);
      expect(quotaPosts.some((t) => t.includes("exhausted quota auto-resume (3 attempts)"))).toBe(true);
    } finally {
      await cleanup?.();
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});
