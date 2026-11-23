import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";
import { recoverPendingProvisions } from "../src/workspace.js";

describe("SwarmBoardDB & Crash Recovery", () => {
  test("same-session re-init after completion & startup crash recovery (Review 3 Tests 3 & 4)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-db-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite1 = await openSqliteDatabase(dbPath);
      const db1 = new SwarmBoardDB(sqlite1, dir);

      const { swarm: s1, coordinator: c1 } = db1.createSwarmWithCoordinator({
        title: "First Swarm",
        objective: "Test re-init",
        coordinatorSessionId: "sess_coord",
        workspaceDir: dir,
      });

      // Simulate completion
      db1.setMemberState(c1.id, "killed");
      db1.setSwarmStatus(s1.id, "completed");

      // Re-init in the SAME session (Review 3 Test 4)
      const { swarm: s2 } = db1.createSwarmWithCoordinator({
        title: "Second Swarm",
        objective: "Test crash recovery",
        coordinatorSessionId: "sess_coord",
        workspaceDir: dir,
      });
      db1.close();

      // Reopen DB -> same-PID reload must preserve the live swarm (S2)
      const sqlite2 = await openSqliteDatabase(dbPath);
      const db2 = new SwarmBoardDB(sqlite2, dir);
      const samePidReconciled = db2.reconcileStaleSwarmsOnStartup();
      expect(samePidReconciled.length).toBe(0);
      expect(db2.getSwarm(s2.id)?.status).toBe("running");

      // S1: Second active swarm in the same workspace is rejected while s2 is running
      expect(() =>
        db2.createSwarmWithCoordinator({
          title: "Duplicate Workspace Swarm",
          objective: "Should fail",
          coordinatorSessionId: "sess_coord_2",
          workspaceDir: dir,
        }),
      ).toThrow(/Workspace already has an active swarm/);

      // Simulate dead foreign PID crash recovery
      sqlite2.prepare(`UPDATE swarms SET owner_pid = 999999 WHERE id = ?`).run(s2.id);
      const reconciled = db2.reconcileStaleSwarmsOnStartup();
      expect(reconciled.length).toBe(1);
      expect(reconciled[0].id).toBe(s2.id);
      expect(db2.getSwarm(s2.id)?.status).toBe("interrupted");
      expect(db2.listLocks(s2.id).length).toBe(0);

      // Verify Antigravity file mirrors exist
      expect(existsSync(join(dir, "swarms", s2.id, "members.json"))).toBe(true);
      expect(existsSync(join(dir, "swarms", s2.id, "board.jsonl"))).toBe(true);
      expect(readFileSync(join(dir, "swarms", s2.id, "board.jsonl"), "utf8")).toContain("Recovered on plugin startup");

      // RT-H1: Verify restart allows creating a new swarm in the same session immediately
      const { swarm: s3 } = db2.createSwarmWithCoordinator({
        title: "Third Swarm after restart",
        objective: "Verify restart does not brick session",
        coordinatorSessionId: "sess_coord",
        workspaceDir: dir,
      });
      expect(s3.id).toBeDefined();

      db2.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("dead-owner lock claim in db.ts steals or reassigns locks (RT-H4)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-lock-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);

      const { swarm, coordinator } = db.createSwarmWithCoordinator({
        title: "Lock Swarm",
        objective: "Test dead-owner locks",
        coordinatorSessionId: "coord_sess",
        workspaceDir: dir,
      });

      const w1 = db.insertMember({
        swarmId: swarm.id,
        name: "w1",
        sessionId: "s_w1",
        role: "worker",
        addedBy: "coordinator",
        groupPrefix: null,
        model: undefined,
        workspaceMode: "inherit",
        workspaceDir: dir,
        workspaceBranch: null,
        brief: "work",
        state: "working",
        lastReadSeq: 0,
        channels: ["main"],
      });

      const res1 = db.claimLocksAtomic(swarm.id, w1.id, w1.name, ["src/**/*.ts"]);
      expect(res1.claimed).toEqual(["src/**/*.ts"]);
      expect(res1.conflicts.length).toBe(0);

      // Kill w1 without releasing lock. This mirrors the real kill path:
      // state flips to 'killed' before the member's in-flight tools finish,
      // so the lock must stay held until releaseLocksForMember runs.
      db.setMemberState(w1.id, "killed");

      const w2 = db.insertMember({
        swarmId: swarm.id,
        name: "w2",
        sessionId: "s_w2",
        role: "worker",
        addedBy: "coordinator",
        groupPrefix: null,
        model: undefined,
        workspaceMode: "inherit",
        workspaceDir: dir,
        workspaceBranch: null,
        brief: "work2",
        state: "working",
        lastReadSeq: 0,
        channels: ["main"],
      });

      // w2 cannot take the killed owner's glob while its tools may still run.
      const blocked = db.claimLocksAtomic(swarm.id, w2.id, w2.name, ["src/**/*.ts"]);
      expect(blocked.claimed).toEqual([]);
      expect(blocked.conflicts).toHaveLength(1);
      expect(blocked.conflicts[0].owner).toBe("w1");

      // Only once the deferred kill cleanup releases w1's locks may w2 claim.
      db.releaseLocksForMember(w1.id);
      const res2 = db.claimLocksAtomic(swarm.id, w2.id, w2.name, ["src/**/*.ts"]);
      expect(res2.claimed).toEqual(["src/**/*.ts"]);
      expect(res2.conflicts.length).toBe(0);

      const activeLocks = db.listLocks(swarm.id);
      expect(activeLocks.length).toBe(1);
      expect(activeLocks[0].owner_name).toBe("w2");
      expect(activeLocks[0].owner_member_id).toBe(w2.id);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  test("live member keeps a long-held lock past the kill grace window", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-lock-live-"));
    const dbPath = join(dir, "board.db");
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(dbPath), dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Live Lock Swarm",
        objective: "Live owner keeps its lock regardless of age",
        coordinatorSessionId: "coord_sess",
        workspaceDir: dir,
      });
      const w1 = db.insertMember({
        swarmId: swarm.id,
        name: "w1",
        sessionId: "s_w1",
        role: "worker",
        addedBy: "coordinator",
        groupPrefix: null,
        model: undefined,
        workspaceMode: "inherit",
        workspaceDir: dir,
        workspaceBranch: null,
        brief: "work",
        state: "working",
        lastReadSeq: 0,
        channels: ["main"],
      });
      const claim = db.claimLocksAtomic(swarm.id, w1.id, w1.name, ["src/a/**"]);
      expect(claim.claimed).toEqual(["src/a/**"]);
      const claimedAt = db.listLocks(swarm.id)[0].claimed_at;

      const w2 = db.insertMember({
        swarmId: swarm.id,
        name: "w2",
        sessionId: "s_w2",
        role: "worker",
        addedBy: "coordinator",
        groupPrefix: null,
        model: undefined,
        workspaceMode: "inherit",
        workspaceDir: dir,
        workspaceBranch: null,
        brief: "work2",
        state: "working",
        lastReadSeq: 0,
        channels: ["main"],
      });

      // 61s later the owner is still live: the lock must survive the claim.
      const res = db.claimLocksAtomic(swarm.id, w2.id, w2.name, ["src/a/**"], claimedAt + 61_000);
      expect(res.claimed).toEqual([]);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].owner).toBe("w1");

      const locks = db.listLocks(swarm.id);
      expect(locks).toHaveLength(1);
      expect(locks[0].owner_member_id).toBe(w1.id);
      expect(locks[0].owner_name).toBe("w1");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  test("killed owner's lock is reclaimed after the grace window", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-lock-expired-"));
    const dbPath = join(dir, "board.db");
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(dbPath), dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Expired Lock Swarm",
        objective: "Killed owner lock expires after the grace window",
        coordinatorSessionId: "coord_sess",
        workspaceDir: dir,
      });
      const w1 = db.insertMember({
        swarmId: swarm.id,
        name: "w1",
        sessionId: "s_w1",
        role: "worker",
        addedBy: "coordinator",
        groupPrefix: null,
        model: undefined,
        workspaceMode: "inherit",
        workspaceDir: dir,
        workspaceBranch: null,
        brief: "work",
        state: "working",
        lastReadSeq: 0,
        channels: ["main"],
      });
      const claim = db.claimLocksAtomic(swarm.id, w1.id, w1.name, ["src/a/**"]);
      expect(claim.claimed).toEqual(["src/a/**"]);
      const claimedAt = db.listLocks(swarm.id)[0].claimed_at;
      db.setMemberState(w1.id, "killed");

      const w2 = db.insertMember({
        swarmId: swarm.id,
        name: "w2",
        sessionId: "s_w2",
        role: "worker",
        addedBy: "coordinator",
        groupPrefix: null,
        model: undefined,
        workspaceMode: "inherit",
        workspaceDir: dir,
        workspaceBranch: null,
        brief: "work2",
        state: "working",
        lastReadSeq: 0,
        channels: ["main"],
      });

      // 61s after claiming, a killed owner's lock is outside the grace window
      // and may be reclaimed by the next claim.
      const res = db.claimLocksAtomic(swarm.id, w2.id, w2.name, ["src/a/**"], claimedAt + 61_000);
      expect(res.claimed).toEqual(["src/a/**"]);
      expect(res.conflicts).toHaveLength(0);

      const locks = db.listLocks(swarm.id);
      expect(locks).toHaveLength(1);
      expect(locks[0].owner_name).toBe("w2");
      expect(locks[0].owner_member_id).toBe(w2.id);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  test("reconcileStaleSwarmsOnStartup transitions a stale swarm exactly once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-reconcile-once-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Stale Once Swarm",
        objective: "Atomic reconcile",
        coordinatorSessionId: "coord_once",
        workspaceDir: dir,
      });
      sqlite.prepare(`UPDATE swarms SET owner_pid = 999999 WHERE id = ?`).run(swarm.id);

      const first = db.reconcileStaleSwarmsOnStartup();
      expect(first.map((s) => s.id)).toEqual([swarm.id]);

      // Second pass must observe the transition and skip the swarm entirely.
      const second = db.reconcileStaleSwarmsOnStartup();
      expect(second).toEqual([]);

      const recoveryPosts = db
        .getPostsPage(swarm.id, 0, 100)
        .posts.filter((p) => p.body.includes("Recovered on plugin startup"));
      expect(recoveryPosts).toHaveLength(1);
      expect(db.getSwarm(swarm.id)?.status).toBe("interrupted");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("reconcileStaleSwarmsOnStartup tolerates addPost failure and still reconciles every stale swarm", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-reconcile-post-fail-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);

      const { swarm: firstSwarm } = db.createSwarmWithCoordinator({
        title: "First Stale Swarm",
        objective: "First",
        coordinatorSessionId: "coord_first",
        workspaceDir: dir,
      });
      // Free the workspace so a second active swarm can be created.
      db.setSwarmStatus(firstSwarm.id, "completed");
      const { swarm: secondSwarm } = db.createSwarmWithCoordinator({
        title: "Second Stale Swarm",
        objective: "Second",
        coordinatorSessionId: "coord_second",
        workspaceDir: dir,
      });
      sqlite
        .prepare(`UPDATE swarms SET status = 'running', owner_pid = 999999 WHERE id IN (?, ?)`)
        .run(firstSwarm.id, secondSwarm.id);

      const originalAddPost = db.addPost.bind(db);
      let addPostCalls = 0;
      (db as any).addPost = (args: any) => {
        addPostCalls += 1;
        if (addPostCalls === 1) throw new Error("simulated addPost failure");
        return originalAddPost(args);
      };

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...parts: any[]) => {
        warnings.push(parts.map(String).join(" "));
      };

      let reconciled: ReturnType<typeof db.reconcileStaleSwarmsOnStartup>;
      try {
        reconciled = db.reconcileStaleSwarmsOnStartup();
      } finally {
        console.warn = originalWarn;
        (db as any).addPost = originalAddPost;
      }

      // A throwing addPost must not abort the loop: both swarms are reconciled.
      expect(addPostCalls).toBe(2);
      expect(reconciled!.map((s) => s.id).sort()).toEqual([firstSwarm.id, secondSwarm.id].sort());
      expect(db.getSwarm(firstSwarm.id)?.status).toBe("interrupted");
      expect(db.getSwarm(secondSwarm.id)?.status).toBe("interrupted");
      expect(warnings.some((w) => w.includes("Failed to post recovery notice"))).toBe(true);

      // Exactly the non-failing post succeeded; the other failure was logged, not silent.
      const recoveryPosts = [
        ...db.getPostsPage(firstSwarm.id, 0, 100).posts,
        ...db.getPostsPage(secondSwarm.id, 0, 100).posts,
      ].filter((p) => p.body.includes("Recovered on plugin startup"));
      expect(recoveryPosts).toHaveLength(1);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("recoverPendingProvisions removes an orphaned workspace inside dataDir and deletes the journal row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-recover-"));
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(join(dir, "board.db")), dir);
      const ws = join(dir, "worktrees", "sw_x", "w1");
      mkdirSync(ws, { recursive: true });
      writeFileSync(join(ws, "marker.txt"), "orphan");

      const rowId = db.insertPendingProvision({
        swarmId: "sw_x",
        memberName: "w1",
        workspaceMode: "share",
        workspaceDir: ws,
        workspaceBranch: "swarm/sw_x/w1",
      });
      expect(existsSync(ws)).toBe(true);
      expect(db.listPendingProvisions().map((r) => r.id)).toEqual([rowId]);

      // repoRoot is not a git repo here, so branch cleanup is skipped safely.
      const { recovered, orphanSessions } = recoverPendingProvisions(db, dir, dir);
      expect(recovered).toBe(1);
      expect(orphanSessions).toEqual([]);
      expect(existsSync(ws)).toBe(false);
      expect(db.listPendingProvisions()).toEqual([]);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("recoverPendingProvisions never deletes a workspace outside dataDir and drops the journal row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-recover-outside-"));
    const outside = mkdtempSync(join(tmpdir(), "swarm-recover-sentinel-"));
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(join(dir, "board.db")), dir);
      const sentinel = join(outside, "sentinel.txt");
      writeFileSync(sentinel, "do not delete");

      const rowId = db.insertPendingProvision({
        swarmId: "sw_x",
        memberName: "w_out",
        workspaceMode: "branch",
        workspaceDir: outside,
        workspaceBranch: "swarm/sw_x/w_out",
      });
      db.setPendingProvisionSession(rowId, "sess_dropped_outside");
      expect(rowId).toBeGreaterThan(0);

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...parts: any[]) => {
        warnings.push(parts.map(String).join(" "));
      };
      let recovered: number;
      let orphanSessions: string[];
      try {
        ({ recovered, orphanSessions } = recoverPendingProvisions(db, dir, dir));
      } finally {
        console.warn = originalWarn;
      }

      // Policy: skip removal and drop the row (we do not retry foreign paths).
      expect(recovered).toBe(0);
      // Dropped rows still surface their child session for best-effort removal.
      expect(orphanSessions).toEqual(["sess_dropped_outside"]);
      expect(existsSync(outside)).toBe(true);
      expect(existsSync(sentinel)).toBe(true);
      expect(readFileSync(sentinel, "utf8")).toBe("do not delete");
      expect(db.listPendingProvisions()).toEqual([]);
      expect(warnings.some((w) => w.includes("outside the data dir"))).toBe(true);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
      try {
        rmSync(outside, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("recoverPendingProvisions is a no-op for an empty journal and tolerates a missing directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-recover-missing-"));
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(join(dir, "board.db")), dir);

      // Empty journal: no-op, returns 0, never throws.
      expect(() => recoverPendingProvisions(db, dir, dir)).not.toThrow();
      expect(recoverPendingProvisions(db, dir, dir)).toEqual({ recovered: 0, orphanSessions: [] });

      // Row whose directory never materialized: row is cleaned up, no throw.
      db.insertPendingProvision({
        swarmId: "sw_x",
        memberName: "w_missing",
        workspaceMode: "branch",
        workspaceDir: join(dir, "clones", "sw_x", "w_missing"),
        workspaceBranch: "swarm/sw_x/w_missing",
      });
      let recovered = 0;
      expect(() => {
        recovered = recoverPendingProvisions(db, dir, dir).recovered;
      }).not.toThrow();
      expect(recovered).toBe(1);
      expect(db.listPendingProvisions()).toEqual([]);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("setPendingProvisionSession updates the journal row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-pending-session-"));
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(join(dir, "board.db")), dir);
      const rowId = db.insertPendingProvision({
        swarmId: "sw_x",
        memberName: "w1",
        workspaceMode: "share",
        workspaceDir: join(dir, "worktrees", "sw_x", "w1"),
        workspaceBranch: "swarm/sw_x/w1",
      });
      expect(db.listPendingProvisions()[0].session_id).toBeNull();

      db.setPendingProvisionSession(rowId, "sess_child_1");

      const rows = db.listPendingProvisions();
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(rowId);
      expect(rows[0].session_id).toBe("sess_child_1");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("recoverPendingProvisions surfaces a recovered row's session id in orphanSessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-recover-session-"));
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(join(dir, "board.db")), dir);
      const ws = join(dir, "worktrees", "sw_x", "w1");
      mkdirSync(ws, { recursive: true });

      const rowId = db.insertPendingProvision({
        swarmId: "sw_x",
        memberName: "w1",
        workspaceMode: "share",
        workspaceDir: ws,
        workspaceBranch: "swarm/sw_x/w1",
      });
      db.setPendingProvisionSession(rowId, "sess_orphan_1");

      const { recovered, orphanSessions } = recoverPendingProvisions(db, dir, dir);
      expect(recovered).toBe(1);
      expect(orphanSessions).toEqual(["sess_orphan_1"]);
      expect(existsSync(ws)).toBe(false);
      expect(db.listPendingProvisions()).toEqual([]);

      // A row without a session id yields an empty orphan list.
      const rowId2 = db.insertPendingProvision({
        swarmId: "sw_x",
        memberName: "w2",
        workspaceMode: "share",
        workspaceDir: join(dir, "worktrees", "sw_x", "w2"),
        workspaceBranch: "swarm/sw_x/w2",
      });
      expect(rowId2).toBeGreaterThan(0);
      const second = recoverPendingProvisions(db, dir, dir);
      expect(second.recovered).toBe(1);
      expect(second.orphanSessions).toEqual([]);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("reconcile reclaims a same-pid swarm owned by a previous instance (plugin reload)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-instance-reload-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm, coordinator } = db.createSwarmWithCoordinator({
        title: "Reloaded Swarm",
        objective: "Same-pid reload",
        coordinatorSessionId: "coord_reload",
        workspaceDir: dir,
        ownerInstance: "A",
      });
      const claimed = db.claimLocksAtomic(swarm.id, coordinator.id, "coordinator", ["src/**"]);
      expect(claimed.claimed).toEqual(["src/**"]);
      expect(db.listLocks(swarm.id).length).toBe(1);

      // A new plugin instance in the same process: same pid, new instance id.
      const reconciled = db.reconcileStaleSwarmsOnStartup("B");

      expect(reconciled.map((s) => s.id)).toEqual([swarm.id]);
      expect(db.getSwarm(swarm.id)?.status).toBe("interrupted");
      expect(db.listLocks(swarm.id)).toEqual([]);
      expect(db.listMembers(swarm.id, false)).toEqual([]);
      expect(db.getMemberById(coordinator.id)?.state).toBe("killed");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("reconcile leaves a swarm owned by the current instance untouched", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-instance-live-"));
    const dbPath = join(dir, "board.db");
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(dbPath), dir);
      const { swarm, coordinator } = db.createSwarmWithCoordinator({
        title: "Live Swarm",
        objective: "Same instance",
        coordinatorSessionId: "coord_live",
        workspaceDir: dir,
        ownerInstance: "A",
      });

      const reconciled = db.reconcileStaleSwarmsOnStartup("A");

      expect(reconciled).toEqual([]);
      expect(db.getSwarm(swarm.id)?.status).toBe("running");
      expect(db.getMemberById(coordinator.id)?.state).toBe("working");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("reconcile treats a legacy NULL-instance row owned by this pid as stale", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-instance-legacy-pid-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);
      // No ownerInstance -> legacy NULL row written with process.pid.
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Legacy Swarm",
        objective: "Legacy row",
        coordinatorSessionId: "coord_legacy",
        workspaceDir: dir,
      });
      const legacy = db.getSwarm(swarm.id) as { owner_instance?: string | null } | undefined;
      expect(legacy?.owner_instance ?? null).toBeNull();

      const reconciled = db.reconcileStaleSwarmsOnStartup("B");

      expect(reconciled.map((s) => s.id)).toEqual([swarm.id]);
      expect(db.getSwarm(swarm.id)?.status).toBe("interrupted");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("reconcile without an instance id keeps the legacy pid-only behavior", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-instance-bwc-"));
    const dbPath = join(dir, "board.db");
    try {
      const db = new SwarmBoardDB(await openSqliteDatabase(dbPath), dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Backwards Compat Swarm",
        objective: "No instance arg",
        coordinatorSessionId: "coord_bwc",
        workspaceDir: dir,
      });

      // No currentInstance supplied: same-pid ownership is still considered live.
      expect(db.reconcileStaleSwarmsOnStartup()).toEqual([]);
      expect(db.getSwarm(swarm.id)?.status).toBe("running");

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("schema migration adds owner_instance to a pre-existing swarms table", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-instance-migrate-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      // Simulate a database created before owner_instance existed.
      sqlite.exec(`
        CREATE TABLE swarms (
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
      `);
      expect(() => new SwarmBoardDB(sqlite, dir)).not.toThrow();

      const columns = (sqlite.prepare(`PRAGMA table_info(swarms)`).all() as Array<{ name: string }>).map(
        (c) => c.name,
      );
      expect(columns).toContain("owner_instance");

      // Legacy rows read as NULL and remain reconcilable by pid.
      sqlite
        .prepare(
          `INSERT INTO swarms (id, title, objective, status, owner_pid, created_at, updated_at)
           VALUES ('sw_legacy', 'Legacy', 'Legacy', 'running', 999999, 1, 1)`,
        )
        .run();
      sqlite.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("syncMembersJson writes valid JSON atomically and leaves no temp files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-mirror-atomic-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Mirror Atomic Swarm",
        objective: "Mirror durability",
        coordinatorSessionId: "coord_mirror_atomic",
        workspaceDir: dir,
      });

      const swarmDir = db.getSwarmDir(swarm.id);
      const membersPath = join(swarmDir, "members.json");
      const raw = readFileSync(membersPath, "utf8");
      const parsed = JSON.parse(raw) as { title: string; members: Record<string, unknown> };
      expect(parsed.title).toBe("Mirror Atomic Swarm");
      expect(Object.keys(parsed.members)).toEqual(["coordinator"]);

      // A fresh sync replaces the file in place and must not leave temp files.
      db.syncMembersJson(swarm.id);
      expect(JSON.parse(readFileSync(membersPath, "utf8")).title).toBe("Mirror Atomic Swarm");
      const leftovers = readdirSync(swarmDir).filter((name) => name.includes(".tmp-"));
      expect(leftovers).toEqual([]);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("rebuildMirrors repairs a truncated members.json from the DB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-mirror-repair-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Mirror Repair Swarm",
        objective: "Repair members.json",
        coordinatorSessionId: "coord_mirror_repair",
        workspaceDir: dir,
      });
      db.insertMember({
        swarmId: swarm.id,
        name: "worker-1",
        sessionId: "sess_worker_1",
        role: "worker",
        addedBy: "coordinator",
        workspaceMode: "inherit",
        workspaceDir: dir,
        brief: "worker",
      });

      const membersPath = join(db.getSwarmDir(swarm.id), "members.json");
      // Simulate a crash mid-write: truncated, unparseable JSON.
      writeFileSync(membersPath, '{"title": "Mirror Rep', "utf8");
      expect(() => JSON.parse(readFileSync(membersPath, "utf8"))).toThrow();

      db.rebuildMirrors();

      const repaired = JSON.parse(readFileSync(membersPath, "utf8")) as {
        members: Record<string, unknown>;
      };
      const dbNames = db
        .listMembers(swarm.id, true)
        .map((m) => m.name)
        .sort();
      expect(Object.keys(repaired.members).sort()).toEqual(dbNames);
      expect(dbNames).toEqual(["coordinator", "worker-1"]);

      const leftovers = readdirSync(db.getSwarmDir(swarm.id)).filter((name) => name.includes(".tmp-"));
      expect(leftovers).toEqual([]);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("rebuildMirrors restores a board.jsonl line lost after commit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-mirror-board-"));
    const dbPath = join(dir, "board.db");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm } = db.createSwarmWithCoordinator({
        title: "Mirror Board Swarm",
        objective: "Repair board.jsonl",
        coordinatorSessionId: "coord_mirror_board",
        workspaceDir: dir,
      });

      for (let i = 1; i <= 3; i++) {
        db.addPost({
          swarmId: swarm.id,
          authorName: "coordinator",
          channel: "main",
          mentions: [],
          channelMentions: [],
          isAll: false,
          body: `post ${i}`,
        });
      }

      const boardPath = join(db.getSwarmDir(swarm.id), "board.jsonl");
      const lines = readFileSync(boardPath, "utf8").split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBe(3);
      // Simulate a crash between COMMIT and the append of the last post.
      writeFileSync(boardPath, lines.slice(0, -1).join("\n") + "\n", "utf8");

      db.rebuildMirrors();

      const rebuilt = readFileSync(boardPath, "utf8").split("\n").filter((l) => l.length > 0);
      const count = (
        sqlite.prepare(`SELECT COUNT(*) AS n FROM board_posts WHERE swarm_id = ?`).get(swarm.id) as {
          n: number;
        }
      ).n;
      expect(rebuilt.length).toBe(count);
      expect(count).toBe(3);
      const parsed = rebuilt.map((l) => JSON.parse(l) as { seq: number; text: string });
      expect(parsed.map((p) => p.seq)).toEqual([1, 2, 3]);
      expect(parsed.map((p) => p.text)).toEqual(["post 1", "post 2", "post 3"]);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("rebuildMirrors does not throw on an empty DB or a missing data dir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-mirror-empty-"));
    const dbPath = join(dir, "board.db");
    const missingDataDir = join(dir, "missing-data-dir");
    try {
      const sqlite = await openSqliteDatabase(dbPath);
      const db = new SwarmBoardDB(sqlite, missingDataDir);
      expect(() => db.rebuildMirrors()).not.toThrow();

      const { swarm } = db.createSwarmWithCoordinator({
        title: "Mirror Missing Dir Swarm",
        objective: "Missing data dir",
        coordinatorSessionId: "coord_mirror_missing",
        workspaceDir: dir,
      });
      expect(() => db.rebuildMirrors()).not.toThrow();
      expect(existsSync(join(missingDataDir, "swarms", swarm.id, "members.json"))).toBe(true);
      expect(existsSync(join(missingDataDir, "swarms", swarm.id, "board.jsonl"))).toBe(true);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});

describe("Swarm unit plan", () => {
  test("createPlan inserts ordered rows, replaces open plans, and rejects invalid lists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-plan-"));
    try {
      const sqlite = await openSqliteDatabase(join(dir, "board.db"));
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm, coordinator } = db.createSwarmWithCoordinator({
        title: "Plan Swarm",
        objective: "Record a plan",
        coordinatorSessionId: "sess_plan_db",
        workspaceDir: dir,
      });

      const tasks = db.createPlan(swarm.id, ["  alpha  ", "", "beta", "beta"]);
      expect(tasks.map((t) => t.seq)).toEqual([1, 2, 3]);
      expect(tasks.map((t) => t.label)).toEqual(["alpha", "beta", "beta"]);
      expect(tasks.every((t) => t.status === "open")).toBe(true);

      const replaced = db.createPlan(swarm.id, ["one", "two"]);
      expect(replaced.map((t) => t.seq)).toEqual([1, 2]);
      expect(db.listTasks(swarm.id).map((t) => t.label)).toEqual(["one", "two"]);

      expect(() => db.createPlan(swarm.id, ["   "])).toThrow("At least one unit is required.");
      expect(() =>
        db.createPlan(
          swarm.id,
          Array.from({ length: 51 }, (_, i) => `unit-${i}`),
        ),
      ).toThrow("at most 50");

      const assigned = db.assignTasks(swarm.id, coordinator.id, coordinator.name, [replaced[0].id]);
      expect(assigned).toHaveLength(1);
      expect(assigned[0].status).toBe("assigned");
      expect(assigned[0].assignee_name).toBe(coordinator.name);

      expect(() => db.createPlan(swarm.id, ["again"])).toThrow("already in progress");
      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("assignTasks validates ids, getTaskCounts reports, and completeTasksForMember marks only its rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-plan-"));
    try {
      const sqlite = await openSqliteDatabase(join(dir, "board.db"));
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm, coordinator } = db.createSwarmWithCoordinator({
        title: "Plan Counts",
        objective: "Count plan units",
        coordinatorSessionId: "sess_plan_counts",
        workspaceDir: dir,
      });
      const worker = db.insertMember({
        swarmId: swarm.id,
        name: "worker-a",
        sessionId: "sess_plan_worker",
        role: "worker",
        addedBy: coordinator.name,
        workspaceMode: "inherit",
        workspaceDir: dir,
        brief: "work",
      });

      const [t1, t2, t3] = db.createPlan(swarm.id, ["a", "b", "c"]);
      expect(db.getTaskCounts(swarm.id)).toEqual({ total: 3, open: 3, assigned: 0, done: 0 });

      expect(() => db.assignTasks(swarm.id, worker.id, worker.name, [9999])).toThrow("does not exist");
      expect(() => db.assignTasks(swarm.id, worker.id, worker.name, [t1.id, 999999])).toThrow("does not exist");

      db.assignTasks(swarm.id, worker.id, worker.name, [t1.id, t2.id]);
      expect(db.getTaskCounts(swarm.id)).toEqual({ total: 3, open: 1, assigned: 2, done: 0 });
      expect(() => db.assignTasks(swarm.id, worker.id, worker.name, [t1.id])).toThrow("already assigned");

      expect(db.completeTasksForMember(worker.id)).toBe(2);
      expect(db.getTaskCounts(swarm.id)).toEqual({ total: 3, open: 1, assigned: 0, done: 2 });
      expect(db.listTasks(swarm.id).find((t) => t.id === t3.id)?.status).toBe("open");
      expect(db.completeTasksForMember(worker.id)).toBe(0);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });

  test("releaseTasksForMember reopens only the units assigned to that member", async () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-plan-"));
    try {
      const sqlite = await openSqliteDatabase(join(dir, "board.db"));
      const db = new SwarmBoardDB(sqlite, dir);
      const { swarm, coordinator } = db.createSwarmWithCoordinator({
        title: "Plan Release",
        objective: "Release assigned units",
        coordinatorSessionId: "sess_plan_release",
        workspaceDir: dir,
      });
      const workerA = db.insertMember({
        swarmId: swarm.id,
        name: "worker-a",
        sessionId: "sess_release_a",
        role: "worker",
        addedBy: coordinator.name,
        workspaceMode: "inherit",
        workspaceDir: dir,
        brief: "work a",
      });
      const workerB = db.insertMember({
        swarmId: swarm.id,
        name: "worker-b",
        sessionId: "sess_release_b",
        role: "worker",
        addedBy: coordinator.name,
        workspaceMode: "inherit",
        workspaceDir: dir,
        brief: "work b",
      });

      const [t1, t2, t3] = db.createPlan(swarm.id, ["a", "b", "c"]);
      db.assignTasks(swarm.id, workerA.id, workerA.name, [t1.id, t2.id]);
      db.assignTasks(swarm.id, workerB.id, workerB.name, [t3.id]);
      expect(db.getTaskCounts(swarm.id)).toEqual({ total: 3, open: 0, assigned: 3, done: 0 });

      expect(db.releaseTasksForMember(workerA.id)).toBe(2);
      expect(db.getTaskCounts(swarm.id)).toEqual({ total: 3, open: 2, assigned: 1, done: 0 });

      const rows = db.listTasks(swarm.id);
      const released = rows.filter((t) => t.id === t1.id || t.id === t2.id);
      expect(released.every((t) => t.status === "open")).toBe(true);
      expect(released.every((t) => t.assignee_member_id === null && t.assignee_name === null)).toBe(true);
      const kept = rows.find((t) => t.id === t3.id);
      expect(kept?.status).toBe("assigned");
      expect(kept?.assignee_member_id).toBe(workerB.id);
      expect(kept?.assignee_name).toBe(workerB.name);

      expect(db.releaseTasksForMember(workerA.id)).toBe(0);

      db.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});
