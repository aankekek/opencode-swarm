import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceMode } from "./types.js";

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

export function provisionMemberWorkspace(args: {
  mode: WorkspaceMode;
  repoRoot: string;
  dataDir: string;
  swarmId: string;
  memberName: string;
}): ProvisionedWorkspace {
  if (args.mode === "inherit") {
    return { mode: "inherit", dir: args.repoRoot, branch: null };
  }

  if (!isGitRepo(args.repoRoot)) {
    throw new Error(
      `workspace:"${args.mode}" requires a Git repository at "${args.repoRoot}". Initialize git or use workspace:"inherit".`,
    );
  }

  const branch = `swarm/${args.swarmId}/${args.memberName}`;

  if (args.mode === "share") {
    const baseDir = join(args.dataDir, "worktrees", args.swarmId);
    mkdirSync(baseDir, { recursive: true });
    const wtDir = join(baseDir, args.memberName);
    if (existsSync(wtDir)) {
      throw new Error(`Worktree directory "${wtDir}" already exists for @${args.memberName}.`);
    }
    runGit(["worktree", "add", "-b", branch, wtDir, "HEAD"], args.repoRoot);
    return { mode: "share", dir: wtDir, branch };
  }

  // branch: isolated clone
  const cloneBase = join(args.dataDir, "clones", args.swarmId);
  mkdirSync(cloneBase, { recursive: true });
  const cloneDir = join(cloneBase, args.memberName);
  if (existsSync(cloneDir)) {
    throw new Error(`Clone directory "${cloneDir}" already exists for @${args.memberName}.`);
  }
  runGit(["clone", "--dissociate", "--no-checkout", args.repoRoot, cloneDir], args.repoRoot);
  runGit(["checkout", "-b", branch], cloneDir);
  return { mode: "branch", dir: cloneDir, branch };
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
