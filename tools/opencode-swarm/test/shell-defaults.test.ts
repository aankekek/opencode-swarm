import { describe, expect, test } from "bun:test";
import { buildRolePermissions, resolveCoordinatorShellPolicy } from "../src/policy.js";
import type { MemberRole, PermissionEffect, PluginOptions } from "../src/types.js";

/**
 * Shell widening is opt-in.
 *
 * `buildRolePermissions` is what the permission hook evaluates against, so a
 * role's resolved effect here is the ceiling the plugin can grant. The defaults
 * must leave shell at "ask" and let the host's own permission config decide;
 * only an explicit `overrideShellAllow: true` plus a policy of "allow" may
 * widen it.
 */

function shellEffect(role: MemberRole, options: PluginOptions): PermissionEffect | undefined {
  return buildRolePermissions(role, options).find((p) => p.action === "shell")?.effect;
}

describe("shell policy defaults", () => {
  test("no options leaves every role's shell at ask or deny, never allow", () => {
    expect(shellEffect("coordinator", {})).toBe("ask");
    expect(shellEffect("worker", {})).toBe("ask");
    expect(shellEffect("verifier", {})).toBe("ask");
    expect(shellEffect("monitor", {})).toBe("deny");
    expect(shellEffect("narrator", {})).toBe("deny");
  });

  test("overrideShellAllow defaults to false", () => {
    expect(resolveCoordinatorShellPolicy({})).toBe("ask");
    expect(resolveCoordinatorShellPolicy({ overrideShellAllow: false })).toBe("ask");
  });

  test("overrideShellAllow: true still only reaches allow through the coordinator policy", () => {
    expect(resolveCoordinatorShellPolicy({ overrideShellAllow: true })).toBe("allow");
    expect(resolveCoordinatorShellPolicy({ overrideShellAllow: true, coordinatorShellPolicy: "deny" })).toBe("deny");
    expect(resolveCoordinatorShellPolicy({ coordinatorShellPolicy: "allow" })).toBe("allow");
  });

  test("per-role policies are honored explicitly, including deny", () => {
    expect(shellEffect("worker", { workerShellPolicy: "allow" })).toBe("allow");
    expect(shellEffect("worker", { workerShellPolicy: "deny" })).toBe("deny");
    expect(shellEffect("verifier", { verifierShellPolicy: "deny" })).toBe("deny");
    expect(shellEffect("monitor", { verifierShellPolicy: "allow" })).toBe("deny");
  });

  test("an explicit allow policy does not touch edit or external_directory fences", () => {
    const perms = buildRolePermissions("coordinator", { coordinatorShellPolicy: "allow", overrideShellAllow: true });
    expect(perms.find((p) => p.action === "shell")?.effect).toBe("allow");
    expect(perms.find((p) => p.action === "edit")?.effect).toBe("deny");
    expect(perms.find((p) => p.action === "external_directory")?.effect).toBe("deny");
  });
});
