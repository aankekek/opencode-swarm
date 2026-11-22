import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseModelSpec, listAvailableModels, resolveAndValidateModel } from "../src/models.js";
import {
  globsPotentiallyOverlap,
  pathMatchesGlob,
  resolveSafeWorkspacePath,
  tightenEffect,
  validateAndNormalizeGlob,
  validateMemberName,
} from "../src/security.js";

describe("security & path/glob validation", () => {
  test("validateMemberName enforces Antigravity rules", () => {
    expect(validateMemberName("@Parser")).toBe("parser");
    expect(validateMemberName("worker_1-a")).toBe("worker_1-a");
    expect(() => validateMemberName("all")).toThrow();
    expect(() => validateMemberName("coordinator")).toThrow();
    expect(() => validateMemberName("coordinator-1")).toThrow();
    expect(() => validateMemberName("-bad")).toThrow();
  });

  test("resolveSafeWorkspacePath blocks traversal, UNC, and protected dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-sec-"));
    try {
      expect(resolveSafeWorkspacePath(root, "src/app.ts")).toBe("src/app.ts");
      expect(() => resolveSafeWorkspacePath(root, "../outside.ts")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, "\\\\server\\share\\file.ts")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, ".git/config")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, ".opencode/opencode.jsonc")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, "node_modules/pkg/index.js")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("glob validation rejects braces/brackets and detects overlap", () => {
    expect(() => validateAndNormalizeGlob("src/**/*.{ts,tsx}")).toThrow();
    expect(() => validateAndNormalizeGlob("src/[ab].ts")).toThrow();
    expect(pathMatchesGlob("src/a/b.ts", "src/**/*.ts")).toBe(true);
    expect(globsPotentiallyOverlap("src/**/*.ts", "src/**/*.tsx")).toBe(false);
    expect(globsPotentiallyOverlap("src/**", "src/api/*.ts")).toBe(true);
  });

  test("tightenEffect never weakens deny or ask", () => {
    expect(tightenEffect("deny", "allow")).toBe("deny");
    expect(tightenEffect("ask", "allow")).toBe("ask");
    expect(tightenEffect("allow", "ask")).toBe("ask");
    expect(tightenEffect("ask", "deny")).toBe("deny");
  });
});

describe("manual model & variant selection", () => {
  const modelEntries = [
    {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
      enabled: true,
      status: "active",
      variants: [{ id: "low" }, { id: "high" }],
    },
    {
      providerID: "openai",
      modelID: "gpt-5.4",
      enabled: true,
      status: "active",
      variants: [{ id: "medium" }, { id: "high" }],
    },
  ];

  const mockCtx = {
    model: {
      async list() {
        return modelEntries;
      },
      async default() {
        return { providerID: "anthropic", modelID: "claude-sonnet-4-6" };
      },
    },
  } as any;

  test("parseModelSpec supports provider/model#variant, separate variant, and #variant", () => {
    expect(parseModelSpec("anthropic/claude-sonnet-4-6#high")).toEqual({
      providerID: "anthropic",
      id: "claude-sonnet-4-6",
      variant: "high",
    });
    expect(parseModelSpec("openai/gpt-5.4", "medium")).toEqual({
      providerID: "openai",
      id: "gpt-5.4",
      variant: "medium",
    });
    expect(parseModelSpec(undefined, "high")).toEqual({ variantOnly: "high" });
  });

  test("resolveAndValidateModel inherits fallback and rejects unknown model/variant", async () => {
    const fallback = { providerID: "anthropic", id: "claude-sonnet-4-6", variant: "low" };
    expect(await resolveAndValidateModel(mockCtx, undefined, undefined, fallback)).toEqual(fallback);
    expect(await resolveAndValidateModel(mockCtx, undefined, "high", fallback)).toEqual({
      providerID: "anthropic",
      id: "claude-sonnet-4-6",
      variant: "high",
    });
    await expect(resolveAndValidateModel(mockCtx, "anthropic/unknown", undefined, fallback)).rejects.toThrow();
    await expect(resolveAndValidateModel(mockCtx, "anthropic/claude-sonnet-4-6#ultra", undefined, fallback)).rejects.toThrow();
  });

  test("listAvailableModels reads the host { location, data } envelope", async () => {
    const envelopeCtx = {
      model: {
        async list() {
          return {
            location: { directory: "/repo" },
            data: [
              ...modelEntries,
              { providerID: "x", modelID: "old", enabled: true, status: "deprecated", variants: [] },
              { providerID: "x", modelID: "off", enabled: false, status: "active", variants: [] },
            ],
          };
        },
        async default() {
          return { location: { directory: "/repo" }, data: modelEntries[0] };
        },
      },
    } as any;

    const catalog = await listAvailableModels(envelopeCtx, { all: false });
    expect(catalog.models.map((m) => m.spec)).toEqual([
      "anthropic/claude-sonnet-4-6",
      "openai/gpt-5.4",
    ]);
    expect(catalog.models[0].variants).toEqual(["low", "high"]);
    expect(catalog.defaultModel).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    });

    const all = await listAvailableModels(envelopeCtx, { all: true });
    expect(all.models).toHaveLength(4);
  });
});
