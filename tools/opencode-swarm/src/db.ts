import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BoardPostRow,
  ChannelRow,
  FileLockRow,
  MemberRole,
  MemberRow,
  MemberState,
  ModelSelection,
  SwarmRow,
  SwarmStatus,
  SwarmTaskRow,
  TrackStatus,
  WakeMode,
  WorkspaceMode,
} from "./types.js";
import {
  globsPotentiallyOverlap,
  normalizeHandle,
  validateAndNormalizeGlob,
  validateChannelName,
} from "./security.js";

/**
 * How long a lock owned by a killed member must survive before a claim may
 * reclaim it. `kill` flips the member's state to `killed` *before* its in-flight
 * tool calls finish; releasing the locks that early would let another member
 * claim the same globs while the killed member's shell/write is still running.
 * The kill path releases locks itself once the tools quiesce, so this grace
 * period only matters for the never-quiesces safety net.
 */
const KILL_LOCK_GRACE_MS = 60_000;

export interface PendingProvisionRow {
  id: number;
  swarm_id: string;
  member_name: string;
  workspace_mode: WorkspaceMode;
  workspace_dir: string;
  workspace_branch: string | null;
  session_id: string | null;
  created_at: number;
}

export interface SqliteStmt {
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
  close(): void;
}

export async function openSqliteDatabase(dbPath: string): Promise<SqliteDb> {
  const mod = (await import("node:sqlite")) as { DatabaseSync: new (path: string) => SqliteDb };
  return new mod.DatabaseSync(dbPath);
}

/**
 * Write `contents` to `targetPath` atomically: write a sibling temp file, then
 * rename it over the target. A crash mid-write can therefore never leave a
 * truncated/invalid file at the target path. The temp file is removed if the
 * write or rename fails.
 */
function writeFileAtomic(targetPath: string, contents: string): void {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    writeFileSync(tmpPath, contents, "utf8");
    renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Temp file may not exist; nothing to clean up.
    }
    throw err;
  }
}

/** One board.jsonl line. Shared by the append path and the mirror rebuild. */
function formatBoardJsonlLine(post: BoardPostRow): string {
  return JSON.stringify({
    seq: post.swarm_seq,
    channel: post.channel,
    agent: post.author_name,
    text: post.body,
    time: new Date(post.created_at).toISOString(),
  });
}

export class SwarmBoardDB {
  constructor(
    private db: SqliteDb,
    private dataDir: string,
  ) {
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS swarms (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        owner_pid INTEGER,
        owner_instance TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_monitor_nudge_seq INTEGER NOT NULL DEFAULT 0,
        monitor_nudge_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS channels (
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (swarm_id, name)
      );

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        generation INTEGER NOT NULL DEFAULT 1,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        added_by TEXT NOT NULL DEFAULT 'coordinator',
        group_prefix TEXT,
        model_provider TEXT,
        model_id TEXT,
        model_variant TEXT,
        workspace_mode TEXT NOT NULL DEFAULT 'inherit',
        workspace_dir TEXT NOT NULL,
        workspace_branch TEXT,
        brief TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'waiting',
        wake_mode TEXT NOT NULL DEFAULT 'mentions',
        wait_since INTEGER NOT NULL DEFAULT 0,
        last_read_seq INTEGER NOT NULL DEFAULT 0,
        last_post_seq INTEGER NOT NULL DEFAULT 0,
        last_post_time INTEGER,
        steps INTEGER NOT NULL DEFAULT 0,
        activity TEXT,
        activity_kind TEXT,
        last_error TEXT,
        paused_quota INTEGER NOT NULL DEFAULT 0,
        track_status TEXT NOT NULL DEFAULT 'open',
        last_active_at INTEGER NOT NULL,
        UNIQUE(swarm_id, name)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_member_session
        ON members(session_id)
        WHERE state != 'killed';

      CREATE TABLE IF NOT EXISTS channel_members (
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        channel_name TEXT NOT NULL,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        PRIMARY KEY (swarm_id, channel_name, member_id)
      );

      CREATE TABLE IF NOT EXISTS board_posts (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        swarm_seq INTEGER NOT NULL,
        channel TEXT NOT NULL DEFAULT 'main',
        author_name TEXT NOT NULL,
        mentions_json TEXT NOT NULL DEFAULT '[]',
        channel_mentions_json TEXT NOT NULL DEFAULT '[]',
        is_all INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(swarm_id, swarm_seq)
      );

      CREATE TABLE IF NOT EXISTS file_locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        glob_pattern TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        owner_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        claimed_at INTEGER NOT NULL,
        UNIQUE(swarm_id, glob_pattern)
      );

      CREATE TABLE IF NOT EXISTS pending_provisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        swarm_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        workspace_mode TEXT NOT NULL,
        workspace_dir TEXT NOT NULL,
        workspace_branch TEXT,
        session_id TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS swarm_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        assignee_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
        assignee_name TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(swarm_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_posts_swarm ON board_posts(swarm_id, swarm_seq);
      CREATE INDEX IF NOT EXISTS idx_members_swarm ON members(swarm_id, state);
      CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id);
      CREATE INDEX IF NOT EXISTS idx_locks_swarm ON file_locks(swarm_id, owner_member_id);
      CREATE INDEX IF NOT EXISTS idx_swarm_tasks_swarm ON swarm_tasks(swarm_id, status);
    `);

    // Safe migration for existing databases missing owner_pid
    try {
      this.db.exec("ALTER TABLE swarms ADD COLUMN owner_pid INTEGER;");
    } catch {
      // Column already exists
    }

    // Safe migration for existing databases missing owner_instance. Legacy rows keep
    // NULL; reconciliation falls back to pid liveness for those.
    try {
      this.db.exec("ALTER TABLE swarms ADD COLUMN owner_instance TEXT;");
    } catch {
      // Column already exists
    }

    // Safe migration for existing databases missing pending_provisions.session_id.
    // Legacy rows keep NULL; recovery simply has no session to remove for them.
    try {
      this.db.exec("ALTER TABLE pending_provisions ADD COLUMN session_id TEXT;");
    } catch {
      // Column already exists
    }
  }

  close() {
    this.db.close();
  }

  getSwarmDir(swarmId: string): string {
    const dir = join(this.dataDir, "swarms", swarmId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  withImmediateTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch (rbErr) {
        console.warn("[opencode-swarm] SQLite ROLLBACK failed:", rbErr);
      }
      throw err;
    }
  }

  createSwarmWithCoordinator(args: {
    title: string;
    objective: string;
    coordinatorSessionId: string;
    workspaceDir: string;
    model?: ModelSelection;
    /** Per-plugin-setup identity. Enables detecting same-process reloads. */
    ownerInstance?: string;
  }): { swarm: SwarmRow; coordinator: MemberRow } {
    // Keep the pid-only pass here: orphaned swarms in this process are handled by
    // the caller's reclaim path, which knows about live coordinator/worker rows.
    this.reconcileStaleSwarmsOnStartup();
    const result = this.withImmediateTransaction(() => {
      const existingActive = this.getActiveMemberBySession(args.coordinatorSessionId);
      if (existingActive) {
        throw new Error(
          `Session already belongs to active swarm '${existingActive.swarm_id}' as ${existingActive.name}. Complete it first.`,
        );
      }
      const workspaceActive = this.getActiveSwarms();
      if (workspaceActive.length > 0) {
        throw new Error(
          `Workspace already has an active swarm '${workspaceActive[0].id}' (${workspaceActive[0].title}). Complete it first.`,
        );
      }

      const swarmId = `sw_${randomUUID().slice(0, 8)}`;
      const now = Date.now();
      const pid = process.pid;
      this.db
        .prepare(
          `INSERT INTO swarms (id, title, objective, status, owner_pid, owner_instance, created_at, updated_at, last_monitor_nudge_seq, monitor_nudge_count)
           VALUES (?, ?, ?, 'running', ?, ?, ?, ?, 0, 0)`,
        )
        .run(swarmId, args.title, args.objective, pid, args.ownerInstance ?? null, now, now);

      this.db
        .prepare(
          `INSERT INTO channels (swarm_id, name, topic, created_by, archived, created_at)
           VALUES (?, 'main', 'Primary swarm channel', 'coordinator', 0, ?)`,
        )
        .run(swarmId, now);

      const coordId = `mb_${randomUUID().slice(0, 8)}`;
      this.db
        .prepare(
          `INSERT INTO members (
             id, swarm_id, name, generation, session_id, role, added_by, group_prefix,
             model_provider, model_id, model_variant, workspace_mode, workspace_dir, workspace_branch,
             brief, state, wake_mode, wait_since, last_read_seq, last_post_seq, last_post_time,
             steps, activity, activity_kind, last_error, paused_quota, track_status, last_active_at
           ) VALUES (?, ?, 'coordinator', 1, ?, 'coordinator', 'user', NULL, ?, ?, ?, 'inherit', ?, NULL, ?, 'working', 'mentions', 0, 0, 0, NULL, 0, NULL, NULL, NULL, 0, 'open', ?)`,
        )
        .run(
          coordId,
          swarmId,
          args.coordinatorSessionId,
          args.model?.providerID ?? null,
          args.model?.id ?? null,
          args.model?.variant ?? null,
          args.workspaceDir,
          args.objective,
          now,
        );

      return {
        swarm: this.getSwarm(swarmId)!,
        coordinator: this.getMemberById(coordId)!,
      };
    });

    this.syncMembersJson(result.swarm.id);
    return result;
  }

  private isPidAlive(pid: number | null | undefined): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err.code === "EPERM"; // EPERM means process exists but we lack permission to signal
    }
  }

  /**
   * Mark swarms abandoned by a previous plugin instance as interrupted.
   *
   * Ownership is identified by `owner_instance` when available. A bare pid is not
   * enough: the same process can reload the plugin (same pid, new instance) and two
   * different processes can share a pid over time (pid reuse). For legacy rows that
   * predate `owner_instance` (NULL) we fall back to pid liveness, and additionally
   * treat `owner_pid === process.pid` as stale because the previous plugin instance
   * in this process is necessarily gone. Residual limitation for legacy NULL rows:
   * another *live* process that reused a dead owner's pid is indistinguishable.
   */
  reconcileStaleSwarmsOnStartup(currentInstance?: string): SwarmRow[] {
    type OwnedSwarmRow = SwarmRow & { owner_instance?: string | null };
    const active = this.getActiveSwarms() as OwnedSwarmRow[];
    const stale: SwarmRow[] = [];
    const currentPid = process.pid;

    for (const swarm of active) {
      if (currentInstance !== undefined) {
        if (swarm.owner_instance) {
          // Live swarm owned by this exact plugin instance; a different instance id
          // (including a same-process reload) is always stale.
          if (swarm.owner_instance === currentInstance) continue;
        } else {
          // Legacy row without an instance id. A matching pid means the old plugin
          // instance in this process is gone (reload/duplicate load) -> stale.
          // Otherwise keep the historical pid-liveness heuristic.
          const ownedByThisProcess = swarm.owner_pid === currentPid;
          const aliveForeignPid = !!swarm.owner_pid && this.isPidAlive(swarm.owner_pid);
          if (!ownedByThisProcess && aliveForeignPid) continue;
        }
      } else if (
        // S2: backwards-compatible pid-only behavior when no instance id is supplied.
        swarm.owner_pid &&
        (swarm.owner_pid === currentPid || this.isPidAlive(swarm.owner_pid))
      ) {
        continue;
      }

      // Decide and perform the transition atomically so two processes starting together
      // cannot both claim the same stale swarm.
      const transitioned = this.withImmediateTransaction(() => {
        const current = this.getSwarm(swarm.id);
        if (!current || (current.status !== "running" && current.status !== "completing")) {
          return false;
        }
        const now = Date.now();
        // RT-H1: Mark members 'killed' so partial index idx_active_member_session no longer blocks reuse
        this.db
          .prepare(
            `UPDATE members SET state = 'killed', activity = NULL, last_active_at = ?
             WHERE swarm_id = ? AND state != 'killed'`,
          )
          .run(now, swarm.id);
        this.db.prepare(`DELETE FROM file_locks WHERE swarm_id = ?`).run(swarm.id);
        this.db.prepare(`UPDATE swarms SET status = 'interrupted', updated_at = ? WHERE id = ?`).run(now, swarm.id);
        return true;
      });
      if (!transitioned) continue;

      // addPost opens its own transaction; keep it outside the one above and tolerate
      // failures so one swarm cannot abort reconciliation of the rest.
      try {
        this.addPost({
          swarmId: swarm.id,
          authorName: "monitor",
          channel: "main",
          mentions: [],
          channelMentions: [],
          isAll: false,
          body: `Recovered on plugin startup after restart/crash: marked swarm '${swarm.id}' interrupted and released all locks.`,
        });
      } catch (err) {
        console.warn(`[opencode-swarm] Failed to post recovery notice for stale swarm '${swarm.id}':`, err);
      }
      try {
        this.syncMembersJson(swarm.id);
      } catch (err) {
        console.warn(`[opencode-swarm] Failed to sync members.json for stale swarm '${swarm.id}':`, err);
      }
      stale.push(swarm);
    }
    return stale;
  }

  getSwarm(swarmId: string): SwarmRow | undefined {
    return this.db.prepare(`SELECT * FROM swarms WHERE id = ?`).get(swarmId) as SwarmRow | undefined;
  }

  getActiveSwarms(): SwarmRow[] {
    return this.db
      .prepare(`SELECT * FROM swarms WHERE status IN ('running', 'completing') ORDER BY created_at DESC, rowid DESC`)
      .all() as unknown as SwarmRow[];
  }

  listSwarms(limit = 50): Array<{
    id: string;
    title: string;
    status: SwarmStatus;
    created_at: number;
    updated_at: number;
    member_count: number;
    post_count: number;
  }> {
    return this.db
      .prepare(
        `SELECT
           s.id,
           s.title,
           s.status,
           s.created_at,
           s.updated_at,
           (SELECT COUNT(*) FROM members m WHERE m.swarm_id = s.id) AS member_count,
           (SELECT COUNT(*) FROM board_posts p WHERE p.swarm_id = s.id) AS post_count
         FROM swarms s
         ORDER BY s.updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as unknown as Array<{
        id: string;
        title: string;
        status: SwarmStatus;
        created_at: number;
        updated_at: number;
        member_count: number;
        post_count: number;
      }>;
  }

  setSwarmTitle(swarmId: string, title: string) {
    this.db.prepare(`UPDATE swarms SET title = ?, updated_at = ? WHERE id = ?`).run(title, Date.now(), swarmId);
    this.syncMembersJson(swarmId);
  }

  setSwarmStatus(swarmId: string, status: SwarmStatus) {
    this.db.prepare(`UPDATE swarms SET status = ?, updated_at = ? WHERE id = ?`).run(status, Date.now(), swarmId);
  }

  updateMonitorNudge(swarmId: string, seq: number, count: number) {
    this.db
      .prepare(`UPDATE swarms SET last_monitor_nudge_seq = ?, monitor_nudge_count = ?, updated_at = ? WHERE id = ?`)
      .run(seq, count, Date.now(), swarmId);
  }

  // -------------------------------------------------------------------------
  // Channels
  // -------------------------------------------------------------------------

  createChannel(swarmId: string, name: string, topic: string, createdBy: string): ChannelRow {
    const clean = validateChannelName(name);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO channels (swarm_id, name, topic, created_by, archived, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      )
      .run(swarmId, clean, topic, createdBy, now);
    return this.getChannel(swarmId, clean)!;
  }

  getChannel(swarmId: string, name: string): ChannelRow | undefined {
    const lookup = name.trim().replace(/^#+/, "").toLowerCase();
    return this.db
      .prepare(`SELECT * FROM channels WHERE swarm_id = ? AND name = ?`)
      .get(swarmId, lookup) as ChannelRow | undefined;
  }

  listChannels(swarmId: string): Array<ChannelRow & { subscriber_count: number }> {
    return this.db
      .prepare(
        `SELECT c.*, COUNT(cm.member_id) AS subscriber_count
         FROM channels c
         LEFT JOIN channel_members cm ON cm.swarm_id = c.swarm_id AND cm.channel_name = c.name
         WHERE c.swarm_id = ?
         GROUP BY c.swarm_id, c.name
         ORDER BY c.created_at ASC`,
      )
      .all(swarmId) as unknown as Array<ChannelRow & { subscriber_count: number }>;
  }

  archiveChannel(swarmId: string, name: string) {
    const clean = normalizeHandle(name);
    if (clean === "main") throw new Error(`Cannot archive 'main' channel.`);
    this.db.prepare(`UPDATE channels SET archived = 1 WHERE swarm_id = ? AND name = ?`).run(swarmId, clean);
  }

  subscribeMemberToChannel(swarmId: string, channelName: string, memberId: string) {
    const clean = normalizeHandle(channelName);
    const ch = this.getChannel(swarmId, clean);
    if (!ch) throw new Error(`Channel "#${clean}" does not exist.`);
    if (ch.archived) throw new Error(`Cannot subscribe to archived channel "#${clean}".`);
    this.db
      .prepare(`INSERT OR IGNORE INTO channel_members (swarm_id, channel_name, member_id) VALUES (?, ?, ?)`)
      .run(swarmId, clean, memberId);
  }

  unsubscribeMemberFromChannel(swarmId: string, channelName: string, memberId: string) {
    const clean = normalizeHandle(channelName);
    if (clean === "main") throw new Error(`Cannot unsubscribe from 'main'.`);
    this.db
      .prepare(`DELETE FROM channel_members WHERE swarm_id = ? AND channel_name = ? AND member_id = ?`)
      .run(swarmId, clean, memberId);
  }

  getMemberChannels(swarmId: string, memberId: string): string[] {
    const rows = this.db
      .prepare(`SELECT channel_name FROM channel_members WHERE swarm_id = ? AND member_id = ? ORDER BY channel_name ASC`)
      .all(swarmId, memberId) as Array<{ channel_name: string }>;
    const unique = new Set<string>(["main", ...rows.map((r) => r.channel_name)]);
    return Array.from(unique);
  }

  getChannelSubscriberIds(swarmId: string, channelName: string): string[] {
    const rows = this.db
      .prepare(`SELECT member_id FROM channel_members WHERE swarm_id = ? AND channel_name = ?`)
      .all(swarmId, normalizeHandle(channelName)) as Array<{ member_id: string }>;
    return rows.map((r) => r.member_id);
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  insertMember(args: {
    swarmId: string;
    name: string;
    sessionId: string;
    role: MemberRole;
    addedBy: string;
    groupPrefix?: string | null;
    model?: ModelSelection;
    workspaceMode: WorkspaceMode;
    workspaceDir: string;
    workspaceBranch?: string | null;
    brief: string;
    state?: MemberState;
    lastReadSeq?: number;
    channels?: string[];
  }): MemberRow {
    const member = this.withImmediateTransaction(() => {
      const id = `mb_${randomUUID().slice(0, 8)}`;
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO members (
             id, swarm_id, name, generation, session_id, role, added_by, group_prefix,
             model_provider, model_id, model_variant, workspace_mode, workspace_dir, workspace_branch,
             brief, state, wake_mode, wait_since, last_read_seq, last_post_seq, last_post_time,
             steps, activity, activity_kind, last_error, paused_quota, track_status, last_active_at
           ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mentions', 0, ?, 0, NULL, 0, NULL, NULL, NULL, 0, ?, ?)`,
        )
        .run(
          id,
          args.swarmId,
          args.name,
          args.sessionId,
          args.role,
          args.addedBy,
          args.groupPrefix ?? null,
          args.model?.providerID ?? null,
          args.model?.id ?? null,
          args.model?.variant ?? null,
          args.workspaceMode,
          args.workspaceDir,
          args.workspaceBranch ?? null,
          args.brief,
          args.state ?? "waiting",
          args.lastReadSeq ?? 0,
          args.role === "verifier" || args.role === "monitor" || args.role === "narrator" ? "done" : "open",
          now,
        );

      for (const ch of args.channels ?? []) {
        const clean = normalizeHandle(ch);
        if (clean !== "main") {
          this.subscribeMemberToChannel(args.swarmId, clean, id);
        }
      }
      return this.getMemberById(id)!;
    });

    this.syncMembersJson(args.swarmId);
    return member;
  }

  getMemberById(memberId: string): MemberRow | undefined {
    return this.db.prepare(`SELECT * FROM members WHERE id = ?`).get(memberId) as MemberRow | undefined;
  }

  getMemberByName(swarmId: string, name: string): MemberRow | undefined {
    return this.db
      .prepare(`SELECT * FROM members WHERE swarm_id = ? AND name = ?`)
      .get(swarmId, normalizeHandle(name)) as MemberRow | undefined;
  }

  getActiveMemberBySession(sessionId: string): MemberRow | undefined {
    return this.db
      .prepare(
        `SELECT m.* FROM members m
         JOIN swarms s ON s.id = m.swarm_id
         WHERE m.session_id = ?
           AND s.status IN ('running', 'completing')
           AND m.state != 'killed'
         ORDER BY m.rowid DESC LIMIT 1`,
      )
      .get(sessionId) as MemberRow | undefined;
  }

  getMemberForActiveSwarmPolicy(sessionId: string): MemberRow | undefined {
    return this.db
      .prepare(
        `SELECT m.* FROM members m
         JOIN swarms s ON s.id = m.swarm_id
         WHERE m.session_id = ? AND s.status IN ('running', 'completing')
         ORDER BY m.rowid DESC LIMIT 1`,
      )
      .get(sessionId) as MemberRow | undefined;
  }

  getLatestMemberBySession(sessionId: string): MemberRow | undefined {
    return this.db
      .prepare(`SELECT * FROM members WHERE session_id = ? ORDER BY rowid DESC LIMIT 1`)
      .get(sessionId) as MemberRow | undefined;
  }

  listMembers(swarmId: string, includeKilled = true): MemberRow[] {
    if (includeKilled) {
      return this.db
        .prepare(`SELECT * FROM members WHERE swarm_id = ? ORDER BY rowid ASC`)
        .all(swarmId) as unknown as MemberRow[];
    }
    return this.db
      .prepare(`SELECT * FROM members WHERE swarm_id = ? AND state != 'killed' ORDER BY rowid ASC`)
      .all(swarmId) as unknown as MemberRow[];
  }

  setMemberState(memberId: string, state: MemberState, opts?: { activity?: string | null; activityKind?: string | null; error?: string | null; pausedQuota?: boolean }) {
    const member = this.getMemberById(memberId);
    if (!member) return;
    if (member.state === "killed" && state !== "killed") return;
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE members
         SET state = ?,
             activity = COALESCE(?, activity),
             activity_kind = COALESCE(?, activity_kind),
             last_error = ?,
             paused_quota = COALESCE(?, paused_quota),
             last_active_at = ?
         WHERE id = ?`,
      )
      .run(
        state,
        opts?.activity === undefined ? member.activity : opts.activity,
        opts?.activityKind === undefined ? member.activity_kind : opts.activityKind,
        opts?.error === undefined ? member.last_error : opts.error,
        opts?.pausedQuota === undefined ? member.paused_quota : opts.pausedQuota ? 1 : 0,
        now,
        memberId,
      );
    this.syncMembersJson(member.swarm_id);
  }

  setMemberModel(memberId: string, model: ModelSelection) {
    const member = this.getMemberById(memberId);
    if (!member) return;
    this.db
      .prepare(
        `UPDATE members
         SET model_provider = ?, model_id = ?, model_variant = ?, paused_quota = 0, last_error = NULL, last_active_at = ?
         WHERE id = ?`,
      )
      .run(model.providerID, model.id, model.variant ?? null, Date.now(), memberId);
    this.syncMembersJson(member.swarm_id);
  }

  setMemberWait(memberId: string, wakeMode: WakeMode, waitSince: number) {
    this.db
      .prepare(`UPDATE members SET wake_mode = ?, wait_since = ?, state = 'waiting', activity = NULL, last_active_at = ? WHERE id = ? AND state != 'killed'`)
      .run(wakeMode, waitSince, Date.now(), memberId);
    const member = this.getMemberById(memberId);
    if (member) this.syncMembersJson(member.swarm_id);
  }

  incrementMemberSteps(memberId: string, activity?: string, activityKind?: string) {
    this.db
      .prepare(
        `UPDATE members SET steps = steps + 1, activity = COALESCE(?, activity), activity_kind = COALESCE(?, activity_kind), last_active_at = ? WHERE id = ?`,
      )
      .run(activity ?? null, activityKind ?? null, Date.now(), memberId);
    if (activity) {
      const member = this.getMemberById(memberId);
      if (member) this.syncMembersJson(member.swarm_id);
    }
  }

  setTrackStatus(memberId: string, status: TrackStatus) {
    this.db
      .prepare(`UPDATE members SET track_status = ?, last_active_at = ? WHERE id = ?`)
      .run(status, Date.now(), memberId);
    const member = this.getMemberById(memberId);
    if (member) this.syncMembersJson(member.swarm_id);
  }

  advanceReadCursor(memberId: string, seq: number) {
    this.db
      .prepare(`UPDATE members SET last_read_seq = MAX(last_read_seq, ?) WHERE id = ?`)
      .run(seq, memberId);
    const member = this.getMemberById(memberId);
    if (member) this.syncMembersJson(member.swarm_id);
  }

  // -------------------------------------------------------------------------
  // Board Posts
  // -------------------------------------------------------------------------

  addPost(args: {
    swarmId: string;
    authorName: string;
    channel: string;
    mentions: string[];
    channelMentions: string[];
    isAll: boolean;
    body: string;
  }): BoardPostRow {
    let mirrorFailed = false;
    try {
      const post = this.withImmediateTransaction(() => {
        const row = this.db
          .prepare(`SELECT COALESCE(MAX(swarm_seq), 0) AS max_seq FROM board_posts WHERE swarm_id = ?`)
          .get(args.swarmId) as { max_seq: number };
        const swarmSeq = row.max_seq + 1;
        const now = Date.now();
        const info = this.db
          .prepare(
            `INSERT INTO board_posts (swarm_id, swarm_seq, channel, author_name, mentions_json, channel_mentions_json, is_all, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            args.swarmId,
            swarmSeq,
            args.channel,
            args.authorName,
            JSON.stringify(args.mentions),
            JSON.stringify(args.channelMentions),
            args.isAll ? 1 : 0,
            args.body,
            now,
          );

        this.db
          .prepare(`UPDATE members SET last_post_seq = ?, last_post_time = ? WHERE swarm_id = ? AND name = ?`)
          .run(swarmSeq, now, args.swarmId, args.authorName);

        const inserted = this.db
          .prepare(`SELECT * FROM board_posts WHERE seq = ?`)
          .get(Number(info.lastInsertRowid)) as BoardPostRow;

        // Append the file mirror inside the same transaction that inserted the
        // row. The old order — COMMIT, then append — left board.jsonl a line
        // short whenever the append failed, and nothing re-read that file until
        // the next startup rebuild, so the divergence was silent.
        //
        // A mirror failure still must not cost the caller its post: SQLite
        // holds the truth, so record the miss and rewrite the file from the
        // committed rows below.
        try {
          this.appendBoardJsonl(inserted);
        } catch (err) {
          mirrorFailed = true;
          console.warn("[opencode-swarm] Failed to append board.jsonl; repairing the mirror:", err);
        }
        return inserted;
      });

      if (mirrorFailed) this.repairBoardJsonl(post.swarm_id);
      return post;
    } catch (err) {
      // The append may have landed before a failed COMMIT. Converge the mirror
      // so board.jsonl never keeps a post the transaction rolled back.
      this.repairBoardJsonl(args.swarmId);
      throw err;
    }
  }

  getPostsPage(
    swarmId: string,
    sinceSeq = 0,
    limit = 30,
    channelsFilter?: string[] | "*",
  ): { posts: BoardPostRow[]; hasMore: boolean } {
    let rows: BoardPostRow[];
    if (!channelsFilter || channelsFilter === "*") {
      rows = this.db
        .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? AND swarm_seq > ? ORDER BY swarm_seq ASC LIMIT ?`)
        .all(swarmId, sinceSeq, limit + 1) as unknown as BoardPostRow[];
    } else {
      const placeholders = channelsFilter.map(() => "?").join(", ");
      rows = this.db
        .prepare(
          `SELECT * FROM board_posts WHERE swarm_id = ? AND swarm_seq > ? AND channel IN (${placeholders}) ORDER BY swarm_seq ASC LIMIT ?`,
        )
        .all(swarmId, sinceSeq, ...channelsFilter, limit + 1) as unknown as BoardPostRow[];
    }
    const hasMore = rows.length > limit;
    return { posts: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  getLatestPostsWindow(
    swarmId: string,
    limit = 500,
    channelsFilter?: string[] | "*",
  ): { posts: BoardPostRow[]; hasMore: boolean } {
    let rows: BoardPostRow[];
    if (!channelsFilter || channelsFilter === "*") {
      rows = this.db
        .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? ORDER BY swarm_seq DESC LIMIT ?`)
        .all(swarmId, limit + 1) as unknown as BoardPostRow[];
    } else {
      const placeholders = channelsFilter.map(() => "?").join(", ");
      rows = this.db
        .prepare(
          `SELECT * FROM board_posts WHERE swarm_id = ? AND channel IN (${placeholders}) ORDER BY swarm_seq DESC LIMIT ?`,
        )
        .all(swarmId, ...channelsFilter, limit + 1) as unknown as BoardPostRow[];
    }
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    sliced.reverse();
    return { posts: sliced, hasMore };
  }

  /**
   * The page of posts immediately older than `beforeSeq`, returned oldest-first.
   * Backwards paging for callers that must examine the whole board (for example
   * verifier-pass freshness) without loading every post at once.
   */
  getPostsBefore(swarmId: string, beforeSeq: number, limit = 200): { posts: BoardPostRow[]; hasMore: boolean } {
    const rows = this.db
      .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? AND swarm_seq < ? ORDER BY swarm_seq DESC LIMIT ?`)
      .all(swarmId, beforeSeq, limit + 1) as unknown as BoardPostRow[];
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    sliced.reverse();
    return { posts: sliced, hasMore };
  }

  getLatestPost(swarmId: string): BoardPostRow | undefined {
    return this.db
      .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? ORDER BY swarm_seq DESC LIMIT 1`)
      .get(swarmId) as BoardPostRow | undefined;
  }

  // -------------------------------------------------------------------------
  // File Locks
  // -------------------------------------------------------------------------

  listLocks(swarmId: string): FileLockRow[] {
    return this.db
      .prepare(`SELECT * FROM file_locks WHERE swarm_id = ? ORDER BY id ASC`)
      .all(swarmId) as unknown as FileLockRow[];
  }

  releaseLocksForMember(memberId: string) {
    this.db.prepare(`DELETE FROM file_locks WHERE owner_member_id = ?`).run(memberId);
  }

  releaseAllLocksForSwarm(swarmId: string) {
    this.db.prepare(`DELETE FROM file_locks WHERE swarm_id = ?`).run(swarmId);
  }

  claimLocksAtomic(
    swarmId: string,
    ownerMemberId: string,
    ownerName: string,
    rawGlobs: string[],
    nowMs?: number,
  ): { claimed: string[]; conflicts: Array<{ requested: string; existing: string; owner: string }> } {
    const owner = normalizeHandle(ownerName);
    const normalized = Array.from(new Set(rawGlobs.map(validateAndNormalizeGlob)));

    return this.withImmediateTransaction(() => {
      const conflicts: Array<{ requested: string; existing: string; owner: string }> = [];
      const existing = this.listLocks(swarmId);
      // RT-H4: clean up only truly orphaned locks. Member rows are retained
      // after a kill, so `state='killed'` is NOT a signal that the owner is
      // gone: its in-flight tools may still be writing. Reclaim a lock only
      // when the owner row no longer exists at all, or when the owner is not
      // live (e.g. killed) and the lock has outlived KILL_LOCK_GRACE_MS (the
      // deferred-cleanup safety net case). A live owner keeps its lock however
      // long it has held it.
      const allMemberIds = new Set(this.listMembers(swarmId, true).map((m) => m.id));
      const liveIds = new Set(this.listMembers(swarmId, false).map((m) => m.id));
      const now = Date.now();
      const expiryNow = nowMs ?? now;
      for (const lock of existing) {
        const live = liveIds.has(lock.owner_member_id);
        const orphaned = !allMemberIds.has(lock.owner_member_id);
        const expired = !live && expiryNow - lock.claimed_at >= KILL_LOCK_GRACE_MS;
        if (orphaned || expired) {
          this.db.prepare(`DELETE FROM file_locks WHERE id = ?`).run(lock.id);
        }
      }

      // Re-fetch remaining active locks from live owners
      const activeLocks = this.listLocks(swarmId);

      for (const req of normalized) {
        for (const lock of activeLocks) {
          if (lock.owner_member_id === ownerMemberId) continue;
          if (globsPotentiallyOverlap(req, lock.glob_pattern)) {
            conflicts.push({
              requested: req,
              existing: lock.glob_pattern,
              owner: lock.owner_name,
            });
          }
        }
      }

      if (conflicts.length > 0) {
        return { claimed: [], conflicts };
      }

      const stmt = this.db.prepare(
        `INSERT INTO file_locks (swarm_id, glob_pattern, owner_name, owner_member_id, claimed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(swarm_id, glob_pattern) DO UPDATE SET
           owner_name = excluded.owner_name,
           owner_member_id = excluded.owner_member_id,
           claimed_at = excluded.claimed_at`,
      );
      const claimed: string[] = [];
      for (const req of normalized) {
        const info = stmt.run(swarmId, req, owner, ownerMemberId, now);
        if (info.changes > 0) {
          claimed.push(req);
        }
      }
      return { claimed, conflicts: [] };
    });
  }

  // -------------------------------------------------------------------------
  // Antigravity File Mirrors (members.json & board.jsonl)
  // -------------------------------------------------------------------------

  syncMembersJson(swarmId: string) {
    try {
      const payload = this.serializeMembersJson(swarmId);
      if (payload === null) return;
      writeFileAtomic(join(this.getSwarmDir(swarmId), "members.json"), payload);
    } catch (err) {
      console.warn("[opencode-swarm] Failed to sync members.json:", err);
    }
  }

  /**
   * Serialize the members.json mirror for a swarm, or null when the swarm does
   * not exist. Kept separate so syncMembersJson and rebuildMirrors share exactly
   * the same JSON shape.
   */
  private serializeMembersJson(swarmId: string): string | null {
    const swarm = this.getSwarm(swarmId);
    if (!swarm) return null;
    const members = this.listMembers(swarmId, true);
    const record: Record<string, unknown> = {};
    for (const m of members) {
      record[m.name] = {
        conversation_id: m.session_id,
        role: m.role,
        model: m.model_provider && m.model_id ? `${m.model_provider}/${m.model_id}${m.model_variant ? `#${m.model_variant}` : ""}` : null,
        workspace: m.workspace_mode,
        workspace_dir: m.workspace_dir,
        channels: this.getMemberChannels(swarmId, m.id),
        wake_mode: m.wake_mode,
        wait_since: m.wait_since,
        last_read_seq: m.last_read_seq,
        killed: m.state === "killed",
      };
    }
    return JSON.stringify({ title: swarm.title, status: swarm.status, members: record }, null, 2);
  }

  /**
   * Rewrite both JSON mirrors (members.json and board.jsonl) for every swarm in
   * the database from authoritative SQLite rows. Repair path for mirrors that
   * were truncated by a crash or lost a board line. Never throws.
   */
  rebuildMirrors(): void {
    let swarms: SwarmRow[];
    try {
      swarms = this.db
        .prepare(`SELECT * FROM swarms ORDER BY created_at ASC, rowid ASC`)
        .all() as unknown as SwarmRow[];
    } catch (err) {
      console.warn("[opencode-swarm] Failed to load swarms for mirror rebuild:", err);
      return;
    }

    for (const swarm of swarms) {
      try {
        const payload = this.serializeMembersJson(swarm.id);
        if (payload !== null) {
          writeFileAtomic(join(this.getSwarmDir(swarm.id), "members.json"), payload);
        }
      } catch (err) {
        console.warn(`[opencode-swarm] Failed to rebuild members.json for ${swarm.id}:`, err);
      }

      this.repairBoardJsonl(swarm.id);
    }
  }

  // -------------------------------------------------------------------------
  // Pending workspace provisions (crash journal)
  // -------------------------------------------------------------------------

  insertPendingProvision(args: {
    swarmId: string;
    memberName: string;
    workspaceMode: WorkspaceMode;
    workspaceDir: string;
    workspaceBranch?: string | null;
  }): number {
    const now = Date.now();
    const res = this.db
      .prepare(
        `INSERT INTO pending_provisions (
           swarm_id, member_name, workspace_mode, workspace_dir, workspace_branch, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        args.swarmId,
        args.memberName,
        args.workspaceMode,
        args.workspaceDir,
        args.workspaceBranch ?? null,
        now,
      );
    return Number(res.lastInsertRowid);
  }

  setPendingProvisionSession(id: number, sessionId: string): void {
    this.db.prepare(`UPDATE pending_provisions SET session_id = ? WHERE id = ?`).run(sessionId, id);
  }

  deletePendingProvision(id: number): void {
    this.db.prepare(`DELETE FROM pending_provisions WHERE id = ?`).run(id);
  }

  listPendingProvisions(): PendingProvisionRow[] {
    return this.db
      .prepare(`SELECT * FROM pending_provisions ORDER BY id ASC`)
      .all() as unknown as PendingProvisionRow[];
  }

  // -------------------------------------------------------------------------
  // Swarm unit plan
  // -------------------------------------------------------------------------

  createPlan(swarmId: string, labels: string[]): SwarmTaskRow[] {
    const cleaned = labels.map((label) => String(label).trim()).filter((label) => label.length > 0);
    if (cleaned.length === 0) throw new Error("At least one unit is required.");
    if (cleaned.length > 50) throw new Error("A plan may contain at most 50 units.");

    return this.withImmediateTransaction(() => {
      const progress = this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM swarm_tasks WHERE swarm_id = ? AND status != 'open'`,
        )
        .get(swarmId) as { c: number };
      if (Number(progress.c) > 0) {
        throw new Error("A plan is already in progress for this swarm.");
      }
      this.db.prepare(`DELETE FROM swarm_tasks WHERE swarm_id = ? AND status = 'open'`).run(swarmId);

      const now = Date.now();
      const insert = this.db.prepare(
        `INSERT INTO swarm_tasks (swarm_id, seq, label, status, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, ?)`,
      );
      for (let i = 0; i < cleaned.length; i++) {
        insert.run(swarmId, i + 1, cleaned[i], now, now);
      }
      return this.listTasks(swarmId);
    });
  }

  listTasks(swarmId: string): SwarmTaskRow[] {
    return this.db
      .prepare(`SELECT * FROM swarm_tasks WHERE swarm_id = ? ORDER BY seq ASC`)
      .all(swarmId) as unknown as SwarmTaskRow[];
  }

  getTaskCounts(swarmId: string): { total: number; open: number; assigned: number; done: number } {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS c FROM swarm_tasks WHERE swarm_id = ? GROUP BY status`)
      .all(swarmId) as unknown as Array<{ status: string; c: number }>;
    const counts = { total: 0, open: 0, assigned: 0, done: 0 };
    for (const row of rows) {
      const n = Number(row.c);
      counts.total += n;
      if (row.status === "open" || row.status === "assigned" || row.status === "done") {
        counts[row.status] += n;
      }
    }
    return counts;
  }

  assignTasks(
    swarmId: string,
    memberId: string,
    memberName: string,
    taskIds: number[],
  ): SwarmTaskRow[] {
    const ids = Array.from(new Set(taskIds.map((id) => Number(id))));
    if (ids.length === 0) throw new Error("At least one task id is required.");

    return this.withImmediateTransaction(() => {
      const now = Date.now();
      const update = this.db.prepare(
        `UPDATE swarm_tasks
           SET status = 'assigned', assignee_member_id = ?, assignee_name = ?, updated_at = ?
         WHERE swarm_id = ? AND id = ? AND status = 'open'`,
      );
      for (const id of ids) {
        const row = this.db
          .prepare(`SELECT * FROM swarm_tasks WHERE id = ?`)
          .get(id) as SwarmTaskRow | undefined;
        if (!row) throw new Error(`Task ${id} does not exist.`);
        if (row.swarm_id !== swarmId) throw new Error(`Task ${id} does not belong to this swarm.`);
        if (row.status !== "open") throw new Error(`Task ${id} is already ${row.status}.`);
        update.run(memberId, memberName, now, swarmId, id);
      }
      return ids
        .map((id) => this.db.prepare(`SELECT * FROM swarm_tasks WHERE id = ?`).get(id) as SwarmTaskRow)
        .sort((a, b) => a.seq - b.seq);
    });
  }

  completeTasksForMember(memberId: string): number {
    const res = this.db
      .prepare(
        `UPDATE swarm_tasks SET status = 'done', updated_at = ?
         WHERE assignee_member_id = ? AND status != 'done'`,
      )
      .run(Date.now(), memberId);
    return Number(res.changes);
  }

  releaseTasksForMember(memberId: string): number {
    const res = this.db
      .prepare(
        `UPDATE swarm_tasks
            SET status = 'open', assignee_member_id = NULL, assignee_name = NULL, updated_at = ?
          WHERE assignee_member_id = ? AND status = 'assigned'`,
      )
      .run(Date.now(), memberId);
    return Number(res.changes);
  }

  /**
   * Append one post to the board.jsonl mirror.
   *
   * Throws on failure (unlike the rest of the mirror paths) so the caller knows
   * the file is behind the DB and can converge it. Called from inside
   * `addPost`'s transaction.
   */
  private appendBoardJsonl(post: BoardPostRow) {
    appendFileSync(join(this.getSwarmDir(post.swarm_id), "board.jsonl"), formatBoardJsonlLine(post) + "\n", "utf8");
  }

  /**
   * Rewrite one swarm's board.jsonl from authoritative SQLite rows.
   *
   * Repair path for a mirror that fell behind (a torn append, a crash during
   * the previous run, or a failed append in `addPost`). Never throws: a repair
   * that cannot run just leaves the divergence for the next startup rebuild.
   */
  private repairBoardJsonl(swarmId: string): void {
    try {
      const rows = this.db
        .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? ORDER BY seq ASC`)
        .all(swarmId) as unknown as BoardPostRow[];
      const body = rows.map((row) => formatBoardJsonlLine(row) + "\n").join("");
      writeFileAtomic(join(this.getSwarmDir(swarmId), "board.jsonl"), body);
    } catch (err) {
      console.warn(
        `[opencode-swarm] Failed to repair board.jsonl for ${swarmId}; it will converge on the next startup rebuild:`,
        err,
      );
    }
  }
}
