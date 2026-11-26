import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { guiBundleIsStale, registerSwarmInGlobalConfig } from "../scripts/install.js";

const OLD = new Date("2020-01-01T00:00:00Z");
const NEW = new Date("2021-01-01T00:00:00Z");

function writeAt(path: string, contents: string, at: Date) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  utimesSync(path, at, at);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "swarm-install-stale-"));
  return {
    root,
    write: (rel: string, at: Date) => writeAt(join(root, rel), "// file\n", at),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("guiBundleIsStale", () => {
  test("is stale when the bundle is missing", () => {
    const f = fixture();
    try {
      f.write("src/gui.tsx", OLD);
      expect(guiBundleIsStale(f.root)).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  test("is fresh when the bundle is newer than every input", () => {
    const f = fixture();
    try {
      f.write("src/gui.tsx", OLD);
      f.write("src/gui/types.ts", OLD);
      f.write("index.ts", OLD);
      f.write("vite.config.ts", OLD);
      f.write("package.json", OLD);
      f.write("dist/gui-experimental.cjs", NEW);

      expect(guiBundleIsStale(f.root)).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  test("is stale when a nested src file is newer than the bundle", () => {
    const f = fixture();
    try {
      f.write("index.ts", OLD);
      f.write("vite.config.ts", OLD);
      f.write("package.json", OLD);
      f.write("dist/gui-experimental.cjs", OLD);
      f.write("src/gui.tsx", OLD);
      f.write("src/gui/SwarmPanelView.tsx", NEW);

      expect(guiBundleIsStale(f.root)).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  test("is stale when the vite config is newer than the bundle", () => {
    const f = fixture();
    try {
      f.write("src/gui.tsx", OLD);
      f.write("index.ts", OLD);
      f.write("package.json", OLD);
      f.write("dist/gui-experimental.cjs", OLD);
      f.write("vite.config.ts", NEW);

      expect(guiBundleIsStale(f.root)).toBe(true);
    } finally {
      f.cleanup();
    }
  });
});

describe("registerSwarmInGlobalConfig defaults", () => {
  test("a new registration does not pre-enable shell widening", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-install-options-"));
    try {
      const cfgPath = join(root, ".config", "opencode", "opencode.json");
      mkdirSync(dirname(cfgPath), { recursive: true });
      writeFileSync(cfgPath, JSON.stringify({ plugins: [] }, null, 2), "utf8");

      const pluginRoot = join(root, "tools", "opencode-swarm");
      expect(registerSwarmInGlobalConfig(cfgPath, pluginRoot).changed).toBe(true);

      const parsed = JSON.parse(readFileSync(cfgPath, "utf8")) as {
        plugins: Array<{ package: string; options?: Record<string, unknown> }>;
      };
      expect(parsed.plugins).toHaveLength(1);
      expect(parsed.plugins[0].options).toEqual({ boardServer: true });
      expect(parsed.plugins[0].options).not.toHaveProperty("overrideShellAllow");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("existing options are preserved when migrating a stale path", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-install-preserve-"));
    try {
      const cfgPath = join(root, ".config", "opencode", "opencode.json");
      mkdirSync(dirname(cfgPath), { recursive: true });
      writeFileSync(
        cfgPath,
        JSON.stringify(
          {
            plugins: [
              { package: join(root, "tools", "swarm-runtime"), options: { overrideShellAllow: true, workerShellPolicy: "allow" } },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      registerSwarmInGlobalConfig(cfgPath, join(root, "tools", "opencode-swarm"));

      const parsed = JSON.parse(readFileSync(cfgPath, "utf8")) as {
        plugins: Array<{ package: string; options?: Record<string, unknown> }>;
      };
      expect(parsed.plugins[0].options).toEqual({ overrideShellAllow: true, workerShellPolicy: "allow" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
