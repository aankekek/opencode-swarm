import {
  Command,
  ComposerPill,
  MenuItem,
  Panel,
  Plugin,
  SettingsPage,
  Slot,
  Style,
  TitlebarItem,
  type ComposerPillTone,
  type PanelTab,
} from "@opencode/plugin/gui";
import { createEffect, createMemo, createSignal, lazy, onCleanup, Show, Suspense } from "solid-js";
import { SWARM_GUI_STYLES } from "./gui/styles.js";
import { SwarmSettingsView } from "./gui/SwarmSettingsView.js";
import {
  DEFAULT_SWARM_SETTINGS,
  normalizeSwarmList,
  normalizeSwarmSnapshot,
  SwarmSettingsSchema,
  unwrapRpcOutput,
  type SwarmSettings,
  type SwarmSnapshot,
  type SwarmSummary,
} from "./gui/types.js";

const SwarmPanelView = lazy(() => import("./gui/SwarmPanelView.js"));

export default Plugin.define({
  setup(ctx) {
    const store = ctx.storage.store("swarm.settings", {
      schema: SwarmSettingsSchema,
      initial: DEFAULT_SWARM_SETTINGS,
    });

    const settings = () => store.value ?? DEFAULT_SWARM_SETTINGS;
    const updateSetting = <K extends keyof SwarmSettings>(key: K, value: SwarmSettings[K]) => {
      store.set({ ...settings(), [key]: value });
    };

    ctx.add(Style, () => SWARM_GUI_STYLES);

    const [swarms, setSwarms] = createSignal<SwarmSummary[]>([]);
    const [selectedSwarmId, setSelectedSwarmId] = createSignal<string | null>(null);
    const [snapshot, setSnapshot] = createSignal<SwarmSnapshot | null>(null);
    const [wantedSessions, setWantedSessions] = createSignal<Set<string>>(new Set());

    let lastPausedQuota = false;
    let lastVerifierStatus = "";
    let lastStalled = false;
    let lastCompletedId = "";
    let lastMonitorPostId: string | number | null = null;

    const markWanted = (sessionKey: string, wanted: boolean) => {
      setWantedSessions((prev) => {
        const next = new Set(prev);
        if (wanted) next.add(sessionKey);
        else next.delete(sessionKey);
        return next;
      });
    };

    const callSwarmRpc = async <T,>(method: string, input: Record<string, unknown> = {}): Promise<T | null> => {
      const session = ctx.sessions.current();
      if (!session) return null;
      const res = await session.server.client.rpc.call({
        rpcID: "local.swarm-runtime",
        method,
        location: session.location,
        input: input as never,
      });
      return unwrapRpcOutput<T>(res);
    };

    const maybeNotify = (snap: SwarmSnapshot) => {
      if (!settings().toastEnabled) return;

      const paused = Boolean(snap.pausedQuota ?? snap.paused_quota);
      if (paused && !lastPausedQuota) {
        ctx.toast.show({
          title: "Swarm paused on quota",
          description: snap.title || snap.swarmId,
          variant: "error",
        });
      }
      lastPausedQuota = paused;

      const verifier = (snap.verifierStatus ?? "").toUpperCase();
      if ((verifier === "PASS" || verifier === "FAIL") && verifier !== lastVerifierStatus) {
        ctx.toast.show({
          title: `@verifier ${verifier}`,
          description: snap.title || snap.swarmId,
          variant: verifier === "PASS" ? "success" : "error",
        });
      }
      lastVerifierStatus = verifier;

      const latestMonitor = [...snap.posts]
        .reverse()
        .find((p) => p.author.replace(/^@/, "").toLowerCase() === "monitor");
      if (snap.stalled && !lastStalled) {
        ctx.toast.show({
          title: "@monitor stall nudge",
          description: latestMonitor?.body ?? "Swarm appears stalled",
        });
      } else if (latestMonitor && latestMonitor.id !== lastMonitorPostId && lastMonitorPostId !== null) {
        ctx.toast.show({
          title: "@monitor stall nudge",
          description: latestMonitor.body,
        });
      }
      lastStalled = Boolean(snap.stalled);
      if (latestMonitor) lastMonitorPostId = latestMonitor.id;

      if (snap.status === "completed" && lastCompletedId !== snap.swarmId) {
        lastCompletedId = snap.swarmId;
        ctx.toast.show({
          title: "Swarm completed",
          description: snap.title || snap.swarmId,
          variant: "success",
        });
      }
    };

    const refresh = async () => {
      try {
        const rawList = await callSwarmRpc<unknown>("listSwarms");
        const list = normalizeSwarmList(rawList);
        if (list.length > 0) {
          setSwarms(list);
          if (!selectedSwarmId()) {
            setSelectedSwarmId(list[0].id);
          }
        }
        const targetId = selectedSwarmId();
        const sessionId = ctx.sessions.current()?.id;
        const rawSnap = await callSwarmRpc<unknown>(
          "getSwarmSnapshot",
          targetId ? { swarmId: targetId } : sessionId ? { sessionId } : {}
        );
        const snap = normalizeSwarmSnapshot(rawSnap);
        if (snap) {
          setSnapshot(snap);
          maybeNotify(snap);
        }
      } catch {
        // Ignore transient RPC errors during startup or when no swarm is active
      }
    };

    createEffect(() => {
      selectedSwarmId();
      void ctx.sessions.current()?.id;
      void refresh();
    });

    const unlisten = (ctx as unknown as { events?: { on?: (event: string, fn: () => void) => () => void } }).events?.on?.(
      "rpc.local.swarm-runtime.changed",
      () => {
        void refresh();
      }
    );
    const pollTimer = setInterval(() => {
      void refresh();
    }, 4000);
    onCleanup(() => {
      unlisten?.();
      clearInterval(pollTimer);
    });

    const counts = createMemo(() => {
      const snap = snapshot();
      if (!snap) return { active: 0, waiting: 0, posts: 0, paused: false, stalled: false };
      let active = 0;
      let waiting = 0;
      for (const m of snap.members) {
        const s = m.state.toLowerCase();
        if (s === "working" || s === "active") active++;
        else if (s === "waiting" || s === "idle") waiting++;
      }
      return {
        active,
        waiting,
        posts: snap.posts.length,
        paused: Boolean(snap.pausedQuota ?? snap.paused_quota),
        stalled: Boolean(snap.stalled),
      };
    });

    const openSwarmPanel = (toggleIfVisible = false) => {
      if (!settings().sidebarShow) {
        ctx.toast.show({ title: "Swarm side tab is disabled in Swarm Board settings." });
        return;
      }
      const session = ctx.sessions.current();
      if (!session) {
        ctx.toast.show({ title: "Open a session first to view the Swarm Board." });
        return;
      }
      const key = `${ctx.id}:swarm`;
      if (toggleIfVisible && ctx.layout.state(key, session) === "visible") {
        ctx.layout.hide(key, session);
        return;
      }
      markWanted(session.key, true);
      ctx.layout.open(key, session);
    };

    ctx.add(SettingsPage, () => ({
      id: "swarm-board",
      title: "Swarm Board",
      render: () => <SwarmSettingsView ctx={ctx} settings={settings} updateSetting={updateSetting} />,
    }));

    ctx.add(TitlebarItem, () => {
      if (!settings().pillbarShow) return undefined;
      const session = ctx.sessions.current();
      const pressed = session ? ctx.layout.state(`${ctx.id}:swarm`, session) === "visible" : false;
      const c = counts();
      const warn = c.paused || c.stalled ? " ⚠" : "";
      return {
        id: "swarm-open",
        label: `Swarm: ${c.active} active · ${c.waiting} waiting · ${c.posts} posts${warn}`,
        title: c.paused
          ? "Swarm paused on quota — click to open Swarm Board"
          : c.stalled
            ? "Swarm stalled — click to open Swarm Board"
            : "Open Swarm Board",
        pressed,
        run: () => openSwarmPanel(true),
      };
    });

    ctx.add(ComposerPill, () => {
      if (!settings().composerPill) return undefined;
      const snap = snapshot();
      if (!snap) return undefined;
      const c = counts();
      const activeHandles = snap.members
        .filter((m) => ["working", "active"].includes(m.state.toLowerCase()))
        .map((m) => `@${m.handle.replace(/^@/, "")}`);
      const verifier = (snap.verifierStatus ?? "").toUpperCase();
      let tone: ComposerPillTone = "success";
      if (c.paused || verifier === "FAIL") tone = "danger";
      else if (c.stalled) tone = "warning";
      const label =
        activeHandles.length > 0
          ? `${activeHandles.slice(0, 3).join(", ")}${activeHandles.length > 3 ? ` +${activeHandles.length - 3}` : ""}`
          : verifier
            ? `Verifier: ${verifier}`
            : `Swarm: ${snap.status}`;
      return {
        id: "swarm-composer-pill",
        show: () => ({
          label,
          tone,
          run: () => openSwarmPanel(false),
        }),
      };
    });

    ctx.add(Slot, () => {
      if (!settings().bottomStrip) return undefined;
      const session = ctx.sessions.current();
      const sideVisible = session ? ctx.layout.state(`${ctx.id}:swarm`, session) === "visible" : false;
      if (sideVisible && !settings().withSidePanel) return undefined;
      const c = counts();
      const snap = snapshot();
      return {
        at: "window.bottom" as const,
        render: () => (
          <div
            class="swarm-gui-bottom-strip"
            style={{ cursor: "pointer" }}
            onClick={() => openSwarmPanel(true)}
          >
            <span>
              Swarm: {snap?.title ?? "Idle"} · {c.active} active · {c.waiting} waiting · {c.posts} posts
            </span>
            <Show when={c.paused || c.stalled}>
              <span>{c.paused ? "Paused on quota" : "Stalled"}</span>
            </Show>
          </div>
        ),
      };
    });

    ctx.add(MenuItem, () => {
      const session = ctx.sessions.current();
      const opened = session ? ctx.layout.state(`${ctx.id}:swarm`, session) !== "closed" : false;
      return {
        menu: "session.panel" as const,
        id: "open-swarm",
        title: "Swarm",
        description: "Open live Swarm Board",
        opened,
        run: () => openSwarmPanel(false),
      };
    });

    ctx.add(Command, () => ({
      id: "open",
      title: "Open Swarm Board",
      description: "Open the live Antigravity-style Swarm Board side panel",
      group: "Swarm",
      section: "navigation" as const,
      bind: "mod+shift+s",
      slash: { name: "swarm-board" },
      run: () => openSwarmPanel(false),
    }));

    const swarmTab: PanelTab = {
      id: "swarm",
      title: "Swarm",
      closable: "hover",
    };

    ctx.add(Panel, () => {
      if (!settings().sidebarShow) return undefined;
      return {
        id: "board",
        region: "side" as const,
        width: 480,
        mobile: {
          title: "Swarm",
          order: 50,
          kind: "tab" as const,
          cached: true,
        },
        list({ session, open }) {
          if (open.includes("swarm") || wantedSessions().has(session.key)) {
            return [swarmTab];
          }
          return [];
        },
        close({ session }) {
          markWanted(session.key, false);
        },
        render(props) {
          return (
            <Suspense fallback={<div style={{ padding: "12px" }}>Loading Swarm Board...</div>}>
              <SwarmPanelView
                ctx={ctx}
                snapshot={snapshot}
                swarms={swarms}
                selectedSwarmId={selectedSwarmId}
                onSelectSwarm={(id) => setSelectedSwarmId(id)}
                onRefresh={() => void refresh()}
                onKillMember={async (swarmId, handle) => {
                  await callSwarmRpc("killMember", { swarmId, handle });
                  await refresh();
                }}
                onCompleteSwarm={async (swarmId) => {
                  await callSwarmRpc("completeSwarm", { swarmId });
                  await refresh();
                }}
                server={props.session.server}
              />
            </Suspense>
          );
        },
      };
    });
  },
});
