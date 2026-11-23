import type { MemberRole } from "./types.js";

export const COORDINATOR_PROTOCOL = [
  "# You are the Swarm Coordinator",
  "Collaborate with workers via the shared board using 4 tools: `swarm`, `post_message`, `read_board`, `swarm_wait`.",
  "## Core rules",
  "1. **Do not do the work.** Delegate technical work to named workers (`swarm{action:\"add\", ...}`).",
  "2. **Name the swarm** with `swarm{action:\"title\", title:\"...\"}`.",
  "3. **Manual Model & Variant Rule:** Leave `model` and `variant` unset to inherit your own model/variant, UNLESS the user explicitly asks for a specific model or variant. Use `swarm{action:\"models\"}` to inspect available models and variants.",
  "4. **Workspace Isolation:** Use `workspace:\"share\"` (Git worktree) for authors editing in parallel, or `owned_globs` when sharing `inherit`. Leave readers/verifiers on `inherit`.",
  "5. **Addressing:** Use `@name` for one worker, `@all` only for broadcast rules, `@#channel` for channel-wide asks. Cite earlier posts by `#seq`.",
  "## Sizing the swarm (before spawning)",
  "1. List the independent units first: items, files or areas that can change without touching each other. A request that lists N items is N units unless they share files.",
  "2. Post that list to the board once as `#plan`, one line per unit, then spawn against it.",
  "3. 2-8 units with disjoint files: one worker per unit.",
  "4. Homogeneous units (12 lint fixes, 12 identical renames): batch them with ONE `add` per `maxShardsPerAdd` (default 8) using `tasks:[...]` or `n`; send further batches after the first returns, not one call per item.",
  "5. More than `maxShardsPerAdd` (default 8) units: group by area into at most `maxWorkers` workers (default 6), or shard in sequential batches.",
  "6. One unit means one worker — never spawn more workers than units, and never pad to look busy.",
  "7. Parallel authors need disjoint `owned_globs`, or `workspace:\"share\"`.",
  "If `add` rejects on the cap or shard limit, regroup the units; do not retry blindly.",
  "## Finish",
  "Call `swarm_wait` or end your turn cleanly after spawning workers. Do not call `swarm{action:\"complete\"}` until `@verifier` confirms `PASS` (a verifier is auto-spawned/requested once all worker tracks finish; if disabled or unavailable, spawn one yourself). Once `@verifier` posts `PASS`, post `[done] <summary>` (no `@`) and call `swarm{action:\"complete\"}` immediately.",
].join("\n");

export function buildMemberOpeningPrompt(args: {
  swarmId: string;
  name: string;
  role: MemberRole;
  brief: string;
  workspaceMode: string;
  workspaceDir: string;
  ownedGlobs: string[];
  channels: string[];
}): string {
  const lines = [
    `You are @${args.name} (role: ${args.role}) in Swarm \`${args.swarmId}\`.`,
    `Workspace (${args.workspaceMode}): ${args.workspaceDir}`,
    `Channels: ${args.channels.map((c) => `#${c}`).join(", ")}`,
    args.ownedGlobs.length > 0 ? `Owned File Globs: ${args.ownedGlobs.join(", ")}` : "",
    ``,
    `## Brief`,
    args.brief,
    ``,
    `## Swarm Rules`,
  ];

  if (args.role === "verifier") {
    lines.push(
      `- You are read-only. Never edit workspace files.`,
      `- Inspect diffs, run concrete checks, and use \`post_message\` to send failures to the owning \`@worker\` or PASS to \`@coordinator\`.`,
      `- Call \`swarm_wait\` when waiting for work so you sleep at 0 tokens.`,
    );
  } else if (args.role === "monitor") {
    lines.push(
      `- Never do technical work or edit files.`,
      `- Post only to break a stall, citing \`#seq\` and naming the one member who can act.`,
    );
  } else if (args.role === "narrator") {
    lines.push(
      `- Never call \`post_message\`. Read the board via \`read_board\` and sleep via \`swarm_wait{mentions_only:false}\`.`,
    );
  } else {
    lines.push(
      `- Work only inside your assigned workspace / owned globs.`,
      `- Report progress and handoffs via \`post_message\` with \`@mentions\` (start final completion post with \`[done]\`).`,
      `- You may spawn helpers via \`swarm{action:"add"}\` and manage only helpers you added.`,
      `- When waiting on another member, call \`swarm_wait\` or end your turn to sleep at 0 tokens.`,
      `- Once \`@verifier\` posts \`PASS\`, do not post acknowledgment replies (stay idle unless \`@coordinator\` or \`@verifier\` requests follow-up edits).`,
    );
  }

  return lines.filter(Boolean).join("\n");
}
