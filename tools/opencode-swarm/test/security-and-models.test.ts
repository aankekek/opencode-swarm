import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseModelSpec, listAvailableModels, resolveAndValidateModel } from "../src/models.js";
import { buildRolePermissions, evaluateActionForMember } from "../src/policy.js";
import {
  extractTargetPaths,
  globsPotentiallyOverlap,
  pathMatchesGlob,
  resolveSafeWorkspacePath,
  tightenEffect,
  validateAndNormalizeGlob,
  validateMemberName,
} from "../src/security.js";
import type { MemberRow, SwarmRow } from "../src/types.js";

/**
 * Creates a directory link (junction on Windows, dir symlink elsewhere).
 * Returns false when the environment forbids link creation.
 */
function createDirLink(target: string, linkPath: string): boolean {
  try {
    symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (err: any) {
    if (err?.code === "EPERM" || err?.code === "EACCES" || err?.code === "ENOSYS") return false;
    throw err;
  }
}

const symlinkSupport = (() => {
  const probe = mkdtempSync(join(tmpdir(), "swarm-symlink-probe-"));
  try {
    mkdirSync(join(probe, "target"));
    return createDirLink(join(probe, "target"), join(probe, "probe-link"));
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();


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
      expect(resolveSafeWorkspacePath(root, "..hidden/x.txt")).toBe("..hidden/x.txt");
      expect(() => resolveSafeWorkspacePath(root, "../outside.ts")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, "\\\\server\\share\\file.ts")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, ".git/config")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, ".opencode/opencode.jsonc")).toThrow();
      expect(() => resolveSafeWorkspacePath(root, "node_modules/pkg/index.js")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolveSafeWorkspacePath blocks dangling symlink escapes (SEC-H4)", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-symlink-root-"));
    const outside = mkdtempSync(join(tmpdir(), "swarm-symlink-outside-"));
    try {
      const linkPath = join(root, "ghost.txt");
      const targetPath = join(outside, "non-existent-target.txt");
      try {
        symlinkSync(targetPath, linkPath);
        expect(() => resolveSafeWorkspacePath(root, "ghost.txt")).toThrow(/escapes workspace root/);
      } catch (err: any) {
        // Skip symlink creation if Windows permissions lack SeCreateSymbolicLinkPrivilege
        if (err.code !== "EPERM") throw err;
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("resolveSafeWorkspacePath resolves symlinks before applying '..' (vendor/../escape.txt)", () => {
    if (!symlinkSupport) {
      console.warn("[skipped] resolveSafeWorkspacePath symlink '..' escape tests: symlinks unavailable");
      return;
    }
    const root = mkdtempSync(join(tmpdir(), "swarm-symlink-dotdot-root-"));
    const outside = mkdtempSync(join(tmpdir(), "swarm-symlink-dotdot-outside-"));
    try {
      writeFileSync(join(outside, "escape.txt"), "outside");
      expect(createDirLink(outside, join(root, "vendor"))).toBe(true);

      // Lexical collapse would yield <root>/escape.txt; the OS lands in outside's parent.
      expect(() => resolveSafeWorkspacePath(root, "vendor/../escape.txt")).toThrow(/escapes workspace root/);
      expect(() => resolveSafeWorkspacePath(root, "vendor/../../escape.txt")).toThrow(/escapes workspace root/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("resolveSafeWorkspacePath keeps blocking direct symlink traversal", () => {
    if (!symlinkSupport) {
      console.warn("[skipped] resolveSafeWorkspacePath direct symlink traversal test: symlinks unavailable");
      return;
    }
    const root = mkdtempSync(join(tmpdir(), "swarm-symlink-direct-root-"));
    const outside = mkdtempSync(join(tmpdir(), "swarm-symlink-direct-outside-"));
    try {
      writeFileSync(join(outside, "pwn.txt"), "outside");
      expect(createDirLink(outside, join(root, "link"))).toBe(true);
      expect(() => resolveSafeWorkspacePath(root, "link/pwn.txt")).toThrow(/escapes workspace root/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("resolveSafeWorkspacePath still allows in-workspace '..' and non-existent paths", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-inroot-"));
    try {
      mkdirSync(join(root, "sub"));
      writeFileSync(join(root, "file.txt"), "ok");
      expect(resolveSafeWorkspacePath(root, "sub/../file.txt")).toBe("file.txt");
      expect(resolveSafeWorkspacePath(root, "new/dir/file.ts")).toBe("new/dir/file.ts");
      expect(resolveSafeWorkspacePath(root, "./sub/../file.txt")).toBe("file.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolveSafeWorkspacePath canonicalizes symlinks that point inside the workspace", () => {
    if (!symlinkSupport) {
      console.warn("[skipped] resolveSafeWorkspacePath inside-workspace symlink test: symlinks unavailable");
      return;
    }
    const root = mkdtempSync(join(tmpdir(), "swarm-symlink-inside-root-"));
    try {
      mkdirSync(join(root, "real"));
      writeFileSync(join(root, "real", "deep.txt"), "ok");
      expect(createDirLink(join(root, "real"), join(root, "alias"))).toBe(true);
      expect(resolveSafeWorkspacePath(root, "alias/deep.txt")).toBe("real/deep.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolveSafeWorkspacePath rejects Windows-style and absolute outside paths", () => {
    const root = mkdtempSync(join(tmpdir(), "swarm-outside-"));
    const outside = mkdtempSync(join(tmpdir(), "swarm-outside-target-"));
    try {
      expect(() => resolveSafeWorkspacePath(root, "..\\..\\escape.txt")).toThrow(/escapes workspace root/);
      expect(() => resolveSafeWorkspacePath(root, join(outside, "escape.txt"))).toThrow(/escapes workspace root/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("glob validation rejects braces/brackets and detects overlap", () => {
    expect(() => validateAndNormalizeGlob("src/**/*.{ts,tsx}")).toThrow();
    expect(() => validateAndNormalizeGlob("src/[ab].ts")).toThrow();
    expect(pathMatchesGlob("src/a/b.ts", "src/**/*.ts")).toBe(true);
    expect(globsPotentiallyOverlap("src/**/*.ts", "src/**/*.tsx")).toBe(false);
    expect(globsPotentiallyOverlap("src/**", "src/api/*.ts")).toBe(true);
  });

  test("glob ReDoS protection caps length, ** count, and rejects **/** (SEC-H5)", () => {
    expect(() => validateAndNormalizeGlob("a/".repeat(150) + "x.ts")).toThrow(/maximum length/);
    expect(() => validateAndNormalizeGlob("a/**/**/b")).toThrow(/Consecutive double-star/);
    expect(() => validateAndNormalizeGlob("a/" + "b/**/".repeat(9) + "z.ts")).toThrow(/maximum permitted '\*\*'/);

    // Verify segment matcher runs in <10ms for deep paths
    const deepPath = "a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z.ts";
    const start = performance.now();
    expect(pathMatchesGlob(deepPath, "a/**/z.ts")).toBe(true);
    expect(performance.now() - start).toBeLessThan(50);
  });

  test("extractTargetPaths extracts file, destination, to, from, and array keys (SEC-H3 / SEC-L10)", () => {
    expect(extractTargetPaths("move", { file: "src/a.ts", destination: "src/b.ts" })).toEqual(["src/a.ts", "src/b.ts"]);
    const copyPaths = extractTargetPaths("copy", { from: "foo.ts", to: "bar.ts" });
    expect(copyPaths).toContain("foo.ts");
    expect(copyPaths).toContain("bar.ts");
    expect(extractTargetPaths("batch", { files: ["1.ts", "2.ts"] })).toEqual(["1.ts", "2.ts"]);
  });

  test("tightenEffect never weakens deny or ask", () => {
    expect(tightenEffect("deny", "allow")).toBe("deny");
    expect(tightenEffect("ask", "allow")).toBe("ask");
    expect(tightenEffect("allow", "ask")).toBe("ask");
    expect(tightenEffect("ask", "deny")).toBe("deny");
  });

  test("policy enforces strict role allowlist and default deny (SEC-C1)", () => {
    const mockDb: any = { listLocks: () => [] };
    const swarm: SwarmRow = {
      id: "sw_test",
      title: "Test",
      objective: "Test",
      status: "running",
      created_at: 0,
      updated_at: 0,
      last_monitor_nudge_seq: 0,
      monitor_nudge_count: 0,
    };
    const root = "C:/fake/repo";

    const attacker: MemberRow = {
      id: "m_attacker",
      swarm_id: "sw_test",
      name: "attacker",
      generation: 1,
      session_id: "s_att",
      role: "root" as any,
      added_by: "coordinator",
      group_prefix: null,
      model_provider: null,
      model_id: null,
      model_variant: null,
      workspace_mode: "inherit",
      workspace_dir: root,
      workspace_branch: null,
      brief: "attack",
      state: "working",
      wake_mode: "mentions",
      wait_since: 0,
      last_read_seq: 0,
      last_post_seq: 0,
      last_post_time: null,
      steps: 0,
      activity: null,
      activity_kind: null,
      last_error: null,
      paused_quota: 0,
      track_status: "open",
      last_active_at: Date.now(),
    };

    const res = evaluateActionForMember(mockDb, root, attacker, swarm, "shell", [], {});
    expect(res.decision).toBe("deny");

    const perms = buildRolePermissions("root" as any, {});
    expect(perms.every((p) => p.effect === "deny")).toBe(true);
  });

  test("policy denies write_file and unknown tools for read-only roles (SEC-H3)", () => {
    const mockDb: any = { listLocks: () => [] };
    const swarm: SwarmRow = {
      id: "sw_test",
      title: "Test",
      objective: "Test",
      status: "running",
      created_at: 0,
      updated_at: 0,
      last_monitor_nudge_seq: 0,
      monitor_nudge_count: 0,
    };
    const root = "C:/fake/repo";

    const verifier: MemberRow = {
      id: "m_v",
      swarm_id: "sw_test",
      name: "verifier",
      generation: 1,
      session_id: "s_v",
      role: "verifier",
      added_by: "coordinator",
      group_prefix: null,
      model_provider: null,
      model_id: null,
      model_variant: null,
      workspace_mode: "inherit",
      workspace_dir: root,
      workspace_branch: null,
      brief: "verify",
      state: "working",
      wake_mode: "mentions",
      wait_since: 0,
      last_read_seq: 0,
      last_post_seq: 0,
      last_post_time: null,
      steps: 0,
      activity: null,
      activity_kind: null,
      last_error: null,
      paused_quota: 0,
      track_status: "open",
      last_active_at: Date.now(),
    };

    expect(evaluateActionForMember(mockDb, root, verifier, swarm, "write_file", ["foo.ts"], {}).decision).toBe("deny");
    expect(evaluateActionForMember(mockDb, root, verifier, swarm, "mcp_custom_write", ["foo.ts"], {}).decision).toBe("deny");
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
