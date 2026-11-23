# Swarm Plugin — Full Uninstall Checklist & Uninstaller

Use any of the three options below to review what will be removed and cleanly uninstall **OpenCode Swarm (`local.opencode-swarm`)** from OpenCode.

---

## Option A — In-App GUI Uninstall Checklist (While Plugin Is Loaded)

1. Open **Settings → Swarm Board → Uninstall...** (or run **Uninstall Swarm Plugin** from the Command Palette).
2. Review the interactive checklist of exact paths detected on your machine:
   - **1. Plugin Registration & Configs** (edits global config to remove `opencode-swarm` while preserving other plugins like `@slkiser/opencode-quota`; deletes dedicated project `.opencode/opencode.jsonc` & empty `.opencode/` folders)
   - **2. Git Worktrees & Swarm Branches** (removes orphan `.opencode-swarm` worktrees, runs `git worktree prune`, deletes `swarm/*` branches)
   - **3. Runtime Data (`~/.opencode-swarm`)** (stops active board server & closes SQLite DBs before deleting all workspace hashes, WALs, clones, and `role-models.json`)
   - **4. Build Artifacts** (`tools/opencode-swarm/node_modules` and `tools/opencode-swarm/dist`)
   - **5. Temporary Files** (`%TEMP%/swarm-*`, `dump_*.ts`, `smoke*.ts`, `opencode-debug.json`)
   - **6. Swarm GUI Settings Store** (resets saved GUI preferences and onboarding state)
3. Click **Confirm & Remove Selected Items**, verify all green checks pass, then reload/restart OpenCode Desktop.

---

## Option B — Standalone CLI Uninstaller

Preview the exact removal checklist on your machine first (no files modified):

```bash
cd tools/opencode-swarm
bun run uninstall:dry-run
```

Run the interactive uninstaller (asks for `[y/N]` confirmation before deleting):

```bash
cd tools/opencode-swarm
bun run uninstall
```

Useful CLI flags:
- `--yes` / `-y` — skip confirmation prompt (after reviewing `--dry-run`)
- `--workspace <dir>` — target a specific repo root
- `--skip-config`, `--skip-git`, `--skip-runtime`, `--skip-build`, `--skip-temp` — skip a specific category
- `--remove-source` — also delete the `tools/opencode-swarm` source folder itself
- `--reload` — attempt `opencode reload` and `opencode service restart` automatically

---

## Option C — Manual Full Uninstall Checklist

### 1. Plugin Registration
- [ ] Delete project config (and empty `.opencode/` dir):
  - `<workspace>/.opencode/opencode.jsonc`
  - `<workspace>/sandbox-test-repo/.opencode/opencode.jsonc` (if present)
- [ ] Edit global config — remove only the `opencode-swarm` entry from `plugins` (keep other plugins intact):
  - Windows: `%USERPROFILE%\.config\opencode\opencode.json` (or `%APPDATA%\opencode\opencode.json`)
  - macOS / Linux: `~/.config/opencode/opencode.json`
- [ ] Reload + restart host:
  ```powershell
  opencode reload
  opencode service restart
  ```
  *(If `opencode` is not on PATH on Windows: `& "$env:LOCALAPPDATA\Programs\opencode\opencode.exe" <command>`)*

### 2. Runtime Data & Git Worktrees
- [ ] Remove any orphan worktrees under `~/.opencode-swarm/<hash>/worktrees/...` and prune:
  ```bash
  git worktree list
  git worktree prune
  ```
- [ ] Delete any `swarm/*` branches:
  ```bash
  git branch --list "swarm/*"
  git branch -D <branch>
  ```
- [ ] Delete all swarm state (DBs, WAL, worktrees, clones, `role-models.json`):
  - Windows: `%USERPROFILE%\.opencode-swarm\`
  - macOS / Linux: `~/.opencode-swarm/`

### 3. Build Artifacts
- [ ] `tools/opencode-swarm/node_modules/`
- [ ] `tools/opencode-swarm/dist/`

### 4. Temporary Files
- [ ] `<TEMP>/swarm-*` (probes, test dirs, board tests, RPC bridge tests)
- [ ] `<TEMP>/dump_*.ts`, `<TEMP>/smoke*.ts`
- [ ] `<TEMP>/opencode-debug.json`

### 5. Verification — All Must Pass

```powershell
# 1. Plugin not listed (expect: no local.opencode-swarm)
opencode plugin list

# 2. No config references (expect: empty output)
opencode debug config | Select-String 'opencode-swarm|swarm-runtime|overrideShellAllow'

# 3. No runtime data (expect: False)
Test-Path "$env:USERPROFILE\.opencode-swarm"

# 4. No worktrees / swarm branches
git worktree list
git branch --list "swarm/*"

# 5. No build artifacts (expect: False)
Test-Path tools\opencode-swarm\node_modules
Test-Path tools\opencode-swarm\dist

# 6. Board server dead (expect: 000)
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:51546/api/swarm
```

### 6. Preserved by Default (No Runtime Effect)
- `tools/opencode-swarm/{src,test,assets,docs,scripts,index.ts,package.json,tsconfig.json,vite.config.ts,bun.lock}`
- `docs/issues/`, `README.md`, `.gitignore`
- Existing backups in `~/.config/opencode/`

### 7. Optional — Remove the Source Folder Completely
Only if you want all source code and audit reports removed too:
```powershell
Remove-Item -Recurse -Force "<path-to-repo>"
```
