import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBoardServer, TOKEN_COOKIE } from "../src/board-server.js";
import { VIEW_MAX_BYTES } from "../src/board-snapshot.js";
import { openSqliteDatabase, SwarmBoardDB } from "../src/db.js";

/**
 * Contract test for `/api/swarm`.
 *
 * The pane's front-end is vendored from the sidecar (`assets/swarm_board/
 * app.js`, `hive.js`). These assertions are the fields those two files actually
 * read, taken from the sidecar's snapshot (`docs/reference/swarm-sidecar/
 * main.mjs`): a `view` object, a `raw` object with three strings, `urlHosts`,
 * and `frames`. Regressing any of them breaks a tab without failing typecheck.
 */

async function makeBoard() {
  const dir = mkdtempSync(join(tmpdir(), "swarm-contract-"));
  const sqlite = await openSqliteDatabase(join(dir, "board.db"));
  const db = new SwarmBoardDB(sqlite, dir);

  const { swarm } = db.createSwarmWithCoordinator({
    title: "Contract",
    objective: "Pin the pane contract",
    coordinatorSessionId: "sess-contract-coord",
    workspaceDir: dir,
  });
  db.insertMember({
    swarmId: swarm.id,
    name: "w1",
    sessionId: "sess-contract-w1",
    role: "worker",
    addedBy: "coordinator",
    workspaceMode: "inherit",
    workspaceDir: dir,
    brief: "work",
    channels: ["main"],
  });
  db.addPost({
    swarmId: swarm.id,
    channel: "main",
    authorName: "coordinator",
    mentions: ["w1"],
    channelMentions: [],
    isAll: false,
    body: "hello contract",
  });

  const handle = await startBoardServer(
    {
      db,
      getAvailableModels: async () => ({ models: [] }),
      switchMemberModel: async () => ({ ok: true }),
      setRoleModelDefault: () => {},
      getRoleModelDefaults: () => ({}),
    },
    0,
  );

  const swarmDir = db.getSwarmDir(swarm.id);
  const get = async (query = ""): Promise<any> => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/swarm${query}`, {
      headers: { Authorization: `Bearer ${handle.token}` },
    });
    expect(res.status).toBe(200);
    return res.json();
  };
  const close = async () => {
    await handle.close();
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  };

  return { dir, swarmDir, db, swarm, handle, get, close };
}

describe("board snapshot contract", () => {
  test("emits the view/raw/urlHosts/frames shape the vendored pane reads", async () => {
    const board = await makeBoard();
    try {
      const snap = await board.get();

      // raw is an object of three strings, not the board text itself.
      expect(typeof snap.raw).toBe("object");
      expect(typeof snap.raw.board).toBe("string");
      expect(snap.raw.board).toContain("hello contract");
      expect(typeof snap.raw.members).toBe("string");
      const roster = JSON.parse(snap.raw.members);
      expect(roster.members.coordinator).toBeDefined();
      expect(snap.raw.view).toBe("");

      // view is the sidecar's view object even when the narrator wrote nothing.
      expect(snap.view.source).toBe("swarm");
      expect(snap.view.dir).toBe(board.swarmDir);
      expect(snap.view.exists).toBe(false);
      expect(snap.view.json).toBeNull();
      expect(snap.view.jsonMtime).toBe(0);
      expect(snap.view.jsonError).toBe("");
      expect(snap.view.html).toBeNull();
      expect(snap.view.htmlKey).toBe("");
      expect(snap.view.htmlError).toBe("");

      // The pane gates url actions on this list.
      expect(Array.isArray(snap.urlHosts)).toBe(true);
      expect(snap.urlHosts).toContain("docs.google.com");

      // Progress reel is always an array (empty: this plugin stores no frames).
      expect(Array.isArray(snap.frames)).toBe(true);
      expect(snap.frames).toHaveLength(0);
    } finally {
      await board.close();
    }
  });

  test("surfaces view.json and view.html when they exist", async () => {
    const board = await makeBoard();
    try {
      const view = { headline: "Two workers", workstreams: [{ title: "parser", owners: ["w1"], state: "active" }] };
      writeFileSync(join(board.swarmDir, "view.json"), JSON.stringify(view), "utf8");
      writeFileSync(join(board.swarmDir, "view.html"), "<p>narrator</p>", "utf8");

      const snap = await board.get();
      expect(snap.view.exists).toBe(true);
      expect(snap.view.json).toEqual(view);
      expect(snap.view.jsonError).toBe("");
      expect(snap.view.jsonMtime).toBeGreaterThan(0);
      expect(snap.view.html).toBe("<p>narrator</p>");
      expect(snap.view.htmlError).toBe("");
      expect(snap.view.htmlKey).toContain(board.swarmDir);
      expect(snap.raw.view).toContain("Two workers");
    } finally {
      await board.close();
    }
  });

  test("reports invalid, oversized, and empty narrator files without throwing", async () => {
    const board = await makeBoard();
    try {
      writeFileSync(join(board.swarmDir, "view.json"), "{bad json", "utf8");
      let snap = await board.get();
      expect(snap.view.exists).toBe(true);
      expect(snap.view.json).toBeNull();
      expect(snap.view.jsonError).toBe("invalid");
      expect(snap.raw.view).toBe("{bad json");

      writeFileSync(join(board.swarmDir, "view.json"), "x".repeat(VIEW_MAX_BYTES + 1), "utf8");
      snap = await board.get();
      expect(snap.view.json).toBeNull();
      expect(snap.view.jsonError).toBe("too_large");
      expect(snap.raw.view).toBe("");

      writeFileSync(join(board.swarmDir, "view.html"), "   \n", "utf8");
      snap = await board.get();
      expect(snap.view.html).toBeNull();
      expect(snap.view.htmlError).toBe("empty");
    } finally {
      await board.close();
    }
  });

  test("etag polling sees the view files change", async () => {
    const board = await makeBoard();
    try {
      const first = await board.get();
      const unchanged = await board.get(`?etag=${first.etag}`);
      expect(unchanged.unchanged).toBe(true);

      writeFileSync(join(board.swarmDir, "view.json"), JSON.stringify({ headline: "changed" }), "utf8");
      const next = await board.get(`?etag=${first.etag}`);
      expect(next.unchanged).toBeUndefined();
      expect(next.etag).not.toBe(first.etag);
      expect(next.view.json.headline).toBe("changed");
    } finally {
      await board.close();
    }
  });

  test("does not serve the reference sidecar from the pane asset directory", async () => {
    const board = await makeBoard();
    try {
      const base = `http://127.0.0.1:${board.handle.port}`;
      // The Antigravity sidecar lives in docs/reference/, not in assets/, so it
      // must not be reachable over the board port.
      for (const path of ["/main.mjs", "/channels.mjs", "/sidecar.json"]) {
        const res = await fetch(`${base}${path}`);
        expect(res.status).toBe(404);
      }
      const pane = await fetch(`${base}/app.js`);
      expect(pane.status).toBe(200);
    } finally {
      await board.close();
    }
  });
});

describe("board token exchange", () => {
  async function openBoard() {
    const board = await makeBoard();
    return { board, base: `http://127.0.0.1:${board.handle.port}` };
  }

  test("a top-level bootstrap URL swaps ?token= for an HttpOnly cookie and redirects to a clean URL", async () => {
    const { board, base } = await openBoard();
    try {
      const res = await fetch(`${base}/?token=${board.handle.token}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
      expect(res.headers.get("location")).not.toContain(board.handle.token);

      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toContain(`${TOKEN_COOKIE}=${board.handle.token}`);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/");
    } finally {
      await board.close();
    }
  });

  test("the cookie authorizes GET and POST without a bearer header", async () => {
    const { board, base } = await openBoard();
    try {
      const cookie = `${TOKEN_COOKIE}=${board.handle.token}`;

      const get = await fetch(`${base}/api/swarm`, { headers: { Cookie: cookie } });
      expect(get.status).toBe(200);

      // Auth passes; the missing Content-Type is what rejects this POST (415),
      // not auth (401).
      const post = await fetch(`${base}/api/member/model`, { method: "POST", headers: { Cookie: cookie } });
      expect(post.status).toBe(415);

      const anonymous = await fetch(`${base}/api/swarm`);
      expect(anonymous.status).toBe(401);
    } finally {
      await board.close();
    }
  });

  test("a bad bootstrap token is rejected without setting a cookie", async () => {
    const { board, base } = await openBoard();
    try {
      const res = await fetch(`${base}/?token=wrong`, { redirect: "manual" });
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    } finally {
      await board.close();
    }
  });

  test("an iframe load keeps ?token= so the desktop pane's preload fallback still works", async () => {
    const { board, base } = await openBoard();
    try {
      const res = await fetch(`${base}/?token=${board.handle.token}`, {
        redirect: "manual",
        headers: { "Sec-Fetch-Dest": "iframe" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(await res.text()).toContain("preload.js");
    } finally {
      await board.close();
    }
  });
});
