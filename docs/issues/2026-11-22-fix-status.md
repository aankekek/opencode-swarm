# Fix status - 2026-11-22 (after dev/fixer update)

Verified against commits `009c33a` (harden swarm runtime, pixel-bee UI, v2 tab) and `03b1924` (rpcID / Panel.list / preload token).

## Reinstall / build verification

| Step | Result |
|---|---|
| `bun install` | 398 packages checked, no changes |
| `bun run typecheck` | exit 0, no diagnostics |
| `bun test` | **22 pass / 0 fail**, 147 assertions, 5 files, ~1.5 s |
| `bun run build:gui` | `dist/gui-experimental.cjs` 4.01 kB (gzip 1.87 kB) |
| `opencode reload` + `plugin list` | `local.swarm-runtime` loads |
| Board auth probe | foreign Host 403, POST no token 401, text/plain 415, evil Origin 403 |

## Fixed

| ID | Evidence |
|---|---|
| SEC-C1 | Role allow-list (`plugin.ts:635-643`) + strict default deny (`policy.ts`); tests |
| SEC-H1 | Fork coordinator-only, coordinator target rejected (`plugin.ts:383-399`) |
| SEC-H4 | `lstatSync` ancestor walk; dangling-symlink test |
| SEC-H5 | Glob length 256 / `**` max 8 / no `**/**`; segment matcher; ReDoS test |
| SEC-H6 | `add`, `title`, `channel create/archive`, `claim` gated; role/action tests |
| SEC-H7 | `complete` clears coordinator permissions (`plugin.ts:857-866`) |
| SEC-M1 | No locks -> edit denied; outside owned globs -> denied |
| SEC-M3 | Unregistered sessions no longer blocked (`plugin.ts:1120-1125`) |
| SEC-M4 | Missing sessionID fails closed for write/shell |
| SEC-M5 | `git clone --dissociate` |
| SEC-M6 | Cleanup steps isolated; always `worktree prune --expire now` |
| RT-H1 | Reconcile marks members `killed`; restart test |
| RT-H2 | `server.once("error")` reject; EADDRINUSE test |
| RT-H4 | Dead-owner locks stolen in transaction; test |
| RT-M1 | `head` from `getLatestPost`; >500-post test |
| RT-M2 | Channel isolation on read/post/channel ops |
| RT-M3 | Waiter returns instead of double-wake; fallback feed channel-filtered |
| RT-M4 | Stale `working` detected via `last_active_at` |
| RT-M5 | Monitor nudges bypass `paused_quota` |
| RT-M6 | `owner_pid` liveness check; live owner swarms not reconciled |
| SEC-L7 | `..`-prefix check fixed |
| SEC-L10 | `extractTargetPaths` covers file/destination/to/from + arrays; test |
| SEC-L12 | `tools/swarm-runtime/nul` removed |
| COMPAT-2 | Activity label via `pendingCalls` (`plugin.ts:1297`) |
| COMPAT-7 | 5 test files incl. board-server, GUI bundle, role gates, symlink, ReDoS |

## Partial / residual

| ID | Status |
|---|---|
| SEC-H2 | Coordinator shell is now explicit (`coordinatorShellPolicy`), but config sets `overrideShellAllow: true` + `workerShellPolicy: "allow"` + `verifierShellPolicy: "allow"`, so coordinator/worker/verifier can shell (and shell-write). Intentional config choice; document it. |
| SEC-H3 | Read-only roles deny known write/shell names and names containing write/edit/exec; an MCP tool like `mcp_filesystem_move` or `mcp_filesystem_createDirectory` still bypasses. Prefer a per-role tool allow-list. |
| SEC-H6 | `channel subscribe/unsubscribe` still has no caller-role gate. |
| RT-H3 | POSTs require bearer + JSON + Origin/Host checks, but `GET /api/swarm` and static assets are still unauthenticated (localhost + Host/Origin only). A local process can read board state; browser DNS-rebinding is blocked by the Host check. |
| COMPAT-1 | `fork:` is gated but still non-functional on v2 (no `ctx.session.fork` in the adapter); remove or reimplement. |
| COMPAT-3 | Coordinator model still persisted before `switchModel` succeeds (`plugin.ts:157-176`). |
| COMPAT-5 | Typecheck still uses installed 2.3.2 types + `skipLibCheck`. |
| COMPAT-6 | Root `@opencode/plugin` import still pulls schema/effect into the host. |
| SEC-L1..L6, L8, L9 | L3 (64 KB cap + CSP) fixed/tested; re-check the rest individually. |

## New surface added by the fixer

- Pixel-bee Swarm Board UI under `tools/swarm-runtime/assets/swarm_board/`
- Authenticated RPC bridge `src/rpc.ts`; GUI export `./gui-experimental` -> `dist/gui-experimental.cjs`
- Desktop v2 integration: titlebar Swarm pill, panel `+` menu, `Ctrl+Shift+S`, `/swarm-board`, click-to-open worker session
- `overrideShellAllow` option (default `true`) and `coordinatorShellPolicy`

> Note: the desktop GUI tab requires a restart of the OpenCode Desktop app; `opencode reload` only reloads the server plugin.
