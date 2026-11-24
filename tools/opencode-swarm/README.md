# opencode-swarm

The runtime package behind this repo's swarm mode: four tools (`swarm`, `post_message`, `read_board`, `swarm_wait`), a SQLite board, Git worktree/clone isolation, a stall monitor, slash commands, and the OpenCode Desktop GUI bundle.

Plans are stored as unit rows in `swarm_tasks`: `add` assigns units to workers and reports coverage counts, and the monitor emits `@coordinator [coverage]` nudges when units are left unassigned.

Start at the [root README](../../README.md) for what a swarm is and how to use one. For install options and per-OS paths, see [docs/INSTALL.md](../../docs/INSTALL.md).

## What's here

| Path | Purpose |
| --- | --- |
| `index.ts` | Plugin entry point. |
| `src/tools.ts` | The four tools and their actions. |
| `src/plugin.ts` | Lifecycle, slash commands, startup recovery, data paths. |
| `src/workspace.ts` | Worktree (`share`) and clone (`branch`) provisioning. |
| `src/board-server.ts` | Local board HTTP server on `127.0.0.1` with a bearer token. |
| `src/db.ts` | SQLite schema, locks, mirrors. |
| `src/gui.tsx`, `src/gui/` | Desktop surfaces; built to `dist/gui-experimental.cjs`. |

## Options

Set these under the plugin entry's `options` in `opencode.json` / `opencode.jsonc`.

| Option | Default | Effect |
| --- | --- | --- |
| `stallTimeoutMs` | `180000` | Idle time before a stall nudge. |
| `monitorIntervalMs` | `30000` | Monitor check interval. |
| `allowCoordinatorEdits` | `false` | Allow coordinator file edits. |
| `overrideShellAllow` | `true` | Coordinator shell resolves to `allow` unless overridden. |
| `coordinatorShellPolicy` | `"allow"` or `"ask"` | Explicit coordinator shell policy. |
| `workerShellPolicy` | `"ask"` | Worker shell policy; `"deny"` is safer without isolated workspaces. |
| `verifierShellPolicy` | `"ask"` | Verifier shell policy; `"deny"` keeps it read-only. |
| `roleModels` | `{}` | Per-role `provider/model#variant` defaults. |
| `boardServer` | `true` | Serve the board UI. |
| `boardPort` | `0` | Board port; `0` = ephemeral. |
| `dbPath` | unset | Explicit SQLite path. |
| `autoSpawnVerifier` | `true` | Spawn/wake a verifier when worker tracks finish. |
| `maxWorkers` | `6` | Maximum live workers; extra units are grouped by area. |
| `maxShardsPerAdd` | `8` | Maximum members per `add`; larger batches split into sequential groups. |
| `quotaResumeDelayMs` | `30000` | Base backoff delay in ms before auto-resuming a quota-paused member (max 3 attempts). |
| `branchCopyMaxEntries` | `5000` | Max file/dir entries when copying a non-git workspace in `branch` mode. |
| `branchCopyMaxBytes` | `268435456` | Max total bytes (256 MiB) when copying a non-git workspace in `branch` mode. |
| `debugEvents` | `false` | Log events to `events.debug.jsonl`. |
| `debugHooks` | `false` | Log hooks to `hooks.debug.jsonl`. |

## Scripts

| Script | Does |
| --- | --- |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun test` | Bun test suite. |
| `bun run build:gui` | Builds `dist/gui-experimental.cjs`. |
| `bun run install:plugin` | Installs deps, builds if needed, registers the global config. |
| `bun run uninstall:dry-run` | Lists what uninstall would remove. |
| `bun run uninstall` | Removes registration, workspaces, runtime data, artifacts. |

The GUI bundle is **committed**. Editing anything under `src/gui.tsx` or `src/gui/` changes nothing in the running app until you run `bun run build:gui` and restart OpenCode Desktop.
