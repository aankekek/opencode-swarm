# OpenCode Desktop GUI Integration (`opencode-swarm`)

The `opencode-swarm` plugin provides a native SolidJS OpenCode Desktop GUI (`dist/gui-experimental.cjs`) built with `@opencode/plugin/gui`, `ctx.ui.*`, `solid-js`, and `effect` (`Schema` for `ctx.storage.store`).

## Surfaces

- **Swarm Side Tab (`Panel`, `region: "side"`)**: Lazy-loaded via Solid `lazy()`. Embeds the Pixel-Bee Web View (`boardUrl` iframe) with live theme synchronization (`swarm:theme`), click-to-open member sessions (`swarm:open_session`), a swarm history switcher (`listSwarms`), Refresh button, Settings shortcut, and a confirmed Complete Swarm dialog (`ctx.dialogs.open` + `ctx.ui.Dialog`).
- **Titlebar Pill (`TitlebarItem`)**: Displays `🐝 Swarm: Buzzing (N active · P posts)` or `🐝 Swarm: Dozing` (plus warning indicator when `paused_quota` or `stalled`). Clicking toggles/focuses the Swarm side tab.
- **Composer Pill (`ComposerPill`)**: Compact pill above the message box showing Buzzing/Dozing status with `tone: "warning" | "danger"` and opening the Swarm Control overlay.
- **Bottom Strip (`Slot` at `"window.bottom"`)**: Optional one-line summary bar, hidden when the side panel is visible unless `withSidePanel` is enabled.
- **Settings (`SettingsPage` `"Swarm Board"`)**: Persists `sidebarShow`, `pillbarShow`, `showWhenIdle`, `composerPill`, `bottomStrip`, `withSidePanel`, and `toastEnabled` in `ctx.storage.store`, plus toggles `Auto-spawn verifier` via `local.opencode-swarm` RPC.
- **Commands & Menu**: `Open Swarm Board` (`mod+shift+s`, `/swarm-board`) and `session.panel` menu item.

## Development

```bash
bun run build:gui
bun run dev:gui
bun test test/gui-bundle.test.ts
```
