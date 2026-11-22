import { Command, MenuItem, Panel, Plugin, TitlebarItem, type PanelTab } from "@opencode/plugin/gui";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { SWARM_RPC_DEF, type SwarmBoardInfo } from "./rpc.js";

export default Plugin.define({
  setup(ctx) {
    const openSwarmPanel = () => {
      const session = ctx.sessions.current();
      if (!session) {
        ctx.toast.show({ title: "Open a session first to view the Swarm Board." });
        return;
      }
      ctx.layout.open(`${ctx.id}:swarm`, session);
    };

    ctx.add(TitlebarItem, () => ({
      id: "swarm-open",
      label: "Swarm",
      title: "Open Swarm Board",
      run: openSwarmPanel,
    }));

    ctx.add(MenuItem, () => ({
      menu: "session.panel" as const,
      id: "open-swarm",
      title: "Swarm",
      description: "Open live Swarm Board",
      run: openSwarmPanel,
    }));

    ctx.add(Command, () => ({
      id: "open",
      title: "Open Swarm Board",
      description: "Open the live Antigravity-style Swarm Board side panel",
      group: "Swarm",
      section: "navigation" as const,
      bind: "mod+shift+s",
      slash: { name: "swarm-board" },
      run: openSwarmPanel,
    }));

    const swarmTab: PanelTab = {
      id: "swarm",
      title: "Swarm",
      closable: "hover",
    };

    ctx.add(Panel, () => ({
      id: "board",
      region: "side" as const,
      width: 480,
      list({ open }) {
        return open.includes("swarm") ? [swarmTab] : [];
      },
      render(props) {
        const [info, setInfo] = createSignal<SwarmBoardInfo | null>(null);
        const [error, setError] = createSignal<string | null>(null);
        const [loading, setLoading] = createSignal(true);

        const refresh = async () => {
          setLoading(true);
          setError(null);
          try {
            const res = (await (props.session.server.client.rpc.call as (args: unknown) => Promise<unknown>)({
              id: SWARM_RPC_DEF.id,
              method: "getBoardInfo",
              input: {},
            })) as SwarmBoardInfo;
            setInfo(res);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setLoading(false);
          }
        };

        createEffect(() => {
          void props.session.id;
          void refresh();
        });

        const onMessage = (event: MessageEvent) => {
          const current = info();
          if (!current?.url) return;
          try {
            const expectedOrigin = new URL(current.url).origin;
            if (event.origin !== expectedOrigin) return;
          } catch {
            return;
          }
          const data = event.data as { type?: string; sessionID?: string } | null;
          if (data?.type === "swarm:open_session" && typeof data.sessionID === "string" && data.sessionID) {
            ctx.tabs.open({ server: props.session.server.id, id: data.sessionID }, { focus: true });
          }
        };

        window.addEventListener("message", onMessage);
        onCleanup(() => window.removeEventListener("message", onMessage));

        return (
          <div style={{ display: "flex", "flex-direction": "column", width: "100%", height: "100%" }}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                padding: "6px 10px",
                "border-bottom": "1px solid var(--border-weak-base, rgba(128,128,128,0.2))",
                "font-size": "12px",
                gap: "8px",
              }}
            >
              <span style={{ "font-weight": "600" }}>
                {info()?.title || "Swarm Board"} {info()?.status ? `(${info()!.status})` : ""}
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button type="button" onClick={() => void refresh()}>
                  Refresh
                </button>
                <Show when={info()?.url}>
                  <button type="button" onClick={() => ctx.system.openExternal(info()!.url)}>
                    Open in Browser
                  </button>
                </Show>
              </div>
            </div>
            <Show
              when={!loading() && info()?.url}
              fallback={
                <div style={{ padding: "16px", "font-size": "13px", opacity: 0.8 }}>
                  {loading() ? "Connecting to Swarm Board..." : error() || "No active swarm board server."}
                </div>
              }
            >
              <iframe
                src={info()!.url}
                style={{ width: "100%", height: "100%", border: "0", flex: "1" }}
                title="Swarm Board"
              />
            </Show>
          </div>
        );
      },
    }));
  },
});
