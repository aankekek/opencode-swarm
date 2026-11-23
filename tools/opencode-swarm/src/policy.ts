import type { SwarmBoardDB } from "./db.js";
import { pathMatchesGlob, resolveSafeWorkspacePath } from "./security.js";
import type { MemberRole, MemberRow, PermissionEffect, PluginOptions, ShellPolicy, SwarmRow } from "./types.js";

export const WRITE_TOOLS = new Set([
  "edit",
  "write",
  "patch",
  "apply_patch",
  "multiedit",
  "multi_edit",
  "delete",
  "delete_file",
  "write_file",
]);

export const SHELL_TOOLS = new Set(["shell", "bash", "cmd", "powershell", "exec", "run_command"]);

// Names that are clearly read-only even when they contain a write-like word
// (e.g. "get", "status"). Kept deliberately small and exact-match.
const READ_ONLY_TOOL_NAMES = new Set([
  "read",
  "read_file",
  "list",
  "list_files",
  "glob",
  "grep",
  "search",
  "find",
  "view",
  "get",
  "show",
  "webfetch",
  "fetch",
  "status",
]);

// Broad write-capable hint. This is intentionally conservative: unknown tools
// that match are treated as write-capable (fail closed) rather than passed through.
const WRITE_TOOL_HINT =
  /(write|edit|patch|apply|replace|create_file|delete|remove|rename|move|mkdir|touch|upload|save)/;

/**
 * Heuristically detect write-capable tools that are not listed in WRITE_TOOLS
 * (e.g. MCP/custom tools such as `mcp__fs__write_file` or `str_replace`).
 *
 * Used to fail closed: callers must not evaluate path/lock containment for these
 * names, they should deny unless the caller is explicitly permitted to edit.
 * Read-only names win over the hint so `grep`/`get`/`status` are never flagged.
 */
export function looksLikeWriteTool(toolName: string): boolean {
  const name = toolName.trim().toLowerCase();
  if (name.length === 0) return false;
  if (READ_ONLY_TOOL_NAMES.has(name)) return false;
  return WRITE_TOOL_HINT.test(name);
}

export function resolveCoordinatorShellPolicy(options: PluginOptions): ShellPolicy {
  if (options.coordinatorShellPolicy) return options.coordinatorShellPolicy;
  const override = options.overrideShellAllow ?? true;
  return override ? "allow" : "ask";
}

export function buildRolePermissions(
  role: MemberRole,
  options: PluginOptions,
): Array<{ action: string; resource: string; effect: PermissionEffect }> {
  const workerShell: ShellPolicy = options.workerShellPolicy ?? "ask";
  const verifierShell: ShellPolicy = options.verifierShellPolicy ?? "ask";
  const coordinatorShell = resolveCoordinatorShellPolicy(options);

  if (role === "verifier" || role === "monitor" || role === "narrator") {
    return [
      { action: "edit", resource: "*", effect: "deny" },
      { action: "external_directory", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: role === "verifier" ? verifierShell : "deny" },
    ];
  }

  if (role === "coordinator") {
    const perms: Array<{ action: string; resource: string; effect: PermissionEffect }> = [
      { action: "external_directory", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: coordinatorShell },
    ];
    if (options.allowCoordinatorEdits !== true) {
      perms.push({ action: "edit", resource: "*", effect: "deny" });
    }
    return perms;
  }

  if (role === "worker") {
    return [
      { action: "external_directory", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: workerShell },
    ];
  }

  // Strict default deny for any unknown role
  return [
    { action: "edit", resource: "*", effect: "deny" },
    { action: "external_directory", resource: "*", effect: "deny" },
    { action: "shell", resource: "*", effect: "deny" },
  ];
}

export function evaluateActionForMember(
  db: SwarmBoardDB,
  canonicalWorkspaceRoot: string,
  member: MemberRow,
  swarm: SwarmRow,
  toolOrAction: string,
  rawTargets: string[],
  options: PluginOptions,
): { decision: PermissionEffect; reason?: string } {
  const action = toolOrAction.toLowerCase();
  const isEdit = action === "edit" || WRITE_TOOLS.has(action);
  const isShell = action === "shell" || SHELL_TOOLS.has(action);
  const isExternalDir = action === "external_directory";

  if (isExternalDir) {
    return {
      decision: "deny",
      reason: `[SWARM SECURITY] External directory access is denied during active swarm '${swarm.id}'.`,
    };
  }

  if (member.state === "killed" || member.state === "stopped" || member.paused_quota === 1) {
    if (isEdit || isShell) {
      return {
        decision: "deny",
        reason: `[SWARM] ${member.name} is in state '${member.paused_quota ? "paused_quota" : member.state}' and cannot execute '${action}'.`,
      };
    }
  }

  // SEC-C1: Role allowlist check
  const validRoles: Set<string> = new Set(["coordinator", "worker", "verifier", "monitor", "narrator"]);
  if (!validRoles.has(member.role)) {
    return {
      decision: "deny",
      reason: `[SWARM SECURITY] Unknown member role '${member.role}' is denied all actions by default.`,
    };
  }

  // SEC-H3: Read-only roles must not execute write tools, unknown tools, or write-like tools
  if (member.role === "verifier" || member.role === "monitor" || member.role === "narrator") {
    if (isEdit) {
      return {
        decision: "deny",
        reason: `[SWARM] @${member.name} (${member.role}) is read-only and cannot run write/edit action '${action}'.`,
      };
    }
    if (isShell) {
      const policy = member.role === "verifier" ? (options.verifierShellPolicy ?? "ask") : "deny";
      return {
        decision: policy,
        reason: `[SWARM] @${member.name} shell policy is '${policy}'.`,
      };
    }
    // Deny unknown tools or tools not recognized for read-only roles
    return {
      decision: "deny",
      reason: `[SWARM] @${member.name} (${member.role}) is read-only and denied tool '${action}'.`,
    };
  }

  if (member.role === "coordinator") {
    if (options.allowCoordinatorEdits !== true && isEdit) {
      return {
        decision: "deny",
        reason: `[SWARM] @coordinator delegates edits to workers while swarm '${swarm.id}' is '${swarm.status}'.`,
      };
    }
    if (isShell) {
      const policy = resolveCoordinatorShellPolicy(options);
      return {
        decision: policy,
        reason: `[SWARM] Coordinator shell policy is '${policy}'.`,
      };
    }
    return { decision: "allow" };
  }

  if (member.role === "worker") {
    if (isShell) {
      const policy = options.workerShellPolicy ?? "ask";
      return {
        decision: policy,
        reason: `[SWARM] Worker shell policy is '${policy}'.`,
      };
    }

    if (isEdit) {
      if (rawTargets.length === 0) {
        return {
          decision: "deny",
          reason: `[SWARM] Blocked '${action}': target file path could not be determined for ownership check.`,
        };
      }

      // If worker has an isolated worktree/clone, allow edits inside its own workspace_dir
      const effectiveRoot = member.workspace_dir || canonicalWorkspaceRoot;
      const allLocks = db.listLocks(member.swarm_id);
      const myLocks = allLocks.filter((l) => l.owner_member_id === member.id);
      const otherLocks = allLocks.filter((l) => l.owner_member_id !== member.id);

      for (const rawPath of rawTargets) {
        let repoRel: string;
        try {
          repoRel = resolveSafeWorkspacePath(effectiveRoot, rawPath);
        } catch (err) {
          return {
            decision: "deny",
            reason: err instanceof Error ? err.message : String(err),
          };
        }

        if (member.workspace_mode === "inherit") {
          // SEC-M1: worker with no owned_globs cannot edit files in shared workspace
          if (myLocks.length === 0) {
            return {
              decision: "deny",
              reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": @${member.name} has no claimed locks. Claim ownership first using action:'claim'.`,
            };
          }

          const blocker = otherLocks.find((l) => pathMatchesGlob(repoRel, l.glob_pattern));
          if (blocker) {
            return {
              decision: "deny",
              reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": owned by @${blocker.owner_name} (${blocker.glob_pattern}). Use post_message to coordinate.`,
            };
          }

          if (!myLocks.some((l) => pathMatchesGlob(repoRel, l.glob_pattern))) {
            return {
              decision: "deny",
              reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": outside @${member.name}'s owned globs (${myLocks.map((l) => l.glob_pattern).join(", ")}).`,
            };
          }
        }
      }
    }
    return { decision: "allow" };
  }

  // Default deny for anything unhandled
  return {
    decision: "deny",
    reason: `[SWARM SECURITY] Action '${action}' denied by default policy.`,
  };
}
