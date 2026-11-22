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
      db2.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {}
    }
  });
});
