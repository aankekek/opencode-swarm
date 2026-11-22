import type { DialogHandle } from "@opencode/plugin/gui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { SwarmGuiContext, SwarmMember, SwarmSnapshot, SwarmSummary } from "./types.js";

export interface SwarmPanelViewProps {
  ctx: SwarmGuiContext;
  snapshot: () => SwarmSnapshot | null;
  swarms: () => SwarmSummary[];
  selectedSwarmId: () => string | null;
  onSelectSwarm: (id: string) => void;
  onRefresh: () => void;
  onKillMember: (swarmId: string, handle: string) => Promise<void>;
  onCompleteSwarm: (swarmId: string) => Promise<void>;
  server?: unknown;
}

function renderHighlightedBody(body: string) {
  const parts = body.split(/(@[a-zA-Z0-9_-]+)/g);
  return (
    <For each={parts}>
      {(part) =>
        part.startsWith("@") ? (
          <span class="swarm-gui-mention">{part}</span>
        ) : (
          <span>{part}</span>
        )
      }
    </For>
  );
}

function memberDotClass(state: string): string {
  const s = state.toLowerCase();
  if (s === "working" || s === "active") return "swarm-gui-dot swarm-gui-dot-working";
  if (s === "waiting" || s === "idle") return "swarm-gui-dot swarm-gui-dot-waiting";
  if (s.includes("paused") || s.includes("quota") || s === "stalled") {
    return "swarm-gui-dot swarm-gui-dot-paused";
  }
  return "swarm-gui-dot swarm-gui-dot-killed";
}

export default function SwarmPanelView(props: SwarmPanelViewProps) {
  const { Button, Dialog } = props.ctx.ui;

  const [subTab, setSubTab] = createSignal("board");
  const [webView, setWebView] = createSignal(false);
  const [handleFilter, setHandleFilter] = createSignal("");
  const [autoScroll, setAutoScroll] = createSignal(true);
  let boardScrollRef: HTMLDivElement | undefined;

  const filteredPosts = createMemo(() => {
    const snap = props.snapshot();
    if (!snap) return [];
    const q = handleFilter().trim().toLowerCase();
    if (!q) return snap.posts;
    return snap.posts.filter(
      (p) =>
        p.author.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        (p.mentions ?? []).some((m) => m.toLowerCase().includes(q))
    );
  });

  createEffect(() => {
    filteredPosts();
    if (autoScroll() && boardScrollRef) {
      boardScrollRef.scrollTop = boardScrollRef.scrollHeight;
    }
  });

  const openMemberSession = (member: SwarmMember) => {
    const sessionId = member.session_id ?? member.sessionId;
    if (!sessionId) {
      props.ctx.toast.show({ title: `No session linked for ${member.handle}` });
      return;
    }
    const server = member.server ?? props.server;
    if (!server) {
      props.ctx.toast.show({ title: `No server context for ${member.handle}` });
      return;
    }
    props.ctx.tabs.open({ server: server as never, id: sessionId }, { focus: true });
  };

  const confirmKillMember = (member: SwarmMember, e: MouseEvent) => {
    e.stopPropagation();
    const swarmId = props.snapshot()?.swarmId;
    if (!swarmId) return;
    props.ctx.dialogs.open((dialog: DialogHandle) => (
      <Dialog title={`Kill ${member.handle}?`}>
        <div style={{ padding: "12px 16px", display: "flex", "flex-direction": "column", gap: "12px" }}>
          <div>
            This permanently terminates <strong>{member.handle}</strong> and releases its locks.
          </div>
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px" }}>
            <Button variant="ghost" onClick={() => dialog.close()}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await props.onKillMember(swarmId, member.handle);
                dialog.close();
              }}
            >
              Kill Member
            </Button>
          </div>
        </div>
      </Dialog>
    ));
  };

  const confirmCompleteSwarm = () => {
    const snap = props.snapshot();
    if (!snap) return;
    props.ctx.dialogs.open((dialog: DialogHandle) => (
      <Dialog title="Complete Swarm?">
        <div style={{ padding: "12px 16px", display: "flex", "flex-direction": "column", gap: "12px" }}>
          <div>
            Mark swarm <strong>{snap.title || snap.swarmId}</strong> as completed?
          </div>
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px" }}>
            <Button variant="ghost" onClick={() => dialog.close()}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await props.onCompleteSwarm(snap.swarmId);
                dialog.close();
              }}
            >
              Complete Swarm
            </Button>
          </div>
        </div>
      </Dialog>
    ));
  };

  return (
    <div class="swarm-gui-panel">
      <div class="swarm-gui-header">
        <select
          class="swarm-gui-select"
          value={props.selectedSwarmId() ?? props.snapshot()?.swarmId ?? ""}
          onChange={(e) => props.onSelectSwarm(e.currentTarget.value)}
        >
          <Show when={props.swarms().length === 0}>
            <option value={props.snapshot()?.swarmId ?? ""}>
              {props.snapshot()?.title ?? "No active swarm"}
            </option>
          </Show>
          <For each={props.swarms()}>
            {(s) => (
              <option value={s.id}>
                {s.title || s.id} ({s.status})
              </option>
            )}
          </For>
        </select>
        <Button size="small" variant="ghost" onClick={() => props.onRefresh()}>
          Refresh
        </Button>
        <Show when={props.snapshot()?.boardUrl}>
          <Button size="small" variant={webView() ? "contrast" : "ghost"} onClick={() => setWebView(!webView())}>
            Pixel-Bee Web View
          </Button>
        </Show>
      </div>

      <Show
        when={!webView() || !props.snapshot()?.boardUrl}
        fallback={<iframe class="swarm-gui-iframe" src={props.snapshot()?.boardUrl} title="Swarm Board Web View" />}
      >
        <div style={{ display: "flex", "flex-direction": "column", flex: 1, "min-height": 0 }}>
          <div class="swarm-gui-toolbar">
            <Button size="small" variant={subTab() === "board" ? "contrast" : "ghost"} onClick={() => setSubTab("board")}>
              Board ({props.snapshot()?.posts.length ?? 0})
            </Button>
            <Button size="small" variant={subTab() === "members" ? "contrast" : "ghost"} onClick={() => setSubTab("members")}>
              Members ({props.snapshot()?.members.length ?? 0})
            </Button>
            <Button size="small" variant={subTab() === "locks" ? "contrast" : "ghost"} onClick={() => setSubTab("locks")}>
              Locks / Graph ({props.snapshot()?.locks.length ?? 0})
            </Button>
          </div>

          <Show when={subTab() === "board"}>
            <div class="swarm-gui-toolbar">
              <input
                class="swarm-gui-input"
                type="text"
                placeholder="Filter by @handle or text..."
                value={handleFilter()}
                onInput={(e) => setHandleFilter(e.currentTarget.value)}
              />
              <Button size="small" variant={autoScroll() ? "neutral" : "ghost"} onClick={() => setAutoScroll(!autoScroll())}>
                {autoScroll() ? "Auto-scroll: On" : "Auto-scroll: Off"}
              </Button>
            </div>
            <div class="swarm-gui-scroll" ref={boardScrollRef}>
              <For each={filteredPosts()}>
                {(post) => (
                  <div class="swarm-gui-post">
                    <div class="swarm-gui-post-head">
                      <span class="swarm-gui-author">@{post.author.replace(/^@/, "")}</span>
                      <span class="swarm-gui-time">{post.createdAt ?? post.created_at ?? ""}</span>
                    </div>
                    <div class="swarm-gui-post-body">{renderHighlightedBody(post.body)}</div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={subTab() === "members"}>
            <div class="swarm-gui-toolbar" style={{ "justify-content": "space-between" }}>
              <span>Click a member to open its session</span>
              <Show when={props.snapshot()?.status !== "completed"}>
                <Button size="small" variant="neutral" onClick={confirmCompleteSwarm}>
                  Complete Swarm
                </Button>
              </Show>
            </div>
            <div class="swarm-gui-scroll">
              <For each={props.snapshot()?.members ?? []}>
                {(member) => (
                  <div class="swarm-gui-member" onClick={() => openMemberSession(member)}>
                    <div class="swarm-gui-member-head">
                      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                        <span class={memberDotClass(member.state)} />
                        <span class="swarm-gui-author">@{member.handle.replace(/^@/, "")}</span>
                        <span class="swarm-gui-time">[{member.state}]</span>
                      </div>
                      <Show when={member.handle !== "coordinator" && member.state !== "killed"}>
                        <Button size="small" variant="ghost" onClick={(e: MouseEvent) => confirmKillMember(member, e)}>
                          Kill
                        </Button>
                      </Show>
                    </div>
                    <div class="swarm-gui-meta">
                      <Show when={member.model}>
                        <span>
                          {member.model}
                          {member.variant ? ` (${member.variant})` : ""}
                        </span>
                      </Show>
                      <Show when={member.trackStatus}>
                        <span>· {member.trackStatus}</span>
                      </Show>
                    </div>
                    <Show when={(member.ownedGlobs ?? []).length > 0}>
                      <div class="swarm-gui-meta">Owns: {(member.ownedGlobs ?? []).join(", ")}</div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={subTab() === "locks"}>
            <div class="swarm-gui-scroll">
              <table class="swarm-gui-table">
                <thead>
                  <tr>
                    <th>Glob</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={props.snapshot()?.locks ?? []}>
                    {(lock) => (
                      <tr>
                        <td>{lock.glob}</td>
                        <td>@{lock.owner.replace(/^@/, "")}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={(props.snapshot()?.handoffs ?? []).length > 0}>
                <div style={{ "margin-top": "8px", "font-weight": 600 }}>Mention / Handoff Flow</div>
                <For each={props.snapshot()?.handoffs ?? []}>
                  {(h) => (
                    <div class="swarm-gui-meta">
                      <span>@{h.from.replace(/^@/, "")}</span>
                      <span>→</span>
                      <span>@{h.to.replace(/^@/, "")}</span>
                      <Show when={h.summary}>
                        <span>({h.summary})</span>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
