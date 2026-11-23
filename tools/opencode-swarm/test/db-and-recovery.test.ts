import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      const recovered = recoverPendingProvisions(db, dir, dir);
      expect(recovered).toBe(1);
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
      expect(rowId).toBeGreaterThan(0);

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...parts: any[]) => {
        warnings.push(parts.map(String).join(" "));
      };
      let recovered: number;
      try {
        recovered = recoverPendingProvisions(db, dir, dir);
      } finally {
        console.warn = originalWarn;
      }

      // Policy: skip removal and drop the row (we do not retry foreign paths).
      expect(recovered).toBe(0);
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
      expect(recoverPendingProvisions(db, dir, dir)).toBe(0);

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
        recovered = recoverPendingProvisions(db, dir, dir);
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
});
