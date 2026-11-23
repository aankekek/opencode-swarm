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

describe("gui.tsx event subscription re-arm", () => {
  const guiPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "gui.tsx");
  const source = readFileSync(guiPath, "utf8");

  test("forceEventResubscribe exists and aborts then re-subscribes", () => {
    const helper =
      /function\s+forceEventResubscribe\s*\(\s*\)\s*\{[\s\S]{0,300}?eventAbort\?\.abort\(\)[\s\S]{0,200}?subscribedClient\s*=\s*null[\s\S]{0,200}?ensureEventSubscription\(\)/;
    expect(helper.test(source)).toBe(true);
  });

  test("the connected transition re-arms the subscription exactly once in refresh", () => {
    const transition =
      /if\s*\(\s*currentRpc\.state\s*!==\s*"connected"\s*\)\s*\{\s*setRpcStatus\(\{\s*state:\s*"connected"\s*\}\);[\s\S]{0,300}?forceEventResubscribe\(\);/;
    expect(transition.test(source)).toBe(true);
    expect(source.match(/forceEventResubscribe\(\)/g)?.length).toBe(2);
  });
});
