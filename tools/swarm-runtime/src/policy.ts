import type { SwarmBoardDB } from "./db.js";
import { pathMatchesGlob, resolveSafeWorkspacePath } from "./security.js";
import type { MemberRole, MemberRow, PermissionEffect, PluginOptions, SwarmRow } from "./types.js";

export const WRITE_TOOLS = new Set([
  "edit",
  "write",
  "patch",
  "apply_patch",
  "multiedit",
  "multi_edit",
  "delete",
  "delete_file",
]);

export const SHELL_TOOLS = new Set(["shell", "bash", "cmd", "powershell", "exec", "run_command"]);

export function buildRolePermissions(
  role: MemberRole,
  options: PluginOptions,
): Array<{ action: string; resource: string; effect: PermissionEffect }> {
  const workerShell = options.workerShellPolicy ?? "ask";
  const verifierShell = options.verifierShellPolicy ?? "ask";

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
    ];
    if (!options.allowCoordinatorEdits) {
      perms.push({ action: "edit", resource: "*", effect: "deny" });
    }
    return perms;
  }

  // worker
  return [
    { action: "external_directory", resource: "*", effect: "deny" },
    { action: "shell", resource: "*", effect: workerShell },
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

  if (swarm.status === "running" || swarm.status === "completing") {
    if (member.role === "verifier" || member.role === "monitor" || member.role === "narrator") {
      if (isEdit) {
        return {
          decision: "deny",
          reason: `[SWARM] @${member.name} (${member.role}) is read-only and cannot run '${action}'.`,
        };
      }
      if (isShell) {
        const policy = member.role === "verifier" ? (options.verifierShellPolicy ?? "ask") : "deny";
        return {
          decision: policy,
          reason: `[SWARM] @${member.name} shell policy is '${policy}'.`,
        };
      }
    }

    if (member.role === "coordinator" && !options.allowCoordinatorEdits && isEdit) {
      return {
        decision: "deny",
        reason: `[SWARM] @coordinator delegates edits to workers while swarm '${swarm.id}' is '${swarm.status}'.`,
      };
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
            const blocker = otherLocks.find((l) => pathMatchesGlob(repoRel, l.glob_pattern));
            if (blocker) {
              return {
                decision: "deny",
                reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": owned by @${blocker.owner_name} (${blocker.glob_pattern}). Use post_message to coordinate.`,
              };
            }

            if (myLocks.length > 0 && !myLocks.some((l) => pathMatchesGlob(repoRel, l.glob_pattern))) {
              return {
                decision: "deny",
                reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": outside @${member.name}'s owned globs (${myLocks.map((l) => l.glob_pattern).join(", ")}).`,
              };
            }
          }
        }
      }
    }
  }

  return { decision: "allow" };
}
