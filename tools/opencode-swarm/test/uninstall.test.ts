import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildUninstallPlan,
  executeUninstallPlan,
  removeSwarmFromConfigContent,
  stripJsonComments,
  verifyUninstall,
} from "../src/uninstall.js";
import { registerSwarmInGlobalConfig } from "../scripts/install.js";

describe("Swarm Uninstall Checklist & Complete Removal", () => {
  test("stripJsonComments preserves URLs inside strings and removes JSONC comments + trailing commas", () => {
    const raw = `{
      "$schema": "https://opencode.ai/config.json", // keep URL!
      /* block comment */
      "plugins": [
        "@slkiser/opencode-quota",
        { "package": "../tools/swarm-runtime", "options": { "overrideShellAllow": true, }, },
      ],
    }`;
    const parsed = JSON.parse(stripJsonComments(raw));
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.plugins.length).toBe(2);

    const res = removeSwarmFromConfigContent(raw);
    expect(res.changed).toBe(true);
    expect(res.emptyAfter).toBe(false);
    const after = JSON.parse(res.nextContent);
    expect(after.plugins).toEqual(["@slkiser/opencode-quota"]);
  });

  test("buildUninstallPlan, executeUninstallPlan, and verifyUninstall remove all Swarm artifacts cleanly while preserving unrelated files", async () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-uninstall-test-"));
    const homeDir = join(root, "home");
    const globalCfgDir = join(homeDir, ".config", "opencode");
    const tempDir = join(root, "temp");
    const workspaceRoot = join(root, "workspace");
    const pluginRoot = join(workspaceRoot, "tools", "swarm-runtime");
    const runtimeDataDir = join(homeDir, ".opencode-swarm");

    mkdirSync(globalCfgDir, { recursive: true });
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(workspaceRoot, ".opencode"), { recursive: true });
    mkdirSync(join(workspaceRoot, "sandbox-test-repo", ".opencode"), { recursive: true });
    mkdirSync(join(pluginRoot, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(pluginRoot, "dist"), { recursive: true });
    mkdirSync(join(runtimeDataDir, "d7b3d3902d25"), { recursive: true });

    try {
      // Git repo with initial commit, swarm/* branch, and orphan worktree inside ~/.opencode-swarm
      execFileSync("git", ["init", workspaceRoot], { stdio: "ignore" });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workspaceRoot, stdio: "ignore" });
      execFileSync("git", ["config", "user.name", "Tester"], { cwd: workspaceRoot, stdio: "ignore" });
      writeFileSync(join(workspaceRoot, "README.md"), "# Test\n", "utf8");
      execFileSync("git", ["add", "README.md"], { cwd: workspaceRoot, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "init"], { cwd: workspaceRoot, stdio: "ignore" });

      const worktreeDir = join(runtimeDataDir, "d7b3d3902d25", "worktrees", "sw_1425c701", "beta");
      mkdirSync(join(runtimeDataDir, "d7b3d3902d25", "worktrees", "sw_1425c701"), { recursive: true });
      execFileSync("git", ["worktree", "add", "-b", "swarm/sw_1425c701/beta", worktreeDir], {
        cwd: workspaceRoot,
        stdio: "ignore",
      });

      // Global config (with quota plugin + backup file that must be preserved)
      const globalCfgPath = join(globalCfgDir, "opencode.json");
      writeFileSync(
        globalCfgPath,
        JSON.stringify(
          {
            $schema: "https://opencode.ai/config.json",
            plugins: [
              "@slkiser/opencode-quota",
              { package: pluginRoot, options: { overrideShellAllow: true } },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );
      const backupPath = join(globalCfgDir, "opencode.json.bak");
      writeFileSync(backupPath, "{\"backup\": true}\n", "utf8");

      // Project & sandbox configs
      const projCfgPath = join(workspaceRoot, ".opencode", "opencode.jsonc");
      writeFileSync(
        projCfgPath,
        `{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": [{ "package": "../tools/swarm-runtime" }]\n}\n`,
        "utf8",
      );
      const sandboxCfgPath = join(workspaceRoot, "sandbox-test-repo", ".opencode", "opencode.jsonc");
      writeFileSync(
        sandboxCfgPath,
        `{\n  "plugins": [{ "package": "../../tools/swarm-runtime" }]\n}\n`,
        "utf8",
      );

      // Runtime data & build artifacts
      writeFileSync(join(runtimeDataDir, "role-models.json"), '{"worker":"openai/gpt-5.4"}\n', "utf8");
      writeFileSync(join(pluginRoot, "dist", "gui-experimental.cjs"), "// bundle\n", "utf8");
      writeFileSync(join(pluginRoot, "node_modules", "pkg", "index.js"), "// dep\n", "utf8");
      writeFileSync(join(pluginRoot, "package.json"), '{"name":"swarm-runtime"}\n', "utf8");

      // Temp files (matching + unrelated file that must survive)
      mkdirSync(join(tempDir, "swarm-probe-1"), { recursive: true });
      writeFileSync(join(tempDir, "swarm-probe-1", "a.txt"), "x", "utf8");
      writeFileSync(join(tempDir, "dump_test.ts"), "console.log(1)\n", "utf8");
      writeFileSync(join(tempDir, "smoke1.ts"), "console.log(2)\n", "utf8");
      writeFileSync(join(tempDir, "opencode-debug.json"), "{}\n", "utf8");
      // Unrelated user temp dir: must never be swept up by the uninstall plan.
      const unrelatedTempDir = join(tempDir, "opencode");
      mkdirSync(unrelatedTempDir, { recursive: true });
      const keepTempPath = join(tempDir, "keep-me.txt");
      writeFileSync(keepTempPath, "preserve\n", "utf8");

      const env = {
        homeDir,
        tempDir,
        workspaceRoot,
        pluginRoot,
        globalConfigDirs: [globalCfgDir],
      };

      const plan = buildUninstallPlan(env);
      const byId = new Map(plan.categories.map((c) => [c.id, c]));

      expect(byId.get("pluginRegistration")!.items.length).toBe(3);
      expect(byId.get("gitWorktreesAndBranches")!.items.some((i) => i.kind === "git-worktree")).toBe(true);
      expect(byId.get("gitWorktreesAndBranches")!.items.some((i) => i.kind === "git-branch" && i.path === "swarm/sw_1425c701/beta")).toBe(true);
      expect(byId.get("runtimeData")!.items.length).toBe(1);
      expect(byId.get("buildArtifacts")!.items.length).toBe(2);
      expect(byId.get("tempFiles")!.items.length).toBe(4);
      expect(byId.get("tempFiles")!.items.some((i) => i.path === unrelatedTempDir)).toBe(false);

      // P0-5: Omitted/empty selection must be a safe no-op
      const noopRes = await executeUninstallPlan(plan, {}, { env });
      expect(noopRes.removed.length).toBe(0);
      expect(noopRes.edited.length).toBe(0);
      expect(existsSync(runtimeDataDir)).toBe(true);

      const fullSelection = {
        pluginRegistration: true,
        gitWorktreesAndBranches: true,
        runtimeData: true,
        buildArtifacts: true,
        tempFiles: true,
      };
      const result = await executeUninstallPlan(plan, fullSelection, { env });
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.verification.every((v) => v.passed)).toBe(true);

      // Global config edited cleanly, other plugin & backup preserved
      const updatedGlobal = JSON.parse(readFileSync(globalCfgPath, "utf8"));
      expect(updatedGlobal.plugins).toEqual(["@slkiser/opencode-quota"]);
      expect(existsSync(backupPath)).toBe(true);

      // Dedicated project/sandbox configs & empty .opencode dirs deleted
      expect(existsSync(projCfgPath)).toBe(false);
      expect(existsSync(join(workspaceRoot, ".opencode"))).toBe(false);
      expect(existsSync(sandboxCfgPath)).toBe(false);
      expect(existsSync(join(workspaceRoot, "sandbox-test-repo", ".opencode"))).toBe(false);

      // Runtime, build artifacts, and temp files removed; source & unrelated temp kept
      expect(existsSync(runtimeDataDir)).toBe(false);
      expect(existsSync(join(pluginRoot, "node_modules"))).toBe(false);
      expect(existsSync(join(pluginRoot, "dist"))).toBe(false);
      expect(existsSync(join(pluginRoot, "package.json"))).toBe(true);
      expect(existsSync(keepTempPath)).toBe(true);
      expect(existsSync(unrelatedTempDir)).toBe(true);
      expect(existsSync(join(tempDir, "opencode-debug.json"))).toBe(false);

      const postChecks = await verifyUninstall(plan, fullSelection, env);
      expect(postChecks.every((c) => c.passed)).toBe(true);
    } finally {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("CLI scripts/uninstall.ts --dry-run exits 0 and deletes nothing", () => {
    const out = execFileSync("bun", ["run", "scripts/uninstall.ts", "--dry-run"], {
      cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
      encoding: "utf8",
    });
    expect(out).toContain("Swarm Plugin — Full Uninstall Checklist");
    expect(out).toContain("[dry-run]");
  });

  test("registerSwarmInGlobalConfig registers idempotently and preserves existing plugins", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-install-test-"));
    try {
      const cfgPath = join(root, ".config", "opencode", "opencode.json");
      mkdirSync(dirname(cfgPath), { recursive: true });
      writeFileSync(cfgPath, JSON.stringify({ plugins: ["@slkiser/opencode-quota"] }, null, 2), "utf8");

      const pluginRoot = join(root, "tools", "opencode-swarm");
      const first = registerSwarmInGlobalConfig(cfgPath, pluginRoot);
      expect(first.changed).toBe(true);
      const second = registerSwarmInGlobalConfig(cfgPath, pluginRoot);
      expect(second.changed).toBe(false);

      const parsed = JSON.parse(readFileSync(cfgPath, "utf8"));
      expect(parsed.plugins.length).toBe(2);
      expect(parsed.plugins[0]).toBe("@slkiser/opencode-quota");
    } finally {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {}
    }
  });

  test("removeSwarmFromConfigContent removes opencode-swarm paths and local.opencode-swarm entries", () => {
    const raw = JSON.stringify(
      {
        plugins: [
          "@slkiser/opencode-quota",
          { package: "../tools/opencode-swarm", options: { boardServer: true } },
          "local.opencode-swarm",
        ],
      },
      null,
      2,
    );
    const res = removeSwarmFromConfigContent(raw);
    expect(res.changed).toBe(true);
    expect(res.emptyAfter).toBe(false);
    const after = JSON.parse(res.nextContent);
    expect(after.plugins).toEqual(["@slkiser/opencode-quota"]);
  });

  test("registerSwarmInGlobalConfig migrates stale swarm-runtime path, preserves options, deduplicates, and is idempotent", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-install-migrate-"));
    try {
      const cfgPath = join(root, ".config", "opencode", "opencode.json");
      const oldPluginRoot = join(root, "tools", "swarm-runtime");
      const newPluginRoot = join(root, "tools", "opencode-swarm");
      mkdirSync(dirname(cfgPath), { recursive: true });
      writeFileSync(
        cfgPath,
        JSON.stringify(
          {
            plugins: [
              "@slkiser/opencode-quota",
              {
                package: oldPluginRoot,
                options: { stallTimeoutMs: 42000, boardServer: false },
              },
              "../tools/swarm-runtime",
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      const migrated = registerSwarmInGlobalConfig(cfgPath, newPluginRoot);
      expect(migrated.changed).toBe(true);

      const parsed = JSON.parse(readFileSync(cfgPath, "utf8"));
      expect(parsed.plugins).toEqual([
        "@slkiser/opencode-quota",
        {
          package: newPluginRoot,
          options: { stallTimeoutMs: 42000, boardServer: false },
        },
      ]);

      const again = registerSwarmInGlobalConfig(cfgPath, newPluginRoot);
      expect(again.changed).toBe(false);
    } finally {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {}
    }
  });
});
