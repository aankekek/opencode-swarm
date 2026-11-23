import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripJsonComments } from "../src/uninstall.js";

const SWARM_MATCH_RE = /(?:^|[\\/])(?:opencode-swarm|swarm-runtime)(?:$|[\\/])|local\.(?:opencode-swarm|swarm-runtime)/i;

function samePath(a: string, b: string): boolean {
  const ra = resolve(a);
  const rb = resolve(b);
  return process.platform === "win32" ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

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

  const targetPath = resolve(pluginRoot);
  const plugins = Array.isArray(parsed.plugins) ? [...parsed.plugins] : [];
  const matchingIndices: number[] = [];
  for (let i = 0; i < plugins.length; i++) {
    const entry = plugins[i];
    if (typeof entry === "string") {
      if (SWARM_MATCH_RE.test(entry)) matchingIndices.push(i);
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const pkg = (entry as { package?: unknown; id?: unknown }).package ?? (entry as { id?: unknown }).id;
      if (typeof pkg === "string" && SWARM_MATCH_RE.test(pkg)) matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 1) {
    const existing = plugins[matchingIndices[0]];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      const pkg = (existing as { package?: unknown }).package;
      if (typeof pkg === "string" && samePath(pkg, targetPath)) {
        return { changed: false, created: false };
      }
    }
  }

  if (matchingIndices.length > 0) {
    const first = plugins[matchingIndices[0]];
    const firstObj = first && typeof first === "object" && !Array.isArray(first)
      ? (first as { options?: unknown })
      : null;
    const preservedOptions = firstObj && firstObj.options !== undefined
      ? firstObj.options
      : { overrideShellAllow: true, boardServer: true };
    const replacement = {
      package: targetPath,
      options: preservedOptions,
    };
    const nextPlugins: unknown[] = [];
    let replaced = false;
    for (let i = 0; i < plugins.length; i++) {
      if (matchingIndices.includes(i)) {
        if (!replaced) {
          nextPlugins.push(replacement);
          replaced = true;
        }
      } else {
        nextPlugins.push(plugins[i]);
      }
    }
    parsed.plugins = nextPlugins;
  } else {
    plugins.push({
      package: targetPath,
      options: {
        overrideShellAllow: true,
        boardServer: true,
      },
    });
    parsed.plugins = plugins;
  }

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
    console.log(`[install:plugin] ${reg.created ? "Created" : "Updated"} ${globalConfigPath} with opencode-swarm.`);
  } else {
    console.log(`[install:plugin] opencode-swarm is already registered in ${globalConfigPath}.`);
  }

  console.log("\nDone! Fully quit and restart OpenCode Desktop to load the Swarm Board GUI, pills, and settings.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
