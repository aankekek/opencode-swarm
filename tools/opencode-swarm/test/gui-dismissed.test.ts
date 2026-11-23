import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "solid-js";
import { createDismissedFlag } from "../src/gui/useDismissed.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const guiDir = join(testDir, "..", "src", "gui");

describe("createDismissedFlag", () => {
  test("is false while the root is alive and true after disposal", () => {
    const { flag, dispose } = createRoot((dispose) => {
      const flag = createDismissedFlag();
      expect(flag()).toBe(false);
      return { flag, dispose };
    });

    expect(flag()).toBe(false);
    dispose();
    expect(flag()).toBe(true);
    // The getter must stay safe to call after disposal.
    expect(flag()).toBe(true);
  });
});

describe("dialog post-await dismissal guards", () => {
  const components = ["SwarmOnboardingModal", "SwarmUninstallModal", "SwarmControlOverlay"];
  const importPattern = /import\s*\{[^}]*\bcreateDismissedFlag\b[^}]*\}\s*from\s*["']\.\/useDismissed(?:\.js)?["']/;
  const createPattern = /const\s+([A-Za-z_$][\w$]*)\s*=\s*createDismissedFlag\s*\(\s*\)/;

  for (const component of components) {
    test(`${component} creates the flag and bails after an await when dismissed`, () => {
      const source = readFileSync(join(guiDir, `${component}.tsx`), "utf8");

      expect(source).toMatch(importPattern);
      const created = source.match(createPattern);
      expect(created).not.toBeNull();

      const flagName = created![1];
      // Formatting-tolerant: a guard must follow some await in the same function.
      const postAwaitGuard = new RegExp(
        `await[\\s\\S]{0,600}?if\\s*\\(\\s*${flagName}\\(\\)\\s*\\)\\s*return`
      );
      expect(source).toMatch(postAwaitGuard);
    });
  }
});
