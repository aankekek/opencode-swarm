# OpenCode Desktop GUI Integration (`swarm-runtime`)

The `swarm-runtime` plugin provides a native SolidJS OpenCode Desktop GUI (`dist/gui-experimental.cjs`) built with `@opencode/plugin/gui`, `ctx.ui.*`, `solid-js`, and `effect` (`Schema` for `ctx.storage.store`).

## Surfaces

- **Swarm Side Tab (`Panel`, `region: "side"`)**: Lazy-loaded via Solid `lazy()`. Includes a swarm history switcher (`listSwarms`), Refresh button, optional Pixel-Bee Web View (`boardUrl` iframe), and three native `ctx.ui.Tabs` sub-tabs:
  - **Board**: Chronological `board_posts`, author badge, highlighted `@mentions`, timestamps, `@handle` filter, and auto-scroll toggle.
  - **Members**: Roster (`@coordinator`, workers, `@verifier`) with state dot/tag, model + variant, track status, owned globs, click-to-open session (`ctx.tabs.open`), and confirmed Kill Member / Complete Swarm actions (`ctx.dialogs.open` + `ctx.ui.Dialog`).
  - **Locks / Graph**: Active `file_locks` table (`glob` -> `@owner`) and mention/handoff flow list.
- **Titlebar Pill (`TitlebarItem`)**: Displays `Swarm: N active · M waiting · P posts` (plus warning indicator when `paused_quota` or `stalled`). Clicking toggles/focuses the Swarm side tab.
- **Composer Pill (`ComposerPill`)**: Compact pill above the message box showing active handles or verifier status with `tone: "success" | "warning" | "danger"`.
- **Bottom Strip (`Slot` at `"window.bottom"`)**: Optional one-line summary bar, hidden when the side panel is visible unless `withSidePanel` is enabled.
- **Settings (`SettingsPage` `"Swarm Board"`)**: Persists `sidebarShow`, `pillbarShow`, `composerPill`, `bottomStrip`, `withSidePanel`, and `toastEnabled` in `ctx.storage.store`.
- **Commands & Menu**: `Open Swarm Board` (`mod+shift+s`, `/swarm-board`) and `session.panel` menu item.

## Development

```bash
bun run build:gui
bun run dev:gui
bun test test/gui-bundle.test.ts
```
