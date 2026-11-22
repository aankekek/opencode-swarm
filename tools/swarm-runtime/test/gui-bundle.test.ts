import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("OpenCode v2 GUI experimental bundle", () => {
  test("dist/gui-experimental.cjs exists, is valid CJS, includes all surfaces, and bundles zero host modules", () => {
    const bundlePath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "gui-experimental.cjs");
    expect(existsSync(bundlePath)).toBe(true);
    const code = readFileSync(bundlePath, "utf8");

    expect(code).toContain("use strict");
    expect(code).toContain("local.swarm-runtime");
    expect(code).toContain("getSwarmSnapshot");
    expect(code).toContain("listSwarms");
    expect(code).toContain("rpc.local.swarm-runtime.changed");
    expect(code).toContain("rpcID");

    // Surfaces & registries
    expect(code).toContain("swarm-board");
    expect(code).toContain("Swarm Board");
    expect(code).toContain("session.panel");
    expect(code).toContain("window.bottom");
    expect(code).toContain("swarm-composer-pill");
    expect(code).toContain("swarm-open");
    expect(code).toContain("sidebarShow");
    expect(code).toContain("pillbarShow");
    expect(code).toContain("composerPill");
    expect(code).toContain("bottomStrip");
    expect(code).toContain("withSidePanel");
    expect(code).toContain("toastEnabled");

    // Zero bundled host modules
    expect(code).not.toContain("@opencode/ui");
    expect(code).not.toContain("node:sqlite");
    expect(code).not.toContain("better-sqlite3");
  });
});
