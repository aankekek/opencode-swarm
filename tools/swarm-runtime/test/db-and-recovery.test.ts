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

      // Reopen DB -> simulate crash recovery (Review 3 Test 3)
      const sqlite2 = await openSqliteDatabase(dbPath);
      const db2 = new SwarmBoardDB(sqlite2, dir);
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

      // Kill w1 without releasing lock
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

      // w2 claims the same glob; dead owner lock must be reassigned and verified
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
});
