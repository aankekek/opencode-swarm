# Issue artifacts - 2026-11-22

Findings for `tools/swarm-runtime` and the repo-root OpenCode config. This folder was renamed from `docs/audit` to `docs/issues`.

| File | Purpose |
|---|---|
| [`2026-11-22-user-issues.md`](./2026-11-22-user-issues.md) | User-facing issue audit (install, GUI, board, workflow, docs) - full reports + consolidated list |
| [`2026-11-22-user-issues.json`](./2026-11-22-user-issues.json) | Machine-readable version (7 blockers, 29 majors, 20 minors) |
| [`2026-11-22-concurrency-state-contract-audit.md`](./2026-11-22-concurrency-state-contract-audit.md) | Concurrency/state/contract audit - 11 defects, 10 invariants (full reports + consolidated list) |
| [`2026-11-22-concurrency-state-contract.json`](./2026-11-22-concurrency-state-contract.json) | Machine-readable version (5 concurrency, 2 state, 4 contract) |
| [`2026-11-22-swarm-runtime-audit.md`](./2026-11-22-swarm-runtime-audit.md) | First audit: internal security/runtime/compatibility reports |
| [`2026-11-22-findings.json`](./2026-11-22-findings.json) | Machine-readable version of the first audit (48 items) |
| [`2026-11-22-fix-status.md`](./2026-11-22-fix-status.md) | What the dev/fixer hardening update fixed and what remains |

**First audit counts:** 1 critical, 11 high, 12 medium, 23 low/minor.
**User-issues pass:** 7 blockers, 29 major, 20 minor. Verifier confirmed 12/12 top claims.
**Concurrency/state/contract pass:** 11 genuine defects (5 concurrency, 2 state, 4 contract). Verifier: 9 PASS, 1 PARTIAL, 0 FAIL.

**Current baseline:** `bun install` 398 packages; `bun run typecheck` clean; `bun test` 24 pass / 0 fail; `bun run build:gui` 21.83 kB.

## Top blockers

1. GUI tab/pill/`/swarm-board` never loads for a local-directory plugin (`features` = server only; `/api/plugin/gui` 404).
2. Clean clone cannot load the plugin before `cd tools/swarm-runtime && bun install`.
3. Board ignores `conversationId`, hides completed swarms, and binds to `activeSwarms[0]`.
4. Overview / Graph / Raw tabs are gated off by a snapshot-contract mismatch.
5. Reload/restart mid-swarm leaves the coordinator edit-denied forever.
6. `branch`/`share` work is deleted on complete/kill.
7. Shipped `roleModels` pin `opencode-go` and worker defaults are not validated.

## Still open from the first audit

`SEC-H3` (MCP tool names), `SEC-H6` (subscribe/unsubscribe), `RT-H3` (unauthenticated GET), `COMPAT-1` (fork), `COMPAT-3`, `COMPAT-5`, `COMPAT-6`.

**Config note:** `overrideShellAllow: true` with worker/verifier shell `allow` means shell is intentionally unrestricted; revert to `ask`/`deny` for verifier read-only semantics.
