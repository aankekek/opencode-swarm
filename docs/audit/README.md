# Audit artifacts - 2026-11-22

Swarm Runtime audit (`tools/swarm-runtime`, OpenCode v2 plugin).

| File | Purpose |
|---|---|
| [`2026-11-22-swarm-runtime-audit.md`](./2026-11-22-swarm-runtime-audit.md) | Full audit reports preserved from the shared board (#4 runtime, #6 compatibility, #8 security, #13 verifier, #14 summary) |
| [`2026-11-22-findings.json`](./2026-11-22-findings.json) | Machine-readable findings (48 items) for a fixer harness |

**Counts:** 1 critical, 11 high, 12 medium, 23 low/minor, plus 1 dead-feature compatibility item.

**Baseline:** `bun run typecheck` clean; `bun test` 10 pass / 0 fail. Critical paths remain untested.

**Do not trust the green suite.** Start with `SEC-C1`, `SEC-H6`, `SEC-H3`, `SEC-H1`/`COMPAT-1`, then `SEC-H4`, `SEC-H5`, `RT-H3`, `RT-H2`, `RT-H1`, `SEC-H7`.

> Note: the coordinator session that produced this audit is left edit-denied by `SEC-H7`; a fixer must run in a fresh session/harness.
