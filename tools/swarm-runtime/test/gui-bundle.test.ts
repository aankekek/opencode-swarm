import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

describe("OpenCode v2 GUI experimental bundle", () => {
  test("dist/gui-experimental.cjs exists, is valid CJS, and uses rpcID + layout.open", () => {
    const bundlePath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "gui-experimental.cjs");
    expect(existsSync(bundlePath)).toBe(true);
    const code = readFileSync(bundlePath, "utf8");
    expect(code).toContain("use strict");
    expect(code).toContain("local.swarm-runtime");
    expect(code).toContain("getBoardInfo");
    expect(code).toContain("rpcID");
    expect(code).toContain("session.panel");
    expect(code).toContain("swarm-board");
    expect(code).toContain("swarm:open_session");
  });
});
