import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { SwarmBoardDB } from "./db.js";
import type { AvailableModelEntry } from "./models.js";
import type { MemberRole } from "./types.js";

export interface BoardServerDeps {
  db: SwarmBoardDB;
  getAvailableModels: () => Promise<{ defaultModel?: { providerID: string; modelID: string }; models: AvailableModelEntry[] }>;
  switchMemberModel: (swarmId: string, memberName: string, model?: string, variant?: string) => Promise<unknown>;
  setRoleModelDefault: (role: MemberRole, spec: string) => void;
  getRoleModelDefaults: () => Partial<Record<MemberRole, string>>;
}

export interface BoardServerHandle {
  url: string;
  port: number;
  token: string;
  isAlive: () => boolean;
  close: () => Promise<void>;
}

const MAX_BODY_BYTES = 65_536;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "assets", "swarm_board");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self' blob: data:",
].join("; ");

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function readJsonFileSafe(filePath: string): unknown {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTextTailSafe(filePath: string, maxBytes = MAX_BODY_BYTES): string {
  try {
    if (!existsSync(filePath)) return "";
    const raw = readFileSync(filePath, "utf8");
    if (raw.length <= maxBytes) return raw;
    return raw.slice(raw.length - maxBytes);
  } catch {
    return "";
  }
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function readBodyJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, "Payload too large (max 64 KB)");
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": CSP_HEADER,
  });
  res.end(body);
}

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  return hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`;
}

function isAllowedOrigin(originHeader: string | undefined, port: number): boolean {
  if (!originHeader) return true;
  return originHeader === `http://127.0.0.1:${port}` || originHeader === `http://localhost:${port}`;
}

function hasValidBearer(req: IncomingMessage, expectedToken: string): boolean {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return false;
  return auth.slice("Bearer ".length).trim() === expectedToken;
}

const PRELOAD_JS = `(() => {
  const root = document.documentElement;
  const applyTheme = () => {
    const isLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    root.dataset.theme = isLight ? 'light' : 'dark';
    root.style.colorScheme = isLight ? 'light' : 'dark';
    if (isLight) {
      root.style.setProperty('--background', '#f8f8f7');
      root.style.setProperty('--foreground', '#0b0b0b');
      root.style.setProperty('--secondary-foreground', '#52514e');
      root.style.setProperty('--card', '#ffffff');
      root.style.setProperty('--secondary', '#f1f1ef');
      root.style.setProperty('--muted', '#f4f4f2');
      root.style.setProperty('--border', '#e7e6e2');
      root.style.setProperty('--card-border', '#e7e6e2');
      root.style.setProperty('--primary', '#2a78d6');
      root.style.setProperty('--muted-foreground', '#8a8984');
      root.style.setProperty('--sw-success', '#0ca30c');
      root.style.setProperty('--sw-warning', '#d99a0b');
      root.style.setProperty('--sw-error', '#d03b3b');
    } else {
      root.style.setProperty('--background', '#141413');
      root.style.setProperty('--foreground', '#ededec');
      root.style.setProperty('--secondary-foreground', '#b5b4b0');
      root.style.setProperty('--card', '#1d1d1c');
      root.style.setProperty('--secondary', '#262625');
      root.style.setProperty('--muted', '#1a1a19');
      root.style.setProperty('--border', '#2f2f2d');
      root.style.setProperty('--card-border', '#2f2f2d');
      root.style.setProperty('--primary', '#4a90e2');
      root.style.setProperty('--muted-foreground', '#8a8984');
      root.style.setProperty('--sw-success', '#2cc28c');
      root.style.setProperty('--sw-warning', '#f0b429');
      root.style.setProperty('--sw-error', '#e05252');
    }
  };
  applyTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
  }
  window.addEventListener('message', (event) => {
    const data = event && event.data;
    if (!data || data.type !== 'swarm:theme') return;
    if (data.mode === 'light' || data.mode === 'dark') {
      root.dataset.theme = data.mode;
      root.style.colorScheme = data.mode;
    }
    if (data.tokens && typeof data.tokens === 'object') {
      for (const [k, v] of Object.entries(data.tokens)) {
        if (typeof v === 'string' && v.trim()) {
          root.style.setProperty(k, v.trim());
        }
      }
    }
  });
  const token = new URLSearchParams(window.location.search).get('token');
  if (token && typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/')) {
        const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || undefined);
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        if (init.method && init.method.toUpperCase() === 'POST' && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        return origFetch(input, { ...init, headers });
      }
      return origFetch(input, init);
    };
  }
  window.sidecar = window.sidecar || {
    ui: {
      toggleConversation(sessionID, name) {
        if (!sessionID) return;
        window.parent.postMessage({ type: 'swarm:open_session', sessionID, name: name || sessionID }, '*');
      },
    },
  };
})();
`;

export async function startBoardServer(deps: BoardServerDeps, port = 0): Promise<BoardServerHandle> {
  const token = randomBytes(24).toString("hex");
  let actualPort = port;
  let dead = false;
  const openSockets = new Set<Socket>();

  const server: Server = createServer(async (req, res) => {
    try {
      if (!isAllowedHost(req.headers.host, actualPort)) {
        return sendJson(res, 403, { ok: false, error: "Forbidden host" });
      }
      if (!isAllowedOrigin(req.headers.origin, actualPort)) {
        return sendJson(res, 403, { ok: false, error: "Forbidden origin" });
      }

      const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${actualPort}`);

      if (req.method === "GET" && reqUrl.pathname === "/api/swarm") {
        if (!hasValidBearer(req, token)) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized" });
        }
        const swarmIdParam = reqUrl.searchParams.get("swarmId");
        const conversationIdParam = reqUrl.searchParams.get("conversationId");
        const etagParam = reqUrl.searchParams.get("etag");
        const activeSwarms = deps.db.getActiveSwarms();
        const convMember = conversationIdParam ? deps.db.getLatestMemberBySession(conversationIdParam) : undefined;
        const swarm = swarmIdParam
          ? deps.db.getSwarm(swarmIdParam)
          : convMember
            ? deps.db.getSwarm(convMember.swarm_id)
            : activeSwarms[0];

        if (!swarm) {
          return sendJson(res, 200, { swarm: null });
        }

        const members = deps.db.listMembers(swarm.id, true);
        const channels = deps.db.listChannels(swarm.id);
        const { posts: rawPosts, hasMore } = deps.db.getLatestPostsWindow(swarm.id, 500, "*");
        const latestPost = deps.db.getLatestPost(swarm.id);
        const head = latestPost ? latestPost.swarm_seq : 0;

        let unseen: number[] = [];
        let posts = rawPosts;
        if (convMember && convMember.role !== "coordinator" && convMember.role !== "monitor" && convMember.role !== "narrator") {
          const allowedChannels = new Set(deps.db.getMemberChannels(swarm.id, convMember.id));
          unseen = rawPosts
            .filter((p) => p.channel !== "main" && !allowedChannels.has(p.channel))
            .map((p) => p.swarm_seq);
          posts = rawPosts.filter((p) => p.channel === "main" || allowedChannels.has(p.channel));
        }

        const postCounts = new Map<string, number>();
        const edgeMap = new Map<string, { from: string; to: string; count: number; viaAll: boolean }>();
        for (const p of posts) {
          postCounts.set(p.author_name, (postCounts.get(p.author_name) ?? 0) + 1);
          const mentions = safeParseStringArray(p.mentions_json);
          if (p.is_all === 1) {
            for (const m of members) {
              if (m.name === p.author_name || m.role === "monitor" || m.role === "narrator") continue;
              const key = `${p.author_name}->${m.name}`;
              const cur = edgeMap.get(key) ?? { from: p.author_name, to: m.name, count: 0, viaAll: true };
              cur.count += 1;
              edgeMap.set(key, cur);
            }
          }
          for (const target of mentions) {
            const key = `${p.author_name}->${target}`;
            const cur = edgeMap.get(key) ?? { from: p.author_name, to: target, count: 0, viaAll: false };
            cur.count += 1;
            cur.viaAll = false;
            edgeMap.set(key, cur);
          }
        }

        const catalog = await deps.getAvailableModels();
        const swarmDir = deps.db.getSwarmDir(swarm.id);
        const viewJson = readJsonFileSafe(join(swarmDir, "view.json"));
        const planJson = readJsonFileSafe(join(swarmDir, "plan.json"));
        const rawBoardText = readTextTailSafe(join(swarmDir, "board.jsonl"));

        const payload = {
          conversationId: conversationIdParam ?? "",
          member: convMember?.name ?? null,
          swarm: swarm.id,
          id: swarm.id,
          title: swarm.title,
          objective: swarm.objective,
          status: swarm.status,
          head,
          hasMore,
          unseen,
          graphTab: true,
          rawTab: true,
          builtinOverview: true,
          systemAttention: [],
          channels: channels.filter((c) => c.name !== "main"),
          members: members.map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role,
            addedBy: m.added_by,
            status: m.state,
            state: m.state,
            killed: m.state === "killed",
            conversation_id: m.session_id,
            local: true,
            pausedQuota: m.paused_quota === 1,
            lastError: m.last_error,
            model: m.model_provider && m.model_id ? `${m.model_provider}/${m.model_id}` : null,
            variant: m.model_variant,
            workspaceMode: m.workspace_mode,
            workspaceDir: m.workspace_dir,
            channels: deps.db.getMemberChannels(swarm.id, m.id),
            wakeMode: m.wake_mode,
            steps: m.steps,
            posts: postCounts.get(m.name) ?? 0,
            activity: m.activity,
            unread: Math.max(0, head - m.last_read_seq),
            lastReadSeq: m.last_read_seq,
            lastPostSeq: m.last_post_seq,
          })),
          messages: posts.map((p) => {
            const mentions = safeParseStringArray(p.mentions_json);
            const channelMentions = safeParseStringArray(p.channel_mentions_json);
            return {
              seq: p.swarm_seq,
              channel: p.channel,
              agent: p.author_name,
              author: p.author_name,
              mentions,
              via_channel: channelMentions,
              channelMentions,
              all: p.is_all === 1,
              isAll: p.is_all === 1,
              text: p.body,
              time: new Date(p.created_at).toISOString(),
            };
          }),
          edges: Array.from(edgeMap.values()),
          view: viewJson,
          plan: planJson,
          dir: swarmDir,
          raw: rawBoardText,
          availableModels: catalog.models,
          roleModels: deps.getRoleModelDefaults(),
        };

        const etag = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
        if (etagParam && etagParam === etag) {
          return sendJson(res, 200, {
            swarm: swarm.id,
            unchanged: true,
            etag,
            member: convMember?.name ?? null,
          });
        }
        return sendJson(res, 200, { ...payload, etag });
      }

      if (req.method === "POST" && (reqUrl.pathname === "/api/member/model" || reqUrl.pathname === "/api/role-models")) {
        if (!hasValidBearer(req, token)) {
          return sendJson(res, 401, { ok: false, error: "Unauthorized" });
        }
        const contentType = req.headers["content-type"] ?? "";
        if (!contentType.toLowerCase().startsWith("application/json")) {
          return sendJson(res, 415, { ok: false, error: "Content-Type must be application/json" });
        }

        const body = await readBodyJson(req);
        if (reqUrl.pathname === "/api/member/model") {
          const swarmId = String(body.swarmId ?? "");
          const name = String(body.name ?? "");
          const target = deps.db.getMemberByName(swarmId, name);
          if (target?.role === "coordinator") {
            return sendJson(res, 403, { ok: false, error: "Coordinator model cannot be switched via board HTTP endpoint." });
          }
          const model = typeof body.model === "string" ? body.model : undefined;
          const variant = typeof body.variant === "string" ? body.variant : undefined;
          const result = await deps.switchMemberModel(swarmId, name, model, variant);
          return sendJson(res, 200, { ok: true, result });
        }

        const role = String(body.role ?? "") as MemberRole;
        const spec = String(body.spec ?? "");
        deps.setRoleModelDefault(role, spec);
        return sendJson(res, 200, { ok: true, roleModels: deps.getRoleModelDefaults() });
      }

      if (req.method === "GET" && reqUrl.pathname === "/preload.js") {
        res.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": CSP_HEADER,
        });
        res.end(PRELOAD_JS);
        return;
      }

      if (req.method === "GET") {
        const relPath = reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname.replace(/^\/+/, "");
        const safeRel = normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, "");
        const filePath = join(ASSETS_DIR, safeRel);
        if (filePath.startsWith(ASSETS_DIR) && existsSync(filePath)) {
          const ext = extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] ?? "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": mime,
            "Cache-Control": "no-store",
            "Content-Security-Policy": CSP_HEADER,
          });
          res.end(readFileSync(filePath));
          return;
        }
      }

      res.writeHead(404, { "Content-Security-Policy": CSP_HEADER });
      res.end("Not found");
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      sendJson(res, status, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.on("connection", (socket: Socket) => {
    openSockets.add(socket);
    socket.once("close", () => openSockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onStartupError = (err: Error) => {
      dead = true;
      reject(err);
    };
    server.once("error", onStartupError);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onStartupError);
      server.on("error", (err) => {
        dead = true;
        console.error("[opencode-swarm] board-server error:", err);
      });
      server.on("close", () => {
        dead = true;
      });
      resolve();
    });
  });

  const addr = server.address();
  actualPort = typeof addr === "object" && addr ? addr.port : port;
  return {
    port: actualPort,
    token,
    url: `http://127.0.0.1:${actualPort}/?token=${token}`,
    isAlive: () => !dead,
    close: () => {
      dead = true;
      for (const socket of openSockets) {
        try {
          socket.destroy();
        } catch {
          // Ignore socket destroy error
        }
      }
      openSockets.clear();
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
