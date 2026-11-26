# Antigravity swarm sidecar (reference only)

These files are Antigravity's own native-swarm sidecar, kept as the reference
for the board payload this plugin reproduces. They are **not built, imported or
served** by `opencode-swarm`.

- `main.mjs` — the sidecar HTTP server. Its `readView()` and snapshot builder
  define the `/api/swarm` shape (`view`, `raw`, `urlHosts`, `frames`) that
  `src/board-snapshot.ts` ports and `test/board-contract.test.ts` pins.
- `channels.mjs` — channel and mention helpers imported by `main.mjs`.
- `package.json` — marks this directory as ESM so the two modules can still be
  read/run with Node.

They used to live in `assets/swarm_board/`, which the board server serves
statically, so the sidecar source was reachable over HTTP on the board port.
The pane files that are actually served (`app.js`, `hive.js`, `index.html`,
`styles.css`, `hive.css`, `gif.js`, `narrator_bootstrap.js`) remain there.
`sidecar.json` (Antigravity's app manifest, naming `SWARM_*` flags this plugin
does not implement) was deleted.
