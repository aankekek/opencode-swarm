import type { SwarmBoardDB } from "./db.js";
import { checkPendingWakePosts, parseMentionsFromText, resolveWakeTargets } from "./mentions.js";
import { hasFreshVerifierPass, isVerifierAuthor } from "./monitor.js";
import type { SwarmChangedEvent } from "./rpc.js";
import type { BoardPostRow, MemberRow } from "./types.js";

const MAX_AUTO_VERIFIER_SPAWNS = 3;

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

export interface VerifyRequestOptions {
  incremental?: boolean;
  doneWorkers?: MemberRow[];
  openWorkers?: MemberRow[];
}

export interface WakeController {
  wakeMember: (member: MemberRow, triggerPost: BoardPostRow) => Promise<void>;
  maybeWakePendingMember: (memberId: string) => Promise<boolean>;
  ensureVerifierForCompletedWork: (
    swarmId: string,
    coord: MemberRow,
    latestPost: BoardPostRow,
    opts?: VerifyRequestOptions,
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
  const autoVerifierSpawnAttempts = new Map<string, number>();
  const lastVerificationRequest = new Map<string, { seq: number; incremental: boolean }>();
  // Per-swarm in-flight marker so overlapping callers cannot both post [verify]
  // for the same latest post while the first request is still being delivered.
  const verificationRequestsInFlight = new Set<string>();

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
    autoVerifierSpawnAttempts.clear();
    lastVerificationRequest.clear();
    verificationRequestsInFlight.clear();
  }

  async function wakeMember(member: MemberRow, triggerPost: BoardPostRow): Promise<void> {
    const swarm = db.getSwarm(member.swarm_id);
    if (!swarm || swarm.status !== "running") return;

    // If member is parked on swarm_wait in-process, resolve its waiter directly
    const waiter = waiters.get(member.id);
    if (waiter) {
      const matched = checkPendingWakePosts(db, member, waiter.sinceSeq, waiter.mentionsOnly);
      if (matched.length > 0) {
        const maxMatchedSeq = matched[matched.length - 1].swarm_seq;
        // Resolving must be unconditional: a fallible DB/emit call below must never
        // leave the promise parked after the entry is removed from the map.
        try {
          db.setMemberState(member.id, "working");
          recordWakeSeq(member.id, maxMatchedSeq);
          if (!waiter.mentionsOnly) {
            db.advanceReadCursor(member.id, maxMatchedSeq);
          }
          emitSwarmChanged({ swarmId: member.swarm_id, reason: "member_state", handle: member.name });
        } catch (err) {
          // Best-effort bookkeeping: the wake still delivers the matched posts.
          console.warn(
            `[opencode-swarm] wake bookkeeping failed for @${member.name}:`,
            err instanceof Error ? err.message : String(err),
          );
        } finally {
          waiters.delete(member.id);
          waiter.resolve({ posts: matched });
        }
        return;
      }
      // If the waiter did not match the trigger post (e.g. unsubscribed channel or not mentioned),
      // do not fall through to session.prompt to avoid double-waking a parked member.
      console.warn(
        `[opencode-swarm] swarm ${member.swarm_id}: #${triggerPost.swarm_seq} by @${triggerPost.author_name} targeted parked member @${member.name} (wake=${waiter.mentionsOnly ? "mentions" : "any"}, wait_since=${waiter.sinceSeq}, last_read=${member.last_read_seq}) but matched 0 posts`,
      );
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

  async function maybeWakePendingMember(memberId: string): Promise<boolean> {
    const fresh = db.getMemberById(memberId);
    if (!fresh || fresh.role === "coordinator" || fresh.state !== "waiting" || fresh.paused_quota === 1 || waiters.has(fresh.id)) {
      return false;
    }
    const swarm = db.getSwarm(fresh.swarm_id);
    if (!swarm || swarm.status !== "running") return false;
    const effectiveWakeSeq = Math.max(fresh.last_read_seq, getLastWakeSeq(fresh.id));
    const pending = checkPendingWakePosts(db, fresh, effectiveWakeSeq, fresh.wake_mode !== "any");
    if (pending.length === 0) return false;
    await wakeMember(fresh, pending[pending.length - 1]);
    return true;
  }

  async function ensureVerifierForCompletedWork(
    swarmId: string,
    coord: MemberRow,
    latestPost: BoardPostRow,
    opts?: VerifyRequestOptions,
  ): Promise<"spawned" | "requested" | "in_progress" | "unavailable"> {
    const incremental = Boolean(opts?.incremental);
    const doneNames =
      (opts?.doneWorkers ?? []).map((w) => w.name).join(", ") || latestPost.author_name;
    const openNames = (opts?.openWorkers ?? []).map((w) => w.name).join(", ");
    const liveVerifiers = db.listMembers(swarmId, false).filter((m) => m.role === "verifier");
    if (liveVerifiers.length === 0) {
      const attempts = autoVerifierSpawnAttempts.get(swarmId) ?? 0;
      if (attempts >= MAX_AUTO_VERIFIER_SPAWNS) return "unavailable";
      autoVerifierSpawnAttempts.set(swarmId, attempts + 1);
      try {
        let verifierName = "verifier";
        if (db.getMemberByName(swarmId, verifierName)) {
          let n = 2;
          while (db.getMemberByName(swarmId, `verifier-${n}`)) n++;
          verifierName = `verifier-${n}`;
        }
        const brief = incremental
          ? [
              `You are the swarm verifier. Completed worker track(s) ready for incremental verification: ${doneNames} (latest #${latestPost.swarm_seq} from ${latestPost.author_name}); still in progress: ${openNames}.`,
              `Start verifying the completed track(s) NOW — do not wait for remaining workers. Read the board with read_board, inspect diffs and run concrete checks.`,
              `Post FAIL naming the owning @worker with exact file:line if you find issues, or an incremental OK/VERIFIED summary to @${coord.name} (reserve final PASS until all worker tracks are complete).`,
              `Read-only: do not edit workspace files.`,
            ].join(" ")
          : [
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
        lastVerificationRequest.set(swarmId, { seq: latestPost.swarm_seq, incremental });
        return "spawned";
      } catch (err) {
        // Restore the previous attempt count so a failed spawn does not burn an attempt.
        if (attempts <= 0) autoVerifierSpawnAttempts.delete(swarmId);
        else autoVerifierSpawnAttempts.set(swarmId, attempts);
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
    const prevReq = lastVerificationRequest.get(swarmId);
    if (prevReq && prevReq.seq === latestPost.swarm_seq && (incremental || !prevReq.incremental)) {
      return "in_progress";
    }
    if (verificationRequestsInFlight.has(swarmId)) return "in_progress";
    verificationRequestsInFlight.add(swarmId);
    try {
      const verifyMsg = incremental
        ? `@${fresh.name} [verify] Incremental verification ready: ${latestPost.author_name} finished (#${latestPost.swarm_seq}; completed: ${doneNames}; still open: ${openNames}). Verify the completed track(s) now with read_board, diff inspection, and concrete checks — do not wait for remaining workers. Post FAIL to the owning @worker if issues are found, or an incremental OK/VERIFIED summary to @${coord.name} (reserve final PASS until all tracks are complete).`
        : `@${fresh.name} [verify] All worker tracks are complete (latest #${latestPost.swarm_seq}). Independently verify completed worker output against the swarm objective: read board with read_board, inspect diffs and run concrete checks, then post PASS to @${coord.name} or FAIL with exact file:line issues naming the responsible @worker.`;
      await postToBoard(
        swarmId,
        coord.name,
        "main",
        verifyMsg,
        new Set([coord.id]),
      );
      lastVerificationRequest.set(swarmId, { seq: latestPost.swarm_seq, incremental });
      return "requested";
    } catch (err) {
      console.warn("[opencode-swarm] verification request failed:", err instanceof Error ? err.message : String(err));
      return "unavailable";
    } finally {
      verificationRequestsInFlight.delete(swarmId);
    }
  }

  async function maybeWakeIdleCoordinator(swarmId: string, triggerPost?: BoardPostRow): Promise<void> {
    const swarm = db.getSwarm(swarmId);
    if (!swarm || swarm.status !== "running") return;

    const members = db.listMembers(swarmId, false);
    const coord = members.find((m) => m.role === "coordinator");
    if (!coord) return;

    const latestPost = triggerPost ?? db.getLatestPost(swarmId);

    const nonCoord = members.filter(
      (m) => m.role !== "coordinator" && m.role !== "monitor" && m.role !== "narrator",
    );
    const anyWorking = nonCoord.some((m) => m.state === "working");
    const workers = nonCoord.filter((m) => m.role === "worker");
    const doneWorkers = workers.filter((w) => w.track_status === "done");
    const openWorkers = workers.filter((w) => w.track_status === "open");
    const allWorkersDone = workers.length > 0 && workers.every((w) => w.track_status === "done");
    const openPlanUnits = db.getTaskCounts(swarmId).open;
    const allWorkDone = allWorkersDone && openPlanUnits === 0;
    const latestAuthorMember = latestPost ? db.getMemberByName(swarmId, latestPost.author_name) : undefined;
    const isVerifierAuthorFlag = latestPost ? isVerifierAuthor(latestPost.author_name, latestAuthorMember) : false;
    const isVerifierReport = Boolean(latestPost && isVerifierAuthorFlag && /\b(PASS|FAIL)\b/i.test(latestPost.body));
    const isMonitorStall = latestPost?.author_name === "monitor";
    const hasFreshPass = hasFreshVerifierPass(db, swarmId, members);
    if (hasFreshPass) {
      // A PASS closes the verification cycle: allow a later work cycle to auto-verify again.
      autoVerifierSpawnAttempts.delete(swarmId);
    }

    const findLatestDoneWorkerPost = (): BoardPostRow | undefined => {
      if (doneWorkers.length === 0) return undefined;
      const doneNames = new Set(doneWorkers.map((w) => w.name));
      if (triggerPost && doneNames.has(triggerPost.author_name)) return triggerPost;
      const { posts } = db.getLatestPostsWindow(swarmId, 200);
      for (let i = posts.length - 1; i >= 0; i--) {
        if (doneNames.has(posts[i].author_name)) return posts[i];
      }
      return undefined;
    };

    if (
      deps.getAutoSpawnVerifier() &&
      allWorkDone &&
      !anyWorking &&
      !isVerifierReport &&
      !isMonitorStall &&
      !hasFreshPass
    ) {
      const verifyTargetPost =
        (latestPost && latestPost.author_name !== coord.name ? latestPost : findLatestDoneWorkerPost()) ?? latestPost;
      if (verifyTargetPost) {
        const outcome = await ensureVerifierForCompletedWork(swarmId, coord, verifyTargetPost, {
          incremental: false,
          doneWorkers,
          openWorkers: [],
        });
        if (outcome === "spawned" || outcome === "requested" || outcome === "in_progress") return;
      }
    } else if (
      deps.getAutoSpawnVerifier() &&
      !allWorkDone &&
      doneWorkers.length > 0 &&
      openWorkers.length > 0 &&
      !isVerifierReport &&
      !isMonitorStall &&
      !hasFreshPass
    ) {
      const donePost = findLatestDoneWorkerPost();
      if (donePost) {
        await ensureVerifierForCompletedWork(swarmId, coord, donePost, {
          incremental: true,
          doneWorkers,
          openWorkers,
        });
      }
    }

    if (!latestPost || latestPost.author_name === coord.name) return;

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

    const completeReady = hasFreshPass && allWorkDone && !anyWorking;

    const handoffText = completeReady
      ? `All swarm members finished (latest #${latestPost.swarm_seq} from @${latestPost.author_name}). Read board updates since #${prevReadSeq} with read_board, present the final summary to the user, and call swarm{action:"complete"}.`
      : allWorkDone && !anyWorking && !hasFreshPass && !isVerifierReport
        ? `Swarm handoff ready on board (latest #${latestPost.swarm_seq} from @${latestPost.author_name}). Verification is NOT done: no verifier PASS yet. Call read_board(since: ${prevReadSeq}) to review, spawn or repair a verifier (@verifier) to independently verify worker output, and do NOT call swarm{action:"complete"} until a verifier posts PASS.`
        : allWorkersDone && openPlanUnits > 0 && !anyWorking
          ? `Batch finished (latest #${latestPost.swarm_seq} from @${latestPost.author_name}), with ${openPlanUnits} plan unit(s) still open. Call read_board(since: ${prevReadSeq}) to review and assign the remaining open units.`
          : `Swarm handoff ready on board (latest #${latestPost.swarm_seq} from @${latestPost.author_name}). Call read_board(since: ${prevReadSeq}) to review and coordinate next steps or complete the swarm.`;

    if (coordWaiter) {
      let posts: BoardPostRow[] = [latestPost];
      // Resolving must be unconditional: if the read cursor or posts query throws,
      // still hand off with the best payload available instead of orphaning the wait.
      try {
        const unread = db
          .getPostsPage(swarmId, coordWaiter.sinceSeq, 50, "*")
          .posts.filter((p) => p.author_name !== coord.name);
        if (unread.length > 0) posts = unread;
        recordWakeSeq(coord.id, latestPost.swarm_seq);
        db.advanceReadCursor(coord.id, latestPost.swarm_seq);
      } catch (err) {
        // Best-effort bookkeeping: the handoff still reaches the coordinator.
        console.warn(
          `[opencode-swarm] coordinator wake bookkeeping failed for @${coord.name}:`,
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        waiters.delete(coord.id);
        coordWaiter.resolve({ posts, handoff: handoffText });
      }
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
    maybeWakePendingMember,
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
