# Installing OpenCode Swarm

Long form of the install options in the [root README](../README.md). Pick one option, then run the checks at the end.

## Before you start

- **OpenCode v2** using `@opencode/plugin@2.3.2`.
- **Bun** on your `PATH` (`bun --version`).
- **Git** if you want isolated workspaces (`share` or `branch`).
- A checkout of this repo. The plugin lives in `tools/opencode-swarm`.

Config file locations:

| OS | Global config |
| --- | --- |
| Windows | `%USERPROFILE%\.config\opencode\opencode.json` |
| macOS / Linux | `~/.config/opencode/opencode.json` |

The project file is `.opencode/opencode.jsonc` at the repo root.

The `plugins` array accepts either a plain string path or an object with `package` and `options`. The installer writes the object form because it carries options.

## Option A — global, one command

```bash
cd tools/opencode-swarm
bun run install:plugin
```

What the script does:

1. Runs `bun install` if `node_modules` is missing.
2. Runs `bun run build:gui` if `dist/gui-experimental.cjs` is missing, or always when you pass `--rebuild` (`bun run install:plugin --rebuild`).
3. Adds or updates one entry in the global config, pointing `package` at this folder's absolute path.
4. Prints the config path it touched.

If an existing opencode-swarm entry is found, it is replaced in place and its `options` are preserved. If none exists, a new entry with `{ "overrideShellAllow": true, "boardServer": true }` is appended. The file is created if missing.

Then **fully quit and reopen OpenCode Desktop**. Use Quit, not "reload window".

## Option B — global, by hand

Build once:

```bash
cd tools/opencode-swarm
bun install
bun run build:gui
```

Edit the global config (create it if absent):

```jsonc
// Windows: %USERPROFILE%\.config\opencode\opencode.json
// macOS/Linux: ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "C:/Users/you/Desktop/Swarm for opencode/tools/opencode-swarm",
      "options": {
        "stallTimeoutMs": 180000,
        "monitorIntervalMs": 30000,
        "overrideShellAllow": true,
        "boardServer": true,
        "boardPort": 0
      }
    }
  ]
}
```

`package` is an absolute path to the plugin folder (the one containing `package.json`), not to `index.ts`. Forward slashes are fine on Windows. Restart the app.

## Option C — project only

```jsonc
// .opencode/opencode.jsonc — resolved relative to this file
{
  "plugins": [
    {
      "package": "../tools/opencode-swarm",
      "options": { "overrideShellAllow": true, "boardServer": true }
    }
  ]
}
```

This registers the plugin for this repo only. The tools and board server work. The **desktop tab, pills, and Settings page need the global entry** in current builds, so use this together with A, B, or D if you want the UI.

## Option D — global + project

Install globally (A or B), then add the project entry (C). OpenCode reads both. For that repo, **project options win** over global options; the global entry is what lets the desktop GUI load. This is the setup used by this repo's own `.opencode/opencode.jsonc`.

## Option E — another folder or clone

Copy or clone the repo anywhere, then point both paths at that location:

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/clone/tools/opencode-swarm",
      "options": { "boardServer": true }
    }
  ]
}
```

Run `bun install && bun run build:gui` inside that folder once. Nothing is published to a registry, so the built `dist/gui-experimental.cjs` must exist locally.

## Which config wins

- The global entry loads the plugin and the desktop GUI for every workspace.
- A project entry adds the plugin for that repo and its `options` override the global ones for that repo.
- Avoid registering the same folder twice with different paths; the installer collapses matching opencode-swarm entries into one.

## Verify each layer

1. **Plugin loaded.** In the coordinator session, `/swarm-models` returns a model list. Or open **Settings → Swarm Board**; the runtime row says it is connected to `local.opencode-swarm` with a swarm count.
2. **GUI loaded.** **Settings → Swarm Board** exists, and after `/swarm` a **Swarm** side tab and composer pill appear. Before any swarm, no pill is expected — that is per-session on purpose.
3. **Board up.** The `open_board` value returned by `swarm{action:"status"}` (also `add`/`title`) looks like `http://127.0.0.1:<port>/?token=<hex>`. Open that exact URL. Without the token you get 403, by design.

If a layer fails, restart the app first; a built GUI bundle is only read at startup.

## Updating

```bash
git pull
cd tools/opencode-swarm
bun install
bun run build:gui
```

Restart OpenCode Desktop. If you use the installer, `bun run install:plugin` also re-registers the path, but it skips the rebuild when `dist/gui-experimental.cjs` already exists — run `bun run build:gui` yourself after GUI changes, or force the build with `bun run install:plugin --rebuild`.

## Uninstalling

```bash
cd tools/opencode-swarm
bun run uninstall:dry-run   # list exact paths
bun run uninstall           # confirm and remove
```

The script removes the plugin registration, swarm worktrees/branches, runtime data under `~/.opencode-swarm`, build artifacts, and temp files. Use `--yes` to skip prompts and `--skip-*` flags (`--skip-config`, `--skip-git`, `--skip-runtime`, `--skip-build`, `--skip-temp`) to keep categories.

In the GUI: **Settings → Swarm Board → Uninstall...** or Command Palette → `Uninstall Swarm Plugin`.

Manual steps and recovery: [../tools/opencode-swarm/docs/UNINSTALL.md](../tools/opencode-swarm/docs/UNINSTALL.md).
