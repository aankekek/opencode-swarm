import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type { UninstallSelection } from "../src/rpc.js";
import { buildUninstallPlan, executeUninstallPlan } from "../src/uninstall.js";

function parseArgs(argv: string[]) {
  const flags = {
    dryRun: false,
    yes: false,
    workspace: "",
    skipConfig: false,
    skipGit: false,
    skipRuntime: false,
    skipBuild: false,
    skipTemp: false,
    removeSource: false,
    reload: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--yes" || arg === "-y") flags.yes = true;
    else if (arg === "--skip-config") flags.skipConfig = true;
    else if (arg === "--skip-git") flags.skipGit = true;
    else if (arg === "--skip-runtime") flags.skipRuntime = true;
    else if (arg === "--skip-build") flags.skipBuild = true;
    else if (arg === "--skip-temp") flags.skipTemp = true;
    else if (arg === "--remove-source") flags.removeSource = true;
    else if (arg === "--reload") flags.reload = true;
    else if (arg === "--workspace" && argv[i + 1]) {
      flags.workspace = argv[++i];
    }
  }
  return flags;
}

function detectWorkspaceRoot(explicitWorkspace: string, pluginRoot: string): string {
  if (explicitWorkspace) return resolve(explicitWorkspace);
  const candidateRepoRoot = resolve(pluginRoot, "..", "..");
  if (existsSync(join(candidateRepoRoot, ".git"))) {
    return candidateRepoRoot;
  }
  return process.cwd();
}

function formatBytes(bytes?: number): string {
  if (typeof bytes !== "number" || bytes <= 0) return "";
  if (bytes < 1024) return ` (${bytes} B)`;
  if (bytes < 1024 * 1024) return ` (${(bytes / 1024).toFixed(1)} KB)`;
  return ` (${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
}

function tryReloadHost() {
  const localWinExe = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "Programs", "opencode", "opencode.exe")
    : "";
  const bin = process.platform === "win32" && localWinExe && existsSync(localWinExe) ? localWinExe : "opencode";
  for (const args of [["reload"], ["service", "restart"]]) {
    try {
      execFileSync(bin, args, { stdio: "inherit" });
    } catch {
      console.warn(`[uninstall] Could not run "${bin} ${args.join(" ")}" automatically.`);
    }
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const workspaceRoot = detectWorkspaceRoot(flags.workspace, pluginRoot);

  const selection: UninstallSelection & { removeSource?: boolean } = {
    pluginRegistration: !flags.skipConfig,
    gitWorktreesAndBranches: !flags.skipGit,
    runtimeData: !flags.skipRuntime,
    buildArtifacts: !flags.skipBuild,
    tempFiles: !flags.skipTemp,
    removeSource: flags.removeSource,
  };

  const plan = buildUninstallPlan({ workspaceRoot, pluginRoot });

  console.log("\n=== Swarm Plugin — Full Uninstall Checklist ===");
  console.log(`Workspace:    ${plan.workspaceRoot}`);
  console.log(`Plugin root:  ${plan.pluginRoot}`);
  console.log(`Runtime data: ${plan.runtimeDataDir}\n`);

  let totalItems = 0;
  for (const cat of plan.categories) {
    const enabled = selection[cat.id];
    const mark = enabled ? "[x]" : "[ ]";
    console.log(`${mark} ${cat.title} (${cat.items.length} item${cat.items.length === 1 ? "" : "s"})`);
    console.log(`    ${cat.description}`);
    if (cat.items.length === 0) {
      console.log(`    - (nothing detected / already clean)`);
    } else {
      for (const item of cat.items) {
        totalItems++;
        console.log(`    - [${item.kind}] ${item.path}${formatBytes(item.sizeBytes)} — ${item.detail}`);
      }
    }
    console.log("");
  }

  if (flags.removeSource) {
    console.log(`[x] Optional: Delete plugin source folder`);
    console.log(`    - [delete-dir] ${plan.pluginRoot}\n`);
  }

  console.log("Preserved (not removed by default):");
  for (const line of plan.preserved) {
    console.log(`  • ${line}`);
  }
  console.log("");

  if (flags.dryRun) {
    console.log(`[dry-run] Listed ${totalItems} item(s). No files were modified.`);
    process.exit(0);
  }

  if (!flags.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question("Confirm complete removal of all [x] items above? [y/N] ");
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Uninstall cancelled. Nothing was removed.");
        process.exit(0);
      }
    } finally {
      rl.close();
    }
  }

  const result = await executeUninstallPlan(plan, selection, {
    env: { workspaceRoot, pluginRoot },
  });

  console.log("\n=== Removal Summary ===");
  console.log(`Removed: ${result.removed.length} | Configs edited: ${result.edited.length} | Skipped: ${result.skipped.length} | Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of result.errors) console.log(`  ✗ ${err}`);
  }

  console.log("\n=== Verification Checklist ===");
  for (const chk of result.verification) {
    console.log(`  [${chk.passed ? "PASS" : "FAIL"}] ${chk.label} — ${chk.detail}`);
  }

  if (flags.reload) {
    console.log("\nReloading OpenCode host...");
    tryReloadHost();
  } else if (result.nextSteps.length > 0) {
    console.log("\nFinal Host Reload Commands:");
    for (const step of result.nextSteps) console.log(`  ${step}`);
  }

  process.exit(result.ok ? 0 : 1);
}

void main();
