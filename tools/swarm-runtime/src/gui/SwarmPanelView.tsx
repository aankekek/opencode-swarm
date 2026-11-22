import type { DialogHandle } from "@opencode/plugin/gui";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { SwarmGuiContext, SwarmSnapshot, SwarmSummary } from "./types.js";

export interface SwarmPanelViewProps {
  ctx: SwarmGuiContext;
  snapshot: () => SwarmSnapshot | null;
  swarms: () => SwarmSummary[];
  selectedSwarmId: () => string | null;
  sessionId?: () => string | undefined;
  onSelectSwarm: (id: string) => void;
  onRefresh: () => void;
  onCompleteSwarm: (swarmId: string) => Promise<void>;
  onOpenSettings?: () => void;
  rpcError?: () => string | undefined;
  server?: unknown;
}

export default function SwarmPanelView(props: SwarmPanelViewProps) {
  const { Button, Dialog } = props.ctx.ui;
  const [reloadNonce, setReloadNonce] = createSignal(0);
  let iframeRef: HTMLIFrameElement | undefined;

  const boardBaseUrl = createMemo(() => props.snapshot()?.boardUrl ?? "");
  const activeSwarmId = createMemo(() => props.selectedSwarmId() ?? props.snapshot()?.swarmId ?? "");

  const iframeSrc = createMemo(() => {
    const base = boardBaseUrl();
    if (!base) return "";
    const swarmId = activeSwarmId();
    const convId = props.sessionId?.() ?? "";
    const nonce = reloadNonce();
    try {
      const url = new URL(base);
      if (swarmId) url.searchParams.set("swarmId", swarmId);
      if (convId) url.searchParams.set("conversationId", convId);
      if (nonce > 0) url.searchParams.set("_r", String(nonce));
      return url.toString();
    } catch {
      return base;
    }
  });

  const expectedOrigin = createMemo(() => {
    const src = iframeSrc();
    if (!src) return "";
    try {
      return new URL(src).origin;
    } catch {
      return "";
    }
  });

  const syncThemeToIframe = () => {
    const win = iframeRef?.contentWindow;
    const targetOrigin = expectedOrigin();
    if (!win || !targetOrigin) return;
    const mode = props.ctx.appearance.mode();
    const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
    const readVar = (name: string) => cs?.getPropertyValue(name).trim() || "";
    const tokens: Record<string, string> = {};
    const map: Array<[string, string]> = [
      ["--background", "--background-base"],
      ["--card", "--surface-raised-base"],
      ["--secondary", "--surface-base-hover"],
      ["--foreground", "--text-strong"],
      ["--secondary-foreground", "--text-base"],
      ["--muted-foreground", "--text-weak"],
      ["--border", "--border-weak-base"],
      ["--card-border", "--border-weak-base"],
      ["--primary", "--text-interactive-base"],
      ["--sw-success", "--icon-success-base"],
      ["--sw-warning", "--icon-warning-base"],
      ["--sw-error", "--icon-critical-base"],
      ["--font-family", "--font-family-sans"],
      ["--editor-font-family", "--font-family-mono"],
    ];
    for (const [dest, src] of map) {
      const val = readVar(src);
      if (val) tokens[dest] = val;
    }
    win.postMessage({ type: "swarm:theme", mode, tokens }, targetOrigin);
  };

  createEffect(() => {
    props.ctx.appearance.mode();
    syncThemeToIframe();
  });

  if (typeof window !== "undefined") {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef?.contentWindow) return;
      const origin = expectedOrigin();
      if (origin && event.origin !== origin) return;
      const data = event.data as { type?: string; sessionID?: string } | null;
      if (data?.type === "swarm:open_session" && typeof data.sessionID === "string" && data.sessionID) {
        if (!props.server) {
          props.ctx.toast.show({ title: "No server context for member session" });
          return;
        }
        props.ctx.tabs.open({ server: props.server as never, id: data.sessionID }, { focus: true });
      }
    };
    window.addEventListener("message", onMessage);
    onCleanup(() => window.removeEventListener("message", onMessage));
  }

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
          value={activeSwarmId()}
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
        <Button
          size="small"
          variant="ghost"
          onClick={() => {
            props.onRefresh();
            setReloadNonce((n) => n + 1);
          }}
        >
          Refresh
        </Button>
        <Show when={props.snapshot()?.status === "running"}>
          <Button size="small" variant="neutral" onClick={confirmCompleteSwarm}>
            Complete
          </Button>
        </Show>
        <Show when={props.onOpenSettings}>
          <Button size="small" variant="ghost" onClick={() => props.onOpenSettings?.()}>
            Settings
          </Button>
        </Show>
      </div>

      <Show
        when={iframeSrc()}
        fallback={
          <div class="swarm-gui-empty">
            {props.rpcError?.() ?? "No swarm active in this workspace. Run /swarm <task> to start one."}
          </div>
        }
      >
        <iframe
          ref={(el) => {
            iframeRef = el;
          }}
          class="swarm-gui-iframe"
          src={iframeSrc()}
          title="Swarm Board"
          onLoad={() => syncThemeToIframe()}
        />
      </Show>
    </div>
  );
}
