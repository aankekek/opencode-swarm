import type { SwarmBoardDB } from "./db.js";
import type { BoardPostRow, MemberRow } from "./types.js";

export interface MonitorConfig {
  stallTimeoutMs: number;
  monitorIntervalMs: number;
}

export function startStallMonitor(
  db: SwarmBoardDB,
  config: MonitorConfig,
  onPost: (swarmId: string, authorName: string, channel: string, text: string) => Promise<BoardPostRow>,
): () => void {
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      for (const swarm of db.getActiveSwarms()) {
        if (swarm.status !== "running") continue;

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
        } else if (verifier && verifier.state === "waiting") {
          nudgeMessage = `@verifier [stall] All worker tracks are done; please verify pending work or post PASS to @coordinator.`;
        } else {
          nudgeMessage = `@coordinator [stall] Swarm '${swarm.id}' is idle with all tracks done; call swarm{action:"complete"} when ready.`;
        }

        const post = await onPost(swarm.id, "monitor", "main", nudgeMessage);
        const nextCount = latestSeq <= swarm.last_monitor_nudge_seq ? swarm.monitor_nudge_count + 1 : 1;
        db.updateMonitorNudge(swarm.id, post.swarm_seq, nextCount);
      }
    } catch (err) {
      console.error("[swarm-runtime] monitor error:", err);
    } finally {
      running = false;
    }
  }, config.monitorIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return () => clearInterval(timer);
}
