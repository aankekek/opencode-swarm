import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyIfCurrent } from "../src/gui/types.js";

describe("applyIfCurrent", () => {
  test("stale request sequence does not invoke the callback and does not throw", () => {
    let calls = 0;
    let result: boolean | undefined;
    expect(() => {
      result = applyIfCurrent(1, 2, () => {
        calls += 1;
      });
    }).not.toThrow();
    expect(result).toBe(false);
    expect(calls).toBe(0);
  });

  test("matching sequence returns true and invokes the callback exactly once", () => {
    let calls = 0;
    const result = applyIfCurrent(7, 7, () => {
      calls += 1;
    });
    expect(result).toBe(true);
    expect(calls).toBe(1);
  });

  test("a throwing callback propagates (the guard is not an error boundary)", () => {
    let calls = 0;
    expect(() =>
      applyIfCurrent(3, 3, () => {
        calls += 1;
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(calls).toBe(1);
  });
});

describe("gui.tsx stale role-config guard", () => {
  test("getRoleConfig then-block is wrapped in applyIfCurrent", () => {
    const guiPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "gui.tsx");
    const source = readFileSync(guiPath, "utf8");

    expect(source).toContain("applyIfCurrent(mySeq, refreshSeq, () => {");

    const roleCfgBlock =
      /getRoleConfig\([\s\S]{0,400}?\.then\(\(rawCfg\) => \{\s*applyIfCurrent\(mySeq, refreshSeq, \(\) => \{[\s\S]{0,600}?setAutoSpawnVerifier\(cfg\.autoSpawnVerifier\);/;
    expect(roleCfgBlock.test(source)).toBe(true);

    // The catch is still present and fire-and-forget.
    expect(source).toContain(".catch(() => {});");
  });
});
