# opencode-swarm

Swarm runtime plugin (see root README for full docs).

## Config

- `autoSpawnVerifier` (default `true`): when all worker tracks are done and no verification ran, auto-spawn a `verifier` (or send one `[verify]` request to the idle verifier) before any coordinator `complete` handoff. Set `options.autoSpawnVerifier = false` to disable.
