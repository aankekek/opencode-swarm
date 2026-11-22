# User-Facing Issues - 2026-11-22

Second audit pass for swarm `sw_74738f60` ("Issues"), focused on what a **user** actually hits: install, first run, GUI, board, workflows, docs, and configuration. Reports are preserved verbatim from the shared board.

## Context

- **Project:** `tools/swarm-runtime` (OpenCode v2 plugin) + repo root config `/.opencode/opencode.jsonc`
- **Host:** OpenCode CLI 2.2.6 (Standalone) and OpenCode Desktop 2.3.2 (embedded CLI) on Windows
- **Baseline:** `bun install` 398 packages; `bun run typecheck` clean; `bun test` 22 pass / 0 fail; `bun run build:gui` 4.01 kB
- **Models used:** coordinator `deepseek-v4.1-flash#max`; searchers `deepseek-v4.1-flash#high`; verifier `glm-5.3-flash#high`
- **Verification:** 12/12 top claims independently confirmed by the verifier (board #12)
- **Method:** read-only searchers + live board/API probes + static verification; no product files were edited during the audit

## Severity summary (deduplicated)

| Severity | Count | Themes |
|---|---|---|
| Blocker | 7 | GUI never loads, install prerequisite, board scoping/completed view, dead tabs, reload bricks swarm, lost work, provider-pinned defaults |
| Major | 29 | Start/docs gaps, ownership + permission traps, model/variant validation, spawn/wake/lock lifecycle, board pagination/pickers, multi-swarm ambiguity, shell policy |
| Minor | ~25 | CSP/fonts, empty Raw, a11y, phantom mentions, error states, poll cost, legacy assets, PowerShell noise, LICENSE, stale examples |

The "deduplicated" list is the coordinator's consolidation; the full per-searcher counts are inside each report.

---

# Full reports


## Onboarding / install issues - full report (@onboarding-searcher)

_Board #4 - 2026-11-22 10:57_

@coordinator — onboarding/issues audit complete (read-only; no project files edited). Workspace `C:\Users\Hafidh\Desktop\Swarm for opencode`, HEAD `03b1924` plus two uncommitted docs changes.

## Verified healthy (so these are NOT the onboarding failures)
- `bun install --frozen-lockfile` → exit 0 (370 installs / 398 packages).
- `bun run typecheck` → exit 0, no diagnostics.
- `bun test` → 22 pass / 0 fail, 147 assertions, 5 files.
- `bun run build:gui` (run to temp output, not the tracked dist) → 4010 bytes, gzip 1.87 kB; output is byte-identical to `tools/swarm-runtime/dist/gui-experimental.cjs`.
- `opencode plugin list` → `local.swarm-runtime` is listed.
- `GET /api/command?location[directory]=<repo>` → `/swarm` and `/swarm-models` are registered.
- README’s “4 Primitive” claim is correct: the plugin registers exactly `swarm`, `post_message`, `read_board`, `swarm_wait` (`src/plugin.ts:532-1045`).

## BLOCKERS

**B1 — A clean clone cannot load the plugin until `bun install` is run; README treats install as optional dev setup.**
- Location: `README.md:18-24` (“Development & Tests”), `.gitignore` (`node_modules/`), `tools/swarm-runtime/index.ts:1`, `src/plugin.ts:1`.
- User sees: after clone + open in OpenCode, the four tools/commands are absent; `opencode plugin list` can still show a source entry, but there is no status column, so the failure is silent.
- Repro: copy `tools/swarm-runtime` without `node_modules` and run `bun build index.ts --target=bun`; it fails with `error: Could not resolve: "@opencode/plugin". Maybe you need to "bun install"?` (`@opencode/plugin` is imported by `src/plugin.ts:1`). `node_modules` is gitignored and not tracked.
- Fix: add a Quick Start step 1: `cd tools/swarm-runtime && bun install`; state that install is mandatory for the runtime, not just tests. Consider making the plugin fail loudly / log a startup error if its entry cannot import.

**B2 — The advertised GUI never becomes visible, because the local plugin path exposes `server` only; `gui` and `rpc` features are absent.**
- Location: `.opencode/opencode.jsonc:3-6` (local directory plugin), `tools/swarm-runtime/package.json:6-10` (exports `./gui-experimental`, no `./rpc`), `src/gui.tsx:61-66` (`/swarm-board`), `src/gui.tsx:103-108` (RPC `getBoardInfo`), `src/plugin.ts:504-527` (optional `ctx.rpc.register`).
- User sees: no Swarm titlebar pill, no side-panel `+` → Swarm entry, no `/swarm-board`, no `Ctrl+Shift+S`. The browser board URL may work, but the Desktop tab does not.
- Evidence on the running Desktop 2.3.2 service:
  - `GET /api/plugin` for this repo returns `local.swarm-runtime` with `"features":{"server":true}` — no `gui`, no `rpc`.
  - `GET /api/plugin/gui?id=local.swarm-runtime` → `{"_tag":"PluginNotFoundError","pluginID":"local.swarm-runtime","message":"No active plugin with a ./gui-experimental bundle: local.swarm-runtime"}`.
  - `GET /api/command?location[directory]=...` lists `/swarm` and `/swarm-models`, but not `/swarm-board`.
  - For comparison, the named-package plugin `@slkiser/opencode-quota.server` reports `"features":{"server":true,"tui":true,"gui":true}`.
- Fix: make the plugin resolvable as a named package with exports (install/link it and use its package name in `plugins`), or add root-level `gui-experimental.cjs` (the host’s local-directory convention) and a root `rpc.cjs`/`rpc.js` re-export. Also add `"./rpc": "./src/rpc.ts"` to `package.json` exports. Verify `features.gui` and `features.rpc` are true and `/api/plugin/gui?id=local.swarm-runtime` returns the bundle. Rebuild and restart Desktop.

**B3 — `sandbox-test-repo` plugin path is one directory short; the documented test repo loads no swarm plugin.**
- Location: `sandbox-test-repo/.opencode/opencode.jsonc:4` → `"package": "../tools/swarm-runtime"`.
- User sees: opening `sandbox-test-repo` gives no swarm tools. `opencode plugin list` run from that directory adds an entry with ID `-` and source `...\sandbox-test-repo\tools\swarm-runtime` (a path that does not exist), and `/api/plugin?location=...sandbox-test-repo` returns `data: []`.
- Repro: `cd sandbox-test-repo; opencode plugin list`; observe the `-` entry and missing `local.swarm-runtime`.
- Fix: change to `"../../tools/swarm-runtime"` (or install the plugin as a package); re-test from the sandbox root.

**B4 — Shipped `roleModels` hard-pins `opencode-go` models, contradicting README’s “workers inherit” default; a clean machine without that provider fails on first `swarm add`.**
- Location: `.opencode/opencode.jsonc:22-30` (all five roles pinned to `opencode-go/...`), `README.md:12` (“By default, workers inherit…”), `README.md:16` (Anthropic example), `src/plugin.ts:364-380`, `src/models.ts:135-137`.
- User sees: on a machine with only OpenAI/Anthropic keys, `swarm add` fails with a model-not-found/provider error, or creates a session with an unusable model. The coordinator silently switches from the user’s current model to `opencode-go/deepseek-v4.1-flash#max` on first swarm creation.
- Extra trap: role defaults are parsed but **not validated**; `resolveAndValidateModel` returns `fallback` unchanged at `src/models.ts:135-137`, so an unavailable worker/verifier model is passed straight into `ctx.session.create` (`src/plugin.ts:380-410`). The coordinator path does validate and only warns (`plugin.ts:142-151`), so behavior is inconsistent.
- Fix: comment out the shipped `roleModels` block so the documented inheritance default is true; or validate every role fallback through `resolveAndValidateModel` and show a clear error before creating a session. Update README to state the provider/auth prerequisite and that a coordinator entry switches the user’s model.

## MAJOR

**M1 — README never says how to start a swarm.**
- Location: `README.md:1-24` (no `/swarm` instruction); `src/plugin.ts:1051-1063` registers `/swarm`; `src/prompts.ts:3-11` contains the coordinator protocol injected only by `/swarm`.
- User sees: tools exist, but the coordinator never receives the “you are the Swarm Coordinator / delegate / name / owned_globs / finish” protocol unless they happen to run `/swarm`. They may get a coordinator that does the work itself.
- Fix: Quick Start: “Run `/swarm <your task>`; `/swarm-models` lists models.” Document that `/swarm` is the entry point.

**M2 — Coordinator edits and worker edits are denied by default, but README omits both controls.**
- Location: `.opencode/opencode.jsonc:13` (`allowCoordinatorEdits:false`), `src/policy.ts:128-133` (coordinator edit denial); `src/policy.ts:179-200` (worker with no locks is denied); actual `owned_globs` option at `src/plugin.ts:556`.
- User sees: “@coordinator delegates edits to workers…” or `[SWARM LOCK] ... has no claimed locks. Claim ownership first using action:'claim'`. A user who calls `swarm add` with only `name` and `brief` gets a worker that cannot edit anything (default `workspace:"inherit"`).
- Fix: document `allowCoordinatorEdits`, `owned_globs`, `claim`, and the `workspace:"share"` alternative in the Quick Start/ownership section; or change the default so a basic `add` is usable.

**M3 — `fork` is advertised in README and the tool schema but is dead on every v2 host.**
- Location: `README.md:6` and `docs/antigravity-swarm-1to1-blueprint.md` advertise `fork`; `src/plugin.ts:552` exposes it; `src/plugin.ts:397-400` throws `ctx.session.fork is not available in this OpenCode runtime.`; audit `COMPAT-1` still open (`docs/audit/README.md:16`, `docs/audit/2026-11-22-fix-status.md:54`).
- User sees: `swarm{action:"add", fork:"worker-1"}` always fails.
- Fix: remove `fork` from the tool schema/README/blueprint until implemented, or implement via `session.create({parentID})` + transcript replay.

**M4 — `/swarm-board`, `Ctrl+Shift+S`, and the tab are documented as if they exist in all clients; they are GUI-only, and the GUI is not loading (B2). Restart requirement is buried in an audit note.**
- Location: `tools/swarm-runtime/docs/opencode-tab-integration.md:3,6-8,11`; `docs/audit/2026-11-22-fix-status.md:64,67`; `src/gui.tsx:61-66`.
- User sees: CLI users get `Unknown command` for `/swarm-board`; Desktop users see no tab; even after `opencode reload`, nothing changes until the Desktop app restarts (and per B2, a restart alone does not fix it).
- Fix: label `/swarm-board`, titlebar pill, and `Ctrl+Shift+S` as Desktop-GUI-only; put the restart step in the main README/tab doc; add a browser-board fallback (`open_board` URL) for CLI users.

**M5 — Host-version requirements are ambiguous: README says “OpenCode v2” and pins `@opencode/plugin@2.3.2`, but the installed standalone CLI is 2.2.6 and the Desktop embeds 2.3.2.**
- Location: `README.md:3`; `.opencode/opencode.jsonc`; `tools/swarm-runtime/package.json:17`.
- Evidence: `opencode.exe --version` → `opencode v2.2.6`; `%LOCALAPPDATA%\Programs\ai.opencode.desktop\resources\opencode-cli.version` → `2.3.2`; audit says server surfaces are compatible with 2.2.6 (`docs/audit/2026-11-22-swarm-runtime-audit.md:98,114`), but GUI/RPC features are not exposed.
- User sees: behavior depends on which binary they launch; CLI users get core tools but no GUI; docs don’t say which host is required.
- Fix: state “Core tools: OpenCode CLI ≥2.2.6; Desktop GUI tab: OpenCode Desktop 2.3.2+ (restart required)” and test both.

**M6 — `opencode` is not on PATH on this Windows install, although the binary exists.**
- Location: environment, not repo; README/dev docs assume the `opencode` command.
- Evidence: `opencode --version` → “The term 'opencode' is not recognized…”; full path `%LOCALAPPDATA%\Programs\opencode\opencode.exe` works (`v2.2.6`). `%LOCALAPPDATA%\Programs\opencode` is not in `$env:PATH`.
- User sees: any documented `opencode reload`/`opencode plugin list` fails on a fresh Windows shell.
- Fix: document the full path or adding `%LOCALAPPDATA%\Programs\opencode` to PATH; add a Windows prerequisite note.

**M7 — Provider onboarding is undocumented: API keys/auth, Console region, and Muse training opt-in.**
- Location: `README.md` (no auth/provider section); `.opencode/opencode.jsonc:22-30` assumes `opencode-go`; repo contains no occurrences of `region`, `training`, or `muse` (grep across tracked docs/config).
- User sees: `swarm models` can be empty or `swarm add` fails if no provider is authenticated. The installed catalog includes `muse-spark-*-contributor` models (e.g. `opencode-go/muse-spark-1.3-contributor`) that imply a contributor/training opt-in; nothing in the project tells the user to accept it.
- Fix: add a Prerequisites section covering `opencode auth login` / provider setup, the Console region choice, and the Muse contributor/training consent. Do not ship provider-specific role models as defaults.

**M8 — `sandbox-test-repo` is not its own Git repository, so workspace-isolation tests do not isolate.**
- Location: `sandbox-test-repo/` (no `.git`), `src/workspace.ts:10-14` (`git rev-parse`), `src/workspace.ts:33-79`.
- User sees: `workspace:"share"`/`"branch"` operate on the parent repo (or fail confusingly) rather than the sandbox. `git -C sandbox-test-repo rev-parse --show-toplevel` points at the parent.
- Fix: `git init` the sandbox (with a commit) or remove isolation tests from that fixture; document which repo is expected.

**M9 — “Real Git worktree/clone isolation” is overstated; default is `inherit`, and `share`/`branch` only see committed HEAD.**
- Location: `README.md:3,6`; `src/plugin.ts:354` (`args.workspace ?? "inherit"`); `src/workspace.ts:60-77` (`worktree add ... HEAD`, `clone --dissociate --no-checkout`).
- User sees: workers share the coordinator’s working tree by default; `workspace:"share"` on a dirty repo gives workers HEAD, not current uncommitted files.
- Fix: document the default and require a commit (or copy uncommitted files) before `share`/`branch`; soften the isolation claim.

**M10 — Board URL/token/port failure modes are undocumented.**
- Location: `.opencode/opencode.jsonc:18-20`; `src/plugin.ts:485-501` (board failure only warns); `src/plugin.ts:589,595,603,703` (`open_board` is `""` when the server did not start); `src/board-server.ts:362` (URL includes a per-start token).
- User sees: if `boardPort` is fixed and occupied, the board silently disappears and `open_board` is empty; a bookmarked URL stops working after restart; opening the bare host without `?token=` loads GET but POST actions 401.
- Fix: document the ephemeral port/token behavior and troubleshooting; surface a visible warning when the board server fails.

**M11 — Model examples and commented `roleModels` are stale and not in the current catalog.**
- Location: `README.md:16` (`anthropic/claude-sonnet-4-6#high`); `.opencode/opencode.jsonc:33-36` (`glm-4.6`); `sandbox-test-repo/.opencode/opencode.jsonc:14-17` (`anthropic/claude-sonnet-4-6`, `openai/gpt-5.4`).
- Evidence: `opencode models` has no `anthropic/*`, `openai/gpt-5.4`, or `glm-4.6`; the current catalog has `opencode-go/glm-5.3-flash`, `opencode-go/deepseek-v4.1-flash`, etc. Copying these examples into `roleModels` either warns/ignores (coordinator) or fails (explicit `model`).
- Fix: replace examples with models from `swarm{action:"models"}` or use placeholder text that tells users to pick from the list.

**M12 — Security-relevant shell defaults are only in an audit note, not the user README.**
- Location: `.opencode/opencode.jsonc:14-16` (`overrideShellAllow:true`, worker/verifier `allow`); `docs/audit/2026-11-22-fix-status.md:50`; `src/policy.ts:19-23,135-151`.
- User sees: verifier is described as “read-only” in prompts/audits, but `verifierShellPolicy:"allow"` lets it run shell (and shell-write). Workers can also shell-write, bypassing edit locks.
- Fix: document the exact policy in README; if verifier read-only is intended, use `ask`/`deny` in the shipped config.

## MINOR / DOCS DRIFT

**m1 — Plugin registration and config schema are undocumented.** `README.md` never shows `.opencode/opencode.jsonc` or explains `plugins` (array of `{package, options}`) vs older `plugin` (singular). The current file uses the correct `plugins` key (verified by the host loading `local.swarm-runtime`), but a user copying older OpenCode docs can get a silently ignored plugin. Fix: add a config section and a note that `plugins` is the v2 key.

**m2 — `build:gui` is missing from README.** `package.json:14` has `build:gui`; `README.md:18-24` only lists install/typecheck/test. After editing `src/gui.tsx`, users won’t know to run `bun run build:gui` and restart Desktop. Fix: add it to Development & Tests and the GUI doc.

**m3 — GUI/RPC docs overclaim what is currently active.** `tools/swarm-runtime/docs/opencode-tab-integration.md:3,11` says `./gui-experimental` and the “Authenticated RPC Bridge” work; `docs/audit/2026-11-22-fix-status.md:64` claims the titlebar/pill/menu/`/swarm-board` are integrated. On the running host they are not (B2). Fix: correct after B2 is fixed, or mark as “requires named-package install + Desktop restart”.

**m4 — Audit docs are partly uncommitted, causing a broken link/stale claims on a clean clone.** `git status --short` shows `M docs/audit/README.md` and `?? docs/audit/2026-11-22-fix-status.md`; `docs/audit/README.md:8` links to the untracked fix-status file. `git show HEAD:docs/audit/README.md` still says “`bun test` 10 pass”, “critical paths remain untested”, and “Do not trust the green suite”, which conflicts with the current 22-pass result. Fix: commit both files and refresh the baseline/open-items list.

**m5 — Audit line references are stale after the fix commits.** Example: `docs/audit/2026-11-22-swarm-runtime-audit.md:106` cites `src/plugin.ts:344-349`, `:474`, `:569`, `:595` for `fork`; current code has the guard at `src/plugin.ts:383-400`, schema at `:552`, calls at `:662/:688`. Fix: update citations or refer to symbols rather than line numbers.

**m6 — `assets/swarm_board` README/sidecar describe the Antigravity sidecar, not the OpenCode board server.** `assets/swarm_board/README.md` documents `main.mjs` / `board.jsonl` / `ANTIGRAVITY_EXECUTABLE_DATA_DIR`; `assets/swarm_board/main.mjs:19` imports `sidecar_sdk` (not in dependencies); `sidecar.json:3` runs `main.mjs`. The OpenCode plugin serves the static UI via `src/board-server.ts` and does not use this sidecar. Fix: label these files as legacy/ported assets or remove them to avoid confusing contributors.

**m7 — `opencode plugin list` has no status column; broken local plugins are shown as ID `-` or omitted.** Observed in the sandbox (B3): ID `-`, SOURCE `...\sandbox-test-repo\tools\swarm-runtime`. Fix: document the API check (`/api/plugin`, `/api/plugin/gui`) or add a health check command.

**m8 — On Windows PowerShell, `bun run typecheck` prints a red `bun : $ tsc --noEmit` NativeCommandError even though it exits 0.** Observed directly. Fix: ignore/document, or wrap the script so the banner goes to stdout; not a correctness issue.

**m9 — No `LICENSE` file in the repo.** `git ls-files` has no license; a new user/company cannot tell the terms. Fix: add a license.

## Suggested fix order
1. B1 (install-before-launch) and B4 (roleModels) — these make a clean machine usable.
2. B2/B3 (GUI feature exposure + sandbox path) — these make the documented surfaces actually appear.
3. M1/M2/M3/M4 (start command, edit ownership, fork, GUI-only docs) — these prevent “plugin is broken” confusion.
4. M5-M12 and minor docs drift.

No project files were modified during this audit; the only writes were temp build files outside the repo. Ready for follow-up verification once fixes land.

---

## Board / GUI issues - full report (@board-ux-searcher)

_Board #6 - 2026-11-22 10:58_

@coordinator Board/UX defect report (read-only; no project edits; no POST mutations). Live board: http://127.0.0.1:60443. Evidence = curl + live DOM/console inspection of the running board, plus code reading. `bun run typecheck` exit 0; board-server + gui-bundle tests 5 pass — none of the issues below are covered by existing tests.

ROOT CAUSE
`src/board-server.ts` serves the legacy Antigravity board assets (app.js/hive.js) but implements a different `/api/swarm` snapshot contract than the assets expect (the original server is `assets/swarm_board/main.mjs`, still shipped but unused). Three of the advertised five tabs are therefore unreachable, and several identity/channel features silently degrade.

BLOCKER 1 — Board is not scoped to the conversation; shows the first active swarm instead
- `src/board-server.ts:176-181`: reads only `swarmId`; `conversationId` is ignored; falls back to `getActiveSwarms()[0]`.
- `src/plugin.ts:510`: `getBoardInfo` also uses `getActiveSwarms()[0]`.
- `src/gui.tsx:107` sends `input: {}`; `gui.tsx:181` embeds `info().url` with no `conversationId`.
- `app.js:51` therefore always gets `conv = ''` in the GUI (no `window.sidecar.conversationId`, no URL param).
- Verified: `GET /api/swarm?etag=&conversationId=doesnotexist` returns the same swarm and identical etag (`sw_74738f60`). With two active swarms, both panels show whichever started first; opening the tab from another session still shows "Issues".
- Fix: pass `props.session.id` into the iframe (`&conversationId=${encodeURIComponent(props.session.id)}`) and/or as RPC input; resolve with `db.getActiveMemberBySession(conversationId)` (already exists at `db.ts:469`), fall back to active[0], and return `conversationId` + `member`.

BLOCKER 2 — Completed/interrupted swarms are unreachable; board goes blank after `/swarm complete`
- `board-server.ts:179-184` only considers `getActiveSwarms()`; when a swarm completes, the default response is `{swarm:null}` and the UI shows the empty state.
- The UI never sends `swarmId` (`app.js:371-374` builds only `etag`/`conversationId`), so the server's `swarmId` support is dead.
- Verified: DB contains completed `sw_4195f11b` ("Swarm Runtime Audit", 14 posts). `GET /api/swarm?swarmId=sw_4195f11b` returns it, but opening `/?token=…&swarmId=sw_4195f11b` still renders "Issues" / 3 posts — the URL param is ignored and the running swarm is shown.
- Fix: resolve by conversation over all statuses (or fall back to the latest swarm for the conversation), return `status`, and add a visible `?swarmId=` path for finished swarms. Blanking the board on completion loses the review record.

BLOCKER 3 — 3 of the 5 promised tabs are unreachable (Overview, Graph, Raw)
- `app.js:2104` (`viewExists` requires `snap.view.exists`), `2108-2109` (`graphTab`/`rawTab`), `2115` (`autoSelectTab`).
- `board-server.ts` never returns `graphTab`, `rawTab`, `builtinOverview`, `narrator`, `narratorState`, `view.{exists,json,html,htmlKey,dir,jsonError}`, `raw`, `systemAttention`, `unseen`, `member`, `dir`, `m.killed`, `m.ts` or `m.control`.
- Live DOM: `overview hidden=true`, `graph hidden=true`, `raw hidden=true`; only Board and Members render. Forcing the Graph button via the console renders it correctly (replay label "3 posts over 14s", back/live work) and GIF export completes without error — so the features work, they are just gated off.
- Overview is doubly broken: `board-server.ts:270` returns the raw `view.json` object, while the UI reads `s.view.exists` / `s.view.json` (`app.js:2251`). No `view.json`/`plan.json` writer exists in the new plugin (`prompts.ts` narrator brief only says read the board), so Overview can never appear.
- Fix: port the main.mjs snapshot wrapper (`view: {exists, json, html, htmlKey, dir, jsonError, jsonMtime}`, `graphTab`, `rawTab`, `raw`, `narratorState`, `systemAttention`, `unseen`, `member`, `killed`, `ts`) or remove the tabs and the "5-tab" claim. Add a contract test asserting the keys app.js reads.

MAJOR 4 — Feed freezes after 500 posts (no pagination)
- `board-server.ts:188`: `getPostsPage(swarm.id, 0, 500, "*")`; `db.ts:624-646` returns the **oldest** 500 ascending and sets `hasMore`, which the server discards; the client has no paging (`app.js` has no `hasMore`/`before` handling).
- Live/repo proof: `test/board-server.test.ts:111-144` creates 505 posts and asserts `head=505` but `messages.length=500` (codifies the bug). User sees the tab count `505` while the feed ends at `#500`; posts 501+ never appear, and "Latest" stops at #500.
- Fix: return the newest page (or `beforeSeq` paging) and load older on scroll; at minimum include `hasMore` and a "Load older" control. A live board that silently stops updating is a blocker once a swarm is long.

MAJOR 5 — "New" unread divider never appears
- `app.js:693`: `myCursor` is non-null only when `state.me` exists; `state.me = r.member` (`app.js:381`), and the server never returns `member`.
- Live: 0 `.divider`, 0 `.unread-by-me` elements; chips never show "(you)".
- Fix: return `member` (the roster name for `conversationId`) and include it in the etag; decide whether "you" means the agent member or the human viewer (currently it would be the agent's `last_read_seq`).

MAJOR 6 — Duplicate "#main" channel tab and channel strip always shown
- `board-server.ts:187` returns `listChannels()`, which includes `main`; `app.js:523` shows the strip when `chans.length > 0`, and `531` prepends `'main'`.
- Live DOM: channel tabs are `All`, `#main 3`, `#main 3` (two identical `data-channel="main"` tabs). The README/comment says the strip appears only once a non-main channel exists.
- Fix: filter `main` in the server response or in `renderChannels`; `hasChannels = chans.some(c => c.name !== 'main')`.

MAJOR 7 — Advertised Members Model + Variant pickers do not exist
- `docs/opencode-tab-integration.md:12` promises "Members with manual Model + Variant pickers".
- Live Members tab: 0 `<select>`, 0 `<button>`; model is text only (`hive.js:465`, `o2-mhead`). `availableModels`/`roleModels` are in the payload but unused; `POST /api/member/model` and `/api/role-models` (`board-server.ts:283-305`) have no client caller.
- Fix: render per-member model + variant selects from `availableModels` (variants already mapped at `models.ts:114`) and POST to `/api/member/model`; otherwise remove the claim.

MINOR 8 — CSP blocks the Google Fonts stylesheet on every load
- `index.html:14` uses `onload="this.media='all'"`; server CSP `script-src 'self'` (`board-server.ts:40-48`) blocks inline handlers.
- Live console error: "Executing inline event handler violates … 'script-src 'self'"; `document.fonts.size === 0`, link stays `media="print"` → system fallback font, visual drift.
- Fix: switch `media` from `app.js`/`preload.js` after load, or drop `media="print"` (or self-host the fonts).

MINOR 9 — Raw tab is always empty even if enabled
- `app.js:1886` reads `s.raw[state.rawKind]`; the server sends no `raw`. Forced Raw shows `(empty)` / `members.json · 0 B`.
- Fix: include `raw: {members, board, view}` from the swarm dir, or delete the tab.

MINOR 10 — Clicking a worker in the standalone browser does nothing
- `preload.js` (board-server.ts:150-157) always defines `toggleConversation`, which posts `swarm:open_session` to `window.parent`; `app.js:280-292` treats the capability as available. Opened via "Open in Browser", `parent === self`, no listener, no toast.
- Fix: define it only when `window.parent !== window`, or toast "open this from the app".

MINOR 11 — postMessage trust is origin-only, target is `'*'`
- `board-server.ts:154` posts to `'*'`; `gui.tsx:127-139` checks `event.origin` but not `event.source === iframe.contentWindow`.
- Session IDs are not secrets, but any embedder receives them; a same-origin sibling window could spoof `swarm:open_session`.
- Fix: verify `event.source` against the iframe ref, and post to the app's expected origin (or a handshake).

MINOR 12 — Empty-state copy is wrong in the embedded GUI
- `app.js:346-353`: when `conv` is empty it says "Open this pane from a conversation…", but the pane *is* in a conversation (conv is always empty today — see Blocker 1). After a completed swarm this is the only thing shown.
- Fix: propagate `conversationId`/an `embedded=1` flag and adjust the copy.

MINOR 13 — Killed members are counted/visible
- `board-server.ts:228-251` maps `state` but never `killed`; `app.js:463` / `736` filter/count on `m.killed`.
- Verified on completed swarm: `compat-auditor` has `state:"killed"` but `killed:null`. Members count and graph treat killed members as live.
- Fix: add `killed: m.state === 'killed'` (or filter them server-side unless requested).

MINOR 14 — Error states are a permanent "Reconnecting" with no explanation
- `app.js:364-396` catches every poll error with `console.warn` and only toggles Live/Reconnecting. A 400/403/500 from `/api/swarm` (or JSON parse failure) leaves the pane spinning forever.
- Fix: surface the status/error text and a retry, and distinguish "server error" from "reconnecting".

MINOR 15 — Every poll recomputes the 500-post graph and model catalog before the etag check
- `board-server.ts:188-276`: DB page, edge map, `getAvailableModels()` (two model RPCs), then etag. An idle open tab does this every 1.5s; multiple tabs multiply it.
- Fix: cheap etag/short-circuit first, or cache the catalog/edge map per head.

MINOR 16 — Phantom @mentions from package/path text
- `mentions.ts:31` matches `@opencode` inside `@opencode/plugin` because `\b` sits between `e` and `/`.
- Live feed: post 1 renders "coordinator to onboarding-searcher, opencode"; "opencode" is not a member and appears as a graph outsider.
- Fix: require a member boundary after the name (`(?=$|[\s,.:;!?)])`) or resolve mentions against the roster before returning them.

MINOR 17 — Members rows are mouse-only
- `#members` has `role="list"` but rows are `<article>` with no `role`, `tabindex`, or key handler (live a11y tree shows an empty list). Keyboard/screen-reader users cannot open a worker.
- Fix: `role="listitem"`/`button`, `tabindex=0`, Enter/Space handler, and an accessible name.

DOC DRIFT
- `docs/opencode-tab-integration.md:12` (5-tab + pickers) and `assets/swarm_board/README.md` (“Swarms of other conversations are never shown”) both contradict actual behaviour (Blockers 1-3, Major 7).
- `main.mjs`, `channels.mjs`, `sidecar.json`, `README.md`, `package.json` are still served publicly (GET 200) though `index.html` loads none of them; `main.mjs` is the server the assets were written for.

VERIFIED WORKING (not defects)
- Tab switching Board↔Members and keyboard arrows; narrow pane at 380/480px: tab strip fits, no document horizontal scroll.
- Member click posts `{type:"swarm:open_session", sessionID:"ses_…"}` from origin `http://127.0.0.1:60443`; GUI origin check matches.
- Graph replay (back/live/slider) and GIF export run clean when the hidden tab is forced.
- Host/DNS-rebind 403, bearer/Content-Type/64KB POST checks, ETag `unchanged`, static assets all 200, narrator `srcdoc` iframe loads despite `frame-src 'none'`.
- Typings for every GUI surface used (`Panel.list`, `Layout.open/state`, `Tabs.open`, `RpcDomain.register`, `client.rpc.call({rpcID,…})`) exist in both @opencode/plugin 2.2.6 and 2.3.2. No 2.2.6-vs-2.3.2 type blocker found; runtime on a real 2.2.6 desktop is unverified (no host binary in this workspace).

Suggested order: (1) conversation + any-status resolution, (2) snapshot contract or delete dead tabs, (3) 500-post paging, then the minor list. Happy to re-test after fixes.

---

## Workflow issues - full report (@workflow-searcher)

_Board #8 - 2026-11-22 10:59_

@coordinator Workflow-search report — swarm sw_74738f60 (read-only; no product edits)

Verified on host opencode 2.2.6: local.swarm-runtime loads (plugin list shows it; swarm/post_message/read_board/swarm_wait are live and setup completed, so /swarm + /swarm-models registered via ctx.command.transform). Baseline `bun test`: 22 pass / 0 fail. Repro harness in %TEMP%\swarm-probe.ts and %TEMP%\swarm-probe2.ts (outputs %TEMP%\swarm-probe-out.json, %TEMP%\swarm-probe2-out.json). No product edits; temp only.

BLOCKERS

[B1] Reload/restart mid-swarm kills the swarm and leaves the coordinator edit-denied forever.
Files: db.ts:251-287 (reconcile), db.ts:258 (same-PID not skipped), plugin.ts:84-93 (restore gated on ctx.sessionID), @opencode/plugin Context has no sessionID, plugin.ts:182-189 (edit deny persisted).
User sees: after `opencode reload`/app restart during a swarm, workers stop, board says interrupted, and the main chat still rejects edits/writes with "[SWARM] @coordinator delegates edits to workers while swarm '…' is 'running'." `swarm complete` then says "Session is not part of an active swarm." Only a new chat escapes.
Repro: start any swarm -> `opencode reload` -> edit a file in the coordinator chat. Same-process setup also reconciles a live swarm because owner_pid === process.pid is not skipped.
Fix: skip reconcile when owner_pid === process.pid; persist coordinator session IDs and clear/restore their permissions in reconcile; prefer ask/plugin-evaluated rules over a persisted hard deny.

[B2] Work in share/branch workspaces is lost on kill/complete; branch mode creates the branch inside the clone, so cleanup deletes the branch itself.
Files: workspace.ts:59-68 (clone + checkout -b inside clone), workspace.ts:71-102 (cleanup deletes dir only), plugin.ts:833-868 (complete), plugin.ts:738-781 (kill).
User sees: worker reports done; the user's working tree is unchanged; the worktree/clone disappears. For share, `git worktree remove --force` discards uncommitted changes (branch may survive); for branch, the branch existed only in the clone, so changes and branch are gone.
Repro: add name:w workspace:"branch" -> edit -> complete; `git branch -a` has no swarm/... branch and the clone is removed. Same with share + an uncommitted edit.
Fix: commit pending work before cleanup (or refuse when dirty); create branch work in the base repo or push/cherry-pick back; merge or report the branch + merge command on complete.

MAJOR

[M1] New members get two queued prompts.
Files: plugin.ts:461 (announcement post), plugin.ts:193-243 (wakeMember prompts), plugin.ts:463-478 (opening prompt).
User sees: the first turn is only "[SWARM BOARD WAKE-UP] @w brief" (no role rules/owned globs/channels); the full opening prompt is queued as a second turn. Extra tokens, duplicated work, or a worker that calls swarm_wait on turn 1 and never sees the opening prompt until woken.
Repro: swarm-probe2-out.json shows prompts[1]=WAKE-UP, prompts[2]=opening for the same new session after one add.
Fix: do not wake the just-created member (exclude set or wait state), post after the opening prompt, or merge the brief into one prompt.

[M2] Invalid variants are accepted on models whose catalog variants list is empty.
Files: models.ts:159-172, esp. models.ts:167 (match.variants.length > 0 guard).
User sees: add model:"opencode/minimax-m3#thinking" or opencode-go/kimi-k2.7-code#high returns ok; status shows the variant; the session ignores it or fails later at the provider. Breaks manual-variant control for toggle-only/fixed models.
Repro: probe B (opencode/minimax-m3#thinking -> ok true). Real catalog: opencode/minimax-m3, opencode-go/kimi-k2.7-code, opencode-go/mimo-v2.6-flash have variants: [].
Fix: if a variant is requested and the model has no variants, reject it ("model has no variants"); skip validation only when no variant is requested.

[M3] roleModels defaults are never validated.
Files: plugin.ts:363-380; models.ts:134-137 (fallback returned untouched).
User sees: a typo/wrong variant in roleModels is accepted; swarm add says ok but the child session is created with a nonexistent model/variant, then never replies or errors at the provider. status displays the bogus model.
Repro: probe C with roleModels.worker="opencode-go/does-not-exist#max" -> add ok; session.create model = does-not-exist#max.
Fix: validate every role default at setup/first use and fail the add with the same clear message as explicit models.

[M4] Unregistered sessions are still hard-denied while a swarm is active (the earlier M3 fix only touched execute.before).
Files: plugin.ts:1177-1181 (permission.evaluate fails closed), plugin.ts:1119-1125 (execute.before returns for unregistered).
User sees: a second chat/tab/window in the same project gets "[SWARM] Denied action from unregistered session while an active swarm is running." for every edit/shell/external-directory action. Starting a swarm there is the only escape, which creates a second active swarm (M13).
Repro: probe H, or start a swarm in chat A and edit in chat B.
Fix: enforce only for sessions in the swarm or for targets inside a member's workspace/locks; let unrelated sessions through, or add an explicit join/ignore switch.

[M5] A killed name can never be reused; a working member cannot switch models — so a bad/stuck worker cannot be fixed under its name.
Files: plugin.ts:346-352, db.ts:99 UNIQUE(swarm_id,name), db.ts:74 unused generation, plugin.ts:297-299.
User sees: swarm kill scratch then swarm add name:"scratch" -> "already exists (state: killed). Killed names cannot be reused." (the same text appears when the member is merely waiting — probe I). If the worker is stuck "working", swarm model name:"scratch" refuses too.
Repro: probe D.
Fix: implement generation (unique swarm_id/name/generation, bump on respawn) or update the killed row; include a suggested new name; allow interrupt-then-switch.

[M6] Partial group spawns and failed prompts leave phantom members that block retry.
Files: plugin.ts:650-706 (loop; catch returns ok:false without rollback), plugin.ts:441-458 (lock conflict kills member), plugin.ts:474-478, plugin.ts:704-706.
User sees: add n:3 tasks:[...] owned_globs:["src/**"] -> "File-lock conflict for @wd-2", but wd-1 is live and wd-2 is listed killed; retry collides with wd-1. A child prompt failure -> add says failed, but the member exists waiting and retry says "already exists". An unknown channel leaves an orphan child session/worktree because insertMember's transaction rolls back after session.create.
Repro: probes E and I.
Fix: pre-validate names/locks/models for all shards, insert atomically, roll back on failure, return created names on partial failure; do not apply one owned_globs set to every shard (or accept per-shard globs).

[M7] Quota-paused workers are never woken or retried.
Files: plugin.ts:275-277 (skip paused targets), plugin.ts:1287-1293 (set paused), db.ts:536-547 (only setMemberModel clears), monitor.ts:52-68 (only posts).
User sees: a 429/quota failure silently stops the worker; mentions do nothing; status shows paused_quota true but no error/recovery hint. Only swarm model (clears paused_quota) or kill+respawn recovers.
Repro: simulate session.execution.failed with a 429, then post @worker -> no prompt.
Fix: retry with backoff after the quota window, add swarm resume/retry, or wake on the next mention with a fresh attempt; include last_error in status.

[M8] Wake/prompt failures are swallowed and invisible.
Files: plugin.ts:278-282 (empty catch after wakeMember), plugin.ts:236-242 (state error only), plugin.ts:604-619 and 926-935 (status omits last_error), board-server.ts:238 (UI has lastError).
User sees: post_message returns ok; the mentioned worker never responds; swarm status shows "waiting" with no error. The board UI may show lastError, but the tools/model cannot.
Repro: make ctx.session.prompt throw for the target (probe I), post, then status.
Fix: include wake failures in post_message's result, add last_error to status/read_board status, and post a monitor warning.

[M9] /swarm injects the request as a JSON object string.
Files: plugin.ts:1056 (JSON.stringify(invocation.prompt ?? "")), plugin.ts:1051-1062.
User sees: User request:\n{"text":"fix the failing test\nplease keep it small"} — quoted/escaped, newlines as \n, and attached files/agents become JSON instead of real attachments.
Repro: probe A captured the exact injected text.
Fix: use invocation.prompt.text and forward files/agents/skills to session.prompt; do not stringify.

[M10] Coordinator edits are hard-denied in the user's own chat.
Files: policy.ts:128-134, plugin.ts:46-48/182-189, plugin.ts:1148-1151.
User sees: after the first swarm add/title, every edit/write in the main chat fails with "[SWARM] @coordinator delegates edits to workers while swarm '…' is 'running'." A one-line fix or config edit is impossible until swarm complete (which also wipes session permissions to []).
Repro: probe H (edit -> deny); config allowCoordinatorEdits:false.
Fix: default to allow or ask; add swarm allow-edits on|off, or allow edits outside worker locks; do not wipe pre-existing session permissions on complete.

[M11] No lock release; locks only disappear on kill.
Files: plugin.ts:541-543 (action enum), plugin.ts:818-831 (claim), db.ts:663-669 (release exists but unused).
User sees: a finished worker's globs stay claimed; another worker is refused; the only workaround is swarm kill, which cleans up its workspace (B2).
Fix: add swarm{action:"release", globs} (owner or coordinator) and auto-release on [done]/complete.

[M12] After completion the four tools disagree and add silently starts a new swarm.
Files: plugin.ts:592-596 (status uses getLatestMemberBySession), plugin.ts:917-919 (read_board latest), plugin.ts:888-889 (post_message active), plugin.ts:623-624 (add ensureCoordinator), db.ts:467-478 vs 491-495.
User sees: status still shows the completed swarm and read_board still reads it, but post_message says "Session is not an active swarm member." and swarm_wait fails. swarm add quietly creates sw_<new> instead of adding to the old swarm.
Repro: probe F.
Fix: unify on active membership; return swarm:null / a clear "completed" error for status/read; require an explicit new/title to start after completion.

[M13] Two active swarms are allowed; the board/UI binds to activeSwarms[0] with no ordering.
Files: db.ts:293-297, board-server.ts:179-180, plugin.ts:509-520.
User sees: a second chat/tab starts a swarm; the board and GUI tab may show the older swarm; the monitor handles both; complete in one leaves the other running.
Repro: two coordinator sessions in the same project, swarm add in each, query /api/swarm.
Fix: one active swarm per workspace (or explicit swarmId in the URL/board), order active swarms, scope the board to the caller's swarm.

[M14] Verifier "read-only" is not enforced with shell allow; worker shell allow also bypasses file locks.
Files: policy.ts:33-38/114-119 (verifier shell = policy), policy.ts:145-151 (worker shell returns before edit/lock checks), plugin.ts:1204-1215 (shell allow override), config verifier/worker = allow.
User sees: verifier runs sed -i/git checkout/tests that write, so PASS is not a read-only gate; parallel inherit workers overwrite each other via shell despite owned_globs.
Fix: default verifier/worker shell to ask/deny, run verifier in a read-only worktree, and document (or block) shell-writes in inherit mode.

[M15] Board URL/token rotates and completed/interrupted boards are unreachable; UI/server param mismatch.
Files: board-server.ts:162 (random token), board-server.ts:348-362 (port 0, URL without swarmId), board-server.ts:177-180 (reads swarmId; active only), assets/swarm_board/app.js:51/373 (sends conversationId), preload.js:150-157 (no sidecar.conversationId/fetch).
User sees: after restart/reload the old tab/bookmark is dead; after complete the board says "No swarm in this conversation"; with two swarms it shows active[0]; clicking a member only works embedded in the desktop app (postMessage to parent).
Repro: complete a swarm, reload the same URL -> empty; restart -> new port/token; pass ?conversationId=... -> ignored.
Fix: stable port/token (or write a board URL/state file), include ?swarmId= in open_board, accept both swarmId/conversationId, allow non-active lookup, add a non-iframe fallback for member clicks.

[M16] Stall monitor is suppressed by one active member and stops after 3 unanswered nudges.
Files: monitor.ts:28-46, monitor.ts:38-40.
User sees: one worker streams/works forever while the coordinator and others are idle -> no nudge; or after 3 nudges with no new posts the monitor goes silent even if the swarm later deadlocks at the same head.
Fix: evaluate each member/track independently and nudge about idle members even if another is working; reset the counter on a time window.

[M17] Killed/completed worker sessions point at deleted worktrees.
Files: plugin.ts:765-779 (interrupt + cleanup, no session removal), plugin.ts:833-852, board-server.ts:186 (lists killed), app.js click-to-open.
User sees: clicking a killed/complete member opens a session whose cwd was removed; file tools fail with ENOENT; the session remains in the sidebar.
Fix: archive/remove the child session on kill, or keep the worktree until acknowledged; mark dead sessions non-clickable.

MINOR
- m1 prompts.ts:55 tells workers they may spawn helpers, but plugin.ts:626-628 denies it. Remove the line or allow owner-scoped helpers.
- m2 fork is advertised but always fails: ctx.session.fork is absent from the v2 adapter (plugin.ts:397-401); even 2.3.2 SessionDomain omits fork. Remove from docs/schema or reimplement via session.create.
- m3 plugin.ts:891 marks the author's own track done on any @x [done] substring, including quoting another member.
- m4 /swarm-models says "or manually assign role/member models" but only lists; it omits role defaults/default model (plugin.ts:1066-1080).
- m5 Board server failure is silent: open_board:"" with only a console warn (plugin.ts:499-501); a fixed boardPort conflict looks like "no board".
- m6 Windows: raw git errors (fatal: invalid reference: HEAD) on a repo with no commits (workspace.ts:55,66-67); rmSync cleanup failures leave orphan worktree dirs (workspace.ts:79-99); localhost is accepted by isAllowedHost but the server listens on 127.0.0.1 only, so a manually typed http://localhost:<port> can fail on IPv6-first Windows (board-server.ts:92-100,348).

---

## Workflow addendum - verified reproductions (@workflow-searcher)

_Board #11 - 2026-11-22 11:00_

@coordinator Addendum to #8 — verified repros from %TEMP%\swarm-probe3.ts / swarm-probe3b.ts (same read-only harness):

1) M1 is happening live: this opening prompt arrived as a second queued turn after my first report. The worker's first turn was only the board wake-up with the brief; the full opening prompt came after. That is the double-prompt defect, not a duplicate assignment.

2) B1 verified end-to-end: setup plugin -> swarm add -> status "running" -> call plugin.setup again in the same process (simulated reload) -> status "interrupted" and both coordinator/worker state "killed". So a reload/same-process setup reconciles a live swarm; combined with the missing sessionID restore, the coordinator session stays edit-denied.

3) M13 verified: two coordinator sessions in one host each run swarm add -> DB getActiveSwarms() returns 2 active swarms (sw_e7ee1a76, sw_da1b222f). `/api/swarm` with no param returns the older (A); each session's own status returns its own swarm. The board is ambiguous and must be scoped/ordered.

4) M15 verified: open_board URL is `http://127.0.0.1:<port>/?token=...` — token yes, swarmId no. After complete, `/api/swarm` returns `{swarm:null}` (active-only), while `/api/swarm?swarmId=<id>` still returns the completed swarm. The UI/plugin never puts swarmId in the URL, so a completed/interrupted board is unreachable from the link it gives you.

No product edits; all artifacts in %TEMP%.

---

## Verifier matrix - 12/12 claims confirmed (@verifier)

_Board #12 - 2026-11-22 11:04_

@coordinator Adversarial static verification complete — read-only, no edits/POSTs. Verdict table (all 12 checked against exact code; live-host probes included for #2):

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Clean clone can't load plugin before `bun install` | PASS | src/plugin.ts:1 `import { Plugin } from "@opencode/plugin"` (external dep, package.json:17); root .gitignore:1 `node_modules/` — `git ls-files` shows 0 tracked node_modules files. (Note: dist/gui-experimental.cjs IS committed via .gitignore whitelist.) |
| 2 | GUI/tab not exposed for local-directory plugin | PASS | package.json:6-10 exports ".", "./server", "./gui-experimental" — no "./rpc" (SWARM_RPC_DEF not exported from index.ts:1-9; duplicated into GUI bundle). LIVE HOST: `GET /api/plugin` (97 plugins, service location C:\Users\Hafidh) contains NO local.swarm-runtime; `GET /api/plugin/gui?id=local.swarm-runtime` → HTTP 404 `{"_tag":"PluginNotFoundError","message":"No active plugin with a ./gui-experimental bundle: local.swarm-runtime"}`. Tab/titlebar integration not registered on Desktop 2.3.2 host. Caveat: /api/plugin list is service-level; the plugin is active in project sessions (its policy enforced in this very session), but the GUI registry lookup by id fails regardless. |
| 3 | sandbox config `../tools/swarm-runtime` resolves to nonexistent path | PASS* | sandbox-test-repo/.opencode/opencode.jsonc:3-4 has same path as root config; resolved per the root config's own comment ("resolved relative to this config file", .opencode/opencode.jsonc:8) → sandbox-test-repo/tools/swarm-runtime = nonexistent (dir contains only .opencode + README.md). *If OpenCode instead resolves relative to project root, it would hit the real ../tools/swarm-runtime — static analysis can't fully disambiguate the resolution base. |
| 4 | roleModels pins opencode-go; worker defaults unvalidated | PASS | .opencode/opencode.jsonc:13-19 pins all 5 roles to opencode-go/* models. Worker default: plugin.ts:364-365 only parseModelSpec(roleModels[role]); :380 passes it as fallback → models.ts:134-137 `if (!parsed) return fallback` returns it with NO catalog validation (unlike coordinator default, validated at plugin.ts:145). Typo'd worker default ships straight to spawn. |
| 5 | Board ignores conversationId, uses getActiveSwarms()[0] | PASS | board-server.ts:177-180 reads only `swarmId` param; app.js:372-373 sends `conversationId` (never swarmId) → falls back to activeSwarms[0]. Every conversation's pane shows the same first active swarm; payload also lacks the `member`/`conversationId` fields app.js reads (app.js:379,384). |
| 6 | Completed swarms unreachable from UI | PASS | db.ts:293-297 getActiveSwarms filters status IN ('running','completing'); app.js:373 never sends swarmId so the getSwarm(swarmIdParam) path (board-server.ts:180) is unreachable from the UI. |
| 7 | Overview/Graph/Raw gated off by snapshot mismatch | PASS | app.js gates on snap.graphTab (2108), snap.rawTab (2109), snap.builtinOverview/snap.view.exists (2101-2105); board-server.ts:220-274 payload has none of those, and `view:` is the raw parsed view.json (217,270) not the {exists,json,html,dir,jsonMtime,jsonError} wrapper app.js reads (2104,2145,2251,2270). Graph/Raw always hidden; Overview effectively off. |
| 8 | Reload mid-swarm never clears coordinator edit deny | PASS | Coordinator edit deny persisted at plugin.ts:181-186 (policy.ts:46-47 when allowCoordinatorEdits!==true). Startup reconcile (plugin.ts:77) clears permissions only on `ctx.sessionID` (plugin.ts:83-93) — a field plugin-level Context doesn't carry; the code's own cast `ctx as unknown as { sessionID?: string }` + "Ignore if unsupported or sessionID not present" comment confirms. Old coordinator session's deny survives. |
| 9 | branch-mode work lost on complete | PASS | workspace.ts:60-68: branch checked out only inside dataDir/clones/<swarmId>/<member> clone; no push/merge/fetch anywhere in src. Complete path plugin.ts:846-851 (and kill at :772-775) → cleanupMemberWorkspace = rmSync of clone dir (workspace.ts:71+). |
| 10 | Invalid variants accepted when variants list empty | PASS | models.ts:167 guard `match.variants.length > 0` → any variant accepted on a no-variant model; models.ts:160 `models.length > 0` skips validation entirely on empty catalog. |
| 11 | /swarm injects JSON.stringify(prompt) | PASS | plugin.ts:1056 `const text = JSON.stringify(invocation.prompt ?? "")` → :1059 injects quoted/escaped JSON string into "User request:\n${text}" instead of raw text. |
| 12 | Post-complete inconsistency | PASS | post_message (:888) + swarm_wait (:992) use getActiveMemberBySession → "Session is not an active swarm member." once members are killed (:845,853); status (:593) + read_board (:918) use getLatestMemberBySession → still serve the completed swarm; swarm add (:624) → ensureCoordinator (:134-158) silently creates a brand-new swarm via createSwarmWithCoordinator. |

Score: 12/12 PASS (one asterisked caveat on #3, one resolution-base caveat on #2). No fixes applied, no POSTs made. Live API probes were read-only GETs authenticated from the local service registration file (~/.local/state/opencode/service.json).

---

## Coordinator - deduplicated issue summary

_Board #14 - 2026-11-22 11:04_

[done] Issues audit — user-facing defects. 3 searchers + verifier; 12/12 top claims PASS.

Totals before dedup: onboarding 4 blockers / 12 major / 9 minor; board+GUI 3 blockers / 4 major / 10 minor; workflow 2 blockers / 17 major / 6 minor.

BLOCKERS
- GUI tab/pill/`/swarm-board` never appear: local-directory plugin exposes only `server`; `/api/plugin` reports `features:{server:true}`, `/api/plugin/gui?id=local.swarm-runtime` -> 404 PluginNotFoundError. Package exports `./gui-experimental` but no `./rpc`.
- Clean clone cannot load the plugin before `cd tools/swarm-runtime && bun install` (README treats install as dev-only; node_modules gitignored; failure is silent).
- Board ignores `conversationId`, always shows `getActiveSwarms()[0]`; completed/interrupted swarms unreachable; URL `swarmId` ignored by UI; board blanks after `/swarm complete`.
- Overview/Graph/Raw tabs gated off: snapshot lacks `view.exists`, `graphTab`, `rawTab`, `raw`, `member`; 3 of 5 advertised tabs unreachable (graph/GIF work when forced).
- Reload/restart mid-swarm kills members, leaves coordinator edit-denied forever: reconcile runs even when `owner_pid === process.pid`, and permission restore needs `ctx.sessionID`, which plugin Context does not have.
- `workspace:"branch"` work is lost on complete/kill: branch is created inside the clone, then the clone is deleted; `share` drops uncommitted work via `worktree remove --force`.
- Shipped `roleModels` hard-pins `opencode-go` on all five roles and worker/verifier defaults are never validated; clean machines without that provider fail at first add.

TOP MAJORS
- Board live feed freezes at 500 posts (oldest page, no paging); test codifies 505 head / 500 messages.
- Advertised Members model+variant pickers do not exist; POST endpoints have no client caller.
- Duplicate `#main` tab; unread divider never appears (no `member`); Raw always empty; CSP blocks Google Fonts; standalone worker click is a no-op.
- `/swarm` injects `JSON.stringify(prompt)` (quoted/escaped JSON, attachments lost).
- New members receive two queued prompts (wake-up first, opening prompt second) — reproduced live.
- Invalid variants accepted when a model exposes no variants (minimax/kimi/mimo); `roleModels` typos pass into session.create.
- Coordinator edits hard-denied in the user's own chat while a swarm runs; complete wipes session permissions to [].
- Killed names can never be reused; working members cannot switch model; partial shard spawns leave phantom members/locks; no lock release action.
- Killed/completed sessions point at deleted worktrees; clicking them opens ENOENT sessions.
- Quota-paused workers never retried/woken; wake failures swallowed and missing from status.
- Unregistered sessions still hard-denied in permission.evaluate (second window/tab blocked).
- Two active swarms allowed; board binds to active[0]; post-complete tools disagree (status/read show old swarm, post/wait reject, add silently starts a new one).
- Verifier "read-only" not enforced: config sets verifier+worker shell `allow`, and shell bypasses file locks.
- Sandbox test config path resolves to `sandbox-test-repo/tools/swarm-runtime` (nonexistent).
- Board token/port rotates; completed board links die; `swarmId` missing from open_board.
- Stall monitor suppressed by one working member and stops after 3 nudges.

Docs drift: no start instructions (`/swarm`), no provider/auth/region/training prerequisites, stale model examples (anthropic/openai/glm-4.6), README omits `build:gui`, audit line refs stale, no LICENSE, `opencode` not on PATH on this Windows install.

Full evidence: board #4 (onboarding), #6 (board/UX), #8 + #11 (workflow), #12 (verifier), #13 (this summary). No files edited during the audit.

---

# Consolidated blocker/major list

## Blockers

1. **GUI never loads for a local-directory plugin.** `/api/plugin` reports only `server`; `/api/plugin/gui?id=local.swarm-runtime` returns 404. No titlebar pill, panel tab, `Ctrl+Shift+S`, or `/swarm-board`. Package exports `./gui-experimental` but no `./rpc`. (B2)
2. **Clean clone cannot load the plugin before `bun install`.** `@opencode/plugin` is imported at runtime; `node_modules` is gitignored; README calls install "Development & Tests". Failure is silent because `opencode plugin list` has no status. (B1)
3. **Board is not scoped to the conversation and hides completed swarms.** `conversationId` ignored, always `getActiveSwarms()[0]`; UI never sends `swarmId`; after `/swarm complete` the board shows "No swarm". Two active swarms show the older one. (Board B1/B2, Workflow M13/M15)
4. **3 of 5 advertised tabs are unreachable.** Snapshot omits `view.exists`, `graphTab`, `rawTab`, `raw`, `member`; Overview/Graph/Raw hidden. Graph replay/GIF works when forced. (Board B3)
5. **Reload/restart mid-swarm bricks the coordinator.** Reconcile runs even when `owner_pid === process.pid`; permission restore requires `ctx.sessionID`, absent from plugin Context; coordinator stays edit-denied forever. (Workflow B1)
6. **Isolated work is lost on complete/kill.** `branch` creates the branch inside the clone then deletes it; `share` drops uncommitted changes with `worktree remove --force`. (Workflow B2)
7. **Shipped role defaults pin `opencode-go` and are unvalidated.** All five roles hard-pinned; worker/verifier defaults bypass catalog validation; a machine without the provider fails at first `add`. (Onboarding B4, Workflow M3)

## Majors (deduplicated)

- README never says to run `/swarm`; the coordinator protocol only arrives via that command.
- Coordinator edit deny + worker "no locks" deny are undocumented; basic `add` workers cannot edit.
- `fork` is advertised but always fails on every v2 host.
- Desktop-GUI-only features are documented as universal; restart requirement buried.
- Host requirement ambiguous (CLI 2.2.6 vs Desktop CLI 2.3.2); `opencode` not on PATH on this Windows install.
- Provider/auth/Console-region/training prerequisites undocumented; contributor models imply consent.
- Isolation claims overstated: default `inherit`; `share`/`branch` see committed HEAD only.
- Board token/port rotate; bookmarks die; `open_board` has no `swarmId`; failures are silent (empty URL).
- Stale model examples (`anthropic/*`, `openai/gpt-5.4`, `glm-4.6`) not in catalog.
- Verifier is not read-only in shipped config (`verifierShellPolicy: "allow"`); shell bypasses edit locks.
- Board feed freezes at 500 posts (oldest page, no paging).
- Members Model/Variant pickers promised but absent; POST endpoints have no client caller.
- Unread divider never appears (`member` missing).
- Duplicate `#main` channel tab.
- New members get two queued prompts (wake-up, then opening prompt).
- Invalid variants accepted when a model exposes no variants.
- `/swarm` injects `JSON.stringify(prompt)` instead of text; attachments lost.
- Unregistered sessions still hard-denied in `permission.evaluate` (second window/tab).
- Killed names cannot be reused; working members cannot switch model.
- Partial shard spawns leave phantom members/sessions/locks.
- Quota-paused members never retried/woken.
- Wake failures swallowed; `status` omits `last_error`.
- No lock-release action; locks persist until kill.
- After complete, `status`/`read_board` show the old swarm while `post_message`/`swarm_wait` reject and `add` silently starts a new swarm.
- Two active swarms allowed; monitor/board/UI ambiguity.
- Stall monitor suppressed by one working member; stops after 3 nudges.
- Killed/completed sessions point at deleted worktrees (ENOENT on click).
- `sandbox-test-repo` config points at a nonexistent path and is not its own Git repo.
- Board failure is silent; fixed-port conflicts look like "no board".

## Minors

CSP blocks Google Fonts; Raw tab always empty; standalone member click does nothing; postMessage uses `'*'` and checks origin only; empty-state copy wrong; killed members counted live; poll errors show "Reconnecting" forever; every poll recomputes graph+catalog; phantom `@opencode` mentions from package paths; Members rows are mouse-only; legacy Antigravity sidecar assets shipped/served; `opencode plugin list` has no health status; PowerShell shows a red tsc banner; no LICENSE; audit line refs stale; helper-spawn promise contradicts policy; `done` substring can mark the author done; `/swarm-models` overclaims; Windows no-commit/lock/`localhost` edge cases.

## Fix order

1. GUI plugin packaging (named package / root `gui-experimental.cjs` + `rpc` export) and verify `features:{server,gui,rpc}`.
2. Install prerequisite + loud startup failure; fix sandbox path.
3. Conversation-scoped, any-status board resolution; include `swarmId`/`conversationId` in `open_board`.
4. Snapshot contract (or remove dead tabs) + 500-post paging.
5. Reconcile same-PID/owner handling and coordinator permission restore.
6. Preserve isolated work (commit/merge/report before cleanup).
7. Unpin/validate role models; validate empty-variant requests.
8. Docs: `/swarm` start, permissions, provider/auth/region, GUI-only flags, current model examples.
9. Shell policy: verifier `ask`/`deny` unless explicitly opted out.
10. Lifecycle: names/generations, partial-spawn rollback, lock release, quota retry, post-complete consistency, single active swarm.
