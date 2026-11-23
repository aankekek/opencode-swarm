# OpenCode Swarm (`opencode-swarm`)

> **Note:** This project is 100% vibecoded — I really like how Swarm Mode works in Antigravity, so I recreated it for OpenCode v2. Expect rough edges and feel free to fork or open issues!

A swarm plugin for **OpenCode v2** (`@opencode/plugin@2.3.2`): one coordinator session delegates to parallel workers, each in its own Git workspace, while an independent verifier checks the result before the swarm is allowed to finish.

## What a swarm actually is

A **coordinator** is the session you talk to. You run `/swarm <task>` in it, and instead of doing the work itself it splits the task into briefs and spawns workers. It keeps its own hands off the files.

A **worker** is a child session with one slice of the job. Each worker gets a brief, a name like `parser`, and optionally its own workspace: a Git worktree or a full clone, so two workers can edit in parallel without fighting over the same files. Workers report back by posting to the board.

A **verifier** is a separate session that re-checks the finished work. It is read-only: it reads the board, inspects diffs, and runs checks. Only after it posts `PASS` should the coordinator call `swarm{action:"complete"}`.

Why a verifier? Because workers can be confidently wrong. A worker that says "done" has usually tested its own assumption, not the requirement. A second session with a different context and no edit rights catches the gap before you do.

The **board** is the shared message log. Every post gets a sequence number (`#12`), so members can cite each other and sleep until something new arrives. Channels (`#main`, `#tests`, ...) keep unrelated chatter apart.

## What you need

| Requirement | Why |
| --- | --- |
| OpenCode v2 with `@opencode/plugin@2.3.2` | The plugin is built against this plugin API; older/newer majors may not load. |
| [Bun](https://bun.sh) | Installs dependencies, runs tests, and builds the GUI bundle. |
| Git | Required for `workspace:"share"` (worktrees) and `workspace:"branch"` (clones). `workspace:"inherit"` works without it, but then everyone shares one folder. |

## Install — pick one

| Option | Scope | Command/effort | Desktop UI (tab, pills, Settings)? |
| --- | --- | --- | --- |
| **A** | Global | One command | Yes |
| **B** | Global | Edit one JSON file | Yes |
| **C** | Project only | Edit one JSONC file | No, not in current builds |
| **D** | Global + project | Both of the above | Yes; project options win for that repo |
| **E** | Another clone/folder | Absolute path + build | Yes, after a one-time build |

"Global" means OpenCode's user config: `~/.config/opencode/opencode.json` (Windows: `%USERPROFILE%\.config\opencode\opencode.json`). The desktop tab, composer pill, titlebar pill, and **Settings → Swarm Board** load from the global entry.

### A. Global, one command

```bash
cd tools/opencode-swarm
bun run install:plugin
```

This installs dependencies if `node_modules` is missing, builds the GUI bundle if `dist/gui-experimental.cjs` is missing, and registers this folder in your global config. Pass `--rebuild` to force the GUI build: `bun run install:plugin --rebuild`. Then **fully quit and reopen OpenCode Desktop** — a reload is not enough.

### B. Global, by hand

Build once, then add the entry:

```bash
cd tools/opencode-swarm
bun install && bun run build:gui
```

```jsonc
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "C:/Users/you/Desktop/Swarm for opencode/tools/opencode-swarm",
      "options": {
        "overrideShellAllow": true,
        "boardServer": true
      }
    }
  ]
}
```

`package` must be an absolute path (forward slashes work on Windows). Restart OpenCode Desktop after saving.

### C. Project only

```jsonc
// .opencode/opencode.jsonc — path is relative to this config file
{
  "plugins": [
    {
      "package": "../tools/opencode-swarm",
      "options": { "overrideShellAllow": true, "boardServer": true }
    }
  ]
}
```

This is enough for the tools and the board server. The desktop tab, pills, and Settings page need the **global** entry in current builds.

### D. Global + project

Do A or B, then add C as well. The project entry lets you change options per repo; for that repo, project options win. Keep the global entry so the GUI loads.

### E. From another folder or clone

Point `package` at the absolute path of that clone and run `bun install && bun run build:gui` inside it once. The GUI bundle is not published to a registry, so it must exist on disk.

### Check it worked

- [ ] `/swarm-models` lists models and their variants.
- [ ] **Settings → Swarm Board** exists.
- [ ] There is deliberately **no composer pill yet** — the pill and tab are per-session and only appear after a swarm is summoned in that session.
- [ ] Run `/swarm hello`. A composer pill and a **Swarm** side tab appear, and the board opens from that tab. `swarm{action:"status"}` (or `add`/`title`) also returns an `open_board` URL for the same board.
- [ ] **Settings → Swarm Board → Swarm Runtime** says it is connected, with a swarm count.

Long version, per-OS paths, and update notes: [docs/INSTALL.md](docs/INSTALL.md).

## Your first swarm

```text
/swarm build a login page
```

What happens:

1. `/swarm` makes this session the coordinator and injects the coordinator protocol.
2. The coordinator lists the independent units, posts that plan, then sizes the swarm from it: one worker per unit for small disjoint sets, batched `tasks` for homogeneous work, and grouping by area up to `maxWorkers` (default 6). It does not edit files.
3. Each worker does its slice in its own workspace, then posts a `[done]` handoff.
4. The verifier is auto-spawned (default) once worker tracks finish, or woken if one already exists. It posts `PASS` or `FAIL` with file:line issues.
5. The coordinator summarises and calls `swarm{action:"complete"}`, which tears down members, workspaces, and locks.

Where to watch: the **Swarm** side tab (board + members), the composer pill (buzzing/dozing), the titlebar pill (active count and post count), or the board URL directly. The Settings page has the same switches plus auto-spawn.

Do not call `complete` yourself from the coordinator unless the verifier has posted `PASS`; the prompt, monitor, and handoff messages all push that contract.

## The four tools

| Tool | What it does |
| --- | --- |
| `swarm` | Management. Actions below. |
| `post_message` | Posts `text` to a `channel`. Mentions (`@name`, `@all`, `@#channel`) wake members. |
| `read_board` | Reads posts since a sequence (`since`, `limit`, `channel`, `status`). |
| `swarm_wait` | Sleeps at zero tokens until a matching post arrives (`since`, `mentions_only`). |

`swarm` actions:

| Action | One-line meaning |
| --- | --- |
| `status` | Current swarm, members, models, workspaces, locks. |
| `models` | Lists available `provider/model` entries and their `variants`. `all:true` includes disabled models. |
| `add` | Spawns a worker/verifier/monitor/narrator. Needs `name` + `brief`. |
| `plan` | Records the unit list; `add` assigns units and reports unassigned counts. |
| `model` | Switches a member's model/variant in place, keeping history. |
| `kill` | Stops a member you added. |
| `title` | Renames the swarm (coordinator only). |
| `channel` | `create`, `subscribe`, `unsubscribe`, `list`, `archive`. |
| `claim` | Claims file globs (only in `workspace:"inherit"`). |
| `complete` | Ends the swarm, tears down children and workspaces (coordinator only). |

`add` extras: `n` spawns `<name>-1..<name>-N`, `tasks` gives each copy its own slice, `workspace` is `inherit` | `share` | `branch`, `fork` copies conversation history from a member or `"coordinator"`, `channels` joins channels at spawn, and `owned_globs` claims write scope up front.

## Models and variants

Nothing is auto-picked. Workers inherit the coordinator's model and variant unless you say otherwise. Four ways to choose:

1. **Tool:** `swarm{action:"models"}`, then `swarm{action:"add", model:"provider/model#variant"}` or `swarm{action:"model", name:"parser", variant:"high"}`.
2. **Slash command:** `/swarm-models` lists models and variants and can assign role defaults.
3. **Swarm Board UI:** **Members** tab → **Model** / **Variant** dropdowns; changes apply to waiting members live.
4. **Config:** `options.roleModels`, e.g. `{ "worker": "anthropic/claude-sonnet-4-6#high" }`. A `coordinator` entry switches the coordinator session when the swarm is created.

The spec is `provider/model` plus an optional `#variant`: `opencode-go/glm-4.6#high`. A variant alone (`"#high"`) is also accepted when the model stays the same. `roleModels` overrides values saved in `role-models.json`.

## Configuration reference

Options go under the plugin entry's `options` object.

| Option | Default | Effect |
| --- | --- | --- |
| `stallTimeoutMs` | `180000` | Idle time before the monitor nudges a stuck swarm. |
| `monitorIntervalMs` | `30000` | How often the monitor checks for stalls. |
| `allowCoordinatorEdits` | `false` | Let the coordinator edit files. Off by default so it delegates. |
| `overrideShellAllow` | `true` | When on, the coordinator's shell resolves to `allow` unless `coordinatorShellPolicy` is set. |
| `coordinatorShellPolicy` | `"allow"` if `overrideShellAllow`, else `"ask"` | Shell policy for the coordinator. |
| `workerShellPolicy` | `"ask"` | Shell policy for workers. `"deny"` or `"ask"` is safer unless workers use isolated worktrees. |
| `verifierShellPolicy` | `"ask"` | `"ask"` lets you approve read-only checks; `"deny"` keeps the verifier strictly read-only. |
| `roleModels` | `{}` | Per-role manual `provider/model#variant` defaults. |
| `boardServer` | `true` | Serve the local Swarm Board UI on `127.0.0.1`. |
| `boardPort` | `0` | Board port; `0` means an ephemeral port. |
| `dbPath` | unset | Explicit SQLite path. Defaults to `~/.opencode-swarm/<hash>/board.db`. |
| `autoSpawnVerifier` | `true` | Spawn/wake a verifier when all worker tracks finish. |
| `maxWorkers` | `6` | Cap live workers per swarm; requests with more units are grouped by area. |
| `maxShardsPerAdd` | `8` | Cap members created by one `add`; larger batches are split into sequential groups. |
| `debugEvents` | `false` | Log raw event payloads to `events.debug.jsonl`. |
| `debugHooks` | `false` | Log permission and execute hooks to `hooks.debug.jsonl`. |

A note on shell: shell execution is **not** path-contained. A permitted `bun test` or `rm` runs with your user's reach. The fence covers `edit`, `external_directory`, and swarm tool paths. For real containment, use a container or VM.

## Where your data lives

Per repo: `~/.opencode-swarm/<repoHash>/`.

The hash is the first 12 hex chars of `sha256(canonical workspace root)`, lowercased first on Windows, so each checkout gets its own state.

```text
~/.opencode-swarm/
  role-models.json                 # shared across repos (unless dbPath is set)
  <repoHash>/
    board.db                       # SQLite, WAL mode
    swarms/<swarmId>/members.json  # mirror of member rows
    swarms/<swarmId>/board.jsonl   # append-only post mirror
    worktrees/<swarmId>/<name>/    # workspace:"share"
    clones/<swarmId>/<name>/       # workspace:"branch"
    events.debug.jsonl             # only with debugEvents
    hooks.debug.jsonl              # only with debugHooks
```

If you set `dbPath`, the database and its sibling files live there instead, and `role-models.json` sits next to it.

Safe to delete only when no swarm is running. Deleting the folder loses board history and the saved role-model defaults; it does not touch your repo, except that unreferenced worktrees/clones under `worktrees/` and `clones/` disappear with it.

## How it works

### Board and sequence numbers
Posts are rows in SQLite with a per-swarm `#seq`. Read and wake cursors are sequence numbers, so `read_board(since: 12)` is race-free. `members.json` and `board.jsonl` are mirrors rebuilt from SQLite on startup if a crash left them stale.

### Locks
`claim` reserves file globs in `workspace:"inherit"` mode. Overlapping globs collide, so `src/*.ts` and `src/a.ts` cannot both be claimed. A killed member's locks survive 60 seconds before reclaim, because its in-flight shell may still be writing.

### Workspaces
- `inherit` — the repo itself, no isolation. Use `owned_globs` to avoid collisions.
- `share` — a Git worktree on a `swarm/<swarmId>/<name>` branch. Fast, isolated checkout.
- `branch` — a full `git clone` on its own branch. Slower, fully separate Git state.

On `complete`, cleanup removes the worktree/clone directory but leaves its `swarm/<swarmId>/<name>` branch behind. Reclaiming an orphaned swarm leaves workspaces in place.

### Monitor
Every `monitorIntervalMs` the monitor looks for idle members and unread handoffs. Past `stallTimeoutMs` it posts one targeted nudge naming the member who can act. If three alerts go unanswered with no board movement, it stops alerting instead of spamming.

### Verifier
With `autoSpawnVerifier` on, a verifier is spawned or woken when all worker tracks are done. Auto-spawn is capped at three attempts per work cycle; a `PASS` resets the cap so a later work cycle can verify again. The gate is a protocol contract: the coordinator prompt, monitor nudges, and the `swarm_wait` handoff all require `PASS`. `complete` itself does not re-check the board.

### Recovery on startup
Interrupted swarms from a dead process are marked `interrupted` and their locks released. Workspace provisions that crashed midway are cleaned up, orphaned child sessions are removed, and the JSON mirrors are rebuilt from SQLite. Orphaned swarms with no working members can also be reclaimed by `/swarm` after the stall threshold.

## Troubleshooting

**No pill and no Swarm tab.** Restart OpenCode Desktop after building the bundle; a reload may keep the old GUI. Then run `/swarm` in that session — the tab is per-session evidence, not a global panel.

**Board is blank or 403.** The board URL carries a `?token=...`; open the exact `open_board` URL, not `127.0.0.1:<port>` by hand. Check `boardServer` is not `false`; the server only starts with it on.

**"This workspace already has active swarm ...".** Finish it with `swarm{action:"complete"}` from that coordinator, or leave it idle for `stallTimeoutMs` (3 minutes by default) and run `/swarm` again, which reclaims a dead orphan.

**`/swarm` seems to do nothing.** It now reports the blocking swarm and why it cannot start instead of failing silently. Read the message in the coordinator session.

**Verifier never passes.** Usually shell policy: with `deny` it cannot run tests, and with `ask` it needs your approvals. A weak verifier model can also loop. Check the board for its `FAIL` reasons, then fix the worker or switch the model.

**Windows path weirdness.** Use absolute paths in config, forward slashes or escaped `\\`. The runtime data path is under `%USERPROFILE%\.opencode-swarm`. Path comparisons are case-insensitive on Windows.

**GUI changes do not show up.** The committed bundle is what loads. Run `bun run build:gui` and restart.

## Development and tests

```bash
cd tools/opencode-swarm
bun install
bun run typecheck
bun test
bun run build:gui
```

CI (`.github/workflows/ci.yml`) runs on Ubuntu: `bun install --frozen-lockfile`, typecheck, `build:gui`, then `bun test --timeout 15000`.

## Uninstall

1. **GUI:** **Settings → Swarm Board → Uninstall...** (or Command Palette → `Uninstall Swarm Plugin`) to review and confirm removal of configs, runtime data, worktrees, build artifacts, and temp files.
2. **CLI:**

```bash
cd tools/opencode-swarm
bun run uninstall:dry-run   # preview exact paths
bun run uninstall           # confirm and remove
```

3. **Manual:** [tools/opencode-swarm/docs/UNINSTALL.md](tools/opencode-swarm/docs/UNINSTALL.md).

## FAQ

**Do I need a paid model?** No. The plugin uses whatever models your OpenCode install can reach. Cheap or free models work; the trade-off is weaker planning and verification.
**Does it work on Windows?** Yes: worktrees, clones, the board, and the GUI run on Windows. Use absolute paths in config; path comparisons are case-insensitive.
**Can two windows share one swarm?** Not as a supported flow. Both windows on the same repo point at the same SQLite file, and a duplicate plugin load disposes the previous instance. One coordinator per workspace.
**What if I close the app mid-swarm?** On next start the swarm is marked `interrupted`, locks are released, orphaned sessions and half-provisioned workspaces are cleaned up, and mirrors are rebuilt. Worktrees may remain and can be deleted once you are sure nothing is running.
**Can I use it offline?** The board is local and the plugin makes no network calls, but the agents still need a model provider. Fully offline means a local model through OpenCode.
