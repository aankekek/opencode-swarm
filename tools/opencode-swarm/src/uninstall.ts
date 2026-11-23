import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  UninstallCategoryId,
  UninstallPlan,
  UninstallPlanCategory,
  UninstallPlanItem,
  UninstallResult,
  UninstallSelection,
  UninstallVerificationCheck,
} from "./rpc.js";

export interface UninstallEnvOptions {
  homeDir?: string;
  tempDir?: string;
  workspaceRoot?: string;
  pluginRoot?: string;
  globalConfigDirs?: string[];
  boardUrl?: string;
}

const SWARM_MATCH_RE = /(?:^|[\\/])(?:opencode-swarm|swarm-runtime)(?:$|[\\/])|local\.(?:opencode-swarm|swarm-runtime)/i;

export function stripJsonComments(raw: string): string {
  const input = raw.replace(/^\uFEFF/, "");
  let out = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === "\n" || ch === "\r") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    out += ch;
  }

  // Strip trailing commas before } or ] outside strings
  let cleaned = "";
  inString = false;
  escaped = false;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (inString) {
      cleaned += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      cleaned += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      if (out[j] === "}" || out[j] === "]") {
        continue;
      }
    }
    cleaned += ch;
  }

  return cleaned;
}

function isSwarmPluginEntry(entry: unknown): boolean {
  if (typeof entry === "string") {
    return SWARM_MATCH_RE.test(entry);
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const pkg = (entry as { package?: unknown; id?: unknown }).package ?? (entry as { id?: unknown }).id;
    return typeof pkg === "string" && SWARM_MATCH_RE.test(pkg);
  }
  return false;
}

export function removeSwarmFromConfigContent(raw: string): {
  changed: boolean;
  emptyAfter: boolean;
  nextContent: string;
} {
  const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { changed: false, emptyAfter: false, nextContent: raw };
  }

  let changed = false;
  for (const key of ["plugins", "plugin"] as const) {
    const arr = parsed[key];
    if (Array.isArray(arr)) {
      const filtered = arr.filter((item) => !isSwarmPluginEntry(item));
      if (filtered.length !== arr.length) {
        parsed[key] = filtered;
        changed = true;
      }
    }
  }

  if (!changed) {
    return { changed: false, emptyAfter: false, nextContent: raw };
  }

  const remainingKeys = Object.keys(parsed).filter((k) => {
    if (k === "$schema") return false;
    if ((k === "plugins" || k === "plugin") && Array.isArray(parsed[k]) && (parsed[k] as unknown[]).length === 0) {
      return false;
    }
    return true;
  });

  return {
    changed: true,
    emptyAfter: remainingKeys.length === 0,
    nextContent: JSON.stringify(parsed, null, 2) + "\n",
  };
}

function getDirSizeBounded(dirPath: string, maxEntries = 4000): number {
  let total = 0;
  let seen = 0;
  const stack = [dirPath];
  while (stack.length > 0 && seen < maxEntries) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (seen >= maxEntries) break;
      seen++;
      const full = join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          total += statSync(full).size;
        } catch {
          // Ignore stat failures
        }
      }
    }
  }
  return total;
}

function runGit(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function listSwarmWorktrees(workspaceRoot: string): Array<{ path: string; branch?: string }> {
  const out = runGit(workspaceRoot, ["worktree", "list", "--porcelain"]);
  if (!out) return [];
  const results: Array<{ path: string; branch?: string }> = [];
  let curPath: string | null = null;
  let curBranch: string | undefined;

  const flush = () => {
    if (!curPath) return;
    const norm = curPath.replace(/\\/g, "/");
    if (norm.includes(".opencode-swarm") || (curBranch && curBranch.startsWith("refs/heads/swarm/"))) {
      results.push({ path: curPath, branch: curBranch });
    }
    curPath = null;
    curBranch = undefined;
  };

  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      curPath = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      curBranch = line.slice("branch ".length).trim();
    }
  }
  flush();
  return results;
}

function listSwarmBranches(workspaceRoot: string): string[] {
  const out = runGit(workspaceRoot, ["branch", "--list", "swarm/*"]);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((l) => l.replace(/^[*+\s]+/, "").trim())
    .filter(Boolean);
}

function collectConfigCandidates(env: {
  homeDir: string;
  workspaceRoot: string;
  globalConfigDirs?: string[];
}): { globalFiles: string[]; projectFiles: string[] } {
  const globalDirs = env.globalConfigDirs ?? [
    join(env.homeDir, ".config", "opencode"),
    ...(process.platform === "win32" && process.env.APPDATA ? [join(process.env.APPDATA, "opencode")] : []),
  ];

  const seenGlobal = new Set<string>();
  const globalFiles: string[] = [];
  for (const dir of globalDirs) {
    for (const file of ["opencode.json", "opencode.jsonc"]) {
      const full = resolve(dir, file);
      const key = process.platform === "win32" ? full.toLowerCase() : full;
      if (!seenGlobal.has(key) && existsSync(full)) {
        seenGlobal.add(key);
        globalFiles.push(full);
      }
    }
  }

  const projectDirs = [env.workspaceRoot];
  try {
    for (const entry of readdirSync(env.workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".opencode") continue;
      projectDirs.push(join(env.workspaceRoot, entry.name));
    }
  } catch {
    // Ignore workspace scan errors
  }

  const seenProject = new Set<string>();
  const projectFiles: string[] = [];
  for (const dir of projectDirs) {
    for (const file of ["opencode.json", "opencode.jsonc"]) {
      const full = resolve(dir, ".opencode", file);
      const key = process.platform === "win32" ? full.toLowerCase() : full;
      if (!seenProject.has(key) && existsSync(full)) {
        seenProject.add(key);
        projectFiles.push(full);
      }
    }
  }

  return { globalFiles, projectFiles };
}

function listMatchingTempItems(tempDir: string): UninstallPlanItem[] {
  const items: UninstallPlanItem[] = [];
  let entries;
  try {
    entries = readdirSync(tempDir, { withFileTypes: true });
  } catch {
    return items;
  }

  for (const entry of entries) {
    const name = entry.name;
    const matches =
      /^swarm-/i.test(name) ||
      /^dump_.*\.ts$/i.test(name) ||
      /^smoke.*\.ts$/i.test(name) ||
      /^opencode-debug\.json$/i.test(name) ||
      /^opencode$/i.test(name);
    if (!matches) continue;

    const full = join(tempDir, name);
    const isDir = entry.isDirectory();
    items.push({
      path: full,
      kind: isDir ? "delete-dir" : "delete-file",
      detail: isDir ? "Temporary directory" : "Temporary file",
      sizeBytes: isDir ? getDirSizeBounded(full, 500) : undefined,
    });
  }

  return items.sort((a, b) => a.path.localeCompare(b.path));
}

export function buildUninstallPlan(env?: UninstallEnvOptions): UninstallPlan {
  const homeDir = resolve(env?.homeDir ?? homedir());
  const tempDir = resolve(env?.tempDir ?? tmpdir());
  const defaultPluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const pluginRoot = resolve(env?.pluginRoot ?? defaultPluginRoot);
  const workspaceRoot = resolve(env?.workspaceRoot ?? process.cwd());
  const runtimeDataDir = join(homeDir, ".opencode-swarm");

  // 1. Plugin registration
  const regItems: UninstallPlanItem[] = [];
  const { globalFiles, projectFiles } = collectConfigCandidates({
    homeDir,
    workspaceRoot,
    globalConfigDirs: env?.globalConfigDirs,
  });

  for (const cfgPath of globalFiles) {
    try {
      const raw = readFileSync(cfgPath, "utf8");
      const res = removeSwarmFromConfigContent(raw);
      if (res.changed) {
        regItems.push({
          path: cfgPath,
          kind: "edit-config",
          detail: "Remove opencode-swarm entry from global plugins list (keep other plugins intact)",
        });
      }
    } catch (err) {
      regItems.push({
        path: cfgPath,
        kind: "edit-config",
        detail: `Unreadable or unparseable config (${err instanceof Error ? err.message : String(err)})`,
      });
    }
  }

  for (const cfgPath of projectFiles) {
    try {
      const raw = readFileSync(cfgPath, "utf8");
      const res = removeSwarmFromConfigContent(raw);
      if (res.changed) {
        regItems.push({
          path: cfgPath,
          kind: res.emptyAfter ? "delete-file" : "edit-config",
          detail: res.emptyAfter
            ? "Delete project swarm config (and remove empty .opencode/ directory)"
            : "Remove opencode-swarm entry from project config",
        });
      }
    } catch (err) {
      regItems.push({
        path: cfgPath,
        kind: "edit-config",
        detail: `Unreadable or unparseable config (${err instanceof Error ? err.message : String(err)})`,
      });
    }
  }

  // 2. Git worktrees & swarm/* branches
  const gitItems: UninstallPlanItem[] = [];
  for (const wt of listSwarmWorktrees(workspaceRoot)) {
    gitItems.push({
      path: wt.path,
      kind: "git-worktree",
      detail: wt.branch ? `Remove worktree (${wt.branch.replace("refs/heads/", "")}) and prune` : "Remove swarm worktree and prune",
    });
  }
  for (const br of listSwarmBranches(workspaceRoot)) {
    gitItems.push({
      path: br,
      kind: "git-branch",
      detail: `Delete local branch ${br}`,
    });
  }

  // 3. Runtime data (~/.opencode-swarm)
  const runtimeItems: UninstallPlanItem[] = [];
  if (existsSync(runtimeDataDir)) {
    let summary = "Swarm SQLite DBs, WAL, worktrees, clones, and role-models.json";
    try {
      const entries = readdirSync(runtimeDataDir, { withFileTypes: true });
      const dirCount = entries.filter((e) => e.isDirectory()).length;
      const hasRoleModels = entries.some((e) => e.isFile() && e.name === "role-models.json");
      const parts: string[] = [];
      if (dirCount > 0) parts.push(`${dirCount} workspace hash dir${dirCount === 1 ? "" : "s"}`);
      if (hasRoleModels) parts.push("role-models.json");
      if (parts.length > 0) summary = parts.join(" + ");
    } catch {
      // Keep default summary
    }
    runtimeItems.push({
      path: runtimeDataDir,
      kind: "delete-dir",
      detail: summary,
      sizeBytes: getDirSizeBounded(runtimeDataDir),
    });
  }

  // 4. Build artifacts (node_modules, dist)
  const buildItems: UninstallPlanItem[] = [];
  for (const dirName of ["node_modules", "dist"] as const) {
    const target = join(pluginRoot, dirName);
    if (existsSync(target)) {
      buildItems.push({
        path: target,
        kind: "delete-dir",
        detail: dirName === "node_modules" ? "Installed plugin dependencies" : "Built Desktop GUI bundle (dist/)",
        sizeBytes: getDirSizeBounded(target),
      });
    }
  }

  // 5. Temporary files
  const tempItems = listMatchingTempItems(tempDir);

  const categories: UninstallPlanCategory[] = [
    {
      id: "pluginRegistration",
      title: "1. Plugin Registration & Configs",
      description: "Remove opencode-swarm from global/project OpenCode configs (keeps other plugins intact).",
      defaultChecked: true,
      items: regItems,
    },
    {
      id: "gitWorktreesAndBranches",
      title: "2. Git Worktrees & Swarm Branches",
      description: "Remove orphan swarm worktrees, prune registrations, and delete swarm/* branches.",
      defaultChecked: true,
      items: gitItems,
    },
    {
      id: "runtimeData",
      title: "3. Runtime Data (~/.opencode-swarm)",
      description: "Delete SQLite board DBs, WAL files, worktrees, clones, and saved role-models.json.",
      defaultChecked: true,
      items: runtimeItems,
    },
    {
      id: "buildArtifacts",
      title: "4. Build Artifacts (node_modules & dist)",
      description: "Delete installed dependencies and built GUI bundle inside tools/opencode-swarm.",
      defaultChecked: true,
      items: buildItems,
    },
    {
      id: "tempFiles",
      title: "5. Temporary Files",
      description: "Delete swarm-*, dump_*.ts, smoke*.ts, opencode-debug.json, and temp opencode/ directory.",
      defaultChecked: true,
      items: tempItems,
    },
  ];

  const reloadCommands =
    process.platform === "win32"
      ? [
          "opencode reload",
          "opencode service restart",
          '& "$env:LOCALAPPDATA\\Programs\\opencode\\opencode.exe" reload',
        ]
      : ["opencode reload", "opencode service restart"];

  return {
    workspaceRoot,
    pluginRoot,
    runtimeDataDir,
    categories,
    preserved: [
      "Source files: tools/opencode-swarm/{src,test,assets,docs,scripts,index.ts,package.json,tsconfig.json,vite.config.ts,bun.lock}",
      "Audit reports & docs: docs/issues/, README.md, .gitignore",
      "Existing backups in ~/.config/opencode/",
    ],
    reloadCommands,
  };
}

function normalizeSelection(selection?: Partial<UninstallSelection>): UninstallSelection {
  return {
    pluginRegistration: selection?.pluginRegistration === true,
    gitWorktreesAndBranches: selection?.gitWorktreesAndBranches === true,
    runtimeData: selection?.runtimeData === true,
    buildArtifacts: selection?.buildArtifacts === true,
    tempFiles: selection?.tempFiles === true,
  };
}

export async function verifyUninstall(
  plan: UninstallPlan,
  selectionInput?: Partial<UninstallSelection>,
  env?: UninstallEnvOptions,
): Promise<UninstallVerificationCheck[]> {
  const selection = normalizeSelection(selectionInput);
  const homeDir = resolve(env?.homeDir ?? homedir());
  const tempDir = resolve(env?.tempDir ?? tmpdir());
  const workspaceRoot = resolve(env?.workspaceRoot ?? plan.workspaceRoot);
  const checks: UninstallVerificationCheck[] = [];

  if (selection.pluginRegistration) {
    const { globalFiles, projectFiles } = collectConfigCandidates({
      homeDir,
      workspaceRoot,
      globalConfigDirs: env?.globalConfigDirs,
    });
    const lingering: string[] = [];
    const unreadable: string[] = [];
    for (const cfgPath of [...globalFiles, ...projectFiles]) {
      try {
        const res = removeSwarmFromConfigContent(readFileSync(cfgPath, "utf8"));
        if (res.changed) lingering.push(cfgPath);
      } catch (err) {
        unreadable.push(`${cfgPath} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    const passed = lingering.length === 0 && unreadable.length === 0;
    checks.push({
      id: "config_clean",
      label: "No opencode-swarm config references",
      passed,
      detail: passed
        ? "All global and project configs clean"
        : [
            lingering.length > 0 ? `Still referenced in: ${lingering.join(", ")}` : "",
            unreadable.length > 0 ? `Unreadable/unparseable: ${unreadable.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("; "),
    });
  }

  if (selection.runtimeData) {
    const exists = existsSync(plan.runtimeDataDir);
    checks.push({
      id: "runtime_data_absent",
      label: "Runtime data directory removed",
      passed: !exists,
      detail: !exists ? `${plan.runtimeDataDir} absent` : `${plan.runtimeDataDir} still exists`,
    });
  }

  if (selection.gitWorktreesAndBranches) {
    const hasGit = existsSync(join(workspaceRoot, ".git"));
    const wtProbe = hasGit ? runGit(workspaceRoot, ["worktree", "list", "--porcelain"]) : "";
    const brProbe = hasGit ? runGit(workspaceRoot, ["branch", "--list", "swarm/*"]) : "";
    const worktrees = wtProbe === null ? [] : listSwarmWorktrees(workspaceRoot);
    const branches = brProbe === null ? [] : listSwarmBranches(workspaceRoot);
    checks.push({
      id: "git_worktrees_clean",
      label: "No orphan swarm worktrees",
      passed: wtProbe !== null && worktrees.length === 0,
      detail:
        wtProbe === null
          ? "git worktree probe failed"
          : worktrees.length === 0
            ? "git worktree list clean"
            : `Remaining: ${worktrees.map((w) => w.path).join(", ")}`,
    });
    checks.push({
      id: "git_branches_clean",
      label: "No swarm/* git branches",
      passed: brProbe !== null && branches.length === 0,
      detail:
        brProbe === null
          ? "git branch probe failed"
          : branches.length === 0
            ? "git branch --list swarm/* empty"
            : `Remaining: ${branches.join(", ")}`,
    });
  }

  if (selection.buildArtifacts) {
    const nmExists = existsSync(join(plan.pluginRoot, "node_modules"));
    const distExists = existsSync(join(plan.pluginRoot, "dist"));
    checks.push({
      id: "build_artifacts_absent",
      label: "Build artifacts (node_modules & dist) removed",
      passed: !nmExists && !distExists,
      detail:
        !nmExists && !distExists
          ? "node_modules and dist absent"
          : `Still present: ${[nmExists ? "node_modules" : "", distExists ? "dist" : ""].filter(Boolean).join(", ")}`,
    });
  }

  if (selection.tempFiles) {
    const remaining = listMatchingTempItems(tempDir);
    checks.push({
      id: "temp_files_clean",
      label: "Temporary swarm/opencode files removed",
      passed: remaining.length === 0,
      detail: remaining.length === 0 ? "Temp directory clean" : `Remaining: ${remaining.map((r) => basename(r.path)).join(", ")}`,
    });
  }

  if (env?.boardUrl) {
    let alive = false;
    try {
      const res = await fetch(`${env.boardUrl.replace(/\/$/, "")}/api/swarm`, {
        signal: AbortSignal.timeout(1500),
      });
      alive = res.ok;
    } catch {
      alive = false;
    }
    checks.push({
      id: "board_server_dead",
      label: "Board server stopped",
      passed: !alive,
      detail: !alive ? "Board server unreachable (stopped)" : `Board server still responding at ${env.boardUrl}`,
    });
  }

  return checks;
}

export async function executeUninstallPlan(
  plan: UninstallPlan,
  selectionInput?: Partial<UninstallSelection> & { removeSource?: boolean },
  hooks?: {
    beforeRuntimeDataDelete?: () => Promise<void> | void;
    env?: UninstallEnvOptions;
  },
): Promise<UninstallResult> {
  const selection = normalizeSelection(selectionInput);
  const removed: string[] = [];
  const edited: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const nextSteps: string[] = [];

  const categoryMap = new Map<UninstallCategoryId, UninstallPlanCategory>(
    plan.categories.map((c) => [c.id, c]),
  );

  // 1. Git worktrees & branches first (before deleting ~/.opencode-swarm directories)
  const gitCat = categoryMap.get("gitWorktreesAndBranches");
  if (gitCat) {
    if (!selection.gitWorktreesAndBranches) {
      for (const item of gitCat.items) skipped.push(item.path);
    } else {
      for (const item of gitCat.items) {
        if (item.kind === "git-worktree") {
          try {
            execFileSync("git", ["worktree", "remove", "--force", item.path], {
              cwd: plan.workspaceRoot,
              stdio: ["ignore", "pipe", "pipe"],
            });
            removed.push(item.path);
          } catch {
            try {
              if (existsSync(item.path)) {
                rmSync(item.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
              }
              removed.push(item.path);
            } catch (err) {
              errors.push(`Worktree ${item.path}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }
      if (gitCat.items.some((i) => i.kind === "git-worktree")) {
        runGit(plan.workspaceRoot, ["worktree", "prune"]);
      }
      for (const item of gitCat.items) {
        if (item.kind === "git-branch") {
          try {
            execFileSync("git", ["branch", "-D", item.path], {
              cwd: plan.workspaceRoot,
              stdio: ["ignore", "pipe", "pipe"],
            });
            removed.push(`branch:${item.path}`);
          } catch (err) {
            errors.push(`Branch ${item.path}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  }

  // 2. Plugin registration & project configs
  const regCat = categoryMap.get("pluginRegistration");
  if (regCat) {
    if (!selection.pluginRegistration) {
      for (const item of regCat.items) skipped.push(item.path);
    } else {
      for (const item of regCat.items) {
        if (!existsSync(item.path)) continue;
        try {
          if (item.kind === "delete-file") {
            rmSync(item.path, { force: true });
            removed.push(item.path);
            const parentDir = dirname(item.path);
            if (basename(parentDir) === ".opencode") {
              try {
                if (readdirSync(parentDir).length === 0) {
                  rmSync(parentDir, { recursive: true, force: true });
                  removed.push(parentDir);
                }
              } catch {
                // Ignore non-empty dir
              }
            }
          } else {
            const raw = readFileSync(item.path, "utf8");
            const res = removeSwarmFromConfigContent(raw);
            if (res.changed) {
              writeFileSync(item.path, res.nextContent, "utf8");
              edited.push(item.path);
            }
          }
        } catch (err) {
          errors.push(`Config ${item.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // 3. Runtime data (~/.opencode-swarm)
  const runtimeCat = categoryMap.get("runtimeData");
  if (runtimeCat) {
    if (!selection.runtimeData) {
      for (const item of runtimeCat.items) skipped.push(item.path);
    } else if (runtimeCat.items.length > 0) {
      try {
        await hooks?.beforeRuntimeDataDelete?.();
      } catch (err) {
        errors.push(`Shutdown hook error: ${err instanceof Error ? err.message : String(err)}`);
      }
      for (const item of runtimeCat.items) {
        if (!existsSync(item.path)) continue;
        try {
          rmSync(item.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
          removed.push(item.path);
        } catch (err) {
          errors.push(`Runtime data ${item.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // 4. Build artifacts (node_modules, dist)
  const buildCat = categoryMap.get("buildArtifacts");
  if (buildCat) {
    if (!selection.buildArtifacts) {
      for (const item of buildCat.items) skipped.push(item.path);
    } else {
      for (const item of buildCat.items) {
        if (!existsSync(item.path)) continue;
        try {
          rmSync(item.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          removed.push(item.path);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Build artifact ${item.path}: ${msg}`);
          nextSteps.push(`Remove locked folder after closing host: Remove-Item -Recurse -Force "${item.path}"`);
        }
      }
    }
  }

  // 5. Temporary files
  const tempCat = categoryMap.get("tempFiles");
  if (tempCat) {
    if (!selection.tempFiles) {
      for (const item of tempCat.items) skipped.push(item.path);
    } else {
      for (const item of tempCat.items) {
        if (!existsSync(item.path)) continue;
        try {
          rmSync(item.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
          removed.push(item.path);
        } catch (err) {
          errors.push(`Temp ${item.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // Optional complete source removal (CLI opt-in only)
  if (selectionInput?.removeSource && existsSync(plan.pluginRoot)) {
    try {
      rmSync(plan.pluginRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      removed.push(plan.pluginRoot);
    } catch (err) {
      errors.push(`Source dir ${plan.pluginRoot}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (selection.pluginRegistration) {
    nextSteps.push(...plan.reloadCommands.map((cmd) => `Run: ${cmd}`));
  }

  const verification = await verifyUninstall(plan, selection, hooks?.env);
  const allVerified = verification.every((v) => v.passed);

  return {
    ok: errors.length === 0 && allVerified,
    removed,
    edited,
    skipped,
    errors,
    verification,
    nextSteps,
  };
}
