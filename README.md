# OpenCode Swarm Runtime (1:1 Antigravity Swarm Mode)

A 1:1 recreation of **Antigravity Swarm Mode** for **OpenCode v2** (`@opencode/plugin@2.3.2`) with **manual model & variant selection**, real Git worktree/clone isolation, multi-channel board routing, stall monitoring, and a realtime Swarm Board Web UI.

## Core Tools (4 Primitives)
- `swarm` — `status`, `models`, `add` (single or sharded via `n`/`tasks`, `workspace: "inherit" | "share" | "branch"`, `fork`, `channels`), `model` (live in-place switch preserving history), `kill`, `title`, `channel` (`create|subscribe|unsubscribe|list|archive`), `claim`, `complete`.
- `post_message` — post `text` to a `channel` with `@name`, `@prefix`, `@all`, and `@#channel` wakeups.
- `read_board` — read `#seq` posts (`since`, `limit`, `channel`, `status`).
- `swarm_wait` — sleep at 0 tokens until woken (`since`, `mentions_only`).

## Manual Model & Variant Selection
Models and variants are **never** auto-selected. By default, workers inherit the coordinator's model and variant. You can manually pick them in 4 ways:
1. **Tool:** `swarm{action:"models"}` to list available models + `variants[]`, then `swarm{action:"add", model:"provider/model#variant"}` or `swarm{action:"model", name:"parser", model:"provider/model", variant:"high"}`.
2. **Slash Command:** `/swarm-models` to inspect available models and variants.
3. **Swarm Board Web UI:** Open the `open_board` URL -> **Members** tab -> use the **Model** and **Variant** dropdowns to switch any waiting member live.
4. **Config (`opencode.jsonc`):** Set `options.roleModels` (e.g. `"worker": "anthropic/claude-sonnet-4-6#high"`). A `"coordinator"` entry is applied by switching the coordinator's own session model when the swarm is first created.

## Development & Tests
```bash
cd tools/swarm-runtime
bun install
bun run typecheck
bun test
```
