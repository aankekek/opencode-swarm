import type { SwarmBoardDB } from "./db.js";
import type { BoardPostRow, MemberRow } from "./types.js";

export interface MonitorConfig {
  stallTimeoutMs: number;
  monitorIntervalMs: number;
  /** Worker cap used by the coverage nudge. Defaults to 6 when omitted. */
  maxWorkers?: number;
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

export function buildVerificationIncompleteNudge(swarmId: string, verifier?: MemberRow): string {
  if (verifier) {
    return `@coordinator [stall] Swarm '${swarmId}' is idle with all tracks done, but verification is incomplete: @${verifier.name} exists (state: ${verifier.state}) and has not posted PASS. Repair or await the verifier, and do not mark the swarm complete until it posts PASS.`;
  }
  return `@coordinator [stall] Swarm '${swarmId}' is idle with all tracks done, but verification is incomplete: no live verifier exists. Spawn a verifier to independently verify the finished work, and do not mark the swarm complete until it posts PASS.`;
}

export function startStallMonitor(
  db: SwarmBoardDB,
  config: MonitorConfig,
  onPost: (swarmId: string, authorName: string, channel: string, text: string) => Promise<BoardPostRow>,
): () => void {
  const inFlightSwarms = new Set<string>();
  // Tracks posts that have been issued but not yet settled by the real post,
  // independently of the race timeout. Prevents a later tick from starting a
  // second nudge while a slow post is still pending.
  const pendingPosts = new Set<string>();
  // Last coverage nudge per swarm: the board seq it was based on and how many
  // plan units were still unassigned then. Bounded by the active swarms.
  const lastCoverage = new Map<string, { seq: number; open: number }>();
  const postTimeoutMs = Math.max(100, Math.min(config.monitorIntervalMs, 15_000));
  const maxWorkers = config.maxWorkers ?? 6;

  const timer = setInterval(async () => {
    try {
      const now = Date.now();
      const activeSwarmIds = new Set<string>();
      for (const swarm of db.getActiveSwarms()) {
        activeSwarmIds.add(swarm.id);
        if (swarm.status !== "running") {
          lastCoverage.delete(swarm.id);
          continue;
        }
        if (swarm.owner_pid && swarm.owner_pid !== process.pid) continue;
        if (inFlightSwarms.has(swarm.id) || pendingPosts.has(swarm.id)) continue;

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

          const counts = db.getTaskCounts(swarm.id);
          const activeWorkers = members.filter((m) => m.role === "worker" && m.track_status === "open").length;
          const anyWorking = members.some((m) => m.state === "working");
          // Board movement means someone other than the monitor/narrator posted;
          // nudge posts of our own must not look like fresh activity.
          let movementSeq = 0;
          const windowPosts = db.getLatestPostsWindow(swarm.id, 200).posts;
          for (let i = windowPosts.length - 1; i >= 0; i--) {
            const p = windowPosts[i];
            if (p.author_name === "monitor" || p.author_name === "narrator") continue;
            movementSeq = p.swarm_seq;
            break;
          }
          const prevCoverage = lastCoverage.get(swarm.id);
          const coverageDue =
            swarm.status === "running" &&
            counts.open >= 3 &&
            !anyWorking &&
            (prevCoverage === undefined ||
              movementSeq > prevCoverage.seq ||
              counts.open > prevCoverage.open);

          const coordinator = members.find((m) => m.role === "coordinator");
          const openWorkers = members.filter((m) => m.role === "worker" && m.track_status === "open");
          const verifier = members.find((m) => m.role === "verifier");
          const hasPass = hasFreshVerifierPass(db, swarm.id, members);

          let nudgeMessage: string;
          if (coverageDue) {
            lastCoverage.set(swarm.id, { seq: movementSeq, open: counts.open });
            if (activeWorkers >= maxWorkers) {
              nudgeMessage = `@coordinator [coverage] ${counts.open} unit(s) unassigned and the worker cap ${maxWorkers} is reached. Finish current tracks so units free, or group the remaining units into fewer workers.`;
            } else if (counts.assigned > 0 || counts.done > 0) {
              nudgeMessage = `@coordinator [coverage] ${counts.open} unit(s) unassigned, ${activeWorkers} worker(s) live (cap ${maxWorkers}). Spawn one worker per unit, group units via add{task_ids:[...]}, or shard with add{tasks}.`;
            } else {
              nudgeMessage = `@coordinator [coverage] ${counts.open} unit(s) unassigned, ${activeWorkers} worker(s) live (cap ${maxWorkers}). Spawn one worker per unit, group by area, or shard with add{tasks}. Use swarm{action:"plan"} to adjust the plan.`;
            }
          } else if (coordinator && latestPost && latestPost.swarm_seq > coordinator.last_read_seq) {
            nudgeMessage = `@coordinator [stall] #${latestPost.swarm_seq} (from @${latestPost.author_name}) is unread; all members are waiting.`;
          } else if (openWorkers.length > 0) {
            const summary = openWorkers
              .map((w: MemberRow) => `@${w.name} (${w.paused_quota ? "paused_quota" : w.state})`)
              .join(", ");
            nudgeMessage = `@coordinator [stall] All members idle >${Math.round(config.stallTimeoutMs / 1000)}s with open tracks: ${summary}.`;
          } else if (verifier && verifier.state === "waiting" && !hasPass) {
            nudgeMessage = `@${verifier.name} [stall] All worker tracks are done; please verify pending work or post PASS to @coordinator.`;
          } else if (!hasPass) {
            nudgeMessage = buildVerificationIncompleteNudge(swarm.id, verifier);
          } else {
            nudgeMessage = `@coordinator [stall] Swarm '${swarm.id}' is idle with all tracks done; call swarm{action:"complete"} when ready.`;
          }

          const nextCount = latestSeq <= swarm.last_monitor_nudge_seq ? swarm.monitor_nudge_count + 1 : 1;
          db.updateMonitorNudge(swarm.id, latestSeq, nextCount);
          // Bookkeeping must follow the REAL post, not whichever side wins the
          // race below. The underlying promise stays pending after a timeout and
          // still commits its post, so it owns the seq update and the pending flag.
          pendingPosts.add(swarm.id);
          const postPromise = onPost(swarm.id, "monitor", "main", nudgeMessage)
            .then((post) => {
              db.updateMonitorNudge(swarm.id, post.swarm_seq, nextCount);
              return post;
            })
            .finally(() => {
              pendingPosts.delete(swarm.id);
            });
          // A late rejection (after the race already timed out) must not surface
          // as an unhandled rejection.
          postPromise.catch(() => {});
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            postPromise,
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error(`Monitor nudge timed out after ${postTimeoutMs}ms`)), postTimeoutMs);
            }),
          ]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
          });
        } catch (err) {
          console.error(`[opencode-swarm] monitor error for swarm ${swarm.id}:`, err);
        } finally {
          inFlightSwarms.delete(swarm.id);
        }
      }
      // Drop coverage state for swarms that are no longer active.
      for (const id of lastCoverage.keys()) {
        if (!activeSwarmIds.has(id)) lastCoverage.delete(id);
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
