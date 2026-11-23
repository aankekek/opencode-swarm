import type { SwarmBoardDB } from "./db.js";
import type { BoardPostRow, MemberRow } from "./types.js";

export interface MonitorConfig {
  stallTimeoutMs: number;
  monitorIntervalMs: number;
}

export function isVerifierAuthor(authorName: string, member?: MemberRow): boolean {
  return (
    member?.role === "verifier" ||
    authorName === "verifier" ||
    /^verifier(-\d+)?$/i.test(authorName)
  );
}

export function isPassAcknowledgementPost(body: string): boolean {
  return (
    /\bPASS\b[\s\S]{0,40}acknowledg|acknowledg[\s\S]{0,40}\bPASS\b|no further action|no action open/i.test(body) &&
    !/\[fixed\]|\bfixed\b|\bpatched\b|\bupdated\b|\bimplemented\b/i.test(body)
  );
}

export function hasFreshVerifierPass(db: SwarmBoardDB, swarmId: string, members?: MemberRow[]): boolean {
  const memberList = members ?? db.listMembers(swarmId, false);
  const byName = new Map<string, MemberRow>();
  for (const m of memberList) byName.set(m.name, m);

  const { posts } = db.getLatestPostsWindow(swarmId, 200);
  for (let i = posts.length - 1; i >= 0; i--) {
    const post = posts[i];
    const member = byName.get(post.author_name);
    if (isVerifierAuthor(post.author_name, member)) {
      if (/\bFAIL\b/i.test(post.body)) return false;
      if (/\bPASS\b/i.test(post.body)) return true;
      continue;
    }
    if (post.author_name === "monitor" || post.author_name === "narrator") continue;
    if (member?.role === "coordinator" || post.author_name === "coordinator") continue;
    if (isPassAcknowledgementPost(post.body)) continue;
    return false;
  }
  return false;
}

export function startStallMonitor(
  db: SwarmBoardDB,
  config: MonitorConfig,
  onPost: (swarmId: string, authorName: string, channel: string, text: string) => Promise<BoardPostRow>,
): () => void {
  const inFlightSwarms = new Set<string>();
  const postTimeoutMs = Math.max(100, Math.min(config.monitorIntervalMs, 15_000));

  const timer = setInterval(async () => {
    try {
      const now = Date.now();
      for (const swarm of db.getActiveSwarms()) {
        if (swarm.status !== "running") continue;
        if (swarm.owner_pid && swarm.owner_pid !== process.pid) continue;
        if (inFlightSwarms.has(swarm.id)) continue;

        inFlightSwarms.add(swarm.id);
        try {
          const members = db.listMembers(swarm.id, false);
          if (members.length === 0) continue;

          // If any member is actively working, check if it's stuck beyond stallTimeoutMs
          const workingMembers = members.filter((m) => m.state === "working");
          if (workingMembers.length > 0) {
            const stuck = workingMembers.some((m) => now - m.last_active_at >= config.stallTimeoutMs);
            if (!stuck) continue;
          }

          const latestPost = db.getLatestPost(swarm.id);
          const latestSeq = latestPost?.swarm_seq ?? 0;

          // Stop alerting after 3 unanswered alerts without board movement
          if (latestSeq <= swarm.last_monitor_nudge_seq && swarm.monitor_nudge_count >= 3) {
            continue;
          }

          const lastActivity = Math.max(
            latestPost?.created_at ?? swarm.created_at,
            ...members.map((m) => m.last_active_at),
          );
          if (now - lastActivity < config.stallTimeoutMs) continue;

          const coordinator = members.find((m) => m.role === "coordinator");
          const openWorkers = members.filter((m) => m.role === "worker" && m.track_status === "open");
          const verifier = members.find((m) => m.role === "verifier");

          let nudgeMessage: string;
          if (coordinator && latestPost && latestPost.swarm_seq > coordinator.last_read_seq) {
            nudgeMessage = `@coordinator [stall] #${latestPost.swarm_seq} (from @${latestPost.author_name}) is unread; all members are waiting.`;
          } else if (openWorkers.length > 0) {
            const summary = openWorkers
              .map((w: MemberRow) => `@${w.name} (${w.paused_quota ? "paused_quota" : w.state})`)
              .join(", ");
            nudgeMessage = `@coordinator [stall] All members idle >${Math.round(config.stallTimeoutMs / 1000)}s with open tracks: ${summary}.`;
          } else if (verifier && verifier.state === "waiting" && !hasFreshVerifierPass(db, swarm.id, members)) {
            nudgeMessage = `@verifier [stall] All worker tracks are done; please verify pending work or post PASS to @coordinator.`;
          } else {
            nudgeMessage = `@coordinator [stall] Swarm '${swarm.id}' is idle with all tracks done; call swarm{action:"complete"} when ready.`;
          }

          const nextCount = latestSeq <= swarm.last_monitor_nudge_seq ? swarm.monitor_nudge_count + 1 : 1;
          db.updateMonitorNudge(swarm.id, latestSeq, nextCount);
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const post = await Promise.race([
            onPost(swarm.id, "monitor", "main", nudgeMessage),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error(`Monitor nudge timed out after ${postTimeoutMs}ms`)), postTimeoutMs);
            }),
          ]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
          });
          db.updateMonitorNudge(swarm.id, post.swarm_seq, nextCount);
        } catch (err) {
          console.error(`[opencode-swarm] monitor error for swarm ${swarm.id}:`, err);
        } finally {
          inFlightSwarms.delete(swarm.id);
        }
      }
    } catch (err) {
      console.error("[opencode-swarm] monitor error:", err);
    }
  }, config.monitorIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return () => clearInterval(timer);
}
