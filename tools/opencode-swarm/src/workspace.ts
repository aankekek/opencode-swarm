import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { SwarmBoardDB, PendingProvisionRow } from "./db.js";
import type { WorkspaceMode } from "./types.js";

export const MAX_BRANCH_COPY_ENTRIES = 5_000;
export const MAX_BRANCH_COPY_BYTES = 256 * 1024 * 1024; // 256 MiB

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function isGitRepo(dir: string): boolean {
  try {
    runGit(["rev-parse", "--is-inside-work-tree"], dir);
    return true;
  } catch {
    return false;
  }
}

export interface ProvisionedWorkspace {
  mode: WorkspaceMode;
  dir: string;
  branch: string | null;
}

export function provisionedWorkspacePaths(args: {
  mode: WorkspaceMode;
  repoRoot: string;
  dataDir: string;
  swarmId: string;
  memberName: string;
}): { dir: string; branch: string | null } {
  if (args.mode === "inherit") return { dir: args.repoRoot, branch: null };
  const branch = `swarm/${args.swarmId}/${args.memberName}`;
  if (args.mode === "share") {
    return { dir: join(args.dataDir, "worktrees", args.swarmId, args.memberName), branch };
  }
  return { dir: join(args.dataDir, "clones", args.swarmId, args.memberName), branch };
}

/**
 * Copies a non-git workspace into `destDir` using a two-phase scan-then-copy
 * with strict entry count and total byte limits, skipping symlinks and any
 * nested `dataDir`.
 */
function copyNonGitWorkspace(
  srcRoot: string,
  destDir: string,
  dataDir: string,
  maxEntries: number,
  maxBytes: number,
): void {
  const resolvedSrc = resolve(srcRoot);
  const resolvedDataDir = resolve(dataDir);
  const dirsToCreate: string[] = [];
  const filesToCopy: Array<{ src: string; rel: string }> = [];
  let entries = 0;
  let totalBytes = 0;

  const stack: string[] = [""];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    const absDir = relDir ? join(resolvedSrc, relDir) : resolvedSrc;
    for (const dirent of readdirSync(absDir, { withFileTypes: true })) {
      const relPath = relDir ? join(relDir, dirent.name) : dirent.name;
      const absPath = join(resolvedSrc, relPath);
      if (resolve(absPath) === resolvedDataDir) {
        continue;
      }
      const st = lstatSync(absPath);
      if (st.isSymbolicLink()) {
        continue;
      }
      if (st.isDirectory()) {
        entries++;
        if (entries > maxEntries || totalBytes > maxBytes) {
          throw new Error(
            `workspace:"branch" copy aborted: "${srcRoot}" exceeds non-git copy limits (${entries} entries, ${totalBytes} bytes; limits: ${maxEntries} entries, ${maxBytes} bytes). Initialize git or use workspace:"inherit".`,
          );
        }
        dirsToCreate.push(relPath);
        stack.push(relPath);
      } else if (st.isFile()) {
        entries++;
        totalBytes += st.size;
        if (entries > maxEntries || totalBytes > maxBytes) {
          throw new Error(
            `workspace:"branch" copy aborted: "${srcRoot}" exceeds non-git copy limits (${entries} entries, ${totalBytes} bytes; limits: ${maxEntries} entries, ${maxBytes} bytes). Initialize git or use workspace:"inherit".`,
          );
        }
        filesToCopy.push({ src: absPath, rel: relPath });
      }
    }
  }

  try {
    mkdirSync(destDir, { recursive: true });
    for (const relDir of dirsToCreate) {
      mkdirSync(join(destDir, relDir), { recursive: true });
    }
    for (const file of filesToCopy) {
      copyFileSync(file.src, join(destDir, file.rel));
    }
  } catch (err) {
    try {
      if (existsSync(destDir)) {
        rmSync(destDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

export function provisionMemberWorkspace(args: {
  mode: WorkspaceMode;
  repoRoot: string;
  dataDir: string;
  swarmId: string;
  memberName: string;
  copyLimits?: { maxEntries?: number; maxBytes?: number };
}): ProvisionedWorkspace {
  if (args.mode === "inherit") {
    return { mode: "inherit", dir: args.repoRoot, branch: null };
  }

  const git = isGitRepo(args.repoRoot);

  if (args.mode === "share") {
    if (!git) {
      throw new Error(
        `workspace:"share" requires a Git repository at "${args.repoRoot}". Initialize git or use workspace:"branch" or workspace:"inherit".`,
      );
    }
    const { dir, branch } = provisionedWorkspacePaths(args);
    const baseDir = join(args.dataDir, "worktrees", args.swarmId);
    mkdirSync(baseDir, { recursive: true });
    if (existsSync(dir)) {
      throw new Error(`Worktree directory "${dir}" already exists for @${args.memberName}.`);
    }
    runGit(["worktree", "add", "-b", branch!, dir, "HEAD"], args.repoRoot);
    return { mode: "share", dir, branch };
  }

  // branch: isolated clone (git) or bounded copy (non-git)
  const { dir, branch } = provisionedWorkspacePaths(args);
  const cloneBase = join(args.dataDir, "clones", args.swarmId);
  mkdirSync(cloneBase, { recursive: true });
  if (existsSync(dir)) {
    throw new Error(`Clone directory "${dir}" already exists for @${args.memberName}.`);
  }
  if (!git) {
    const maxEntries = args.copyLimits?.maxEntries ?? MAX_BRANCH_COPY_ENTRIES;
    const maxBytes = args.copyLimits?.maxBytes ?? MAX_BRANCH_COPY_BYTES;
    copyNonGitWorkspace(args.repoRoot, dir, args.dataDir, maxEntries, maxBytes);
    return { mode: "branch", dir, branch: null };
  }
  runGit(["clone", "--dissociate", "--no-checkout", args.repoRoot, dir], args.repoRoot);
  runGit(["checkout", "-b", branch!], dir);
  return { mode: "branch", dir, branch };
}

export function cleanupMemberWorkspace(args: {
  mode: WorkspaceMode;
  dir: string;
  branch: string | null;
  repoRoot: string;
  deleteBranch?: boolean;
}): { ok: boolean; error?: string } {
  if (args.mode === "inherit") return { ok: true };
  const errors: string[] = [];
  if (args.mode === "share" && isGitRepo(args.repoRoot)) {
    try {
      runGit(["worktree", "remove", "--force", args.dir], args.repoRoot);
    } catch {
      // Fallback to directory removal
    }
    try {
      if (existsSync(args.dir)) rmSync(args.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    try {
      runGit(["worktree", "prune", "--expire", "now"], args.repoRoot);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    if (args.deleteBranch && args.branch) {
      try {
        runGit(["branch", "-D", args.branch], args.repoRoot);
      } catch {
        // Ignore if branch was never created
      }
    }
    if (existsSync(args.dir)) {
      errors.push(`Workspace directory still exists: ${args.dir}`);
    }
    if (errors.length > 0) {
      console.warn(`[opencode-swarm] Workspace cleanup warning for ${args.dir}: ${errors.join("; ")}`);
      return { ok: false, error: errors.join("; ") };
    }
    return { ok: true };
  }
  try {
    if (existsSync(args.dir)) {
      rmSync(args.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  if (existsSync(args.dir)) {
    errors.push(`Workspace directory still exists: ${args.dir}`);
  }
  if (errors.length > 0) {
    console.warn(`[opencode-swarm] Workspace cleanup warning for ${args.dir}: ${errors.join("; ")}`);
    return { ok: false, error: errors.join("; ") };
  }
  return { ok: true };
}

/** True when `child` resolves to a path strictly inside `parent`. */
function isStrictlyInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  if (rel === "") return false;
  if (isAbsolute(rel)) return false;
  return !rel.startsWith("..");
}

/**
 * Recover workspaces that were provisioned but never recorded as members
 * (crash between provisioning and `insertMember`). Each pending row is an
 * intent record written before provisioning; the row is deleted once the
 * member exists, so a surviving row means the workspace may be orphaned.
 *
 * Safety policy:
 * - Only remove directories strictly inside `dataDir`. A row pointing
 *   elsewhere is logged and dropped without touching the filesystem.
 * - For `share` mode with a `swarm/` branch, best-effort delete the branch
 *   and prune stale worktree metadata.
 * - Never throws; per-row failures are logged. Rows whose directory could
 *   not be removed are kept for a later retry.
 *
 * Any child session recorded on a row that is recovered (its directory was
 * cleaned up) or dropped (its directory lies outside our data dir) is
 * returned in `orphanSessions` so the caller can best-effort delete it. The
 * caller owns that side effect: this function never talks to the session API.
 */
export function recoverPendingProvisions(
  db: SwarmBoardDB,
  dataDir: string,
  repoRoot: string,
): { recovered: number; orphanSessions: string[] } {
  let pending: PendingProvisionRow[];
  try {
    pending = db.listPendingProvisions();
  } catch (err) {
    console.warn("[opencode-swarm] Failed to read pending workspace provisions:", err);
    return { recovered: 0, orphanSessions: [] };
  }

  let recovered = 0;
  const orphanSessions: string[] = [];
  const recordOrphanSession = (row: PendingProvisionRow) => {
    if (typeof row.session_id === "string" && row.session_id.length > 0) {
      orphanSessions.push(row.session_id);
    }
  };
  for (const row of pending) {
    try {
      if (!isStrictlyInside(dataDir, row.workspace_dir)) {
        // Outside our data dir: never touch it. Drop the row so we do not
        // retry forever; the directory is not ours to manage.
        console.warn(
          `[opencode-swarm] Pending provisioning for @${row.member_name} (${row.swarm_id}) points outside the data dir (${row.workspace_dir}); skipping removal and dropping journal row.`,
        );
        recordOrphanSession(row);
        db.deletePendingProvision(row.id);
        continue;
      }

      if (existsSync(row.workspace_dir)) {
        rmSync(row.workspace_dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
        if (existsSync(row.workspace_dir)) {
          console.warn(
            `[opencode-swarm] Pending workspace still exists after removal attempt: ${row.workspace_dir}; keeping journal row for retry.`,
          );
          continue;
        }
      }

      if (
        row.workspace_mode === "share" &&
        row.workspace_branch &&
        /^swarm\//.test(row.workspace_branch) &&
        isGitRepo(repoRoot)
      ) {
        try {
          runGit(["worktree", "prune", "--expire", "now"], repoRoot);
        } catch {
          // Best effort only.
        }
        try {
          runGit(["branch", "-D", row.workspace_branch], repoRoot);
        } catch {
          // Branch may never have been created, or is already gone.
        }
      }

      db.deletePendingProvision(row.id);
      recordOrphanSession(row);
      recovered++;
    } catch (err) {
      console.warn(
        `[opencode-swarm] Failed to recover pending provision ${row.id} for @${row.member_name} (${row.workspace_dir}):`,
        err,
      );
    }
  }
  return { recovered, orphanSessions };
}
