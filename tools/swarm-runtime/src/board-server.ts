import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
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
  close: () => Promise<void>;
}

function readJsonFileSafe(filePath: string): unknown {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > 65_536) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readBodyJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export async function startBoardServer(deps: BoardServerDeps, port = 0): Promise<BoardServerHandle> {
  const server: Server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");

      if (req.method === "GET" && reqUrl.pathname === "/api/swarm") {
        const swarmIdParam = reqUrl.searchParams.get("swarmId");
        const etagParam = reqUrl.searchParams.get("etag");
        const activeSwarms = deps.db.getActiveSwarms();
        const swarm = swarmIdParam ? deps.db.getSwarm(swarmIdParam) : activeSwarms[0];

        if (!swarm) {
          return sendJson(res, 200, { swarm: null });
        }

        const members = deps.db.listMembers(swarm.id, true);
        const channels = deps.db.listChannels(swarm.id);
        const { posts } = deps.db.getPostsPage(swarm.id, 0, 500, "*");
        const head = posts.length > 0 ? posts[posts.length - 1].swarm_seq : 0;

        // Build mention graph edges
        const edgeMap = new Map<string, { from: string; to: string; count: number; viaAll: boolean }>();
        for (const p of posts) {
          const mentions = JSON.parse(p.mentions_json) as string[];
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

        const payload = {
          id: swarm.id,
          title: swarm.title,
          objective: swarm.objective,
          status: swarm.status,
          head,
          channels,
          members: members.map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role,
            addedBy: m.added_by,
            state: m.state,
            pausedQuota: m.paused_quota === 1,
            lastError: m.last_error,
            model: m.model_provider && m.model_id ? `${m.model_provider}/${m.model_id}` : null,
            variant: m.model_variant,
            workspaceMode: m.workspace_mode,
            workspaceDir: m.workspace_dir,
            channels: deps.db.getMemberChannels(swarm.id, m.id),
            wakeMode: m.wake_mode,
            steps: m.steps,
            activity: m.activity,
            unread: Math.max(0, head - m.last_read_seq),
            lastReadSeq: m.last_read_seq,
            lastPostSeq: m.last_post_seq,
          })),
          messages: posts.map((p) => ({
            seq: p.swarm_seq,
            channel: p.channel,
            author: p.author_name,
            mentions: JSON.parse(p.mentions_json),
            channelMentions: JSON.parse(p.channel_mentions_json),
            isAll: p.is_all === 1,
            text: p.body,
            time: new Date(p.created_at).toISOString(),
          })),
          edges: Array.from(edgeMap.values()),
          view: viewJson,
          plan: planJson,
          availableModels: catalog.models,
          roleModels: deps.getRoleModelDefaults(),
        };

        const etag = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
        if (etagParam && etagParam === etag) {
          return sendJson(res, 200, { swarm: swarm.id, unchanged: true, etag });
        }
        return sendJson(res, 200, { ...payload, etag });
      }

      if (req.method === "POST" && reqUrl.pathname === "/api/member/model") {
        const body = await readBodyJson(req);
        const swarmId = String(body.swarmId ?? "");
        const name = String(body.name ?? "");
        const model = typeof body.model === "string" ? body.model : undefined;
        const variant = typeof body.variant === "string" ? body.variant : undefined;
        const result = await deps.switchMemberModel(swarmId, name, model, variant);
        return sendJson(res, 200, { ok: true, result });
      }

      if (req.method === "POST" && reqUrl.pathname === "/api/role-models") {
        const body = await readBodyJson(req);
        const role = String(body.role ?? "") as MemberRole;
        const spec = String(body.spec ?? "");
        deps.setRoleModelDefault(role, spec);
        return sendJson(res, 200, { ok: true, roleModels: deps.getRoleModelDefaults() });
      }

      if (req.method === "GET" && reqUrl.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(BOARD_HTML);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

const BOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>OpenCode Swarm Board</title>
<style>
  :root {
    --bg: #0f1115; --fg: #e6e8ec; --muted: #8b93a1; --card: #161a22;
    --border: #252b36; --primary: #3b82f6; --green: #22c55e; --amber: #f59e0b; --red: #ef4444;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #fafafa; --fg: #18181b; --muted: #71717a; --card: #ffffff;
      --border: #e4e4e7; --primary: #2563eb; --green: #16a34a; --amber: #d97706; --red: #dc2626;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); font-size: 13px; }
  header { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); padding: 12px 16px; z-index: 10; }
  .title-row { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
  .title { font-size: 15px; font-weight: 600; }
  .meta { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .tabs { display: flex; gap: 14px; margin-top: 10px; border-bottom: 1px solid var(--border); }
  .tab { background: none; border: none; color: var(--muted); padding: 6px 2px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
  .tab.active { color: var(--fg); border-bottom-color: var(--primary); font-weight: 600; }
  main { max-width: 980px; margin: 0 auto; padding: 14px 16px 40px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .dot.working { background: var(--green); }
  .dot.waiting { border: 2px solid var(--green); }
  .dot.stopped { background: var(--amber); }
  .dot.killed { background: var(--muted); }
  .pill { font-size: 11px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
  .pill.mention { color: var(--primary); border-color: var(--primary); }
  .post { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .post-head { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
  .post-body { white-space: pre-wrap; line-height: 1.45; }
  select, input, button { font: inherit; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; }
  button.primary { background: var(--primary); color: #fff; border-color: var(--primary); cursor: pointer; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; margin: 0; }
  svg { width: 100%; height: 340px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; }
</style>
</head>
<body>
<header>
  <div class="title-row">
    <div>
      <div class="title" id="swarm-title">OpenCode Swarm Board</div>
      <div class="meta" id="swarm-meta">Waiting for active swarm...</div>
    </div>
    <span class="pill" id="live-pill">LIVE</span>
  </div>
  <div class="tabs">
    <button class="tab active" data-tab="overview">Overview</button>
    <button class="tab" data-tab="board">Board</button>
    <button class="tab" data-tab="members">Members</button>
    <button class="tab" data-tab="graph">Graph</button>
    <button class="tab" data-tab="raw">Raw</button>
  </div>
</header>
<main id="content"><div class="card">No active swarm found.</div></main>
<script>
let state = null;
let activeTab = 'overview';
let lastEtag = '';
let channelFilter = 'all';
let searchQuery = '';

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    render();
  });
});

async function poll() {
  try {
    const res = await fetch('/api/swarm?etag=' + encodeURIComponent(lastEtag));
    const data = await res.json();
    if (data.unchanged) return;
    if (data.swarm === null) {
      state = null;
      document.getElementById('swarm-title').textContent = 'No active swarm';
      document.getElementById('swarm-meta').textContent = 'Start a swarm with /swarm';
      render();
      return;
    }
    state = data;
    lastEtag = data.etag || '';
    document.getElementById('swarm-title').textContent = data.title + ' (' + data.id + ')';
    const working = data.members.filter(m => m.state === 'working').length;
    const waiting = data.members.filter(m => m.state === 'waiting').length;
    document.getElementById('swarm-meta').textContent = working + ' working · ' + waiting + ' waiting · #' + data.head + ' posts · ' + data.status;
    render();
  } catch (e) {}
}

async function switchModel(name, modelSpec, variant) {
  if (!state) return;
  await fetch('/api/member/model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ swarmId: state.id, name, model: modelSpec, variant: variant || undefined })
  });
  lastEtag = '';
  await poll();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function render() {
  const el = document.getElementById('content');
  if (!state) { el.innerHTML = '<div class="card">No active swarm.</div>'; return; }

  if (activeTab === 'overview') {
    const v = state.view;
    const p = state.plan;
    let html = '<div class="card"><strong>Objective</strong><div style="margin-top:6px">' + esc(state.objective) + '</div></div>';
    if (v && v.headline) {
      html += '<div class="card"><strong>Narrator Overview</strong><div>' + esc(v.headline) + '</div></div>';
    } else if (p && p.goal) {
      html += '<div class="card"><strong>' + esc(p.goal.title) + '</strong><div>' + esc(p.goal.line) + '</div></div>';
    }
    const alerts = state.members.filter(m => m.pausedQuota || m.lastError);
    if (alerts.length) {
      html += '<div class="card" style="border-color:var(--amber)"><strong>System Attention</strong>';
      for (const a of alerts) {
        html += '<div style="margin-top:6px">@' + esc(a.name) + ': ' + esc(a.pausedQuota ? 'Quota exhausted' : a.lastError) + '</div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
    return;
  }

  if (activeTab === 'board') {
    const chans = ['all', ...state.channels.map(c => c.name)];
    let html = '<div class="card row">';
    html += '<input id="q" placeholder="Search posts..." value="' + esc(searchQuery) + '" />';
    html += '<select id="ch">' + chans.map(c => '<option value="' + esc(c) + '"' + (c===channelFilter?' selected':'') + '>#' + esc(c) + '</option>').join('') + '</select>';
    html += '</div><div class="card" style="padding:0">';
    const filtered = state.messages.filter(m => (channelFilter==='all' || m.channel===channelFilter) && (!searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase())));
    for (const m of filtered) {
      html += '<div class="post"><div class="post-head"><span><strong>@' + esc(m.author) + '</strong> <span class="pill">#' + esc(m.channel) + '</span></span><span>#' + m.seq + ' · ' + esc(m.time.slice(11,19)) + '</span></div><div class="post-body">' + esc(m.text) + '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    document.getElementById('q').oninput = (e) => { searchQuery = e.target.value; render(); };
    document.getElementById('ch').onchange = (e) => { channelFilter = e.target.value; render(); };
    return;
  }

  if (activeTab === 'members') {
    let html = '';
    for (const m of state.members) {
      const models = state.availableModels || [];
      const curModel = m.model || '';
      const modelObj = models.find(x => x.spec === curModel);
      const variants = modelObj ? modelObj.variants : [];
      html += '<div class="card"><div class="row" style="justify-content:space-between">';
      html += '<div class="row"><span class="dot ' + esc(m.state) + '"></span><strong>@' + esc(m.name) + '</strong><span class="pill">' + esc(m.role) + '</span><span class="pill">' + esc(m.workspaceMode) + '</span></div>';
      html += '<div class="row">';
      html += '<select data-member="' + esc(m.name) + '" class="m-sel"><option value="">(inherited)</option>' + models.map(x => '<option value="' + esc(x.spec) + '"' + (x.spec===curModel?' selected':'') + '>' + esc(x.spec) + '</option>').join('') + '</select>';
      html += '<select data-member="' + esc(m.name) + '" class="v-sel"><option value="">(default variant)</option>' + variants.map(v => '<option value="' + esc(v) + '"' + (v===m.variant?' selected':'') + '>' + esc(v) + '</option>').join('') + '</select>';
      html += '</div></div>';
      html += '<div class="meta">state: ' + esc(m.state) + ' · steps: ' + m.steps + ' · unread: ' + m.unread + (m.activity ? ' · ' + esc(m.activity) : '') + '</div></div>';
    }
    el.innerHTML = html;
    document.querySelectorAll('.m-sel').forEach(sel => {
      sel.onchange = () => {
        const name = sel.dataset.member;
        if (sel.value) switchModel(name, sel.value, '');
      };
    });
    document.querySelectorAll('.v-sel').forEach(sel => {
      sel.onchange = () => {
        const name = sel.dataset.member;
        const mSel = document.querySelector('.m-sel[data-member="' + name + '"]');
        if (mSel && mSel.value) switchModel(name, mSel.value, sel.value);
      };
    });
    return;
  }

  if (activeTab === 'graph') {
    const nodes = state.members;
    const cx = 320, cy = 170, r = 120;
    const pos = {};
    nodes.forEach((n, i) => {
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      pos[n.name] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    let svg = '<svg viewBox="0 0 640 340">';
    for (const e of state.edges) {
      const p1 = pos[e.from], p2 = pos[e.to];
      if (!p1 || !p2) continue;
      svg += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="var(--primary)" stroke-opacity="0.5" stroke-width="' + Math.min(5, e.count) + '" />';
    }
    for (const n of nodes) {
      const p = pos[n.name];
      svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="18" fill="var(--bg)" stroke="var(--border)" stroke-width="2" />';
      svg += '<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" fill="var(--fg)" font-size="11">@' + esc(n.name) + '</text>';
    }
    svg += '</svg>';
    el.innerHTML = svg;
    return;
  }

  if (activeTab === 'raw') {
    el.innerHTML = '<div class="card"><pre>' + esc(JSON.stringify({ members: state.members, channels: state.channels, messages: state.messages }, null, 2)) + '</pre></div>';
  }
}

poll();
setInterval(poll, 2000);
</script>
</body>
</html>`;
