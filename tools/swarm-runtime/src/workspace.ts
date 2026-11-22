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
      rmSync(wtDir, { recursive: true, force: true });
    }
    runGit(["worktree", "add", "-b", branch, wtDir, "HEAD"], args.repoRoot);
    return { mode: "share", dir: wtDir, branch };
  }

  // branch: isolated clone
  const cloneBase = join(args.dataDir, "clones", args.swarmId);
  mkdirSync(cloneBase, { recursive: true });
  const cloneDir = join(cloneBase, args.memberName);
  if (existsSync(cloneDir)) {
    rmSync(cloneDir, { recursive: true, force: true });
  }
  runGit(["clone", "--shared", "--no-checkout", args.repoRoot, cloneDir], args.repoRoot);
  runGit(["checkout", "-b", branch], cloneDir);
  return { mode: "branch", dir: cloneDir, branch };
}

export function cleanupMemberWorkspace(args: {
  mode: WorkspaceMode;
  dir: string;
  branch: string | null;
  repoRoot: string;
}) {
  if (args.mode === "inherit") return;
  try {
    if (args.mode === "share" && isGitRepo(args.repoRoot)) {
      try {
        runGit(["worktree", "remove", "--force", args.dir], args.repoRoot);
      } catch {
        // Fallback to directory removal + prune
        if (existsSync(args.dir)) rmSync(args.dir, { recursive: true, force: true });
        try {
          runGit(["worktree", "prune"], args.repoRoot);
        } catch {
          // Ignore prune errors
        }
      }
      return;
    }
    if (existsSync(args.dir)) {
      rmSync(args.dir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup on Windows file locks
  }
}
