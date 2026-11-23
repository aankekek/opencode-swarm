import type { SwarmBoardDB } from "./db.js";
import { checkPendingWakePosts, parseMentionsFromText, resolveWakeTargets } from "./mentions.js";
import { hasFreshVerifierPass, isVerifierAuthor } from "./monitor.js";
import type { SwarmChangedEvent } from "./rpc.js";
import type { BoardPostRow, MemberRow } from "./types.js";

export interface WaiterEntry {
  resolve: (res: { posts: BoardPostRow[]; aborted?: boolean; handoff?: string }) => void;
  sinceSeq: number;
  mentionsOnly: boolean;
}

export interface WakeControllerDeps {
  db: SwarmBoardDB;
  getAutoSpawnVerifier: () => boolean;
  waiters: Map<string, WaiterEntry>;
  promptSession: (args: { sessionID: string; text: string; delivery?: "queue" }) => Promise<unknown>;
  emitSwarmChanged: (event: SwarmChangedEvent) => void;
  spawnVerifier: (args: { swarmId: string; caller: MemberRow; name: string; brief: string }) => Promise<unknown>;
}

export interface WakeController {
  wakeMember: (member: MemberRow, triggerPost: BoardPostRow) => Promise<void>;
  ensureVerifierForCompletedWork: (
    swarmId: string,
    coord: MemberRow,
    latestPost: BoardPostRow,
  ) => Promise<"spawned" | "requested" | "in_progress" | "unavailable">;
  maybeWakeIdleCoordinator: (swarmId: string, triggerPost?: BoardPostRow) => Promise<void>;
  postToBoard: (
    swarmId: string,
    authorName: string,
    channel: string,
    text: string,
    excludeMemberIds?: Set<string>,
  ) => Promise<BoardPostRow>;
  getLastWakeSeq: (memberId: string) => number;
  recordWakeSeq: (memberId: string, seq: number) => void;
  clearMemberWakeSeq: (memberId: string) => void;
  clearCoordinatorWakeSeq: () => void;
  clearState: () => void;
}

export function createWakeController(deps: WakeControllerDeps): WakeController {
  const { db, waiters, emitSwarmChanged } = deps;
  const lastCoordinatorWakeSeq = new Map<string, number>();
  const lastWakeSeq = new Map<string, number>();
  const autoVerifierSpawns = new Set<string>();
  const lastVerificationRequestSeq = new Map<string, number>();

  function getLastWakeSeq(memberId: string): number {
    return lastWakeSeq.get(memberId) ?? 0;
  }

  function recordWakeSeq(memberId: string, seq: number): void {
    lastWakeSeq.set(memberId, Math.max(lastWakeSeq.get(memberId) ?? 0, seq));
  }

  function clearMemberWakeSeq(memberId: string): void {
    lastWakeSeq.delete(memberId);
  }

  function clearCoordinatorWakeSeq(): void {
    lastCoordinatorWakeSeq.clear();
  }

  function clearState(): void {
    lastCoordinatorWakeSeq.clear();
    lastWakeSeq.clear();
    autoVerifierSpawns.clear();
    lastVerificationRequestSeq.clear();
  }

  async function wakeMember(member: MemberRow, triggerPost: BoardPostRow): Promise<void> {
    const swarm = db.getSwarm(member.swarm_id);
    if (!swarm || swarm.status !== "running") return;

    // If member is parked on swarm_wait in-process, resolve its waiter directly
    const waiter = waiters.get(member.id);
    if (waiter) {
      const matched = checkPendingWakePosts(db, member, waiter.sinceSeq, waiter.mentionsOnly);
      if (matched.length > 0) {
        waiters.delete(member.id);
        db.setMemberState(member.id, "working");
        const maxMatchedSeq = matched[matched.length - 1].swarm_seq;
        recordWakeSeq(member.id, maxMatchedSeq);
        if (!waiter.mentionsOnly) {
          db.advanceReadCursor(member.id, maxMatchedSeq);
        }
        emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
        waiter.resolve({ posts: matched });
        return;
      }
      // If the waiter did not match the trigger post (e.g. unsubscribed channel or not mentioned),
      // do not fall through to session.prompt to avoid double-waking a parked member.
      return;
    }

    // Never inject [SWARM BOARD WAKE-UP] prompts into the user's coordinator chat.
    // When @coordinator is parked in swarm_wait, the waiter branch above wakes it silently.
    if (member.role === "coordinator") {
      return;
    }

    const fresh = db.getMemberById(member.id);
    const effectiveWakeSeq = Math.max(fresh?.last_read_seq ?? 0, getLastWakeSeq(member.id));
    if (!fresh || fresh.state === "killed" || fresh.state === "working" || effectiveWakeSeq >= triggerPost.swarm_seq) {
      return;
    }

    // Medium 7: channel-isolated fallback feed (no cross-channel leaks)
    const isGlobal = fresh.role === "monitor" || fresh.role === "narrator";
    const memberChannels = isGlobal ? "*" : db.getMemberChannels(fresh.swarm_id, fresh.id);
    const { posts } = db.getPostsPage(fresh.swarm_id, effectiveWakeSeq, 25, memberChannels);
    if (posts.length === 0) return;
    const lastSeq = posts[posts.length - 1].swarm_seq;

    const feed = posts
      .map((p) => `[#${p.swarm_seq} #${p.channel}] @${p.author_name}:\n${p.body}`)
      .join("\n\n");

    const promptText = [
      `[SWARM BOARD WAKE-UP for @${fresh.name} — Swarm ${fresh.swarm_id}]`,
      `New board traffic:`,
      feed,
      ``,
      `Act on your assignment and report via \`post_message\`.`,
    ].join("\n");

    db.setMemberState(fresh.id, "working");
    emitSwarmChanged({ swarmId: fresh.swarm_id, reason: "member_state", handle: fresh.name });
    try {
      await deps.promptSession({
        sessionID: fresh.session_id,
        text: promptText,
        delivery: "queue",
      });
      recordWakeSeq(fresh.id, lastSeq);
      db.advanceReadCursor(fresh.id, lastSeq);
    } catch (err) {
      // Reset state to waiting on prompt failure so member is not stuck in working and can re-deliver
      db.setMemberState(fresh.id, "waiting", {
        error: err instanceof Error ? err.message : String(err),
      });
      emitSwarmChanged({ swarmId: fresh.swarm_id, reason: "member_state", handle: fresh.name });
      throw err;
    }
  }

  async function ensureVerifierForCompletedWork(
    swarmId: string,
    coord: MemberRow,
    latestPost: BoardPostRow,
  ): Promise<"spawned" | "requested" | "in_progress" | "unavailable"> {
    const liveVerifiers = db.listMembers(swarmId, false).filter((m) => m.role === "verifier");
    if (liveVerifiers.length === 0) {
      if (autoVerifierSpawns.has(swarmId)) return "in_progress";
      autoVerifierSpawns.add(swarmId);
      try {
        let verifierName = "verifier";
        if (db.getMemberByName(swarmId, verifierName)) {
          let n = 2;
          while (db.getMemberByName(swarmId, `verifier-${n}`)) n++;
          verifierName = `verifier-${n}`;
        }
        const brief = [
          `You are the swarm verifier. All worker tracks are complete (latest #${latestPost.swarm_seq} from ${latestPost.author_name}).`,
          `Verify completed worker output against the swarm objective: read board with read_board, independently verify each finished track, inspect diffs and run concrete checks (tests/builds/file review).`,
          `Then post PASS to @${coord.name} if all checks pass, or FAIL with exact file:line issues naming the responsible @worker.`,
          `Read-only: do not edit workspace files.`,
        ].join(" ");
        await deps.spawnVerifier({
          swarmId,
          caller: coord,
          name: verifierName,
          brief,
        });
        return "spawned";
      } catch (err) {
        autoVerifierSpawns.delete(swarmId);
        console.warn("[opencode-swarm] auto-spawn verifier failed:", err instanceof Error ? err.message : String(err));
        return "unavailable";
      }
    }

    const anyWorkingVerifier = liveVerifiers.some(
      (m) => db.getMemberById(m.id)?.state === "working" || m.state === "working",
    );
    if (anyWorkingVerifier) return "in_progress";
    const waitingVerifier = liveVerifiers.find((m) => {
      const fresh = db.getMemberById(m.id) ?? m;
      return fresh.state === "waiting";
    });
    if (!waitingVerifier) return "unavailable";
    const fresh = db.getMemberById(waitingVerifier.id) ?? waitingVerifier;
    if (fresh.paused_quota === 1 || fresh.state === "stopped" || fresh.state === "killed") return "unavailable";
    if (waiters.has(fresh.id)) return "in_progress";
    if (lastVerificationRequestSeq.get(swarmId) === latestPost.swarm_seq) return "in_progress";
    try {
      await postToBoard(
        swarmId,
        coord.name,
        "main",
        `@${fresh.name} [verify] All worker tracks are complete (latest #${latestPost.swarm_seq}). Independently verify completed worker output against the swarm objective: read board with read_board, inspect diffs and run concrete checks, then post PASS to @${coord.name} or FAIL with exact file:line issues naming the responsible @worker.`,
        new Set([coord.id]),
      );
      lastVerificationRequestSeq.set(swarmId, latestPost.swarm_seq);
      return "requested";
    } catch (err) {
      console.warn("[opencode-swarm] verification request failed:", err instanceof Error ? err.message : String(err));
      return "unavailable";
    }
  }

  async function maybeWakeIdleCoordinator(swarmId: string, triggerPost?: BoardPostRow): Promise<void> {
    const swarm = db.getSwarm(swarmId);
    if (!swarm || swarm.status !== "running") return;

    const members = db.listMembers(swarmId, false);
    const coord = members.find((m) => m.role === "coordinator");
    if (!coord) return;

    const latestPost = triggerPost ?? db.getLatestPost(swarmId);
    if (!latestPost || latestPost.author_name === coord.name) return;

    const nonCoord = members.filter(
      (m) => m.role !== "coordinator" && m.role !== "monitor" && m.role !== "narrator",
    );
    const anyWorking = nonCoord.some((m) => m.state === "working");
    const workers = nonCoord.filter((m) => m.role === "worker");
    const allWorkersDone = workers.length > 0 && workers.every((w) => w.track_status === "done");
    const latestAuthorMember = db.getMemberByName(swarmId, latestPost.author_name);
    const isVerifierAuthorFlag = isVerifierAuthor(latestPost.author_name, latestAuthorMember);
    const isVerifierReport = isVerifierAuthorFlag && /\b(PASS|FAIL)\b/i.test(latestPost.body);
    const isMonitorStall = latestPost.author_name === "monitor";
    const hasFreshPass = hasFreshVerifierPass(db, swarmId, members);

    if (
      deps.getAutoSpawnVerifier() &&
      allWorkersDone &&
      !anyWorking &&
      !isVerifierReport &&
      !isMonitorStall &&
      !hasFreshPass
    ) {
      const outcome = await ensureVerifierForCompletedWork(swarmId, coord, latestPost);
      if (outcome === "spawned" || outcome === "requested" || outcome === "in_progress") return;
    }

    const coordWaiter = waiters.get(coord.id);
    if ((!coordWaiter && coord.state !== "waiting") || coord.paused_quota === 1) {
      return;
    }

    const prevCoordinatorWakeSeq = lastCoordinatorWakeSeq.get(swarmId) ?? 0;
    if (coord.last_read_seq >= latestPost.swarm_seq || prevCoordinatorWakeSeq >= latestPost.swarm_seq) {
      return;
    }
    let parsedMentions: string[] = [];
    try {
      parsedMentions = JSON.parse(latestPost.mentions_json || "[]") as string[];
    } catch {
      parsedMentions = [];
    }
    const mentionsCoord = parsedMentions.includes(coord.name);
    const isExplicitHandoff =
      mentionsCoord && /\[done\]|\[blocked\]|\[question\]|\bPASS\b|\bFAIL\b/i.test(latestPost.body);

    const shouldWake =
      (!anyWorking && (allWorkersDone || isVerifierReport)) ||
      isMonitorStall ||
      (!anyWorking && isExplicitHandoff);
    if (!shouldWake) return;

    const prevReadSeq = coord.last_read_seq;
    lastCoordinatorWakeSeq.set(swarmId, latestPost.swarm_seq);
    db.setMemberState(coord.id, "working");
    emitSwarmChanged({ swarmId, reason: "member_state", handle: coord.name });

    const completeReady = hasFreshPass && allWorkersDone && !anyWorking;

    const handoffText = completeReady
      ? `All swarm members finished (latest #${latestPost.swarm_seq} from @${latestPost.author_name}). Read board updates since #${prevReadSeq} with read_board, present the final summary to the user, and call swarm{action:"complete"}.`
      : allWorkersDone && !anyWorking && !hasFreshPass && !isVerifierReport
        ? `Swarm handoff ready on board (latest #${latestPost.swarm_seq} from @${latestPost.author_name}). Verification is NOT done: no verifier PASS yet. Call read_board(since: ${prevReadSeq}) to review, spawn or repair a verifier (@verifier) to independently verify worker output, and do NOT call swarm{action:"complete"} until a verifier posts PASS.`
        : `Swarm handoff ready on board (latest #${latestPost.swarm_seq} from @${latestPost.author_name}). Call read_board(since: ${prevReadSeq}) to review and coordinate next steps or complete the swarm.`;

    if (coordWaiter) {
      waiters.delete(coord.id);
      const unread = db
        .getPostsPage(swarmId, coordWaiter.sinceSeq, 50, "*")
        .posts.filter((p) => p.author_name !== coord.name);
      const posts = unread.length > 0 ? unread : [latestPost];
      recordWakeSeq(coord.id, latestPost.swarm_seq);
      db.advanceReadCursor(coord.id, latestPost.swarm_seq);
      coordWaiter.resolve({ posts, handoff: handoffText });
      return;
    }

    try {
      await deps.promptSession({
        sessionID: coord.session_id,
        text: handoffText,
        delivery: "queue",
      });
      db.advanceReadCursor(coord.id, latestPost.swarm_seq);
    } catch (err) {
      lastCoordinatorWakeSeq.set(swarmId, prevCoordinatorWakeSeq);
      db.setMemberState(coord.id, "waiting", {
        error: err instanceof Error ? err.message : String(err),
      });
      emitSwarmChanged({ swarmId, reason: "member_state", handle: coord.name });
    }
  }

  async function postToBoard(
    swarmId: string,
    authorName: string,
    channel: string,
    text: string,
    excludeMemberIds?: Set<string>,
  ): Promise<BoardPostRow> {
    const ch = db.getChannel(swarmId, channel);
    if (!ch) throw new Error(`Unknown channel "#${channel}".`);
    if (ch.archived) throw new Error(`Channel "#${channel}" is archived.`);

    // Medium 6: Channel isolation check on postToBoard
    const author = db.getMemberByName(swarmId, authorName);
    if (author) {
      const isGlobal = author.role === "coordinator" || author.role === "monitor" || author.role === "narrator";
      if (!isGlobal && channel !== "main") {
        const authorChannels = db.getMemberChannels(swarmId, author.id);
        if (!authorChannels.includes(channel)) {
          throw new Error(`Member @${authorName} is not subscribed to channel "#${channel}".`);
        }
      }
    }

    const parsed = parseMentionsFromText(text);
    const post = db.addPost({
      swarmId,
      authorName,
      channel,
      mentions: parsed.memberMentions,
      channelMentions: parsed.channelMentions,
      isAll: parsed.isAll,
      body: text,
    });
    emitSwarmChanged({
      swarmId,
      reason: "board_post",
      seq: post.swarm_seq,
      handle: authorName,
    });

    const targets = resolveWakeTargets(db, swarmId, authorName, channel, parsed);
    const isMonitorAuthor = authorName === "monitor";
    for (const target of targets) {
      if (excludeMemberIds?.has(target.id)) continue;
      // RT-M5: Monitor nudges bypass paused_quota so stall breaks can proceed
      if (target.paused_quota === 1 && !isMonitorAuthor) continue;
      try {
        await wakeMember(target, post);
      } catch {
        // Wake error recorded on member if needed
      }
    }

    return post;
  }

  return {
    wakeMember,
    ensureVerifierForCompletedWork,
    maybeWakeIdleCoordinator,
    postToBoard,
    getLastWakeSeq,
    recordWakeSeq,
    clearMemberWakeSeq,
    clearCoordinatorWakeSeq,
    clearState,
  };
}
