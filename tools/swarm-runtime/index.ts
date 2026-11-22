import { Plugin } from "@opencode/plugin";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types & State Machine
// ---------------------------------------------------------------------------

type MemberRole = "coordinator" | "worker" | "verifier";

type MemberState =
  | "spawning"
  | "active"
  | "waiting"
  | "paused_quota"
  | "interrupted"
  | "failed"
  | "replaced"
  | "completed"
  | "killed";

type SwarmStatus = "running" | "completing" | "completed" | "interrupted";
type TrackStatus = "open" | "done";
type ShellPolicy = "deny" | "ask" | "allow";
type PermissionEffect = "allow" | "ask" | "deny";

const TERMINAL_MEMBER_STATES = new Set<MemberState>([
  "killed",
  "replaced",
  "completed",
  "failed",
  "interrupted",
]);

interface MemberRow {
  id: string;
  swarm_id: string;
  handle: string;
  generation: number;
  session_id: string;
  role: MemberRole;
  model: string | null;
  brief: string;
  state: MemberState;
  track_status: TrackStatus;
  last_read_post_id: number;
  last_active_at: number;
}

interface BoardPostRow {
  id: number;
  swarm_id: string;
  author_handle: string;
  mentions_json: string;
  body: string;
  created_at: number;
}

interface FileLockRow {
  id: number;
  swarm_id: string;
  glob_pattern: string;
  owner_handle: string;
  owner_member_id: string;
  claimed_at: number;
}

interface SwarmRow {
  id: string;
  name: string;
  objective: string;
  status: SwarmStatus;
  created_at: number;
  last_monitor_nudge_post_id: number;
}

interface PluginOptions {
  stallTimeoutMs?: number;
  monitorIntervalMs?: number;
  allowCoordinatorEdits?: boolean;
  /** "deny" or "ask" recommended unless workers run in isolated Git worktrees. */
  workerShellPolicy?: ShellPolicy;
  /** "ask" lets you approve read-only test commands; "deny" enforces strict read-only. */
  verifierShellPolicy?: ShellPolicy;
  /** Optional explicit SQLite path; defaults outside the workspace under ~/.opencode-swarm/<hash>/board.db. */
  dbPath?: string;
  /** Logs raw ctx.event.subscribe payloads to events.debug.jsonl for schema verification. */
  debugEvents?: boolean;
  /** Logs permission.evaluate and execute.before payloads (including effectBefore/effectAfter) to hooks.debug.jsonl. */
  debugHooks?: boolean;
}

interface CachedCall {
  tool: string;
  input: unknown;
  sessionID?: string;
  ts: number;
}

const WRITE_TOOLS = new Set([
  "edit",
  "write",
  "patch",
  "apply_patch",
  "multiedit",
  "multi_edit",
  "delete",
  "delete_file",
]);

const SHELL_TOOLS = new Set(["shell", "bash", "cmd", "powershell", "exec", "run_command"]);

const PROTECTED_TOP_DIRS = new Set([".git", ".opencode", "node_modules"]);

const IS_WINDOWS = process.platform === "win32";

interface SqliteStmt {
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
  close(): void;
}

// ---------------------------------------------------------------------------
// Validation, Canonical Path Security, and Glob Overlap Logic
// ---------------------------------------------------------------------------

function normalizeHandle(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]/g, "-");
  if (!cleaned) {
    throw new Error(`Invalid swarm handle: "${raw}"`);
  }
  return `@${cleaned}`;
}

function extractMentions(text: string, explicit: string[] = []): string[] {
  const found = new Set<string>();
  for (const h of explicit) {
    if (h?.trim()) found.add(normalizeHandle(h));
  }
  const regex = /(?:^|[\s(])@([a-zA-Z0-9_-]{2,40})\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.add(`@${match[1].toLowerCase()}`);
  }
  return Array.from(found);
}

function isProtectedRepoPath(repoRelPath: string): boolean {
  const norm = repoRelPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const firstSegment = (norm.split("/")[0] ?? "").toLowerCase();
  return PROTECTED_TOP_DIRS.has(firstSegment);
}

function resolveCanonicalAncestor(targetAbs: string): string {
  let cursor = targetAbs;
  const suffixParts: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    suffixParts.unshift(relative(parent, cursor));
    cursor = parent;
  }
  const realBase = existsSync(cursor) ? realpathSync(cursor) : cursor;
  return suffixParts.length > 0 ? resolve(realBase, ...suffixParts) : realBase;
}

/**
 * Resolves a path strictly inside canonicalWorkspaceRoot.
 * Rejects null bytes, UNC paths, external drives, `..` traversal, symlink escapes,
 * and protected internal directories (.git, .opencode, node_modules).
 */
function resolveSafeWorkspacePath(canonicalWorkspaceRoot: string, rawPath: string): string {
  if (!rawPath || rawPath.includes("\0")) {
    throw new Error(`[SWARM SECURITY] Invalid file path.`);
  }
  const trimmed = rawPath.trim();
  if (/^(\\\\|\/\/)/.test(trimmed)) {
    throw new Error(`[SWARM SECURITY] UNC network paths are blocked: "${trimmed}"`);
  }

  const candidateAbs = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(canonicalWorkspaceRoot, trimmed);
  const candidateReal = resolveCanonicalAncestor(candidateAbs);
  const rel = relative(canonicalWorkspaceRoot, candidateReal);

  if (rel === "" || rel === ".") {
    return "";
  }
  if (rel.startsWith("..") || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(
      `[SWARM SECURITY] Path escapes workspace root: "${rawPath}" (outside "${canonicalWorkspaceRoot}").`,
    );
  }
  const normalized = rel.replace(/\\/g, "/");
  if (isProtectedRepoPath(normalized)) {
    throw new Error(`[SWARM SECURITY] Protected repository path cannot be modified by swarm members: "${normalized}"`);
  }
  return normalized;
}

function validateAndNormalizeGlob(rawGlob: string): string {
  if (!rawGlob || rawGlob.includes("\0")) {
    throw new Error(`Invalid ownership glob: "${rawGlob}"`);
  }
  const norm = rawGlob.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!norm) {
    throw new Error(`Empty ownership glob is not allowed.`);
  }
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm) || norm.startsWith("//")) {
    throw new Error(`Ownership glob must be workspace-relative (got "${rawGlob}").`);
  }
  // P1-3: Reject unsupported brace/bracket globs so locks never silently match nothing
  if (/[{}[\]]/.test(norm)) {
    throw new Error(
      `Unsupported glob syntax in "${rawGlob}" (braces '{}' and brackets '[]' are not expanded). ` +
        `Pass separate entries in owned_globs instead (e.g. ["src/**/*.ts", "src/**/*.tsx"]).`,
    );
  }
  const segments = norm.split("/");
  if (segments.some((s) => s === "..")) {
    throw new Error(`Ownership glob cannot contain parent traversal '..' (got "${rawGlob}").`);
  }
  if (isProtectedRepoPath(norm)) {
    throw new Error(`Protected path cannot be claimed as an ownership glob: "${rawGlob}"`);
  }
  return norm.endsWith("/") ? `${norm}**` : norm;
}

function globToRegExp(glob: string): RegExp {
  const norm = validateAndNormalizeGlob(glob);
  let regexStr = "^";
  let i = 0;
  while (i < norm.length) {
    const ch = norm[i];
    if (ch === "*") {
      if (norm[i + 1] === "*") {
        if (norm[i + 2] === "/") {
          regexStr += "(?:.*/)?";
          i += 3;
          continue;
        }
        regexStr += ".*";
        i += 2;
        continue;
      }
      regexStr += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      regexStr += "[^/]";
      i += 1;
      continue;
    }
    regexStr += /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  regexStr += "$";
  return new RegExp(regexStr, IS_WINDOWS ? "i" : "");
}

function pathMatchesGlob(repoRelPath: string, glob: string): boolean {
  const cleanPath = repoRelPath.replace(/\\/g, "/").replace(/^\.\//, "");
  return globToRegExp(glob).test(cleanPath);
}

/**
 * Extracts a trailing literal extension when present.
 * Note: Compound extensions such as `**\/*.d.ts` return `.ts`, which conservatively
 * conflicts with `**\/*.ts` (safe direction: avoids missed overlaps).
 */
function literalExtension(glob: string): string | null {
  const lastSegment = glob.split("/").pop() ?? "";
  if (!lastSegment || /[*?]$/.test(lastSegment)) return null;
  const ext = extname(lastSegment);
  if (!ext || /[*?]/.test(ext)) return null;
  return IS_WINDOWS ? ext.toLowerCase() : ext;
}

function globsPotentiallyOverlap(a: string, b: string): boolean {
  const na = validateAndNormalizeGlob(a);
  const nb = validateAndNormalizeGlob(b);
  const ca = IS_WINDOWS ? na.toLowerCase() : na;
  const cb = IS_WINDOWS ? nb.toLowerCase() : nb;
  if (ca === cb) return true;

  const extA = literalExtension(na);
  const extB = literalExtension(nb);
  if (extA && extB && extA !== extB) {
    return false;
  }

  const prefixA = ca.split(/[*?]/)[0];
  const prefixB = cb.split(/[*?]/)[0];
  if (!prefixA || !prefixB) {
    return true;
  }
  if (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)) {
    return true;
  }
  return (
    pathMatchesGlob(na.replace(/[*?].*$/, "sample"), nb) ||
    pathMatchesGlob(nb.replace(/[*?].*$/, "sample"), na)
  );
}

function extractTargetPaths(toolName: string, input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  const paths = new Set<string>();

  for (const key of ["path", "filePath", "file_path", "targetPath", "filename", "resource"]) {
    if (typeof obj[key] === "string" && obj[key].trim()) {
      paths.add(obj[key].trim());
    }
  }
  for (const arrKey of ["paths", "resources"]) {
    if (Array.isArray(obj[arrKey])) {
      for (const p of obj[arrKey] as unknown[]) {
        if (typeof p === "string" && p.trim()) paths.add(p.trim());
      }
    }
  }
  if (Array.isArray(obj.edits)) {
    for (const edit of obj.edits) {
      if (edit && typeof edit === "object") {
        const e = edit as Record<string, unknown>;
        for (const key of ["path", "filePath", "file_path"]) {
          if (typeof e[key] === "string" && e[key].trim()) paths.add(e[key].trim());
        }
      }
    }
  }

  if (toolName.includes("patch") || toolName === "edit") {
    const patchText =
      typeof obj.patch === "string"
        ? obj.patch
        : typeof obj.patchText === "string"
          ? obj.patchText
          : typeof obj.diff === "string"
            ? obj.diff
            : "";
    if (patchText) {
      const headerRe = /^(?:\*\*\* (?:Update|Add|Delete) File: |\+\+\+ b\/|--- a\/)(.+)$/gm;
      let m: RegExpExecArray | null;
      while ((m = headerRe.exec(patchText)) !== null) {
        const candidate = m[1]?.trim();
        if (candidate && candidate !== "/dev/null") paths.add(candidate);
      }
    }
  }

  return Array.from(paths);
}

/**
 * Only tightens a permission effect (allow -> ask -> deny).
 * Never weakens a user's or agent's pre-computed deny/ask rule.
 */
function tightenEffect(current: unknown, proposed: PermissionEffect): PermissionEffect {
  const rank: Record<PermissionEffect, number> = { allow: 0, ask: 1, deny: 2 };
  const cur: PermissionEffect =
    current === "deny" || current === "ask" || current === "allow" ? current : "allow";
  return rank[proposed] > rank[cur] ? proposed : cur;
}

function toolJson(payload: unknown): { content: string } {
  return { content: JSON.stringify(payload, null, 2) };
}

function parseModelSpec(spec?: string): { providerID: string; id: string } | undefined {
  if (!spec?.trim()) return undefined;
  const trimmed = spec.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash >= trimmed.length - 1) {
    throw new Error(`Model override must use "providerID/modelID" format (got "${spec}").`);
  }
  return {
    providerID: trimmed.slice(0, slash),
    id: trimmed.slice(slash + 1),
  };
}

function isQuotaOrRateLimitError(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  return /(429|quota|rate[\s_-]?limit|insufficient_quota|usage limit|resource_exhausted)/i.test(text);
}

// ---------------------------------------------------------------------------
// SQLite Store (Partial Unique Indexes, Transactional Init & Locks, WAL)
// ---------------------------------------------------------------------------

async function openSqliteDatabase(dbPath: string): Promise<SqliteDb> {
  try {
    const mod = (await import("node:sqlite")) as { DatabaseSync: new (path: string) => SqliteDb };
    return new mod.DatabaseSync(dbPath);
  } catch (err) {
    throw new Error(
      `[swarm-runtime] Failed to load 'node:sqlite' (${err instanceof Error ? err.message : String(err)}). ` +
        `Requires Node >= 22.13.0 or a Bun build with node:sqlite support; otherwise migrate SwarmBoardDB to ctx.storage.`,
    );
  }
}

class SwarmBoardDB {
  constructor(private db: SqliteDb) {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS swarms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        created_at INTEGER NOT NULL,
        last_monitor_nudge_post_id INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        handle TEXT NOT NULL,
        generation INTEGER NOT NULL DEFAULT 1,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        model TEXT,
        brief TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'spawning',
        track_status TEXT NOT NULL DEFAULT 'open',
        last_read_post_id INTEGER NOT NULL DEFAULT 0,
        last_active_at INTEGER NOT NULL
      );

      -- P0-5 & P1: Partial unique indexes allow clean handle replacement and same-session re-init after completion
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_swarm_handle
        ON members(swarm_id, handle)
        WHERE state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted');

      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_member_session
        ON members(session_id)
        WHERE state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted');

      CREATE TABLE IF NOT EXISTS board_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        author_handle TEXT NOT NULL,
        mentions_json TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_locks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
        glob_pattern TEXT NOT NULL,
        owner_handle TEXT NOT NULL,
        owner_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        claimed_at INTEGER NOT NULL,
        UNIQUE(swarm_id, glob_pattern)
      );

      CREATE INDEX IF NOT EXISTS idx_posts_swarm ON board_posts(swarm_id, id);
      CREATE INDEX IF NOT EXISTS idx_members_swarm ON members(swarm_id, state);
      CREATE INDEX IF NOT EXISTS idx_members_session ON members(session_id, rowid);
      CREATE INDEX IF NOT EXISTS idx_locks_swarm ON file_locks(swarm_id, owner_member_id);
    `);
  }

  close() {
    this.db.close();
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

  /** P0-5: Atomically creates swarm + coordinator + opening post so failed init leaves no orphan swarm row. */
  createSwarmWithCoordinator(
    name: string,
    objective: string,
    coordinatorSessionId: string,
  ): { swarm: SwarmRow; coordinator: MemberRow } {
    return this.withImmediateTransaction(() => {
      const existingActive = this.getActiveMemberBySession(coordinatorSessionId);
      if (existingActive) {
        throw new Error(
          `Session already belongs to active swarm '${existingActive.swarm_id}' as ${existingActive.handle}. Call swarm_complete first.`,
        );
      }

      const swarmId = `sw_${randomUUID().slice(0, 8)}`;
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO swarms (id, name, objective, status, created_at, last_monitor_nudge_post_id)
           VALUES (?, ?, ?, 'running', ?, 0)`,
        )
        .run(swarmId, name, objective, now);

      const coordId = `mb_${randomUUID().slice(0, 8)}`;
      this.db
        .prepare(
          `INSERT INTO members (
             id, swarm_id, handle, generation, session_id, role, model, brief,
             state, track_status, last_read_post_id, last_active_at
           ) VALUES (?, ?, '@coordinator', 1, ?, 'coordinator', NULL, ?, 'active', 'open', 0, ?)`,
        )
        .run(coordId, swarmId, coordinatorSessionId, objective, now);

      this.db
        .prepare(
          `INSERT INTO board_posts (swarm_id, author_handle, mentions_json, body, created_at)
           VALUES (?, '@coordinator', '[]', ?, ?)`,
        )
        .run(swarmId, `Swarm "${name}" started.\nObjective: ${objective}`, now);

      return {
        swarm: this.getSwarm(swarmId)!,
        coordinator: this.getMemberById(coordId)!,
      };
    });
  }

  /** P0-4: Startup crash reconciliation so dead processes never permanently poison the workspace. */
  reconcileStaleSwarmsOnStartup(): SwarmRow[] {
    const stale = this.getActiveSwarms();
    for (const swarm of stale) {
      this.withImmediateTransaction(() => {
        const now = Date.now();
        this.db
          .prepare(
            `UPDATE members SET state = 'interrupted', last_active_at = ?
             WHERE swarm_id = ? AND state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted')`,
          )
          .run(now, swarm.id);
        this.db.prepare(`DELETE FROM file_locks WHERE swarm_id = ?`).run(swarm.id);
        this.db.prepare(`UPDATE swarms SET status = 'interrupted' WHERE id = ?`).run(swarm.id);
        this.db
          .prepare(
            `INSERT INTO board_posts (swarm_id, author_handle, mentions_json, body, created_at)
             VALUES (?, '@monitor', '[]', ?, ?)`,
          )
          .run(
            swarm.id,
            `Recovered on plugin startup after restart/crash: marked swarm '${swarm.id}' interrupted and released all locks.`,
            now,
          );
      });
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

  setSwarmStatus(swarmId: string, status: SwarmStatus) {
    this.db.prepare(`UPDATE swarms SET status = ? WHERE id = ?`).run(status, swarmId);
  }

  updateMonitorNudge(swarmId: string, postId: number) {
    this.db
      .prepare(`UPDATE swarms SET last_monitor_nudge_post_id = ? WHERE id = ?`)
      .run(postId, swarmId);
  }

  insertMember(
    member: Omit<MemberRow, "id" | "generation" | "last_read_post_id" | "last_active_at">,
  ): MemberRow {
    return this.withImmediateTransaction(() => {
      const handle = normalizeHandle(member.handle);
      const row = this.db
        .prepare(`SELECT MAX(generation) as max_gen FROM members WHERE swarm_id = ? AND handle = ?`)
        .get(member.swarm_id, handle) as { max_gen: number | null } | undefined;
      const generation = (row?.max_gen ?? 0) + 1;
      const id = `mb_${randomUUID().slice(0, 8)}`;
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO members (
             id, swarm_id, handle, generation, session_id, role, model, brief,
             state, track_status, last_read_post_id, last_active_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(
          id,
          member.swarm_id,
          handle,
          generation,
          member.session_id,
          member.role,
          member.model,
          member.brief,
          member.state,
          member.track_status,
          now,
        );
      return this.getMemberById(id)!;
    });
  }

  getMemberById(memberId: string): MemberRow | undefined {
    return this.db.prepare(`SELECT * FROM members WHERE id = ?`).get(memberId) as MemberRow | undefined;
  }

  getActiveMemberBySession(sessionId: string): MemberRow | undefined {
    return this.db
      .prepare(
        `SELECT m.* FROM members m
         JOIN swarms s ON s.id = m.swarm_id
         WHERE m.session_id = ?
           AND s.status IN ('running', 'completing')
           AND m.state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted')
         ORDER BY m.rowid DESC LIMIT 1`,
      )
      .get(sessionId) as MemberRow | undefined;
  }

  /** Used by policy hooks so even an interrupted/killed child in a running/completing swarm is matched explicitly. */
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

  /** Used by read-only inspection tools (board_read, swarm_status) even after completion. */
  getLatestMemberBySession(sessionId: string): MemberRow | undefined {
    return this.db
      .prepare(`SELECT * FROM members WHERE session_id = ? ORDER BY rowid DESC LIMIT 1`)
      .get(sessionId) as MemberRow | undefined;
  }

  getActiveMemberByHandle(swarmId: string, handle: string): MemberRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM members
         WHERE swarm_id = ? AND handle = ?
           AND state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted')
         ORDER BY generation DESC LIMIT 1`,
      )
      .get(swarmId, normalizeHandle(handle)) as MemberRow | undefined;
  }

  listMembers(swarmId: string, includeTerminal = false): MemberRow[] {
    if (includeTerminal) {
      return this.db
        .prepare(`SELECT * FROM members WHERE swarm_id = ? ORDER BY rowid ASC`)
        .all(swarmId) as unknown as MemberRow[];
    }
    return this.db
      .prepare(
        `SELECT * FROM members
         WHERE swarm_id = ?
           AND state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted')
         ORDER BY rowid ASC`,
      )
      .all(swarmId) as unknown as MemberRow[];
  }

  setMemberStateById(memberId: string, state: MemberState, force = false) {
    if (force) {
      this.db
        .prepare(`UPDATE members SET state = ?, last_active_at = ? WHERE id = ?`)
        .run(state, Date.now(), memberId);
      return;
    }
    this.db
      .prepare(
        `UPDATE members SET state = ?, last_active_at = ?
         WHERE id = ? AND state NOT IN ('killed', 'replaced', 'completed', 'failed', 'interrupted')`,
      )
      .run(state, Date.now(), memberId);
  }

  releaseLocksForMember(memberId: string) {
    this.db.prepare(`DELETE FROM file_locks WHERE owner_member_id = ?`).run(memberId);
  }

  releaseAllLocksForSwarm(swarmId: string) {
    this.db.prepare(`DELETE FROM file_locks WHERE swarm_id = ?`).run(swarmId);
  }

  setTrackStatusById(memberId: string, status: TrackStatus) {
    this.db
      .prepare(`UPDATE members SET track_status = ?, last_active_at = ? WHERE id = ?`)
      .run(status, Date.now(), memberId);
  }

  advanceReadCursorById(memberId: string, postId: number) {
    this.db
      .prepare(`UPDATE members SET last_read_post_id = MAX(last_read_post_id, ?) WHERE id = ?`)
      .run(postId, memberId);
  }

  addPost(swarmId: string, authorHandle: string, mentions: string[], body: string): BoardPostRow {
    const now = Date.now();
    const mentionsJson = JSON.stringify(mentions);
    const info = this.db
      .prepare(
        `INSERT INTO board_posts (swarm_id, author_handle, mentions_json, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(swarmId, authorHandle, mentionsJson, body, now);
    return {
      id: Number(info.lastInsertRowid),
      swarm_id: swarmId,
      author_handle: authorHandle,
      mentions_json: mentionsJson,
      body,
      created_at: now,
    };
  }

  getPostsPage(swarmId: string, sinceId = 0, limit = 30): { posts: BoardPostRow[]; hasMore: boolean } {
    const rows = this.db
      .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? AND id > ? ORDER BY id ASC LIMIT ?`)
      .all(swarmId, sinceId, limit + 1) as unknown as BoardPostRow[];
    const hasMore = rows.length > limit;
    return { posts: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  getLatestPost(swarmId: string): BoardPostRow | undefined {
    return this.db
      .prepare(`SELECT * FROM board_posts WHERE swarm_id = ? ORDER BY id DESC LIMIT 1`)
      .get(swarmId) as BoardPostRow | undefined;
  }

  listLocks(swarmId: string): FileLockRow[] {
    return this.db
      .prepare(`SELECT * FROM file_locks WHERE swarm_id = ? ORDER BY id ASC`)
      .all(swarmId) as unknown as FileLockRow[];
  }

  claimLocksAtomic(
    swarmId: string,
    ownerMemberId: string,
    ownerHandle: string,
    rawGlobs: string[],
  ): { claimed: string[]; conflicts: Array<{ requested: string; existing: string; owner: string }> } {
    const owner = normalizeHandle(ownerHandle);
    const normalized = Array.from(new Set(rawGlobs.map(validateAndNormalizeGlob)));

    return this.withImmediateTransaction(() => {
      const conflicts: Array<{ requested: string; existing: string; owner: string }> = [];
      const existing = this.listLocks(swarmId);
      const nonTerminalIds = new Set(this.listMembers(swarmId, false).map((m) => m.id));

      for (const req of normalized) {
        for (const lock of existing) {
          if (lock.owner_member_id === ownerMemberId) continue;
          if (!nonTerminalIds.has(lock.owner_member_id)) continue;
          if (globsPotentiallyOverlap(req, lock.glob_pattern)) {
            conflicts.push({
              requested: req,
              existing: lock.glob_pattern,
              owner: lock.owner_handle,
            });
          }
        }
      }

      if (conflicts.length > 0) {
        return { claimed: [], conflicts };
      }

      const stmt = this.db.prepare(
        `INSERT OR IGNORE INTO file_locks (swarm_id, glob_pattern, owner_handle, owner_member_id, claimed_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      const now = Date.now();
      for (const req of normalized) {
        stmt.run(swarmId, req, owner, ownerMemberId, now);
      }
      return { claimed: normalized, conflicts: [] };
    });
  }
}

// ---------------------------------------------------------------------------
// Plugin Definition
// ---------------------------------------------------------------------------

export default Plugin.define({
  id: "local.swarm-runtime",

  async setup(ctx) {
    const workspaceRoot = resolve(ctx.location.directory);
    const canonicalWorkspaceRoot = existsSync(workspaceRoot)
      ? realpathSync(workspaceRoot)
      : workspaceRoot;

    const options = ((ctx as unknown as { options?: PluginOptions }).options ?? {}) as PluginOptions;
    const stallTimeoutMs = options.stallTimeoutMs ?? 90_000;
    const monitorIntervalMs = options.monitorIntervalMs ?? 30_000;
    const allowCoordinatorEdits = options.allowCoordinatorEdits ?? false;
    const workerShellPolicy: ShellPolicy = options.workerShellPolicy ?? "ask";
    const verifierShellPolicy: ShellPolicy = options.verifierShellPolicy ?? "ask";
    const debugEvents = options.debugEvents ?? false;
    const debugHooks = options.debugHooks ?? false;

    // P0-4: Store DB & debug logs OUTSIDE the workspace root so workers can never claim or edit them
    const repoHash = createHash("sha256")
      .update(IS_WINDOWS ? canonicalWorkspaceRoot.toLowerCase() : canonicalWorkspaceRoot)
      .digest("hex")
      .slice(0, 12);
    const dataDir = options.dbPath
      ? dirname(resolve(options.dbPath))
      : join(homedir(), ".opencode-swarm", repoHash);
    const dbPath = options.dbPath ? resolve(options.dbPath) : join(dataDir, "board.db");
    mkdirSync(dataDir, { recursive: true });

    const eventDebugLogPath = join(dataDir, "events.debug.jsonl");
    const hookDebugLogPath = join(dataDir, "hooks.debug.jsonl");

    function logDebug(filePath: string, record: Record<string, unknown>) {
      try {
        appendFileSync(filePath, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n", "utf8");
      } catch {
        // Ignore debug write errors
      }
    }

    const sqlite = await openSqliteDatabase(dbPath);
    const db = new SwarmBoardDB(sqlite);

    // P0-4: Reconcile any swarms left running/completing by a prior crashed OpenCode process
    const reconciled = db.reconcileStaleSwarmsOnStartup();
    if (reconciled.length > 0) {
      console.warn(
        `[swarm-runtime] Reconciled ${reconciled.length} stale swarm(s) on startup (${reconciled
          .map((s) => s.id)
          .join(", ")}); all prior file locks released.`,
      );
    }

    // P0-2: Bounded call-arg cache bridging execute.before (event.id) -> permission.evaluate (event.source.id)
    const pendingCalls = new Map<string, CachedCall>();

    function cachePendingCall(callId: string, entry: CachedCall) {
      pendingCalls.set(callId, entry);
      if (pendingCalls.size > 500) {
        const cutoff = Date.now() - 10 * 60_000;
        for (const [k, v] of pendingCalls) {
          if (v.ts < cutoff) pendingCalls.delete(k);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 0. Static Per-Agent Permissions & /swarm Command (Valid V2 Actions Only)
    //    P0-3 & P1-5: Valid V2 actions are edit, shell, external_directory, etc.
    // -----------------------------------------------------------------------
    let staticAgentsRegistered = false;
    try {
      const agentApi = (ctx as unknown as {
        agent?: {
          transform?: (fn: (agents: { add: (def: Record<string, unknown>) => void }) => void) => Promise<void>;
        };
      }).agent;

      await agentApi?.transform?.((agents) => {
        const coordinatorPerms: Array<{ action: string; resource: string; effect: PermissionEffect }> = [
          { action: "external_directory", resource: "*", effect: "deny" },
        ];
        if (!allowCoordinatorEdits) {
          coordinatorPerms.push({ action: "edit", resource: "*", effect: "deny" });
        }

        agents.add({
          name: "swarm-coordinator",
          description: "Coordinates a parallel multi-agent swarm via the shared board without direct code edits.",
          mode: "primary",
          permissions: coordinatorPerms,
          prompt: [
            "You are @coordinator for an Antigravity-style parallel swarm.",
            "1. Decompose the user's objective into non-overlapping workspace-relative file globs (no brace/bracket syntax) and call `swarm_init`.",
            "2. Never edit project files directly while the swarm is running—delegate via `board_post` with @mentions.",
            "3. When `@verifier` confirms all checks pass, call `swarm_complete` to stop all child sessions cleanly before delivering your final report.",
          ].join("\n"),
        });

        agents.add({
          name: "swarm-worker",
          description: "Isolated swarm worker scoped to owned file globs, coordinating via board_post.",
          mode: "subagent",
          permissions: [
            { action: "external_directory", resource: "*", effect: "deny" },
            { action: "shell", resource: "*", effect: workerShellPolicy },
          ],
          prompt: [
            "You are a named swarm worker. Only modify files inside your Owned File Globs.",
            "Post updates, interface questions, and ready-for-review handoffs using `board_post` with explicit `@mentions` (e.g., `@verifier`, `@coordinator`).",
            "When waiting on another member, finish your turn so you sleep at 0 tokens until woken.",
          ].join("\n"),
        });

        agents.add({
          name: "swarm-verifier",
          description: "Read-only adversarial verifier that inspects diffs, runs checks, and bounces failures.",
          mode: "subagent",
          permissions: [
            { action: "edit", resource: "*", effect: "deny" },
            { action: "external_directory", resource: "*", effect: "deny" },
            { action: "shell", resource: "*", effect: verifierShellPolicy },
          ],
          prompt: [
            "You are `@verifier` (read-only). Never modify workspace files.",
            "When `@mentioned` by a worker, inspect diffs, run concrete test/lint commands, and use `board_post` to send exact failure output back to the owning `@worker`, or post PASS tagging `@coordinator`.",
          ].join("\n"),
        });

        staticAgentsRegistered = true;
      });

      const cmdApi = (ctx as unknown as {
        command?: {
          transform?: (fn: (cmds: { add: (def: Record<string, unknown>) => void }) => void) => Promise<void>;
        };
      }).command;

      await cmdApi?.transform?.((cmds) => {
        cmds.add({
          name: "swarm",
          description: "Start a parallel multi-agent swarm with a shared SQLite board, file locks, and @verifier.",
          agent: "swarm-coordinator",
          template: [
            "Launch a parallel swarm immediately (no upfront interview unless requirements are critically ambiguous) for:",
            "",
            "$ARGUMENTS",
            "",
            "Call `swarm_init` with clean non-overlapping `owned_globs` per worker and concrete verification checks for `@verifier`.",
          ].join("\n"),
        });
      });
    } catch (err) {
      console.warn("[swarm-runtime] Agent/command registration failed:", err);
    }

    // -----------------------------------------------------------------------
    // Helpers: Pinned Roster Instructions & Session Termination
    // -----------------------------------------------------------------------
    async function syncMemberInstruction(member: MemberRow) {
      if (TERMINAL_MEMBER_STATES.has(member.state)) return;
      const locks = db
        .listLocks(member.swarm_id)
        .filter((l) => l.owner_member_id === member.id)
        .map((l) => l.glob_pattern);
      const roster = db
        .listMembers(member.swarm_id, false)
        .map((m) => `${m.handle}#g${m.generation} (${m.role}, ${m.state})`)
        .join(", ");

      const entryText = [
        `[SWARM IDENTITY]`,
        `Swarm ID: ${member.swarm_id}`,
        `Handle: ${member.handle} (gen ${member.generation}, role: ${member.role})`,
        `Owned File Globs: ${locks.length > 0 ? locks.join(", ") : "(none — read-only)"}`,
        `Active Roster: ${roster}`,
        `Rules: Communicate via board_post with @mentions. Edit only inside Owned File Globs. Stop your turn when waiting so you sleep at 0 tokens.`,
      ].join("\n");

      try {
        const instructionsApi = (ctx.session as unknown as {
          instructions?: {
            entry?: {
              put?: (args: { sessionID: string; key: string; value: string }) => Promise<unknown>;
            };
          };
        }).instructions;
        await instructionsApi?.entry?.put?.({
          sessionID: member.session_id,
          key: "swarm.identity",
          value: entryText,
        });
      } catch {
        // Fallback identity provided via opening prompt + compaction hook
      }
    }

    async function interruptSessionSafe(sessionId: string) {
      try {
        await (ctx.session as unknown as {
          interrupt?: (args: { sessionID: string }) => Promise<unknown>;
        }).interrupt?.({ sessionID: sessionId });
      } catch {
        // Already idle or closed
      }
    }

    // -----------------------------------------------------------------------
    // Shared Policy Evaluator (Used by Permission Hook & Defense-in-Depth Tool Hook)
    // -----------------------------------------------------------------------
    function evaluateActionForMember(
      member: MemberRow,
      swarm: SwarmRow,
      toolOrAction: string,
      rawTargets: string[],
    ): { decision: PermissionEffect; reason?: string } {
      const action = toolOrAction.toLowerCase();
      const isEdit = action === "edit" || WRITE_TOOLS.has(action);
      const isShell = action === "shell" || SHELL_TOOLS.has(action);
      const isExternalDir = action === "external_directory";

      if (isExternalDir) {
        return {
          decision: "deny",
          reason: `[SWARM SECURITY] External directory access is denied during active swarm '${swarm.id}'.`,
        };
      }

      if (TERMINAL_MEMBER_STATES.has(member.state) || member.state === "paused_quota") {
        if (isEdit || isShell) {
          return {
            decision: "deny",
            reason: `[SWARM] ${member.handle} is in state '${member.state}' and cannot execute '${action}'.`,
          };
        }
      }

      if (swarm.status === "running" || swarm.status === "completing") {
        if (member.role === "verifier") {
          if (isEdit) {
            return {
              decision: "deny",
              reason: `[SWARM] @verifier is read-only and cannot run '${action}'. Post failure details to the owning @worker via board_post.`,
            };
          }
          if (isShell) {
            return {
              decision: verifierShellPolicy,
              reason: `[SWARM] @verifier shell policy is '${verifierShellPolicy}'.`,
            };
          }
        }

        if (member.role === "coordinator" && !allowCoordinatorEdits && isEdit) {
          return {
            decision: "deny",
            reason: `[SWARM] @coordinator delegates edits to workers while swarm '${swarm.id}' is '${swarm.status}'.`,
          };
        }

        if (member.role === "worker") {
          if (isShell) {
            return {
              decision: workerShellPolicy,
              reason: `[SWARM] Worker shell commands can bypass file locks (policy='${workerShellPolicy}').`,
            };
          }

          if (isEdit) {
            if (rawTargets.length === 0) {
              return {
                decision: "deny",
                reason: `[SWARM] Blocked '${action}': target file path could not be determined for ownership check.`,
              };
            }

            const allLocks = db.listLocks(member.swarm_id);
            const myLocks = allLocks.filter((l) => l.owner_member_id === member.id);
            const otherLocks = allLocks.filter((l) => l.owner_member_id !== member.id);

            for (const rawPath of rawTargets) {
              let repoRel: string;
              try {
                repoRel = resolveSafeWorkspacePath(canonicalWorkspaceRoot, rawPath);
              } catch (err) {
                return {
                  decision: "deny",
                  reason: err instanceof Error ? err.message : String(err),
                };
              }

              const blocker = otherLocks.find((l) => pathMatchesGlob(repoRel, l.glob_pattern));
              if (blocker) {
                return {
                  decision: "deny",
                  reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": owned by ${blocker.owner_handle} (${blocker.glob_pattern}). Use board_post to @mention ${blocker.owner_handle}.`,
                };
              }

              if (myLocks.length === 0 || !myLocks.some((l) => pathMatchesGlob(repoRel, l.glob_pattern))) {
                return {
                  decision: "deny",
                  reason: `[SWARM LOCK] Blocked '${action}' on "${repoRel}": outside ${member.handle}'s owned globs (${myLocks.map((l) => l.glob_pattern).join(", ") || "none"}). Call swarm_claim_files first.`,
                };
              }
            }
          }
        }
      }

      return { decision: "allow" };
    }

    // -----------------------------------------------------------------------
    // @mention Wake Router (Paginated — Never Skips Unread Messages)
    // -----------------------------------------------------------------------
    async function wakeMember(member: MemberRow, triggerPost: BoardPostRow, urgency: "queue" | "steer" = "queue") {
      const PAGE_LIMIT = 25;
      const { posts: unread, hasMore } = db.getPostsPage(member.swarm_id, member.last_read_post_id, PAGE_LIMIT);
      const delivered = unread.length > 0 ? unread : [triggerPost];
      const lastDeliveredId = delivered[delivered.length - 1].id;

      const feed = delivered
        .map((p) => `[#${p.id}] ${p.author_handle} -> ${JSON.parse(p.mentions_json).join(" ") || "(board)"}:\n${p.body}`)
        .join("\n\n");

      const truncationNotice = hasMore
        ? `\n\n[NOTE] More unread board messages exist after #${lastDeliveredId}. Call \`board_read\` to retrieve the rest.`
        : "";

      const promptText = [
        `[SWARM BOARD WAKE-UP for ${member.handle} — Swarm ${member.swarm_id}]`,
        `Mentioned by ${triggerPost.author_handle} in post #${triggerPost.id}.`,
        ``,
        `Unread board traffic:`,
        feed + truncationNotice,
        ``,
        `Complete your assigned action within your owned files and report via \`board_post\`.`,
      ].join("\n");

      db.setMemberStateById(member.id, "active");
      db.advanceReadCursorById(member.id, lastDeliveredId);

      await (ctx.session as unknown as {
        prompt: (args: { sessionID: string; text: string; delivery?: "queue" | "steer" }) => Promise<unknown>;
      }).prompt({
        sessionID: member.session_id,
        text: promptText,
        delivery: urgency,
      });
    }

    async function routeBoardPost(
      swarmId: string,
      authorHandle: string,
      rawMentions: string[],
      body: string,
      urgency: "queue" | "steer" = "queue",
    ) {
      const activeMembers = db.listMembers(swarmId, false);
      const handleMap = new Map(activeMembers.map((m) => [m.handle, m]));
      const parsed = extractMentions(body, rawMentions);

      const targets = new Set<string>();
      for (const m of parsed) {
        if (m === "@all" || m === "@everyone") {
          for (const member of activeMembers) {
            if (member.handle !== authorHandle) targets.add(member.handle);
          }
        } else if (handleMap.has(m) && m !== authorHandle) {
          targets.add(m);
        }
      }

      const targetList = Array.from(targets);
      const post = db.addPost(swarmId, authorHandle, targetList, body);

      const woken: string[] = [];
      const skipped: Array<{ handle: string; reason: string }> = [];

      for (const handle of targetList) {
        const target = handleMap.get(handle);
        if (!target) continue;
        if (target.state === "paused_quota" || target.state === "spawning") {
          skipped.push({ handle, reason: `member is in state '${target.state}'` });
          continue;
        }
        try {
          await wakeMember(target, post, urgency);
          woken.push(handle);
        } catch (err) {
          skipped.push({
            handle,
            reason: `wake failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      return { post, woken, skipped };
    }

    // -----------------------------------------------------------------------
    // Spawn Child Member (P1-4: Refuses Silent Verifier Degradation + Rollback)
    // -----------------------------------------------------------------------
    async function spawnSwarmMember(args: {
      swarmId: string;
      parentSessionId: string;
      handle: string;
      role: "worker" | "verifier";
      agent?: string;
      model?: string;
      brief: string;
      ownedGlobs: string[];
      replaceExisting?: boolean;
    }) {
      const handle = normalizeHandle(args.handle);
      const parsedModel = parseModelSpec(args.model);
      const validatedGlobs =
        args.role === "worker" ? args.ownedGlobs.map(validateAndNormalizeGlob) : [];

      const sessionApi = ctx.session as unknown as {
        create: (params: { parentID?: string; title?: string }) => Promise<{ id?: string; sessionID?: string }>;
        switchAgent?: (params: { sessionID: string; agent: string }) => Promise<unknown>;
        switchModel?: (params: { sessionID: string; model: { providerID: string; id: string } }) => Promise<unknown>;
        prompt: (params: { sessionID: string; text: string; delivery?: "queue" | "steer" }) => Promise<unknown>;
      };

      // P1-4: Never silently spawn an un-isolated verifier under the default agent
      if (args.role === "verifier" && (!staticAgentsRegistered || typeof sessionApi.switchAgent !== "function")) {
        throw new Error(
          `Refusing to spawn @verifier: static 'swarm-verifier' agent or ctx.session.switchAgent is unavailable, so read-only isolation cannot be guaranteed.`,
        );
      }

      const existing = db.getActiveMemberByHandle(args.swarmId, handle);
      if (existing) {
        if (!args.replaceExisting) {
          throw new Error(
            `Active handle ${handle} already exists (state: ${existing.state}). Pass replace_existing: true or kill it first.`,
          );
        }
        db.setMemberStateById(existing.id, "interrupted", true);
        await interruptSessionSafe(existing.session_id);
        db.setMemberStateById(existing.id, "replaced", true);
        db.releaseLocksForMember(existing.id);
      }

      const created = await sessionApi.create({
        parentID: args.parentSessionId,
        title: `[swarm:${args.swarmId}] ${handle}`,
      });
      const childSessionId = created.id ?? created.sessionID;
      if (!childSessionId) {
        throw new Error(`ctx.session.create did not return a session ID for ${handle}`);
      }

      const member = db.insertMember({
        swarm_id: args.swarmId,
        handle,
        session_id: childSessionId,
        role: args.role,
        model: args.model ?? null,
        brief: args.brief,
        state: "spawning",
        track_status: args.role === "verifier" ? "done" : "open",
      });

      const warnings: string[] = [];

      try {
        const lockResult =
          args.role === "worker" && validatedGlobs.length > 0
            ? db.claimLocksAtomic(args.swarmId, member.id, handle, validatedGlobs)
            : { claimed: [], conflicts: [] };

        if (lockResult.conflicts.length > 0) {
          throw new Error(
            `File-lock conflict for ${handle}: ${lockResult.conflicts
              .map((c) => `${c.requested} overlaps ${c.existing} (owned by ${c.owner})`)
              .join("; ")}`,
          );
        }

        const targetAgent = args.agent || (args.role === "verifier" ? "swarm-verifier" : "swarm-worker");
        if (typeof sessionApi.switchAgent === "function") {
          await sessionApi.switchAgent({ sessionID: childSessionId, agent: targetAgent });
        } else {
          warnings.push(`${handle}: ctx.session.switchAgent unavailable; running under default agent.`);
        }

        if (parsedModel) {
          if (typeof sessionApi.switchModel === "function") {
            await sessionApi.switchModel({ sessionID: childSessionId, model: parsedModel });
          } else {
            warnings.push(`${handle}: ctx.session.switchModel unavailable; requested model '${args.model}' not applied.`);
          }
        }

        await syncMemberInstruction(member);

        const post = db.addPost(
          args.swarmId,
          "@coordinator",
          [handle],
          `Assigned brief to ${handle} (gen ${member.generation}):\n${args.brief}`,
        );

        const openingBrief = [
          `You are ${handle} (gen ${member.generation}, role: ${args.role}) in Swarm \`${args.swarmId}\`.`,
          `Owned files: ${lockResult.claimed.length > 0 ? lockResult.claimed.join(", ") : "(read-only — do not edit files)"}`,
          ``,
          `## Brief`,
          args.brief,
          ``,
          `## Protocol`,
          args.role === "verifier"
            ? `- Inspect worker diffs, run executable checks, and post concrete failures tagging the owning @worker (or PASS tagging @coordinator).`
            : `- Edit ONLY inside Owned Files. When done or blocked, call \`board_post\` mentioning \`@verifier\` or \`@coordinator\`, then end your turn so you sleep at 0 tokens.`,
        ].join("\n");

        if (args.role === "worker") {
          db.setMemberStateById(member.id, "active");
          db.advanceReadCursorById(member.id, post.id);
          await sessionApi.prompt({
            sessionID: childSessionId,
            text: openingBrief,
            delivery: "queue",
          });
        } else {
          db.setMemberStateById(member.id, "waiting");
          db.advanceReadCursorById(member.id, post.id);
        }

        return { member: db.getMemberById(member.id)!, claimedLocks: lockResult.claimed, warnings };
      } catch (err) {
        await interruptSessionSafe(childSessionId);
        db.releaseLocksForMember(member.id);
        db.setMemberStateById(member.id, "failed", true);
        throw err;
      }
    }

    // -----------------------------------------------------------------------
    // 1. Register Tools (Documented V2 Contract: `input` + `options`)
    // -----------------------------------------------------------------------
    await ctx.tool.transform((tools) => {
      tools.add({
        name: "swarm_init",
        description:
          "Initialize a new parallel swarm from the coordinator session: atomically registers swarm + coordinator, claims non-overlapping file locks, and spawns named workers plus @verifier.",
        input: {
          type: "object",
          required: ["name", "objective", "workers"],
          properties: {
            name: { type: "string", description: "Short slug for this swarm." },
            objective: { type: "string", description: "Overall goal of the swarm." },
            workers: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["handle", "brief", "owned_globs"],
                properties: {
                  handle: { type: "string" },
                  brief: { type: "string" },
                  owned_globs: { type: "array", items: { type: "string" } },
                  model: { type: "string", description: "Optional 'providerID/modelID' override." },
                  agent: { type: "string" },
                },
              },
            },
            verifier: {
              type: "object",
              properties: {
                enabled: { type: "boolean" },
                brief: { type: "string" },
                model: { type: "string", description: "Optional 'providerID/modelID' override." },
              },
            },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const input = rawInput as {
            name: string;
            objective: string;
            workers: Array<{
              handle: string;
              brief: string;
              owned_globs: string[];
              model?: string;
              agent?: string;
            }>;
            verifier?: { enabled?: boolean; brief?: string; model?: string };
          };

          // Pre-validate handles and cross-worker glob overlaps before writing anything to SQLite
          const seenHandles = new Set<string>(["@coordinator", "@verifier", "@monitor"]);
          const plannedGlobs: Array<{ handle: string; glob: string }> = [];
          try {
            for (const w of input.workers) {
              const h = normalizeHandle(w.handle);
              if (seenHandles.has(h)) {
                return toolJson({ ok: false, error: `Duplicate or reserved handle: ${h}` });
              }
              seenHandles.add(h);
              for (const g of w.owned_globs ?? []) {
                const ng = validateAndNormalizeGlob(g);
                for (const prior of plannedGlobs) {
                  if (prior.handle !== h && globsPotentiallyOverlap(ng, prior.glob)) {
                    return toolJson({
                      ok: false,
                      error: `Overlapping ownership in swarm_init: ${h} (${ng}) conflicts with ${prior.handle} (${prior.glob}).`,
                    });
                  }
                }
                plannedGlobs.push({ handle: h, glob: ng });
              }
            }
          } catch (err) {
            return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }

          let swarm: SwarmRow;
          try {
            const created = db.createSwarmWithCoordinator(input.name, input.objective, toolCtx.sessionID);
            swarm = created.swarm;
          } catch (err) {
            return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }

          const spawned: Array<{ handle: string; generation: number; session_id: string; owned_globs: string[] }> = [];
          const errors: Array<{ handle: string; error: string }> = [];
          const warnings: string[] = [];

          for (const w of input.workers) {
            try {
              const res = await spawnSwarmMember({
                swarmId: swarm.id,
                parentSessionId: toolCtx.sessionID,
                handle: w.handle,
                role: "worker",
                agent: w.agent,
                model: w.model,
                brief: w.brief,
                ownedGlobs: w.owned_globs ?? [],
              });
              spawned.push({
                handle: res.member.handle,
                generation: res.member.generation,
                session_id: res.member.session_id,
                owned_globs: res.claimedLocks,
              });
              warnings.push(...res.warnings);
            } catch (err) {
              errors.push({ handle: w.handle, error: err instanceof Error ? err.message : String(err) });
            }
          }

          if (input.verifier?.enabled !== false) {
            try {
              const vRes = await spawnSwarmMember({
                swarmId: swarm.id,
                parentSessionId: toolCtx.sessionID,
                handle: "@verifier",
                role: "verifier",
                model: input.verifier?.model,
                brief:
                  input.verifier?.brief ??
                  `Inspect diffs from all workers, run tests/linters, and post concrete failures to the owning @worker or PASS to @coordinator.`,
                ownedGlobs: [],
              });
              spawned.push({
                handle: vRes.member.handle,
                generation: vRes.member.generation,
                session_id: vRes.member.session_id,
                owned_globs: [],
              });
              warnings.push(...vRes.warnings);
            } catch (err) {
              errors.push({ handle: "@verifier", error: err instanceof Error ? err.message : String(err) });
            }
          }

          for (const m of db.listMembers(swarm.id, false)) {
            await syncMemberInstruction(m);
          }

          return toolJson({
            ok: errors.length === 0,
            partial_failure: errors.length > 0,
            swarm_id: swarm.id,
            db_path: dbPath,
            spawned,
            warnings,
            errors,
          });
        },
      });

      tools.add({
        name: "swarm_spawn_member",
        description:
          "Coordinator-only: spawn a new worker/verifier or replace a killed, failed, or quota-paused member under the same handle.",
        input: {
          type: "object",
          required: ["handle", "brief"],
          properties: {
            handle: { type: "string" },
            role: { type: "string", enum: ["worker", "verifier"] },
            brief: { type: "string" },
            owned_globs: { type: "array", items: { type: "string" } },
            model: { type: "string", description: "Optional 'providerID/modelID' override." },
            agent: { type: "string" },
            replace_existing: { type: "boolean" },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller || caller.role !== "coordinator") {
            return toolJson({ ok: false, error: "Only an active @coordinator may spawn or replace members." });
          }
          const swarm = db.getSwarm(caller.swarm_id);
          if (!swarm || swarm.status !== "running") {
            return toolJson({ ok: false, error: `Swarm '${caller.swarm_id}' is not running.` });
          }
          const input = rawInput as {
            handle: string;
            role?: "worker" | "verifier";
            brief: string;
            owned_globs?: string[];
            model?: string;
            agent?: string;
            replace_existing?: boolean;
          };
          try {
            const res = await spawnSwarmMember({
              swarmId: caller.swarm_id,
              parentSessionId: toolCtx.sessionID,
              handle: input.handle,
              role: input.role ?? "worker",
              agent: input.agent,
              model: input.model,
              brief: input.brief,
              ownedGlobs: input.owned_globs ?? [],
              replaceExisting: input.replace_existing ?? false,
            });
            for (const m of db.listMembers(caller.swarm_id, false)) {
              await syncMemberInstruction(m);
            }
            return toolJson({
              ok: true,
              handle: res.member.handle,
              generation: res.member.generation,
              session_id: res.member.session_id,
              claimed_locks: res.claimedLocks,
              warnings: res.warnings,
            });
          } catch (err) {
            return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        },
      });

      tools.add({
        name: "board_post",
        description:
          "Post a public message to the shared swarm board and wake every @mentioned non-paused member.",
        input: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
            mentions: { type: "array", items: { type: "string" } },
            mark_track_done: { type: "boolean" },
            urgency: { type: "string", enum: ["queue", "steer"] },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller) {
            return toolJson({ ok: false, error: "Session is not an active swarm member." });
          }
          const input = rawInput as {
            message: string;
            mentions?: string[];
            mark_track_done?: boolean;
            urgency?: "queue" | "steer";
          };
          if (input.mark_track_done) {
            db.setTrackStatusById(caller.id, "done");
          }
          const { post, woken, skipped } = await routeBoardPost(
            caller.swarm_id,
            caller.handle,
            input.mentions ?? [],
            input.message,
            input.urgency ?? "queue",
          );
          db.advanceReadCursorById(caller.id, post.id);
          return toolJson({ ok: true, post_id: post.id, author: caller.handle, woken, skipped });
        },
      });

      tools.add({
        name: "board_read",
        description:
          "Read paginated posts from the shared swarm board. Filtered reads do not advance your main unread cursor.",
        input: {
          type: "object",
          properties: {
            since_id: { type: "number" },
            only_my_mentions: { type: "boolean" },
            limit: { type: "number" },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getLatestMemberBySession(toolCtx.sessionID);
          if (!caller) {
            return toolJson({ ok: false, error: "This session is not registered in any swarm." });
          }
          const input = (rawInput ?? {}) as {
            since_id?: number;
            only_my_mentions?: boolean;
            limit?: number;
          };
          const since = typeof input.since_id === "number" ? input.since_id : caller.last_read_post_id;
          const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
          const { posts: page, hasMore } = db.getPostsPage(caller.swarm_id, since, limit);

          if (!input.only_my_mentions && page.length > 0) {
            db.advanceReadCursorById(caller.id, page[page.length - 1].id);
          }

          const visible = input.only_my_mentions
            ? page.filter((p) => (JSON.parse(p.mentions_json) as string[]).includes(caller.handle))
            : page;

          return toolJson({
            swarm_id: caller.swarm_id,
            viewer: caller.handle,
            has_more: hasMore,
            next_since_id: page.length > 0 ? page[page.length - 1].id : since,
            cursor_advanced: !input.only_my_mentions && page.length > 0,
            posts: visible.map((p) => ({
              id: p.id,
              author: p.author_handle,
              mentions: JSON.parse(p.mentions_json),
              body: p.body,
              created_at: new Date(p.created_at).toISOString(),
            })),
          });
        },
      });

      tools.add({
        name: "swarm_claim_files",
        description: "Atomically request additional workspace-relative file ownership globs.",
        input: {
          type: "object",
          required: ["globs"],
          properties: {
            globs: { type: "array", minItems: 1, items: { type: "string" } },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller) {
            return toolJson({ ok: false, error: "Session is not an active swarm member." });
          }
          if (caller.role !== "worker") {
            return toolJson({ ok: false, error: `Role '${caller.role}' cannot claim worker edit locks.` });
          }
          const input = rawInput as { globs: string[] };
          try {
            const res = db.claimLocksAtomic(caller.swarm_id, caller.id, caller.handle, input.globs);
            if (res.conflicts.length > 0) {
              return toolJson({
                ok: false,
                conflicts: res.conflicts,
                action: "Coordinate with the owning @handle via board_post instead of editing directly.",
              });
            }
            await syncMemberInstruction(caller);
            return toolJson({ ok: true, claimed: res.claimed });
          } catch (err) {
            return toolJson({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        },
      });

      tools.add({
        name: "swarm_status",
        description: "Inspect swarm status, member state machine, owned file locks, and latest board post ID.",
        input: { type: "object", properties: {} },
        options: { codemode: false },
        async execute(_rawInput, toolCtx) {
          const caller = db.getLatestMemberBySession(toolCtx.sessionID);
          if (!caller) {
            return toolJson({ ok: false, error: "This session is not part of a swarm." });
          }
          const swarm = db.getSwarm(caller.swarm_id);
          const members = db.listMembers(caller.swarm_id, true);
          const locks = db.listLocks(caller.swarm_id);
          const latest = db.getLatestPost(caller.swarm_id);
          return toolJson({
            swarm,
            members: members.map((m) => ({
              handle: m.handle,
              generation: m.generation,
              role: m.role,
              state: m.state,
              track_status: m.track_status,
              model: m.model ?? "(inherited)",
              owned_globs: locks.filter((l) => l.owner_member_id === m.id).map((l) => l.glob_pattern),
              last_active_iso: new Date(m.last_active_at).toISOString(),
            })),
            latest_post_id: latest?.id ?? 0,
          });
        },
      });

      tools.add({
        name: "swarm_kill_member",
        description:
          "Coordinator-only: interrupt a swarm member, mark it killed, and release its locks only after interruption.",
        input: {
          type: "object",
          required: ["handle", "reason"],
          properties: {
            handle: { type: "string" },
            reason: { type: "string" },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller || caller.role !== "coordinator") {
            return toolJson({ ok: false, error: "Only an active @coordinator may kill swarm members." });
          }
          const input = rawInput as { handle: string; reason: string };
          const target = db.getActiveMemberByHandle(caller.swarm_id, input.handle);
          if (!target) {
            return toolJson({ ok: false, error: `No active member found for handle ${input.handle}.` });
          }
          if (target.role === "coordinator") {
            return toolJson({ ok: false, error: "Cannot kill @coordinator." });
          }

          db.setMemberStateById(target.id, "interrupted", true);
          await interruptSessionSafe(target.session_id);
          db.setMemberStateById(target.id, "killed", true);
          db.releaseLocksForMember(target.id);

          db.addPost(
            caller.swarm_id,
            "@coordinator",
            [],
            `Killed ${target.handle} (gen ${target.generation}, reason: ${input.reason}). Locks released.`,
          );
          for (const m of db.listMembers(caller.swarm_id, false)) {
            await syncMemberInstruction(m);
          }
          return toolJson({ ok: true, killed: target.handle, generation: target.generation, locks_released: true });
        },
      });

      tools.add({
        name: "swarm_complete",
        description:
          "Coordinator-only: transition swarm to completing, interrupt all workers and @verifier while locks remain enforced, then release locks and finalize.",
        input: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Optional final closing note posted to the board." },
          },
        },
        options: { codemode: false },
        async execute(rawInput, toolCtx) {
          const caller = db.getActiveMemberBySession(toolCtx.sessionID);
          if (!caller || caller.role !== "coordinator") {
            return toolJson({ ok: false, error: "Only an active @coordinator may complete the swarm." });
          }
          const swarm = db.getSwarm(caller.swarm_id);
          if (!swarm || swarm.status === "completed" || swarm.status === "interrupted") {
            return toolJson({ ok: false, error: `Swarm '${caller.swarm_id}' is already closed (${swarm?.status}).` });
          }

          db.setSwarmStatus(swarm.id, "completing");

          const children = db
            .listMembers(swarm.id, false)
            .filter((m) => m.role !== "coordinator");

          for (const child of children) {
            db.setMemberStateById(child.id, "interrupted", true);
            await interruptSessionSafe(child.session_id);
            db.setMemberStateById(child.id, "completed", true);
          }

          db.setMemberStateById(caller.id, "completed", true);
          db.releaseAllLocksForSwarm(swarm.id);
          db.setSwarmStatus(swarm.id, "completed");

          const summary = (rawInput as { summary?: string } | undefined)?.summary;
          db.addPost(
            swarm.id,
            "@coordinator",
            [],
            summary ? `Swarm completed: ${summary}` : `Swarm "${swarm.name}" completed cleanly.`,
          );

          return toolJson({
            ok: true,
            swarm_id: swarm.id,
            status: "completed",
            stopped_members: children.map((c) => `${c.handle}#g${c.generation}`),
          });
        },
      });
    });

    // -----------------------------------------------------------------------
    // 2. Tool Execution Hook: Cache Args by Call ID + Defense-in-Depth Audit
    //    P0-2: Caches { tool, input, sessionID } keyed by event.id for permission.evaluate.
    //    P0-3: Does NOT throw on missing sessionID (avoids locking out unrelated sessions);
    //          enforcement lives in static agent permissions + permission.evaluate.
    // -----------------------------------------------------------------------
    await ctx.tool.hook("execute.before", async (event) => {
      const ev = event as unknown as { id?: string; tool?: string; input?: unknown; sessionID?: string };
      const toolName = String(ev.tool ?? "").toLowerCase();

      if (ev.id) {
        cachePendingCall(ev.id, {
          tool: toolName,
          input: ev.input,
          sessionID: ev.sessionID,
          ts: Date.now(),
        });
      }

      if (debugHooks) {
        logDebug(hookDebugLogPath, {
          hook: "tool.execute.before",
          id: ev.id ?? null,
          tool: toolName,
          hasSessionID: Boolean(ev.sessionID),
          keys: Object.keys(event as Record<string, unknown>),
        });
      }

      if (!WRITE_TOOLS.has(toolName) && !SHELL_TOOLS.has(toolName)) return;
      if (!ev.sessionID) return;

      const activeSwarms = db.getActiveSwarms();
      if (activeSwarms.length === 0) return;

      const member = db.getMemberForActiveSwarmPolicy(ev.sessionID);
      if (!member) {
        throw new Error(
          `[SWARM] Blocked '${toolName}' from unregistered session while an active swarm owns workspace locks.`,
        );
      }

      const swarm = db.getSwarm(member.swarm_id);
      if (!swarm) return;

      const targets = extractTargetPaths(toolName, ev.input);
      const verdict = evaluateActionForMember(member, swarm, toolName, targets);
      if (verdict.decision === "deny") {
        throw new Error(verdict.reason ?? `[SWARM] Blocked '${toolName}' for ${member.handle}.`);
      }
    });

    // -----------------------------------------------------------------------
    // 3. Primary Runtime Enforcement: Permission Hook (IN-PLACE MUTATION)
    //    P0-1: Mutates event.effect directly (never returns a discarded object).
    //    P0-2: Merges event.resources/resource with cached execute.before args via source.id.
    //    P0-3: Denies unregistered or unattributed writes/shell while a swarm is active.
    // -----------------------------------------------------------------------
    try {
      const permApi = (ctx as unknown as {
        permission?: {
          hook?: (
            name: "evaluate",
            handler: (event: Record<string, unknown>) => Promise<void> | void,
          ) => Promise<void>;
        };
      }).permission;

      await permApi?.hook?.("evaluate", async (event) => {
        const action = String(event.action ?? "").toLowerCase();
        if (action !== "edit" && action !== "shell" && action !== "external_directory") return;

        const effectBefore = event.effect;
        const activeSwarms = db.getActiveSwarms();
        if (activeSwarms.length === 0) return;

        const source = (event.source ?? {}) as Record<string, unknown>;
        const callId = typeof source.id === "string" ? source.id : undefined;
        const cached = callId ? pendingCalls.get(callId) : undefined;
        const sessionId =
          (typeof event.sessionID === "string" && event.sessionID) ||
          (typeof source.sessionID === "string" && source.sessionID) ||
          cached?.sessionID;

        let reason: string | undefined;

        if (!sessionId) {
          event.effect = tightenEffect(event.effect, "deny");
          reason =
            "[SWARM FAIL-CLOSED] permission.evaluate had no sessionID while a swarm is active; denied to prevent lock bypass.";
        } else {
          const member = db.getMemberForActiveSwarmPolicy(sessionId);
          if (!member) {
            // P0-3: Deny writes/shell from unregistered sessions while a swarm owns workspace locks
            event.effect = tightenEffect(event.effect, "deny");
            reason = "[SWARM] Denied action from unregistered session while an active swarm owns workspace locks.";
          } else {
            const swarm = db.getSwarm(member.swarm_id);
            if (swarm) {
              const targetSet = new Set<string>([
                ...extractTargetPaths(action, event),
                ...(cached ? extractTargetPaths(cached.tool, cached.input) : []),
              ]);
              const verdict = evaluateActionForMember(member, swarm, action, Array.from(targetSet));
              event.effect = tightenEffect(event.effect, verdict.decision);
              reason = verdict.reason;
            }
          }
        }

        if (debugHooks) {
          logDebug(hookDebugLogPath, {
            hook: "permission.evaluate",
            action,
            callId: callId ?? null,
            hasCachedInput: Boolean(cached),
            sessionId: sessionId ?? null,
            resources: event.resources ?? event.resource ?? null,
            effectBefore,
            effectAfter: event.effect,
            reason: reason ?? null,
            keys: Object.keys(event),
          });
        }
      });
    } catch (err) {
      console.warn("[swarm-runtime] ctx.permission.hook('evaluate') registration failed:", err);
    }

    // -----------------------------------------------------------------------
    // 4. Context Compaction Preservation (`event.system`)
    // -----------------------------------------------------------------------
    await ctx.session.hook("compaction", async (event) => {
      const ev = event as unknown as {
        sessionID?: string;
        system?: Array<{ type: string; text: string } | string>;
      };
      if (!ev.sessionID) return;
      const member = db.getActiveMemberBySession(ev.sessionID);
      if (!member) return;

      const myLocks = db
        .listLocks(member.swarm_id)
        .filter((l) => l.owner_member_id === member.id)
        .map((l) => l.glob_pattern);

      const note =
        `Preserve in compaction summary: Swarm=${member.swarm_id}, Handle=${member.handle}#g${member.generation}, ` +
        `Role=${member.role}, OwnedGlobs=[${myLocks.join(", ")}], LastReadBoardPostID=${member.last_read_post_id}.`;

      if (Array.isArray(ev.system)) {
        ev.system.push({ type: "text", text: note });
      }
    });

    // -----------------------------------------------------------------------
    // 5. Event Stream Consumer + Optional Raw Event Logger (`debugEvents`)
    // -----------------------------------------------------------------------
    const abortController = new AbortController();

    void (async () => {
      try {
        const stream = (ctx.event as unknown as {
          subscribe: (opts?: { signal?: AbortSignal }) => AsyncIterable<Record<string, unknown>>;
        }).subscribe({ signal: abortController.signal });

        for await (const rawEvent of stream) {
          if (abortController.signal.aborted) break;

          if (debugEvents) {
            logDebug(eventDebugLogPath, { event: rawEvent });
          }

          const eventType = String(rawEvent.type ?? "").toLowerCase();
          const payload = (rawEvent.properties ?? rawEvent.payload ?? rawEvent) as Record<string, unknown>;
          const sessionId =
            (typeof rawEvent.sessionID === "string" && rawEvent.sessionID) ||
            (typeof payload.sessionID === "string" && payload.sessionID) ||
            (typeof payload.id === "string" && eventType.startsWith("session.") ? payload.id : undefined);

          if (!sessionId) continue;

          const member = db.getActiveMemberBySession(sessionId);
          if (!member) continue;

          if (eventType.includes("started") || eventType === "session.busy") {
            db.setMemberStateById(member.id, "active");
            continue;
          }

          if (eventType.includes("interrupted") || eventType.includes("aborted")) {
            db.setMemberStateById(member.id, "interrupted");
            continue;
          }

          if (eventType.includes("idle") || eventType.includes("succeeded") || eventType.includes("completed")) {
            db.setMemberStateById(member.id, "waiting");
            continue;
          }

          if (eventType.includes("failed") || eventType.includes("error")) {
            const errInfo = payload.error ?? rawEvent.error ?? payload;
            if (isQuotaOrRateLimitError(errInfo)) {
              db.setMemberStateById(member.id, "paused_quota");
              if (member.role !== "coordinator") {
                await routeBoardPost(
                  member.swarm_id,
                  "@monitor",
                  ["@coordinator"],
                  `${member.handle}#g${member.generation} paused due to quota/rate limit. ` +
                    `Replace it on a fallback model via \`swarm_spawn_member({ handle: "${member.handle}", replace_existing: true, model: "..." })\`.`,
                );
              }
            } else {
              db.setMemberStateById(member.id, "failed");
            }
            continue;
          }

          if (eventType === "session.deleted") {
            db.setMemberStateById(member.id, "killed", true);
            db.releaseLocksForMember(member.id);
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error("[swarm-runtime] event stream stopped:", err);
        }
      }
    })();

    // -----------------------------------------------------------------------
    // 6. Non-Overlapping @monitor Stall Watchdog (P1-1: Covers Verifier Handoff)
    // -----------------------------------------------------------------------
    let monitorRunning = false;

    const monitorTimer = setInterval(async () => {
      if (monitorRunning) return;
      monitorRunning = true;
      try {
        const now = Date.now();
        for (const swarm of db.getActiveSwarms()) {
          if (swarm.status !== "running") continue;

          const members = db.listMembers(swarm.id, false);
          if (members.length === 0) continue;

          const anyActive = members.some((m) => m.state === "active" || m.state === "spawning");
          if (anyActive) continue;

          const latestPost = db.getLatestPost(swarm.id);
          const latestPostId = latestPost?.id ?? 0;
          if (latestPostId <= swarm.last_monitor_nudge_post_id && latestPostId > 0) {
            continue;
          }

          const lastActivity = Math.max(
            latestPost?.created_at ?? swarm.created_at,
            ...members.map((m) => m.last_active_at),
          );
          if (now - lastActivity < stallTimeoutMs) continue;

          const openWorkers = members.filter((m) => m.role === "worker" && m.track_status === "open");
          const verifier = members.find((m) => m.role === "verifier");

          let nudgeMessage: string;
          const nudgeTargets = ["@coordinator"];

          if (openWorkers.length > 0) {
            const summary = openWorkers.map((w) => `${w.handle}#g${w.generation} (${w.state})`).join(", ");
            nudgeMessage =
              `All swarm members have been idle for over ${Math.round(stallTimeoutMs / 1000)}s while worker tracks remain open: ${summary}. ` +
              `Inspect \`swarm_status\` and either wake stalled workers, replace paused ones, or call \`swarm_complete\`.`;
          } else {
            // P1-1: Workers are all marked done, yet swarm is still running (stalled handoff to @verifier or coordinator)
            if (verifier && verifier.state === "waiting") {
              nudgeTargets.push("@verifier");
            }
            nudgeMessage =
              `All worker tracks are marked done, but swarm '${swarm.id}' has been idle for over ${Math.round(stallTimeoutMs / 1000)}s without completion. ` +
              `${verifier ? "@verifier verify pending diffs and post PASS/FAIL; " : ""}@coordinator inspect \`swarm_status\` and call \`swarm_complete\` once verified.`;
          }

          const { post } = await routeBoardPost(swarm.id, "@monitor", nudgeTargets, nudgeMessage);
          db.updateMonitorNudge(swarm.id, post.id);
        }
      } catch (err) {
        console.error("[swarm-runtime] monitor error:", err);
      } finally {
        monitorRunning = false;
      }
    }, monitorIntervalMs);

    if (typeof monitorTimer.unref === "function") {
      monitorTimer.unref();
    }

    // -----------------------------------------------------------------------
    // Teardown
    // -----------------------------------------------------------------------
    return () => {
      clearInterval(monitorTimer);
      abortController.abort();
      pendingCalls.clear();
      db.close();
    };
  },
});
