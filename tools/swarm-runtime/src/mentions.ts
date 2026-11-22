import type { SwarmBoardDB } from "./db.js";
import type { BoardPostRow, MemberRow } from "./types.js";

export interface ParsedMentions {
  memberMentions: string[];
  channelMentions: string[];
  isAll: boolean;
}

/**
 * Parses @name, @prefix, @all/@everyone, and @#channel from post text.
 */
export function parseMentionsFromText(text: string): ParsedMentions {
  const memberMentions = new Set<string>();
  const channelMentions = new Set<string>();
  let isAll = false;

  const chanRegex = /(?:^|[\s(])@#([a-zA-Z0-9_-]{1,32})\b/g;
  let m: RegExpExecArray | null;
  while ((m = chanRegex.exec(text)) !== null) {
    const ch = m[1].toLowerCase();
    if (ch === "main") {
      throw new Error(`@#main is not allowed; use @all to address everyone.`);
    }
    channelMentions.add(ch);
  }

  const userRegex = /(?:^|[\s(])@([a-zA-Z0-9_-]{1,32})(?=$|[\s,.:;!?)])/g;
  while ((m = userRegex.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (name === "all" || name === "everyone") {
      isAll = true;
    } else {
      memberMentions.add(name);
    }
  }

  return {
    memberMentions: Array.from(memberMentions),
    channelMentions: Array.from(channelMentions),
    isAll,
  };
}

/**
 * Resolves which live members should be woken by a post.
 */
export function resolveWakeTargets(
  db: SwarmBoardDB,
  swarmId: string,
  authorName: string,
  channel: string,
  parsed: ParsedMentions,
): MemberRow[] {
  const liveMembers = db.listMembers(swarmId, false);
  const targets = new Map<string, MemberRow>();

  for (const m of liveMembers) {
    if (m.name === authorName) continue;

    const isGlobalRole = m.role === "coordinator" || m.role === "monitor" || m.role === "narrator";
    const memberChannels = isGlobalRole ? [] : db.getMemberChannels(swarmId, m.id);
    if (!isGlobalRole && channel !== "main" && !memberChannels.includes(channel)) {
      continue;
    }

    // 1. @all wakes every live member
    if (parsed.isAll) {
      targets.set(m.id, m);
      continue;
    }

    // 2. Direct @name or group @prefix (for sharded <prefix>-1..<prefix>-k)
    const directHit = parsed.memberMentions.some(
      (mention) => m.name === mention || (m.group_prefix !== null && m.group_prefix === mention),
    );
    if (directHit) {
      targets.set(m.id, m);
      continue;
    }

    // 3. @#channel wakes subscribers of that channel (+ coordinator/monitor/narrator)
    if (parsed.channelMentions.length > 0) {
      const channelHit = parsed.channelMentions.some((ch) => {
        const chRow = db.getChannel(swarmId, ch);
        if (!chRow || chRow.archived) return false;
        return isGlobalRole || memberChannels.includes(ch);
      });
      if (channelHit) {
        targets.set(m.id, m);
        continue;
      }
    }

    // 4. Members parked with wake_mode='any' wake on any post in their visible channels
    if (m.wake_mode === "any" && m.state === "waiting") {
      if (isGlobalRole || channel === "main" || memberChannels.includes(channel)) {
        targets.set(m.id, m);
      }
    }
  }

  return Array.from(targets.values());
}

/**
 * Race-free check for swarm_wait: returns matching posts already on the board after `sinceSeq`.
 */
export function checkPendingWakePosts(
  db: SwarmBoardDB,
  member: MemberRow,
  sinceSeq: number,
  mentionsOnly: boolean,
): BoardPostRow[] {
  const isGlobalRole = member.role === "coordinator" || member.role === "monitor" || member.role === "narrator";
  const channelsFilter = isGlobalRole ? "*" : db.getMemberChannels(member.swarm_id, member.id);
  const { posts } = db.getPostsPage(member.swarm_id, sinceSeq, 100, channelsFilter);
  const others = posts.filter((p) => p.author_name !== member.name);

  if (!mentionsOnly) {
    return others;
  }

  return others.filter((p) => {
    if (p.is_all === 1) return true;
    const mentions = JSON.parse(p.mentions_json) as string[];
    if (mentions.includes(member.name) || (member.group_prefix && mentions.includes(member.group_prefix))) {
      return true;
    }
    const chMentions = JSON.parse(p.channel_mentions_json) as string[];
    if (chMentions.length > 0) {
      if (isGlobalRole) return true;
      const myChannels = db.getMemberChannels(member.swarm_id, member.id);
      return chMentions.some((ch) => myChannels.includes(ch));
    }
    return false;
  });
}
