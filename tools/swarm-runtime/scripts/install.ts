import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripJsonComments } from "../src/uninstall.js";

const SWARM_MATCH_RE = /(?:^|[\\/])swarm-runtime(?:$|[\\/])|local\.swarm-runtime/i;

export function registerSwarmInGlobalConfig(
  configPath: string,
  pluginRoot: string,
): { changed: boolean; created: boolean } {
  let created = false;
  let parsed: Record<string, unknown> = { $schema: "https://opencode.ai/config.json", plugins: [] };

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf8");
    const obj = JSON.parse(stripJsonComments(raw)) as unknown;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      parsed = obj as Record<string, unknown>;
    }
  } else {
    created = true;
    mkdirSync(dirname(configPath), { recursive: true });
  }

  const plugins = Array.isArray(parsed.plugins) ? [...parsed.plugins] : [];
  const alreadyPresent = plugins.some((entry) => {
    if (typeof entry === "string") return SWARM_MATCH_RE.test(entry);
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const pkg = (entry as { package?: unknown; id?: unknown }).package ?? (entry as { id?: unknown }).id;
      return typeof pkg === "string" && SWARM_MATCH_RE.test(pkg);
    }
    return false;
  });

  if (alreadyPresent) {
    return { changed: false, created: false };
  }

  plugins.push({
    package: resolve(pluginRoot),
    options: {
      overrideShellAllow: true,
      boardServer: true,
    },
  });
  parsed.plugins = plugins;

  writeFileSync(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return { changed: true, created };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const forceRebuild = args.has("--rebuild");
  const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const globalConfigPath = join(homedir(), ".config", "opencode", "opencode.json");

  if (!existsSync(join(pluginRoot, "node_modules"))) {
    console.log("[install:plugin] Installing dependencies (bun install)...");
    execFileSync("bun", ["install"], { cwd: pluginRoot, stdio: "inherit" });
  }

  if (forceRebuild || !existsSync(join(pluginRoot, "dist", "gui-experimental.cjs"))) {
    console.log("[install:plugin] Building Desktop GUI bundle (bun run build:gui)...");
    execFileSync("bun", ["run", "build:gui"], { cwd: pluginRoot, stdio: "inherit" });
  }

  const reg = registerSwarmInGlobalConfig(globalConfigPath, pluginRoot);
  if (reg.changed) {
    console.log(`[install:plugin] ${reg.created ? "Created" : "Updated"} ${globalConfigPath} with swarm-runtime.`);
  } else {
    console.log(`[install:plugin] swarm-runtime is already registered in ${globalConfigPath}.`);
  }

  console.log("\nDone! Fully quit and restart OpenCode Desktop to load the Swarm Board GUI, pills, and settings.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
