# Antigravity Swarm Mode 1:1 Blueprint for OpenCode v2

## 1. Core Tools (4 Primitives)
- `swarm`:
  - `status`: list every member, model + variant, workspace, channels, and state (`waiting`, `working`, `stopped`, `killed`).
  - `models`: list available providers, models, and supported `variant` values (e.g. reasoning effort tiers) for manual selection.
  - `add`: spawn a worker (or sharded group via `n` / `tasks`), optionally with `model`, `variant`, `workspace` (`inherit` | `share` | `branch`), `fork`, and `channels`.
  - `model`: switch a `waiting` worker (or coordinator) to another `model` / `variant` in-place while preserving conversation history.
  - `kill`: permanently terminate a worker and clean up its workspace.
  - `title`: name the swarm.
  - `channel`: `create` | `subscribe` | `unsubscribe` | `list` | `archive`.
- `post_message`: post `text` (optionally to `channel`) with `@name`, `@prefix`, `@all`, `@#channel` wakeups.
- `read_board`: read append-only `#seq` posts (`since`, `limit`, `channel`, `status`) and advance `last_read_seq` cursors.
- `swarm_wait`: sleep at 0 tokens until woken (`since`, `mentions_only`).

## 2. Manual Model & Variant Selection
- Never auto-select models or variants unless the user specifies them (default inherits coordinator's model + variant).
- `swarm{action:"models"}` enumerates providers, models, and supported `variant` values.
- `swarm{action:"add", model, variant}` pins a worker to a chosen model + variant.
- `swarm{action:"model", name?, model, variant?}` switches a waiting member's (or coordinator's) model/variant in-place while preserving conversation history.

## 3. Isolation & Topology
- `workspace`: `"inherit"` | `"share"` (Git worktree) | `"branch"` (isolated clone), plus optional file-lock enforcement as defense-in-depth.
- `fork`: `"<member>"` | `"coordinator"` to branch a new worker from warm conversation history.
- Sharded spawning: `n` copies or `tasks` array -> `<name>-1`..`<name>-<k>`, group addressing `@<name>` and `kill{name:"<name>"}`.
- Worker-spawned helpers: workers can `add` helpers and `kill`/`model` only helpers they added.
- Multi-channel board: `main` + `#area` channels, `@#channel` cross-channel wakeups.

## 4. Roles & Realtime Board UI
- `@monitor`: timer-based stall watchdog, cites `#seq`, distinguishes unaddressed results, unanswered `@mentions`, and chains; goes dormant on `[done]`.
- `@narrator`: maintains `plan.json` + `view.json` (Overview threads, workstreams, attention items, milestones, risks, feedback loop).
- Realtime **Swarm Board Web UI**: Overview, Board feed (`#seq` pills, unread divider, filters), Members tab (status, activity, steps, unread), Mention Graph (replay + GIF export), Raw tab.

## Verified Antigravity Compiled Parity & Limits (`language_server.exe`)

Static binary analysis of Antigravity's `language_server.exe` (`exa.cortex.native_swarm`, Go 1.28) verified the following compiled constants and behaviors:

- **Board & tool limits:** `60` posts/min steady `1.0/s` rate limit, `65,536` bytes max post, `262,144` bytes max brief, `1,024` bytes max channel topic (no `@` or newlines), `1–24` char channel names (`[a-z][a-z0-9-]{0,23}`), reserved `^(narrator|monitor)(?:-\d+)?$` member names, no hardcoded worker cap in `add`.
- **Guards & notifications:** `swarm_park_guard` blocks parking past unread posts; `post_message` warns on unknown/archived `@#channel` mentions; quota pauses/resumes emit `[quota]` board notices; `n` must match `len(tasks)` when both are passed.
- **Non-git `workspace:"branch"`:** Bounded directory copy with fork marker (`.jetski-dircopy` in Antigravity, `.swarm-dircopy` in `opencode-swarm`); Antigravity compiles `100,000` entries / `4 GiB`, while `opencode-swarm` defaults to `5,000` entries / `256 MiB` (configurable via `branchCopyMaxEntries` / `branchCopyMaxBytes`).
- **Sidecar UI polling:** `POLL_MS = 1500` active / `IDLE_POLL_MS = 3000` idle in `assets/swarm_board/app.js`.
- **Spanner backend:** Multi-node Spanner boards are compiled out of Antigravity's public desktop build; `opencode-swarm` targets local SQLite + JSONL mirrors.
