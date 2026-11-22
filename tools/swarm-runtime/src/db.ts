import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
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
  TrackStatus,
  WakeMode,
  WorkspaceMode,
} from "./types.js";
import { globsPotentiallyOverlap, normalizeHandle, validateAndNormalizeGlob } from "./security.js";

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

export class SwarmBoardDB {
  constructor(
    private db: SqliteDb,
    private dataDir: string,
  ) {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS swarms (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        owner_pid INTEGER,
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

      CREATE INDEX IF NOT EXISTS idx_posts_swarm ON board_posts(swarm_id, swarm_seq);
      CREATE INDEX IF NOT EXISTS idx_members_swarm ON members(swarm_id, state);
      CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id);
      CREATE INDEX IF NOT EXISTS idx_locks_swarm ON file_locks(swarm_id, owner_member_id);
    `);

    // Safe migration for existing databases missing owner_pid
    try {
      this.db.exec("ALTER TABLE swarms ADD COLUMN owner_pid INTEGER;");
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
      } catch {
        // Ignore rollback failure
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
  }): { swarm: SwarmRow; coordinator: MemberRow } {
    const result = this.withImmediateTransaction(() => {
      const existingActive = this.getActiveMemberBySession(args.coordinatorSessionId);
      if (existingActive) {
        throw new Error(
          `Session already belongs to active swarm '${existingActive.swarm_id}' as ${existingActive.name}. Complete it first.`,
        );
      }

      const swarmId = `sw_${randomUUID().slice(0, 8)}`;
      const now = Date.now();
      const pid = process.pid;
      this.db
        .prepare(
          `INSERT INTO swarms (id, title, objective, status, owner_pid, created_at, updated_at, last_monitor_nudge_seq, monitor_nudge_count)
           VALUES (?, ?, ?, 'running', ?, ?, ?, 0, 0)`,
        )
        .run(swarmId, args.title, args.objective, pid, now, now);

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
           ) VALUES (?, ?, 'coordinator', 1, ?, 'coordinator', 'user', NULL, ?, ?, ?, 'inherit', ?, NULL, ?, 'working', 'any', 0, 0, 0, NULL, 0, NULL, NULL, NULL, 0, 'open', ?)`,
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

  reconcileStaleSwarmsOnStartup(): SwarmRow[] {
    const active = this.getActiveSwarms();
    const stale: SwarmRow[] = [];
    const currentPid = process.pid;

    for (const swarm of active) {
      // RT-M6: If swarm is owned by another live process, do not clobber it
      if (swarm.owner_pid && swarm.owner_pid !== currentPid && this.isPidAlive(swarm.owner_pid)) {
        continue;
      }

      this.withImmediateTransaction(() => {
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
      });
      this.addPost({
        swarmId: swarm.id,
        authorName: "monitor",
        channel: "main",
        mentions: [],
        channelMentions: [],
        isAll: false,
        body: `Recovered on plugin startup after restart/crash: marked swarm '${swarm.id}' interrupted and released all locks.`,
      });
      this.syncMembersJson(swarm.id);
      stale.push(swarm);
    }
    return stale;
  }

  getSwarm(swarmId: string): SwarmRow | undefined {
    return this.db.prepare(`SELECT * FROM swarms WHERE id = ?`).get(swarmId) as SwarmRow | undefined;
  }

  getActiveSwarms(): SwarmRow[] {
    return this.db
      .prepare(`SELECT * FROM swarms WHERE status IN ('running', 'completing')`)
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
    const clean = normalizeHandle(name);
    if (clean === "main" || clean === "all") {
      throw new Error(`Channel name "${clean}" is reserved.`);
    }
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
    return this.db
      .prepare(`SELECT * FROM channels WHERE swarm_id = ? AND name = ?`)
      .get(swarmId, normalizeHandle(name)) as ChannelRow | undefined;
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
  }

  incrementMemberSteps(memberId: string, activity?: string, activityKind?: string) {
    this.db
      .prepare(
        `UPDATE members SET steps = steps + 1, activity = COALESCE(?, activity), activity_kind = COALESCE(?, activity_kind), last_active_at = ? WHERE id = ?`,
      )
      .run(activity ?? null, activityKind ?? null, Date.now(), memberId);
  }

  setTrackStatus(memberId: string, status: TrackStatus) {
    this.db
      .prepare(`UPDATE members SET track_status = ?, last_active_at = ? WHERE id = ?`)
      .run(status, Date.now(), memberId);
  }

  advanceReadCursor(memberId: string, seq: number) {
    this.db
      .prepare(`UPDATE members SET last_read_seq = MAX(last_read_seq, ?) WHERE id = ?`)
      .run(seq, memberId);
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
        .prepare(`UPDATE members SET last_post_seq = ?, last_read_seq = MAX(last_read_seq, ?), last_post_time = ? WHERE swarm_id = ? AND name = ?`)
        .run(swarmSeq, swarmSeq, now, args.swarmId, args.authorName);

      return this.db
        .prepare(`SELECT * FROM board_posts WHERE seq = ?`)
        .get(Number(info.lastInsertRowid)) as BoardPostRow;
    });

    this.appendBoardJsonl(post);
    return post;
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
  ): { claimed: string[]; conflicts: Array<{ requested: string; existing: string; owner: string }> } {
    const owner = normalizeHandle(ownerName);
    const normalized = Array.from(new Set(rawGlobs.map(validateAndNormalizeGlob)));

    return this.withImmediateTransaction(() => {
      const conflicts: Array<{ requested: string; existing: string; owner: string }> = [];
      const existing = this.listLocks(swarmId);
      const liveIds = new Set(this.listMembers(swarmId, false).map((m) => m.id));

      // RT-H4: Clean up dead locks whose owner is no longer live
      for (const lock of existing) {
        if (!liveIds.has(lock.owner_member_id)) {
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
      const now = Date.now();
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
      const swarm = this.getSwarm(swarmId);
      if (!swarm) return;
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
      writeFileSync(
        join(this.getSwarmDir(swarmId), "members.json"),
        JSON.stringify({ title: swarm.title, status: swarm.status, members: record }, null, 2),
        "utf8",
      );
    } catch {
      // Ignore mirror write errors
    }
  }

  private appendBoardJsonl(post: BoardPostRow) {
    try {
      const line = JSON.stringify({
        seq: post.swarm_seq,
        channel: post.channel,
        agent: post.author_name,
        text: post.body,
        time: new Date(post.created_at).toISOString(),
      });
      appendFileSync(join(this.getSwarmDir(post.swarm_id), "board.jsonl"), line + "\n", "utf8");
    } catch {
      // Ignore mirror write errors
    }
  }
}
