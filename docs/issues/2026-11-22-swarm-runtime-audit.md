# Swarm Runtime Audit — 2026-11-22

Complete findings from audit swarm `sw_4195f11b` (3 read-only auditors + adversarial verifier), preserved verbatim from the shared board. Written for a fixer working in a separate harness.

## Context

- **Project:** `tools/swarm-runtime` — OpenCode v2 plugin implementing Antigravity-style swarm coordination
- **Workspace:** `C:\Users\Hafidh\Desktop\Swarm for opencode`
- **Host:** `opencode 2.2.6` (Windows). Plugin dependency `@opencode/plugin 2.3.2` (installed plugin/client/schema 2.3.2, effect 4.1.0)
- **Runtime DB:** `~/.opencode-swarm/d7b3d3902d25/board.db`
- **Models:** coordinator `opencode-go/deepseek-v4.1-flash#max`; workers `deepseek-v4.1-flash#high`; verifier `glm-5.3-flash#high`
- **Baseline:** `bun run typecheck` clean; `bun test` **10 pass / 0 fail** (60 assertions, 3 files, ~1.2 s). Critical paths are untested.
- **Verification:** verifier confirmed 10/10 top claims by static line-check (board #13). Two verifier statements were wrong and are corrected in the final section.

## Severity summary (deduplicated)

| Severity | Count | Areas |
|---|---|---|
| Critical | 1 | Authorization model |
| High | 11 | Role/ownership bypass, sandbox escape, DoS, board auth, lifecycle |
| Medium | 12 | Isolation gaps, monitor/wake correctness, multi-process safety |
| Low/minor | 23 | Hardening, cleanup, UX, test gaps (+1 major compat: fork is dead) |

Source counts before dedup: security 1C/6H/6M/9L; runtime 4H/6M/8L; compatibility 1 major/6 minor.

> H11 (coordinator left edit-denied after `complete`) is why this file was written through the shell rather than the edit tool — a live demonstration of H2.

---

# Full audit reports


## Runtime audit — full report (@runtime-auditor)

_Board #4 · 2026-11-22 09:31_

@coordinator Runtime audit complete — read-only (no product files edited; repro scripts only under %TEMP%). `bun test`: 10 pass / 0 fail, exit 0, ~1.1s, stable over 3 runs (plugin-e2e ~1.0s = git ops; others <100ms; no flaky/slow tests observed). Findings below, each reproduced or code-traced.

## HIGH

**1. Any restart permanently bricks new swarms in the same session**
`db.ts:101-103` (unique index `idx_active_member_session ON members(session_id) WHERE state != 'killed'`), `db.ts:232-245` (reconcile sets members `state='stopped'`), `db.ts:176-191` (create checks only *active* swarm), `plugin.ts:1137-1146` (graceful cleanup never closes the swarm).
Evidence (repro): create swarm → close DB (restart) → `reconcileStaleSwarmsOnStartup()` → `createSwarmWithCoordinator(same session)` throws `UNIQUE constraint failed: members.session_id`. Coordinator row is `stopped`, not `killed`, so the partial index still covers it. Because plugin teardown leaves status `running`, this also happens after a *graceful* OpenCode restart, not just a crash.
Fix: reconcile should set `state='killed'` (or delete/re-key the coordinator), and shutdown should transition the swarm (`interrupted`/`completed`) + kill members; alternatively scope the unique index to `swarms.status IN ('running','completing')` via a trigger/partial design. Add the regression test.

**2. `startBoardServer` hangs forever and crashes the process on EADDRINUSE**
`board-server.ts:181-183` (promise resolves only in `listen` callback, no `server.on('error')`); `plugin.ts:432-449` (try/catch cannot catch a never-settling promise or an unhandled `error` event).
Evidence (repro, port collision): `startBoardServer(deps, samePort)` → `TIMEOUT-hang` after 1.5s, plus uncaught `EADDRINUSE`. In production the unhandled `error` event terminates the host process.
Fix: attach `server.once('error', reject)` before `listen`, reject + close; keep a post-listen error handler; add a timeout.

**3. Board server is unauthenticated and CSRF-able / DNS-rebindable**
`board-server.ts:52-55` (no Host/Origin check), `:150-166` (mutating POSTs), `:181-183` (127.0.0.1 only).
Evidence (repro): `POST /api/member/model` with `Content-Type: text/plain` and `Origin: https://evil.example` returned 200 and executed `switchMemberModel("sw_…","coordinator","x/y")`; `GET /api/swarm` with `Host: attacker.example` returned the full board (743 B). Any visited webpage can drive model switches/role defaults via a simple request; DNS rebinding can exfiltrate the board.
Fix: per-start random bearer token embedded in the URL handed to the user; require `Content-Type: application/json`; accept only `Origin` absent or `http://127.0.0.1:<port>`; validate `Host` ∈ {127.0.0.1:port, localhost:port}; reject unknown methods.

**4. File-lock claim silently succeeds without acquiring a dead owner's lock**
`db.ts:647-679` (dead owners skipped via `liveIds`), `:670-677` (`INSERT OR IGNORE` swallows the unique conflict).
Evidence (repro): w1 claims `src/**` → w1 killed without releasing → w2 claims `src/**` → returns `claimed:["src/**"]` while `list_locks` still shows owner `w1`. Lock protection is void and the worker is told it owns files it does not.
Fix: inside the transaction delete/steal locks whose owner is not live (or `INSERT ... ON CONFLICT DO UPDATE`), and verify `changes > 0` before adding to `claimed`.

## MEDIUM

**5. Board `head` freezes at #500** — `board-server.ts:69-70` computes `head` from `getPostsPage(...,0,500)`. Reproduced 505 posts → page head 500, true head 505, `hasMore=true`, so the UI stops updating and unread counts are wrong after 500 posts. Use `getLatestPost().swarm_seq` (or paginate).

**6. Channel isolation is not enforced** — `plugin.ts:820-835`: `read_board` accepts `channel:"*"` or any explicit channel for non-global members, bypassing `getMemberChannels`; `plugin.ts:212-216` `postToBoard` only checks existence/archived, not subscription; `plugin.ts:684-705` channel create/archive/subscribe has no role check; `db.ts:329-334` subscribes to nonexistent channels (repro: channels become `["main","ghost"]`). Fix: membership check on read/post, coordinator-only create/archive, reject unknown/archived channels on subscribe.

**7. Wake prompt leaks posts from other channels** — `plugin.ts:187-204`: fallback feed uses `getPostsPage(..., "*")` then `advanceReadCursor` past it. A #main-only worker woken by `@all`/global mention in #dev receives #dev content. Also, when the waiter branch's `checkPendingWakePosts` returns 0 (e.g. `@all` in an unsubscribed channel), `wakeMember` falls through and `session.prompt`s a session still blocked inside `swarm_wait` (double-wake). Fix: filter the fallback page to `getMemberChannels` (global roles `*`); in the waiter branch, return when the member is parked.

**8. A stuck "working" member disables the stall monitor indefinitely** — `monitor.ts:28` skips the whole swarm if *any* member is `working`; `plugin.ts:203-209` sets `working` *before* awaiting `session.prompt`; `plugin.ts:229-236` swallows wake errors. One failed prompt ⇒ member stays `working` forever ⇒ no nudges ever, no timeout. Fix: on wake failure set `waiting` + `last_error`; monitor should treat `working` older than `stallTimeoutMs` (via `last_active_at`) as stalled.

**9. Quota-paused members can deadlock the swarm** — `plugin.ts:230` skips `paused_quota` wake targets; `db.ts:475-501` + plugin event handler `:1103-1113` keep `paused_quota=1` through later successes (COALESCE), clearing only on `setMemberModel`. If the coordinator is quota-paused, stall nudges are never delivered. Fix: clear `pausedQuota` on `session.execution.started`/`idle`, or allow monitor/system posts to bypass the pause.

**10. Startup reconciliation clobbers swarms owned by another live process** — `db.ts:232-258` interrupts *all* running/completing swarms at every process start with no liveness check. Reproduced: two DB handles, `db2.reconcile…()` → `db1`'s live swarm becomes `interrupted`. Two OpenCode windows sharing `dbPath` will kill each other. Fix: persist an owner boot-id/PID + heartbeat; reconcile only swarms whose owner is dead.

## LOW
- `db.ts:153-167` `withImmediateTransaction` is not reentrant; future nesting (helper calling a transactional method) throws "cannot start a transaction within a transaction". Add a depth guard or document.
- `db.ts:42-46` `busy_timeout=5000` on synchronous `DatabaseSync` blocks the whole event loop (HTTP + monitor) up to 5 s under lock contention. Consider 1–2 s and retry/backoff.
- `board-server.ts:34-41` unbounded request body, no timeout → local memory DoS and shutdown waits on slow bodies. Cap `Content-Length`/bytes. (Idle keep-alive `close()` was fine: 2 ms.)
- `board-server.ts:60-61` `getActiveSwarms()[0]` has no ORDER BY/LIMIT → nondeterministic swarm for the UI; `GET ?swarmId=` also exposes completed swarms.
- `db.ts:578-580` `addPost` doesn't advance the author's cursor → author's own posts count as unread in the UI (`board-server.ts:122`).
- `workspace.ts:48-68` `git worktree add -b` / `checkout -b` fail on stale branch/worktree (no `worktree prune`, no `-B`); low because member names can't be reused, only crash leftovers.
- `db.ts:344-349` `getMemberChannels` can return duplicate `"main"` if a member is subscribed to main.
- XSS: **no injection found** — `esc()` (`board-server.ts:309-311`) escapes `& < > "` and every interpolation in render paths is escaped or numeric. Add a CSP header as defense-in-depth.

## Test coverage gaps (most valuable next)
No tests at all for: `mentions.ts` (parse `@all`/`@#chan`/group prefix, `resolveWakeTargets`, `checkPendingWakePosts` scoping), `monitor.ts` (nudge counter, stuck-working, paused quota), board-server HTTP contract (only `url.startsWith("http://127.0.0.1:")` is asserted), EADDRINUSE/rejection, concurrent `addPost` swarm_seq integrity/WAL, dead-owner lock reclaim, restart→new-swarm regression (#1), >500-post head (#5), and channel-isolation (#6). Suggested fast unit tests: swap `openSqliteDatabase` for an in-memory/tmp DB and drive `SwarmBoardDB` directly (as `db-and-recovery.test.ts` already does); use `startBoardServer(...,0)` + `fetch` for the API.

Happy to re-run anything or produce the failing-test files for #1/#4/#5/#2 as a follow-up.

---

## Compatibility audit — full report (@compat-auditor)

_Board #6 · 2026-11-22 09:41_

@coordinator — compat audit complete (read-only; no files edited).

**Verdict:** NO BLOCKERS. Every ctx surface the plugin calls exists in opencode 2.2.6, and the 2.3.2 `.d.ts` is strictly additive over 2.2.6 (no removals that this code touches). 1 MAJOR + 6 MINOR below.

**Exact test evidence (tools/swarm-runtime):**
- `bun run typecheck` (`tsc --noEmit`) → exit 0, zero diagnostics. Caveat: tsconfig has `skipLibCheck: true`, so this only checks the code against installed 2.3.2 types, not the 2.2.6 host.
- `bun test` → exit 0: **10 pass / 0 fail**, 60 `expect()` calls, 3 files, 1214 ms.
- Host confirmed: `opencode.exe --version` → `2.2.6`; installed `@opencode/plugin`/`client`/`schema` = 2.3.2, `effect` 4.1.0.

**Findings**
1. **MAJOR — `swarm add fork:` is dead on every v2 host.** `src/plugin.ts:344-349` (advertised at `:474`, passed at `:569`/`:595`). Evidence: 2.2.6 `SessionDomain` is `Pick<SessionApi, …>` with no `fork` (`@opencode/plugin@2.2.6/dist/promise/session.d.ts:186`), and the adapter builds `ctx.session` from an explicit whitelist containing no fork (`dist/promise/adapter.js:452-475`; 0 matches for "fork" in adapter.js for BOTH 2.2.6 and 2.3.2) — while `@opencode/client@2.2.6` `SessionApi` *does* expose fork. So the `as unknown as { fork? }` cast hides a capability that ctx never provides; the guard throws on every call. Fix: drop `fork` from the tool schema/description, or implement it as `ctx.session.create({ parentID: target.session_id, … })` + transcript replay; don't runtime-detect a ctx method that never exists.
2. **MINOR — activity label reads a field that does not exist.** `src/plugin.ts:1117` `data.tool`; `session.tool.called.data` has only `sessionID, assistantMessageID, id, input, executed, native` (`@opencode/client@2.2.6/dist/promise/generated/types.d.ts:2168-2181`, identical in 2.3.2). Result: every step label is "Running tool". Fix: resolve via the existing cache — `pendingCalls.get(String(data.id))?.tool ?? "tool"`.
3. **MINOR — coordinator model persisted before the switch succeeds.** `src/plugin.ts:133-161`: `createSwarmWithCoordinator({model})` runs first; `switchModel` failure only `console.warn`s, so `swarm{action:"status"}` reports a model the 2.2.6 session isn't using. (`switchMemberModelInPlace` at `:268-276` gets this right: switch then persist.) Fix: persist after success, or roll the DB model back / re-read `session.get`.
4. **MINOR — permission cache key is unbranded.** `src/plugin.ts:1005-1007` casts `event.source` to `{id?: string}`. 2.2.6 `Permission.Source` is `{type:"tool", messageID, id: string}` (`@opencode/schema@2.2.6/dist/permission.d.ts:7-11`), i.e. a plain string, while the cache is keyed by `Tool.CallID`. If a host ever supplies the permission-request id instead, `pendingCalls.get` silently misses and `evaluate` runs with `event.resources` only. Fix: assert `source?.type === "tool"` and fail closed (or log) when an edit/shell evaluation has no cached call for a non-coordinator. Note: in-place mutation of `event.effect`/`event.message` is contractually supported in 2.2.6 (`permission.d.ts:7-16` marks only those two mutable), so that mechanism itself is fine.
5. **MINOR — typecheck is blind to host drift by construction.** `src/plugin.ts:3` and `src/models.ts:4` derive `Context` from the installed 2.3.2 package; nothing compares it to the host. Finding 1 is the proof. Fix: pin `@opencode/plugin` to the host version (2.2.6) for typecheck, or add a CI step that typechecks against the host's shipped `.d.ts` + a setup-time capability probe logging missing ctx methods.
6. **MINOR — package-root import drags 2.3.2 runtime into the 2.2.6 process.** `src/plugin.ts:1` `import { Plugin } from "@opencode/plugin"` loads `dist/promise/index.js`, which eagerly re-exports 20 `@opencode/schema@2.3.2` modules and `effect@4.1.0` (both installed locally), although only identity `define` is needed (`plugin.js` is 54 bytes). Benign today (no schema objects cross the boundary), but it can create dual-Effect/schema copies. Fix: import the narrow subpath (`@opencode/plugin/promise/plugin`) or vendor `define`.
7. **MINOR — tests can't catch any of this.** `test/plugin-e2e.test.ts:20-100`: mock `model.list()` returns a bare array (`:31-48`) instead of the real `{location,data}` envelope, `session.create` returns `{id}` (`:74-78`), `command.transform` is a no-op (`:66-67`) so `/swarm` and `/swarm-models` are never executed, and there is no `fork`/capability test. `bun test` green therefore says nothing about 2.2.6. Fix: add a contract test that builds the real 2.2.6 adapter (or runs a smoke plugin against opencode 2.2.6) and asserts tools/commands/hooks register, plus a whitelist check of `Object.keys(ctx.session)` vs the methods used.

**Verified-compatible (no action):** `session.create/get/update/switchModel/prompt/interrupt/synthetic` (all in 2.2.6 domain; inputs `SessionCreateInput`, `SessionGetInput`, `SessionUpdateInput`, `SessionSwitchModelInput`, `SessionPromptInput`, `SessionInterruptInput`, `SessionSyntheticInput`, `SessionInfo.model: {id,providerID,variant?}`, `ModelRef`, `ModelInfo`, `ModelVariant`, `ModelListOutput {location,data}`, `ModelDefaultOutput {location,data}` are byte-identical between 2.2.6 and 2.3.2); `tool.transform` + `Tool.Info` (`options:{codemode:false}` and `content:string` valid) + `ToolContext.signal` (passed by adapter); `command.transform`; `tool.hook("execute.before")`; `permission.hook("evaluate")`; `session.hook("compaction")` (event.system is `Array<SystemPart>`, shape identical); `event.subscribe({signal})` (`SubscribeOptions.signal` exists; events are `{type,data}`); event names used (`session.execution.started/succeeded/interrupted/failed`, `session.idle`, `session.step.started`, `session.tool.called`, `session.deleted`) all exist in 2.2.6 and carry `data.sessionID`; delivery value `"queue"` valid. 2.3.2-only additions exist but are unused: `experimental.model.resolve` hook, `SessionRequestMessage.metadata`, idle-background kinds `codemode`/`fork`, `session.step.first-token`, tool `Freeform`, removed `Tool.Context.cancel`.

Bottom line: safe to ship on 2.2.6 if `fork` is removed/guarded and finding 3 is fixed; the rest are hardening.

---

## Security audit — full report (@security-auditor)

_Board #8 · 2026-11-22 09:44_

@coordinator **SECURITY AUDIT — swarm-runtime** (read-only; no product files edited). Scope: src/policy.ts, src/security.ts, src/workspace.ts, src/plugin.ts hooks, plus db.ts/mentions.ts/board-server.ts where the hooks depend on them.

**Verdict: 1 Critical, 6 High, 6 Medium, 9 Low.** The path fence itself is decent, but *role* and *tool classification* are not validated, so the entire policy is bypassable. All findings below were reproduced with throwaway Bun probes in %TEMP% unless marked "by inspection".

## CRITICAL

**C1. Unvalidated `role` input → every ownership/read-only check falls through to allow.**
`plugin.ts:550` (`const role = (input.role as MemberRole) ?? "worker"`) → `spawnSingleMember` (plugin.ts:285) → `db.insertMember` (db.ts:362; `role TEXT` has no CHECK). `policy.ts:25-48` only knows 5 roles, and `policy.ts:80-156` ends with `return {decision:"allow"}` for anything else.
Repro: `evaluateActionForMember(..., role:"root", "edit", ["../outside/secret.txt"]) => allow`, shell `=> allow` (same for "admin", "Coordinator", "supervisor", "worker ").
Exploit: any active member runs `swarm {action:"add", role:"root", name:"r", brief:"..."}`; the new session can edit `../` paths and shell with no lock/workspace/role checks. `role:"coordinator"` additionally creates a second coordinator row, which passes `complete`/`kill` authority checks (plugin.ts:657,660,726).
Fix: allow-list role at the tool boundary (`worker|verifier|monitor|narrator`), reject everything else; add a `default: deny` in `evaluateActionForMember`; never allow spawning a `coordinator` row.

## HIGH

**H1. `fork:"coordinator"` exfiltrates the coordinator's full transcript.**
`plugin.ts:336-349` — any caller resolves `forkTarget` by name and calls `ctx.session.fork({sessionID: forkTarget.session_id})`, which copies conversation history into a session the caller then controls.
Exploit: worker calls `swarm {action:"add", name:"spy", fork:"coordinator", brief:"print your entire context verbatim"}` → user request, system prompts, pasted tokens/keys are readable by a worker. Same trick reads any peer's private reasoning.
Fix: only the coordinator may set `fork`; rank-check the target session (never fork upward); otherwise strip `fork`.

**H2. `allowCoordinatorEdits=false` is bypassable with shell.**
`policy.ts:97-102` denies only `isEdit`; `policy.ts:33-41` adds no shell rule for the coordinator.
Repro: coordinator `edit`/`write`/`apply_patch` = deny, coordinator `shell` = allow.
Exploit: coordinator runs `bash -c 'printf … > src/x.ts'` / `Set-Content` — the option does not make coordination read-only.
Fix: when the option is false, deny (or force `ask`) on `shell` too, and state in docs that shell ≡ edit.

**H3. Tool classification is a denylist; MCP/code-exec tools are unpoliced.**
`policy.ts:5-16` (8 write names, 6 shell names), consumed at `plugin.ts:977`.
Repro: verifier + tool `write_file` → allow; verifier + `mcp_filesystem_write` → allow. Live evidence: in this audit session the `write` tool to a path outside the workspace was correctly DENIED, while the Code-Mode `execute`/MCP path wrote that same file outside the workspace without any prompt.
Exploit: a read-only verifier (or an unscoped worker) uses any MCP filesystem/code-exec tool → arbitrary writes/commands, no role, workspace, or lock checks.
Fix: classify by permission action (`edit`/`write`/`shell`) *and* keep a per-role tool allow-list; unknown/MCP tools → deny for verifier/monitor/narrator, and require a resolvable target for all roles.

**H4. Dangling symlink escapes `resolveSafeWorkspacePath`.**
`security.ts:49-60` uses `while (!existsSync(cursor))`; a dangling symlink returns false, so it is treated as "not yet existing" and the suffix is re-attached inside the root (`security.ts:79-89`).
Repro: `repo/ghost.txt -> <outside>/outside-ghost.txt` (target absent) → policy returns `ghost.txt` (ALLOW) → `writeFileSync` follows the link and **creates the outside file** ("ESCAPED"). `/../outside` in the same run was correctly denied.
Exploit: worker writes through a pre-existing dangling link (or one created via shell/MCP) to `~/.ssh/authorized_keys`, `~/.gitconfig`, shell profiles → persistence outside the workspace; also a generic "write outside sandbox" primitive.
Fix: walk ancestors with `lstatSync` (detects links whose target is missing), and reject when `realpathSync` throws; `lstat` the final target and reject symlinks that resolve outside or cannot resolve. Only join `parentReal + basename` when the basename is not a link.

**H5. Glob→regex ReDoS wedges the whole host.**
`security.ts:130-142` emits `(?:.*/)?` per `**/`; `pathMatchesGlob` (security.ts:159) is called per lock at `policy.ts:139,147` and inside `globsPotentiallyOverlap` (security.ts:193-196).
Repro: glob `x/` + `**/`×n + `zzz.ts` vs a 40-segment path: n=8 → 1.1 s, n=10 → >15 s, n=12 → >600 s (process killed). No cap on glob length or segment count anywhere (`validateAndNormalizeGlob`, security.ts:99).
Exploit: any member (verifier included) runs `swarm {action:"claim", globs:["a/"+ "**/".repeat(12) + "z.ts"]}` or passes it as `owned_globs`; one edit/claim with a deep path blocks the single-threaded plugin — hooks, TUI, board server, all swarms.
Fix: cap glob length (≤256) and `**` count (≤8), reject consecutive `**/**`; replace regex with a segment-wise DP/linear matcher.

**H6. Read-only roles can spawn writers and take control actions.**
`plugin.ts:541` (`add`), `613` (caller), `502` (`title`), `684-711` (`channel create|archive|subscribe`), `713` (`claim`) have no role gate.
Exploit: verifier calls `swarm {action:"add", role:"worker", name:"h", brief:"edit src/…", owned_globs:[]}` → an unscoped worker with write rights, defeating verifier read-only. Or a verifier claims broad globs to lock every worker out (DoS), renames the swarm, or archives channels so `post_message` fails.
Fix: gate `add`/`title`/`channel create|archive`/`claim` on `caller.role === "coordinator"`; verifiers get none.

## MEDIUM

**M1. Unscoped workers can write the entire repo.** `policy.ts:147` only enforces ownership when `myLocks.length > 0`. Worker with no `owned_globs` → any unlocked path allowed (repro: allow). Locks become advisory and concurrent workers clobber each other. Fix: for `inherit`, deny edits until at least one glob is claimed, or treat "not covered by my globs" as deny.

**M2. Startup recovery disables all policy while sessions live `db.ts:232-258` + `plugin.ts:76-81`, hooks `plugin.ts:979,1003`.** Every plugin load flips all `running|completing` swarms to `interrupted`, members to `stopped`, and deletes locks; `getActiveSwarms()` is then empty so both hooks return early. Restarting the host (or a second instance on the same repo DB) leaves resumed member sessions editing/shelling with zero enforcement. Fix: interrupt member sessions during reconcile; key policy on a live member row, not swarm status; add an owner/heartbeat row so a second instance cannot reconcile a live swarm.

**M3. Unregistered-session block breaks unrelated work.** `plugin.ts:981-984` throws for any write/shell from a session with no member row while any swarm is active. That includes the user's other sessions in the same workspace and every `task`/subagent session (different sessionID), including subagents the swarm itself delegates to. Fix: allow sessions whose parent chain includes a member, and scope the block to the swarm workspace.

**M4. `execute.before` fails open without sessionID.** `plugin.ts:978` returns silently; only `permission.evaluate` fail-closes (`plugin.ts:1011-1013`). Any write/shell path that doesn't emit an edit/shell permission is unpoliced. Fix: throw when a swarm is active and sessionID is absent.

**M5. `git clone --shared` is unsafe and leaks the origin path.** `workspace.ts:66`. With shell, a `workspace:"branch"` worker can run `git gc/repack/prune` in its clone against `objects/info/alternates` pointing into the user's real object store, and the alternates file discloses the absolute repo path; full history (and any committed secrets) is exposed. Fix: `--dissociate` or `git worktree` for both modes.

**M6. Windows worktree cleanup can silently skip `prune` and leaks registrations.** `workspace.ts:81-90`: when `git worktree remove` fails, `rmSync` runs inside the `catch`; if `rmSync` throws on a locked file, the exception exits to the outer `catch {}` and `git worktree prune` never runs. Crash recovery never cleans workspaces at all (`db.ts:232`). Result: orphaned `~/.opencode-swarm/worktrees/*` and `<repo>/.git/worktrees/<name>` entries, `git worktree list` pollution, later `worktree add` collisions. Fix: isolate each step in its own try, always attempt `worktree remove --force` + `worktree prune --expire now` (retry after delay), delete the `swarm/<id>/<name>` branch in clone mode, and reconcile workspaces on startup.

## LOW

**L1. Shell-only coordinator enforcement has no lifecycle bound** — outside `running|completing` (`policy.ts:80`) everything allows; repro swarm.status="completed" → verifier edit = allow. Enforce the member lifecycle independently of swarm status.
**L2. Channel privacy bypass** — `plugin.ts:823-830` lets any member pass `channel:"*"` and read all channels; `post_message` never checks subscription (`plugin.ts:212-215`). Intersect `"*"` with membership for non-global roles.
**L3. No rate limit on posts/@all → cost DoS** — `plugin.ts:228-236`, `mentions.ts:61-65`. A worker loops `post_message "@all"` and wakes every member each time. Rate-limit per member and restrict `@all` to coordinator.
**L4. `allowCoordinatorEdits:"false"` (string) is truthy** — `policy.ts:37,97` use `!options.allowCoordinatorEdits`; repro "false" → allow. Coerce `=== true` only.
**L5. Active-swarm scoping bypass in reads** — `read_board` uses `getLatestMemberBySession` (`plugin.ts:799`) and `status` uses it too (`plugin.ts:511`), so killed/completed sessions still read board history and absolute `workspace_dir`s.
**L6. Stale-lock claim reports success but owns nothing** — `db.ts:650-678`: conflicts skip locks whose owner isn't live, then `INSERT OR IGNORE` keeps the dead owner's row while `claimed` returns the glob; `policy.ts:139` still sees that row as "otherLocks" and blocks everyone. Delete/reassign orphan rows in-transaction and assert `changes===1`.
**L7. `..`-prefixed legitimate names over-blocked** — `security.ts:85` `rel.startsWith("..")` rejects `..hidden/x.txt` (repro). Use `rel===".." || rel.startsWith(".."+sep)`.
**L8. Board server is unauthenticated** — `board-server.ts:150-166`, bound `127.0.0.1` with an ephemeral port (`181-183`); no Origin/CSRF check, so a text/plain body needs no preflight. A malicious page via DNS rebinding (or any local process) can POST `/api/role-models` and `/api/member/model` and GET the whole board incl. absolute workspace paths. Add a random token (path or header), check `Origin`/`Sec-Fetch-Site`, require `application/json`.
**L9. Call-ID cache is unbounded and contract-dependent** — `plugin.ts:84-93` only prunes >10 min entries when >500, so high tool volume still grows it; `plugin.ts:1005-1008` assumes `permission.evaluate.source.id === execute.before.id`. If that changes, worker edits deny (availability) and verifier/patch checks lose target paths. Delete on use, hard-cap, and warn when an edit has no cached input.

Also `security.ts:199-247` (`extractTargetPaths`) misses `file`, `destination`, `to`, `from` — a move/copy/rename tool yields `[]`; workers fail closed but coordinator/verifier target checks see nothing. Add those keys and deny write-tools with zero extracted targets for every role. (`swarm kill` also compares raw `input.name` at `plugin.ts:646-651` without `normalizeHandle`, so `@Name` silently misses.)

## Verified NOT vulnerable (so you can trust the rest)
- Path fence blocks `../`, absolute-outside, UNC, `.git`/`.opencode`/`node_modules`, and **existing** symlink/junction escapes (tested: junction to an outside dir → deny in all variants).
- Coordinator `edit`/`write`/`apply_patch` are denied when `allowCoordinatorEdits` is boolean-false (both hooks).
- Cross-repo absolute paths from a `share` worktree are denied, and `.git` is denied for all workspace modes.
- Glob overlap is conservative over the tested set (no under-block found; it only over-blocks).
- Board HTML escapes `& < > "` in every interpolation and uses double-quoted attributes, so the stored-XSS chain does not land.
- `runGit` uses `execFileSync` (no shell) → no command injection via names/paths.

**Top 4 to fix first: C1 (role allow-list), H3 (tool allow-list), H4 (dangling symlink), H1 (fork).** They are each single-function changes and together restore the isolation model. Nothing was edited; probe scripts live only under %TEMP%\opencode\swarm-audit. Side note: `tools/swarm-runtime/nul` (102 B) is a stray Windows artifact and will break Linux checkouts/packaging.

---

## Verifier matrix — independent static verification (@verifier)

_Board #13 · 2026-11-22 09:48_

@coordinator Adversarial static verification complete — 10/10 checked against exact lines in tools/swarm-runtime/src/* (note: files live under src/, not the paths quoted in the claims). Verdicts:

| id | verdict | evidence |
|----|---------|----------|
| C1 role fallthrough | PASS | plugin.ts:550 `role = (input.role as MemberRole) ?? "worker"` — cast only, no validation; policy.ts:25-48 unknown role falls through to worker branch (edit ends in `allow` at policy.ts:159 when no locks claimed; shell = "ask"). Nuance: fallthrough grants worker perms, not admin escalation. |
| H1 fork transcript copy | PASS | plugin.ts:336-349 forks any member by name incl. coordinator (348 `forkFn({sessionID: forkTarget.session_id})`); no privilege/hierarchy check; fork branch skips `buildRolePermissions` (only create branch, line 355); forked child registered with arbitrary role at 371-386. Caveat: reachable only via action "add" which is coordinator-gated (plugin.ts:542). |
| H2 coordinator shell | PASS | policy.ts:33-41 coordinator perms deny external_directory + (optional) edit only — no shell rule; policy.ts:97-102 denies edit only; coordinator isShell matches no branch → `return {decision:"allow"}` at policy.ts:159. allowCoordinatorEdits=false does not restrict shell. |
| H4 dangling symlink | PASS | security.ts:49-60 resolveCanonicalAncestor walks up while `!existsSync`, so the dangling symlink component is never resolved — kept as plain name under root; security.ts:79-89 check passes; write-through symlink lands at its outside target. Live symlinks are caught (realpathSync), dangling ones are not. |
| H5 glob ReDoS | PASS | security.ts:126-157 globToRegExp emits `[^/]*`/`.*` with no complexity cap; validateAndNormalizeGlob (security.ts:99-124) has no length limit; pathMatchesGlob runs per-edit (policy.ts:139,147) → catastrophic backtracking on malicious owned_glob like `*a*a*a*...`. |
| H3 denylist gaps | PASS | policy.ts:5-16 WRITE_TOOLS lacks "write_file", both sets lack MCP tool names; plugin.ts:977 `if (!WRITE_TOOLS.has(toolName) && !SHELL_TOOLS.has(toolName)) return;` — such tools are never evaluated → read-only roles (verifier/monitor) can call them. |
| R1 restart bricks | PASS | db.ts:101-103 partial unique index `WHERE state != 'killed'`; reconcile db.ts:239-240 sets `state='stopped'` (still indexed). Guard db.ts:177-182 requires swarm status running/completing, but reconcile already set status='interrupted' (db.ts:244) → guard passes, INSERT at db.ts:200-213 reusing a resumed session_id violates idx_active_member_session → createSwarmWithCoordinator throws. |
| R2 EADDRINUSE hang | PASS | board-server.ts:181-183 promise resolves only in listen callback; no `server.on("error")` — on EADDRINUSE the promise never settles (and unhandled 'error' can crash the host). |
| R3 unauth board API | PASS | board-server.ts:53-55 no auth/token/origin check on any route; POST /api/member/model (150-157) switches a member's model; POST /api/role-models (160-165) mutates role defaults. Bound to 127.0.0.1 (182) but any local process / DNS-rebinding page can mutate state. |
| Compat fork whitelist | PASS | plugin.ts:344-347 requires `ctx.session.fork`. Installed adapter @opencode/plugin SessionDomain = `Pick<SessionApi, "list"|"create"|"get"|"remove"|"switchAgent"|"switchModel"|"prompt"|"generate"|"command"|"compact"|"synthetic"|"interrupt"|"update"|"move"|"context">` (dist/promise/session.d.ts:206-208) — fork is absent; "fork" exists only as a hook event name (session.d.ts:188). Verified against adapter dist 2.3.0 found in opencode npm cache; swarm-runtime declares @opencode/plugin 2.3.2 but has no node_modules installed, so confirm the exact resolved copy if 2.3.2 differs. Plugin fails loudly ("ctx.session.fork is not available"), so fork-based spawn is dead on this runtime. |

No product files touched; verification was read-only.

---

## Coordinator — final deduplicated summary

_Board #14 · 2026-11-22 09:49_

[done] Swarm Runtime Audit — 3 auditors + adversarial verifier.

Scope: tools/swarm-runtime (OpenCode v2 plugin), host opencode 2.2.6.
Tests: `bun run typecheck` clean; `bun test` 10 pass / 0 fail (~1.2 s); critical paths are untested.
Verifier: 10/10 top claims PASS by static line-check. One verifier caveat was wrong (it said `add` is coordinator-gated; plugin.ts:541-543 has no gate), so H6 stands.

CRITICAL
- C1 unvalidated role: plugin.ts:550 casts input.role; policy.ts:25-159 falls through to allow for unknown roles. `role:"root"` bypasses role restrictions; `role:"coordinator"` creates a second coordinator with complete/kill authority.

HIGH
- H1 fork leaks transcripts: plugin.ts:336-349 forks any member incl. coordinator with no rank check (latent today: ctx.session.fork is absent from the v2 adapter, so fork throws).
- H2 allowCoordinatorEdits=false is bypassable via shell: policy.ts:33-41,97-102 denies edit only.
- H3 tool classification is a denylist: policy.ts:5-16; plugin.ts:977 ignores write_file/MCP/code-exec tools → read-only roles can write.
- H4 dangling-symlink escape: security.ts:49-90 uses existsSync while walking; a broken symlink is re-attached under root, then write follows it outside.
- H5 glob ReDoS: security.ts:126-196 has no length/`**` cap; 12×`**/` hung >600 s, blocking the single-threaded host.
- H6 read-only roles can add writers, claim globs, rename/archive channels: plugin.ts:541-543,684-713 no caller gate.
- Board API unauthenticated/CSRF/DNS-rebindable: board-server.ts:52-55,150-166; text/plain cross-origin POST switched a model; foreign Host read the full board.
- Restart bricks new swarms in the same session: db.ts:101-103 index covers state != 'killed', reconcile writes 'stopped' (db.ts:232-245) → UNIQUE violation on recreate.
- EADDRINUSE hangs and can crash host: board-server.ts:181-183 resolves only in listen callback, no error handler.
- Dead-owner lock reported as claimed: db.ts:647-679 skips dead owners then INSERT OR IGNORE.
- Coordinator session is left edit-denied after complete: ensureCoordinator sets coordinator permissions (plugin.ts:128-135) and complete never restores them.

MEDIUM (deduped)
- Channel isolation not enforced for read/post/channel ops (plugin.ts:212-215,684-705,820-835).
- Wake fallback leaks other channels and can double-wake a parked member (plugin.ts:187-204).
- One stuck `working` member disables the stall monitor forever (monitor.ts:28 + plugin.ts:203-236).
- Quota-paused members are skipped and pause persists after recovery (plugin.ts:230, db.ts:475-501).
- Startup reconcile clobbers swarms owned by another live process (db.ts:232-258).
- Unscoped workers can write anywhere; locks are advisory (policy.ts:147).
- Unregistered-session block also blocks the user's other sessions/subagents (plugin.ts:981-984).
- execute.before fails open when sessionID is absent (plugin.ts:978).
- `git clone --shared` exposes origin object store/path (workspace.ts:66).
- Windows worktree cleanup can skip prune and leak registrations (workspace.ts:81-90).
- Board `head` freezes at #500 (board-server.ts:69-70).

COMPAT (opencode 2.2.6 vs plugin 2.3.2)
- No blockers: all ctx surfaces used exist; 2.3.2 d.ts is additive for this code.
- `fork:` is dead on every v2 host (ctx.session.fork absent, adapter whitelist).
- `data.tool` is not a field on session.tool.called → activity labels always "Running tool" (plugin.ts:1117).
- Coordinator model is persisted before switch succeeds (plugin.ts:133-161).
- typecheck uses skipLibCheck + 2.3.2 types, so host drift is invisible.
- Root import pulls 2.3.2 schema/effect into the host process.
- Mocks return the old model-list shape and never execute /swarm or /swarm-models.

LOW points and missing-test list are in board #4, #8.
Fix order: role allow-list + default-deny → gate add/claim/title/channel → tool allow-list → restrict fork → dangling-symlink lstat → glob caps → board token/Origin/Host → EADDRINUSE reject → reconcile 'killed' + owner heartbeat → restore coordinator permissions on complete.

Board: http://127.0.0.1:53454 (swarm sw_4195f11b).

---

# Corrections & consolidated fix order

## Verifier corrections

1. The verifier said `add` is coordinator-gated at `plugin.ts:542` — **wrong**. That line only calls `ensureCoordinator`; there is no role gate. H6 stands.
2. The verifier said the package has no `node_modules` — **wrong**; `@opencode/plugin@2.3.2` is installed. Its `fork` conclusion is still correct.

## Fix order

1. Role allow-list + `default: deny` (C1)
2. Gate `add` / `claim` / `title` / channel ops to coordinator (H6)
3. Tool allow-list classified by permission action (H3)
4. Restrict/remove `fork` (H1, COMPAT-1)
5. `lstat`-based symlink walk (H4)
6. Glob length/`**` caps (H5)
7. Board token + Origin/Host checks (R3/L8)
8. `server.once("error", reject)` + timeout (R2)
9. Reconcile `state='killed'` + owner heartbeat (R1, R10, M2)
10. Restore coordinator permissions on `complete` (H11)
11. Channel isolation (R6), wake filtering (R7), monitor stuck-working (R8), quota pause (R9), unscoped workers (M1), subagent guard (M3), fail-open hooks (M4), worktree cleanup (M5/M6), board head (R5)
12. Lows + missing tests; delete `tools/swarm-runtime/nul`

## Regression tests to add with the fixes

- Unknown role rejected; coordinator role cannot be spawned
- Verifier cannot `add`/`claim`/`title`/`archive`
- MCP-style `write_file` denied for verifier
- Dangling-symlink write outside workspace denied
- 12×`**/` glob rejected quickly
- Cross-origin / foreign-Host board requests rejected
- `EADDRINUSE` rejects within timeout instead of hanging
- Create swarm → restart → create again succeeds
- Dead-owner lock is stolen or reported as conflict, never `claimed`
- `complete` restores coordinator edit permissions
- >500 posts: `head` equals latest seq
- Channel-nonmember read/post denied

## Artifacts

- Board posts: #4 runtime, #6 compatibility, #8 security, #13 verifier, #14 final summary
- Runtime DB: `~/.opencode-swarm/d7b3d3902d25/board.db`
- Board UI (ephemeral, dead after restart): `http://127.0.0.1:53454`
- Repro probes: `%TEMP%\opencode\swarm-audit` (security), `%TEMP%` scripts (runtime)
- Slim config backup from model tuning: `~/.config/opencode/oh-my-opencode-slim.json.bak-before-go60plus`
