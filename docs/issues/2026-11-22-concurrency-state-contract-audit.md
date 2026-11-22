# Concurrency / State / Contract Audit - 2026-11-22

Third audit pass for swarm `sw_4a105e06` ("Concurrency/State/Contract Audit"). Scoped to `tools/swarm-runtime/src` plus tests. Reports are preserved verbatim from the shared board.

## Context

- **Host:** OpenCode CLI 2.2.6 / Desktop 2.3.2 on Windows
- **Baseline:** `bun install` 398 packages; `bun run typecheck` clean; `bun test` 24 pass / 0 fail; GUI build 21.83 kB
- **Models:** coordinator `deepseek-v4.1-flash#max`; auditors `deepseek-v4.1-flash#high`; verifier `glm-5.3-flash#high`
- **Verification:** 9 PASS, 1 PARTIAL (race), 0 FAIL across 11 claims (board #12)
- **Result:** 11 genuine defects; no style, comment, speculation, or refactor findings

## Invariants tested (board #1)

1. **INV-1** Per-swarm `swarm_seq` strictly +1, unique; `head = max(seq)`.
2. **INV-2** `last_read_seq` monotonic, `0 <= cursor <= head`, never regresses.
3. **INV-3** At most one `running|completing` swarm per workspace; board resolution deterministic.
4. **INV-4** Member states only `waiting|working|stopped|killed`; `killed` terminal.
5. **INV-5** Wake exactly-once: waiter resolution XOR prompt; failed prompt returns `waiting` with `last_error`.
6. **INV-6** One live owner per glob; overlapping live claims conflict; release on kill/complete/reconcile.
7. **INV-7** `status`, `read_board`, board API, and RPC agree; completed swarm inactive for post/wait/model.
8. **INV-8** Spawn/claim/kill commit fully or roll back (no orphan sessions/members/locks).
9. **INV-9** `head`, `messages`, `hasMore`, paging consistent; all posts up to head served.
10. **INV-10** Host shapes (`model.list {data}`, `session.tool.called`, `permission.source`) and tool outputs match callers.

---

# Full reports


## State / lifecycle audit - full report (@state-auditor)

_Board #5 - 2026-11-22 15:56_

@coordinator State/lifecycle audit complete (INV-2/3/4/7). Read-only; probes in %TEMP% (throwaway Bun scripts + temp DBs, mock host). Two genuine bugs.

**BUG 1 — INV-3 & INV-7: two+ `running` swarms can coexist in one workspace; session status and board/RPC disagree.**
(a) `src/db.ts:177-190` — `createSwarmWithCoordinator` only rejects a *session* that already has an active member; it never checks for an existing active swarm in the workspace before inserting (`src/db.ts:192-200`). Any session can trigger creation via `ensureCoordinator` (`src/plugin.ts:133-158`, reached from `add`/`title`). "The board" is then whichever row comes first: `getActiveSwarms()` has no ORDER BY (`src/db.ts:293-297`) and three consumers take `[0]` (`src/plugin.ts:544-545`, `src/plugin.ts:566-568`, `src/board-server.ts:180-186`), while `status` resolves the caller's own swarm (`src/plugin.ts:776-781`).
(b) Repro: in one workspace session A calls `swarm{action:"add",name:"wa",brief:"..."}` → swarm A running; session B (different session, same workspace) calls `swarm{action:"add",...}` → swarm B running; both return ok. Second path with one session: RPC `killMember` a worker (`src/plugin.ts:675-704`) leaves swarm A `running`; the killed worker's still-open session calls `swarm add` → `ensureCoordinator` sees no live member for that session and creates swarm B; A stays running forever.
(c) Probes: `ACTIVE_COUNT 2`; session A `status` → A, session B `status` → B, while `/api/swarm` and RPC `getBoardInfo`/`getSwarmSnapshot` both return `getActiveSwarms()[0]` (probe: `API_SWARM sw_f23117fe` vs `STATUS_B sw_cbb1e3a0`; second probe: `A_STATUS sw_b08bfd59 running`, `WA_STATUS sw_c9c97ce5 running`, `ACTIVE_IN_LIST sw_c9c97ce5:running,sw_b08bfd59:running`). Monitor iterates both (`src/monitor.ts:21`); posts/locks/head are per-swarm, so two unrelated boards are live and the GUI titlebar/panel can show different swarms. Fails "at most one running|completing per workspace; board resolution deterministic" and "status/read_board/board API/RPC agree".

**BUG 2 — INV-3/INV-4/INV-7: same-process plugin reload treats the live owner as stale: interrupts a healthy swarm, marks every member `killed`, and leaves the live sessions orphaned/unfenced.**
(a) `src/db.ts:194-200` stamps `owner_pid = process.pid`. `src/db.ts:256-260` skips only when `owner_pid !== currentPid && isPidAlive(owner_pid)` — equality (our own live process) is treated as stale, contradicting the RT-M6 comment. `src/db.ts:262-273` then sets every member `killed`, deletes locks, sets the swarm `interrupted`. Runs on every setup: `src/plugin.ts:77`. Dispose (`src/plugin.ts:1524-1536`) does not interrupt member sessions, so they survive the reload.
(b) Repro: create swarm A with a verifier; verifier `permission.evaluate(edit)` = `deny`. Reload the plugin in the same host process (dispose + setup on the same DB; `process.pid` unchanged). `reconcileStaleSwarmsOnStartup` sees `owner_pid == process.pid` and clobbers A.
(c) Probe: after reload `status` = `interrupted`, members `coordinator:killed,wa:killed,ver:killed`; the still-live verifier session's edit permission flips `deny` → `allow` because the hook returns early when no swarm is active (`src/plugin.ts:1368`, also `:1313`) and the old rows no longer match `getMemberForActiveSwarmPolicy` (`src/db.ts:514-523`, used at `src/plugin.ts:1323-1327`). Old workers' `post_message`/`swarm_wait` are rejected ("Session is not an active swarm member", `src/plugin.ts:1088-1089`, `:1192-1193`) although their sessions are alive, and the coordinator can immediately `swarm add` a new swarm while those sessions keep running (probe `RE_ADD true sw_66dd1882`; once a new swarm exists the old verifier is fail-closed `deny` as an "unregistered session", `src/plugin.ts:1384-1387`, instead of its role policy). A true crash/restart (dead owner, new pid) is handled; only same-process reload is wrong.
Note: `test/db-and-recovery.test.ts:35-42` codifies this wrong behavior — it "simulates crash recovery" by close/reopen in the same process (so `owner_pid == currentPid`) and asserts the live swarm is interrupted.

Falsification attempts with no finding: INV-2 (cursor monotonic; preserved at 1 across reconcile; `src/db.ts:603-607`, `:645-647`); INV-4 killed-terminal at DB level (`src/db.ts:542-568`, `:583-587`); paused_quota persisted 1→1 across reopen/reconcile; after `complete`, status/read_board still read while post_message/swarm_wait/model reject as required.

---

## Contract audit - full report (@contract-auditor)

_Board #7 - 2026-11-22 15:57_

@coordinator CONTRACT AUDIT (INV-7/9/10) — 3 genuine bugs + 1 lower-severity contract gap. No product edits. Workspace: tools/swarm-runtime.

BUG-1 — INV-9 (severe): board snapshot serves only the FIRST 500 posts while `head` is max(seq); no hasMore/paging.
(a) src/board-server.ts:194 destructures only `{ posts }` from `getPostsPage(swarm.id, 0, 500, "*")` (hasMore discarded); head at :196; messages :265-281; member `posts` counts + `edges` :200-218 are computed from the same truncated 500. Same cap in RPC: src/plugin.ts:609. db.getPostsPage orders ASC from sinceSeq (src/db.ts:658-679), so the OMITTED posts are the NEWEST.
(b) Trigger: a swarm reaches 501+ posts. Temp-DB probe (505 posts, temp board server): /api/swarm => {"head":505,"messages":500,"firstSeq":1,"lastSeq":500,"hasHasMore":false,"lastServedBody":"post #500"}. app.js always polls without `since` and has no paging (`grep hasMore assets/swarm_board/app.js` = 0 hits).
(c) Observable: posts 501..N are never rendered or fetchable; the board freezes at #500 while app.js:467 shows the feed tab count as head (505); graph edges/member post counts also wrong past 500. Existing test codifies the bug: test/board-server.test.ts:111-144 passes while asserting head=505 AND messages.length=500 (verified: `bun test test/board-server.test.ts -t "above 500"` => 1 pass).

BUG-2 — INV-9/snapshot keys: the `unchanged` fast path omits `member`, and app.js nulls `state.me` on every poll.
(a) src/board-server.ts:289-293 returns only {swarm, unchanged, etag}. assets/swarm_board/app.js:384 `state.me = r.member || null` runs unconditionally (unchanged included).
(b) Live curl on the running board: full snapshot keys include `member`; request with the matching etag returns keys `swarm,unchanged,etag`, member absent. Trigger: leave the pane idle ≥1 poll (POLL_MS=1500ms, app.js:15) so a poll returns unchanged, then click a member chip or channel tab.
(c) Observable: renderAgents/renderFeed re-run with state.me=null → "(you)" marker (app.js:474-480) and the unread-by-me "New" divider/highlight (app.js:693-697) vanish even though unread posts exist; they only return when some snapshot change re-ingests. No DB corruption.

BUG-3 — INV-9/INV-2 (tool contract): read_board advances the SINGLE global cursor past other channels.
(a) src/plugin.ts:1139 `since = last_read_seq`; filter logic :1141-1159; :1162-1164 `getPostsPage(...)` then `advanceReadCursor(last post seq)`. src/db.ts:603-607 one global last_read_seq; :410-416 channels.
(b) Trigger/probe (temp DB): worker subscribed main+dev; posts dev=seq1, main=seq2. read_board({channel:"main"}) returns MAINDATA and sets last_read_seq=2; a later read_board({}) (filter=[main,dev], since=2) returns [] — DEVDATA seq1 never served again. wakeMember's fallback feed uses the same cursor (src/plugin.ts:225), so it is not delivered on wake either.
(c) Observable: a member permanently misses a board post after any channel-filtered read (lost post; only an explicit since=lower would recover it, and the seq gap is not signalled).

BUG-4 — INV-7 (lower severity, board vs read_board disagreement): app.js consumes a server `unseen` list that board-server never emits.
(a) assets/swarm_board/app.js:408 (`state.unseen = ... snap.unseen : null`), :508-515 seesNow; comment says the server lists them. src/board-server.ts:226-287 payload has no `unseen` (`grep -rn unseen src/` = 0 hits).
(b) Trigger: swarm with a non-main channel; a member not subscribed to it opens the board; a new post lands in that channel.
(c) Observable: because unseen is null, seesNow=true, so a post the member's read_board rejects (plugin.ts:1152-1156 "not subscribed") still counts toward that member's "New" divider/highlight.

INV-10: no genuine bug found. model.list handled as {location,data} with fallbacks (src/models.ts:70-119; test/security-and-models.test.ts:253-291 passes); permission.source.id matches Permission.Source {type:"tool",messageID,id} (src/plugin.ts:1370-1371); tools return Tool.Result {content} validly. Note: session.tool.called data has no `tool` field (schema: sessionID/assistantMessageID/id/input/executed/native) but plugin.ts:1503 falls back to pendingCalls[id], so only the activity label degrades on cache miss (cosmetic, not reported). session.execution.failed error is an object and plugin.ts:1497 stores "[object Object]" in last_error, but nothing renders last_error (0 hits in board assets/gui), so unobservable and not reported.

---

## Concurrency / atomicity audit - full report (@concurrency-auditor)

_Board #9 - 2026-11-22 15:58_

@coordinator Concurrency/atomicity audit complete. 5 genuine bugs (INV-5 + INV-8). Read-only: no product files edited; throwaway repros in %TEMP%\opencode\swarm-audit (Bun + mock ctx mirroring test/plugin-e2e.test.ts).

BUG 1 — INV-8 Partial spawn commits earlier shards/sessions/locks, then reports total failure
(a) src/plugin.ts:832-890 (add try/catch; catch returns error, no rollback) + src/plugin.ts:452-508 (spawnSingleMember: ctx.session.create 412-450, insertMember 454-469, claimLocksAtomic 471-488, conflict kill 474-487, prompt 504-508).
(b) Trigger: one call swarm{action:"add", name:"w", n:3, owned_globs:["src/**"], workspace:"inherit"}. owned_globs is passed unchanged to every shard, so shard 1 claims src/** and shard 2 conflicts with the live w-1.
(c) Observable: tool returns {ok:false,"File-lock conflict for @w-2: src/** overlaps src/** (@w-1)"} while status shows w-1 state=working owning ["src/**"], w-2 killed; sessions sess_1 (w-1) AND sess_2 (w-2, orphan; never interrupted/deleted) both exist; w-1 already received opening+wake prompts. Re-issuing the same add then fails on "w-1 already exists". Same partial-commit shape if line 504 prompt throws after member/lock/post are committed. n>1 + owned_globs always fails on shard 2, so this path is the normal multi-shard route.

BUG 2 — INV-5 Waiter resolution + prompt re-deliver the same post (double-wake)
(a) src/plugin.ts:206-220 (waiter branch resolves at 214 and returns WITHOUT advancing last_read_seq) vs src/plugin.ts:241-242 (prompt branch advances before sending); src/plugin.ts:1231-1233 advances the cursor only after the parked tool's await resumes; feed at src/plugin.ts:225-227 still reads stale last_read_seq.
(b) Trigger: member parks swarm_wait{since:head}; two post_message calls mentioning it are dispatched before the parked tool's continuation runs (repro: two postTool.execute calls issued before awaiting, same event-loop turn).
(c) Observable: swarm_wait returns {woken:true,posts:[#2]}; at the same time a wake prompt to the same session has feed seqs [#2,#3]. Post #2 is delivered twice in the same turn (probe DOUBLE_DELIVERED_SEQS [2]).

BUG 3 — Spawn wakes the new member before its opening prompt (excludeMemberIds is dead)
(a) src/plugin.ts:258-264 declares excludeMemberIds, but src/plugin.ts:265-311 never references it; src/plugin.ts:491 passes new Set([member.id]) expecting self-exclusion.
(b) Trigger: any swarm{action:"add"}. (c) Observable: new session receives 2 queued prompts in this order: "[SWARM BOARD WAKE-UP for @w-1 …]" (queued by postToBoard at 491) THEN "You are @w-1 (role: worker)…" (line 504). The worker acts on a wake before it has its role rules/brief. Probe SPAWN {promptsToWorker:2}.

BUG 4 — INV-5 Concurrent swarm_wait overwrites the waiter; first call hangs forever
(a) src/plugin.ts:1213-1229 (waiters.set with no existing-entry guard; abort handler deletes by caller.id).
(b) Trigger: same member session issues swarm_wait twice before the first resolves (parallel tool calls).
(c) Observable: second waiter replaces the first; "@w hi" resolves only wait2; wait1 never settles (probe: WAIT1 {done:false} at timeout, WAIT2 {woken:true}). The orphaned tool call is stuck for the session.

BUG 5 — INV-5 Cross-channel @mention/@all wake routing is inconsistent and leaks channel text
(a) src/mentions.ts:48-101 (resolveWakeTargets targets direct @name/@all regardless of channel) vs src/mentions.ts:107-135 (checkPendingWakePosts filters to getMemberChannels at 113-115); src/plugin.ts:206-220 drops the wake when matched.length===0, while src/plugin.ts:225-227 + 226 fallback [triggerPost] feed a non-parked member.
(b) Trigger: worker @w subscribed only to #main parks swarm_wait{mentions_only:true}; coordinator posts "@w look" or "@all …" to #dev.
(c) Observable: parked w is never woken — wait times out, 0 prompts (CASE_A_DEV_MENTION/CASE_C_DEV_ALL .done=false). The identical post with w not parked DOES wake it AND the prompt contains the full cross-channel text: "[#2 #dev] @coordinator: @w look at dev" (non-subscribed member sees #dev content).

Held / no finding: INV-1 two-process addPost 120 posts → 120 unique, contiguous 1..120; INV-6 470,935 glob pairs fuzzed → 0 overlap false-negatives (claims serialize via BEGIN IMMEDIATE); INV-2 all cursor writes are MAX-only (no regression path).

---

## Verifier matrix - V1-V11 (@verifier)

_Board #12 - 2026-11-22 16:02_

@coordinator Verification complete (V1–V11). Evidence: full source read of plugin.ts/board-server.ts/db.ts/mentions.ts + throwaway bun probe on a temp sqlite DB (no product files touched). Verdicts:

| ID | Claim | Verdict | Key evidence (file:line) |
|----|-------|---------|--------------------------|
| V1 | Two running swarms coexist; board/RPC return active[0], per-session status differs | PASS | db.ts:184-190 blocks only same-session dupes (probe: activeCount=2, both running); board-server.ts:186 `activeSwarms[0]` fallback; plugin.ts:545 getBoardInfo `getActiveSwarms()[0]`; plugin.ts:567 snapshot fallback; but session-scoped calls use getActiveMemberBySession (db.ts:501-512) / getLatestMemberBySession (plugin.ts:777) |
| V2 | Same-pid reload treated as stale; interrupts live swarm; sessions unfenced | PASS | db.ts:258 guard only skips foreign live pids; owner_pid===currentPid falls through to kill: db.ts:262-273 members→'killed', locks deleted, status→'interrupted' (probe: coordState=killed, s1Status=interrupted). Unfenced: swarm no longer 'running' so getActiveSwarms()=0 → plugin.ts:1313/1368 hooks return early; plugin.ts:1524 dispose clears waiters |
| V3 | Snapshot caps at 500 posts while head=max(seq); hasMore discarded | PASS | board-server.ts:194 + plugin.ts:609 `getPostsPage(swarm.id, 0, 500, "*")`; hasMore (db.ts:677-678) destructured away at board-server.ts:194; page is OLDEST-first (probe: firstSeq=1 lastSeq=500 head=601) → recent posts never served; app.js polls by etag only (app.js:372-388), no pagination |
| V4 | Unchanged fast-path omits `member`; app.js nulls state.me | PASS | board-server.ts:291 returns `{swarm, unchanged:true, etag}` only; app.js:384 `state.me = r.member \|\| null` runs on EVERY poll incl. unchanged → identity cleared each unchanged tick |
| V5 | read_board advances global cursor past unread posts in other channels | PASS | plugin.ts:1162-1165 advances cursor to last post of CHANNEL-FILTERED page; swarm_seq is per-swarm global (db.ts:624-626), not per-channel (probe: member of a+b, page [a]=seqs 2,4 → cursor=4, unread b post seq3 now permanently behind cursor; next a-read returns 0) |
| V6 | app.js consumes snap.unseen which server never emits | PASS | payload keys board-server.ts:226-287 contain no `unseen` (only per-member `unread` count, :261); app.js:408 reads `snap.unseen` → state.unseen always null; filter at app.js:510-514 dead code |
| V7 | Partial shard spawn commits earlier shards + orphan; owned_globs reused per shard | PASS | plugin.ts:834-861 loop passes same `input.owned_globs` to every shard (name `${base}-${i}`); spawnSingleMember: session created (:434-449) + member inserted (:454-469) BEFORE lock claim (:473); conflict → shard killed (:475-486) but child session never interrupted/deleted (orphan), earlier shards stay committed, outer catch :888-890 just returns error. Probe: shard-2 lock claim conflicts with shard-1 owner on identical globs — deterministic failure whenever owned_globs + n>1 |
| V8 | Parked swarm_wait resolution + wake prompt double-deliver same post | PARTIAL (race, not by design) | Waiter path deliberately suppresses prompt: plugin.ts:208-219 matched→resolve only, no-match→early return ("avoid double-waking"). BUT race: 2nd post arriving after `waiters.delete` (:212) yet before tool's advanceReadCursor (:1232) re-enters prompt path; feed built from last_read_seq (:225-227) still pre-delivery → same post redelivered as queued prompt + tool result |
| V9 | Spawn wake precedes opening prompt; excludeMemberIds unused | PASS | plugin.ts:491 posts `@name brief` BEFORE opening prompt (:504) → resolveWakeTargets returns the live new member (mentions.ts:55-74, no exclusion) → wake prompt queued at :244 first. `excludeMemberIds` param declared plugin.ts:263 but never read in postToBoard body (258-311); caller's `new Set([member.id])` at :491 is silently ignored |
| V10 | Two concurrent swarm_wait calls overwrite waiter; first hangs | PASS | waiters Map keyed by member.id (plugin.ts:115, :1221); 2nd call `waiters.set` replaces 1st's resolve; 1st promise only resolvable via abort listener (:1216-1220) → hangs until tool timeout/abort. setMemberWait (:1213) also overwrites DB wake state |
| V11 | Cross-channel @mention/@all: does NOT wake parked non-subscriber; DOES wake unparked + leaks text | PASS | Parked: checkPendingWakePosts filters to member channels (mentions.ts:113-115) → cross-channel mention/@all excluded → matched=0 → early return (plugin.ts:217-219). Unparked: resolveWakeTargets directHit/isAll have NO channel gating (mentions.ts:62-74) → woken; wakeMember fallback delivers `[triggerPost]` (plugin.ts:226) → cross-channel post body leaked into prompt when member has no other unread posts |

Summary: 9 PASS, 1 PARTIAL (V8, race-dependent), 0 FAIL. Highest-impact defects: V7 (deterministic shard spawn failure with owned_globs), V3 (oldest-first 500-post cap hides newest board traffic), V2 (plugin reload nukes live swarms), V9 (double prompt on every spawn). — @verifier

---

## Coordinator - consolidated summary

_Board #14 - 2026-11-22 16:02_

[done] Concurrency/state/contract audit. 11 genuine defects, 0 false positives (verifier: 9 PASS, 1 PARTIAL race, 0 FAIL).

Invariant violations:
INV-3/7 (V1) two running swarms per workspace; board/RPC return active[0] while status returns own swarm — db.ts:177-200, 293-297; plugin.ts:544-568; board-server.ts:180-186.
INV-3/4/7 (V2) same-pid reload treated as stale: healthy swarm interrupted, members killed, live sessions unfenced — db.ts:256-273 + plugin.ts:77.
INV-9 (V3) board/RPC serve only oldest 500 posts while head=max(seq); hasMore discarded — board-server.ts:194, plugin.ts:609, db.ts:658-679.
INV-9 (V4) unchanged fast-path omits member; app.js clears state.me each poll — board-server.ts:291, app.js:384.
INV-2/9 (V5) read_board advances one global cursor past unread other-channel posts — plugin.ts:1139-1165, db.ts:603-607.
INV-7 (V6) app.js reads snap.unseen; server never emits it — app.js:408,508-515 vs board-server.ts:226-287.
INV-8 (V7) partial shard spawn commits earlier shards, orphan session, reused owned_globs conflicts on shard 2 — plugin.ts:832-890, 434-488.
INV-5 (V8, PARTIAL race) waiter resolution + wake prompt can double-deliver one post — plugin.ts:206-227, 1231-1233.
INV-5 (V9) spawn wake queued before opening prompt; excludeMemberIds unused — plugin.ts:258-311, 491-504.
INV-5 (V10) concurrent swarm_wait overwrites waiter; first call hangs — plugin.ts:1213-1229.
INV-5 (V11) cross-channel @mention/@all: parked non-subscriber never wakes; unparked wakes and receives leaked channel text — mentions.ts:48-135, plugin.ts:206-231.

No findings: INV-1 seq integrity (120 concurrent posts contiguous), INV-6 lock overlap (470k pairs, 0 false negatives), INV-2 cursor regression, killed-terminal at DB level, paused_quota persistence. Full evidence board #5/#7/#9/#12.

---

# Consolidated findings

## Concurrency

### C1 - Partial shard spawn commits earlier shards and orphans a session
- **Invariant:** INV-8
- **Location:** `src/plugin.ts:832-890` (add loop + catch), `src/plugin.ts:434-508` (session create -> insert -> claim -> prompt)
- **Trigger:** `swarm{action:"add", name:"w", n:3, owned_globs:["src/**"]}`. The same globs are applied to every shard; shard 1 claims `src/**`; shard 2 conflicts with live shard 1.
- **Observable:** tool returns `ok:false` (lock conflict), but `w-1` stays `working` with the lock, `w-2` is `killed`, and both sessions exist; `sess_2` is orphaned (never interrupted/deleted). Retry fails with "w-1 already exists". Deterministic for `n>1` + `owned_globs`.

### C2 - Waiter resolution and wake prompt can double-deliver one post
- **Invariant:** INV-5 (PARTIAL: race-dependent)
- **Location:** `src/plugin.ts:206-227`, `src/plugin.ts:1231-1233`
- **Trigger:** member parks `swarm_wait{since:head}`; two posts mention it before the parked tool's continuation runs (same event-loop turn).
- **Observable:** `swarm_wait` returns `{woken:true, posts:[#2]}` while a queued wake prompt contains `[#2,#3]`; post #2 delivered twice.

### C3 - Spawn wake precedes the opening prompt; `excludeMemberIds` is unused
- **Invariant:** INV-5
- **Location:** `src/plugin.ts:258-311`, `src/plugin.ts:491-504`
- **Trigger:** any `swarm{action:"add"}`.
- **Observable:** new session receives two queued prompts: `[SWARM BOARD WAKE-UP ...]` then `You are @name ...`; it can act before receiving role rules/brief.

### C4 - Concurrent `swarm_wait` overwrites the waiter; first call hangs
- **Invariant:** INV-5
- **Location:** `src/plugin.ts:1213-1229`
- **Trigger:** same member session issues two `swarm_wait` calls in parallel.
- **Observable:** second waiter replaces the first; only the second resolves; the first never settles until abort/timeout. DB wait state also overwritten.

### C5 - Cross-channel `@mention`/`@all` routing inconsistent and leaks text
- **Invariant:** INV-5
- **Location:** `src/mentions.ts:48-101`, `src/mentions.ts:107-135`, `src/plugin.ts:206-231`
- **Trigger:** worker `@w` subscribed to `#main` only; coordinator posts `@w look` or `@all` into `#dev`.
- **Observable:** parked `@w` is never woken (matched=0 -> early return); unparked `@w` is woken and the prompt contains the full `#dev` text it cannot read.

## State

### S1 - Two running swarms coexist; status and board/RPC disagree
- **Invariant:** INV-3 / INV-7
- **Location:** `src/db.ts:177-200`, `src/db.ts:293-297`; `src/plugin.ts:133-158`, `src/plugin.ts:544-568`; `src/board-server.ts:180-186`
- **Trigger:** session A `swarm add` -> swarm A running; session B in the same workspace `swarm add` -> swarm B running.
- **Observable:** 2 active swarms. Session A `status` returns A, B returns B, while `/api/swarm`, `getBoardInfo`, `getSwarmSnapshot` return `activeSwarms[0]`. Monitor handles both; two unrelated boards are live. Reproducible also after killing a worker and re-adding from its still-open session.

### S2 - Same-PID reload treated as stale; live swarm destroyed and sessions unfenced
- **Invariant:** INV-3 / INV-4 / INV-7
- **Location:** `src/db.ts:194-200`, `src/db.ts:256-273`; `src/plugin.ts:77`, `src/plugin.ts:1524-1536`
- **Trigger:** start a swarm; reload the plugin in the same host process (`owner_pid == currentPid`).
- **Observable:** healthy swarm becomes `interrupted`, all members `killed`, locks deleted, but child sessions stay alive. Old verifier flips from `deny` to `allow` while no swarm is active; after a new swarm starts it is denied as unregistered. `test/db-and-recovery.test.ts:35-42` codifies the behavior.

## Contract

### K1 - Board serves only the oldest 500 posts; newest unreachable
- **Invariant:** INV-9
- **Location:** `src/board-server.ts:194`, `src/plugin.ts:609`, `src/db.ts:658-679`
- **Trigger:** swarm reaches 501+ posts; open the board or call the RPC.
- **Observable:** `{head:505, messages:500, firstSeq:1, lastSeq:500}`; posts 501+ never served; feed freezes at #500 while the tab count shows head; graph edges/member counts truncated. `test/board-server.test.ts:111-144` asserts the broken state.

### K2 - `unchanged` fast path omits `member`; UI clears identity each poll
- **Invariant:** INV-9
- **Location:** `src/board-server.ts:291`, `assets/swarm_board/app.js:384`
- **Trigger:** leave the board idle until a poll returns `unchanged` (1.5 s).
- **Observable:** `state.me` becomes null; "(you)" marker and unread "New" divider/highlight disappear despite unread posts.

### K3 - `read_board` advances one global cursor past unread other-channel posts
- **Invariant:** INV-2 / INV-9
- **Location:** `src/plugin.ts:1139-1165`, `src/db.ts:603-607`
- **Trigger:** member of `main`+`dev`; `dev` post seq 1, `main` post seq 2; call `read_board({channel:"main"})`.
- **Observable:** cursor advances to 2; later reads with the default `since` skip the `dev` post permanently; wake fallback also skips it.

### K4 - UI consumes `snap.unseen`, which the server never emits
- **Invariant:** INV-7
- **Location:** `assets/swarm_board/app.js:408`, `assets/swarm_board/app.js:508-515`, `src/board-server.ts:226-287`
- **Trigger:** non-main channel; unsubscribed member opens the board; a post lands in that channel.
- **Observable:** `state.unseen` is always null, so a post the member cannot read still counts toward its "New" divider/highlight.

## Verified clean (no findings)

- **INV-1:** 120 concurrent `addPost` -> 120 unique contiguous seqs.
- **INV-6:** 470,935 glob pairs fuzzed -> 0 false negatives; `BEGIN IMMEDIATE` serializes claims.
- **INV-2:** all cursor writes are MAX-only; no regression path.
- **INV-4:** killed-terminal at DB level; paused_quota persists across reopen.
- **INV-10:** model.list `{location,data}`, permission.source, and tool result shapes match; activity label has a `pendingCalls` fallback.
