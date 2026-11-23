import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";

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
});
