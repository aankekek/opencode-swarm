# OpenCode Desktop v2 Native Tab Integration

`tools/swarm-runtime` exports `./gui-experimental` (`dist/gui-experimental.cjs`) built with `@opencode/plugin/gui/vite`.

## How to Open the Swarm Board in OpenCode v2
1. **Titlebar Pill:** Click **Swarm** in the OpenCode Desktop v2 titlebar.
2. **Side Panel `+` Menu:** Click `+` before the side panel tabs -> **Swarm**.
3. **Keyboard Shortcut / Slash Command:** Press `Ctrl+Shift+S` (`Cmd+Shift+S` on macOS) or run `/swarm-board`.

## Features
- **Authenticated RPC Bridge (`src/rpc.ts`):** Queries `local.swarm-runtime` `getBoardInfo` for the live `127.0.0.1` board URL + per-start bearer token.
- **Full Antigravity Pixel-Bee UI:** Embeds the 5-tab Swarm Board (Overview, Board, Members with manual Model + Variant pickers, Graph with Replay & GIF89a export, Raw).
- **Click-to-Open Worker Session:** Clicking a worker in the Swarm Board posts `swarm:open_session` to the parent OpenCode window, which verifies the origin and opens/focuses that worker's session tab via `ctx.tabs.open(..., { focus: true })`.
