import {
  Command,
  ComposerPill,
  MenuItem,
  Panel,
  Plugin,
  SettingsPage,
  Slot,
  Store,
  Style,
  TitlebarItem,
  type ComposerPillTone,
  type PanelTab,
  type SettingEntry,
} from "@opencode/plugin/gui";
import { createEffect, createMemo, createSignal, lazy, onCleanup, Show, Suspense } from "solid-js";
import SWARM_RPC_DEF from "../src/rpc.js";
import { SWARM_GUI_STYLES } from "./gui/styles.js";
import { SwarmSettingsView, type SwarmRpcStatus } from "./gui/SwarmSettingsView.js";
import {
  DEFAULT_SWARM_SETTINGS,
  normalizeSwarmList,
  normalizeSwarmSnapshot,
  SWARM_SETTINGS_PAGE_ID,
  SwarmSettingsSchema,
  type SwarmSettings,
  type SwarmSnapshot,
  type SwarmSummary,
} from "./gui/types.js";

const SwarmPanelView = lazy(() => import("./gui/SwarmPanelView.js"));

const SETTINGS_ENTRIES: readonly SettingEntry[] = [
  {
    id: SWARM_SETTINGS_PAGE_ID,
    title: "Swarm Board",
    description: "Configure Swarm Board side tab, pills, bottom strip, and event toasts",
    keywords: "swarm board agents coordinator verifier",
  },
  {
    id: "swarm-board.sidebarShow",
    title: "Show Swarm side tab",
    description: "Display the Swarm Board panel in the session side pane",
    keywords: "swarm sidebar panel tab",
  },
  {
    id: "swarm-board.pillbarShow",
    title: "Show titlebar status pill",
    description: "Show live active, waiting, and post counts in the window titlebar",
    keywords: "swarm titlebar pill status",
  },
  {
    id: "swarm-board.showWhenIdle",
    title: "Show titlebar pill when idle",
    description: "Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",
    keywords: "swarm titlebar idle",
  },
  {
    id: "swarm-board.composerPill",
    title: "Show composer pill",
    description: "Show active handles and verifier status above the message composer",
    keywords: "swarm composer pill",
  },
  {
    id: "swarm-board.bottomStrip",
    title: "Show bottom summary strip",
    description: "Display a compact one-line swarm summary bar at the bottom of the window",
    keywords: "swarm bottom strip status bar",
  },
  {
    id: "swarm-board.withSidePanel",
    title: "Keep bottom strip when side panel is open",
    description: "Show the bottom summary strip even while the Swarm side panel is visible",
    keywords: "swarm bottom strip side panel",
  },
  {
    id: "swarm-board.toastEnabled",
    title: "Event toasts",
    description: "Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",
    keywords: "swarm toast notifications",
  },
];

export default Plugin.define({
  stores: {
    settings: Store.global(SwarmSettingsSchema, DEFAULT_SWARM_SETTINGS),
  },
  setup(ctx) {
    const store =
      ctx.stores?.settings ??
      ctx.storage.store("swarm.settings", {
        schema: SwarmSettingsSchema,
        initial: DEFAULT_SWARM_SETTINGS,
      });

    const settings = (): SwarmSettings => store.value ?? DEFAULT_SWARM_SETTINGS;
    const updateSetting = <K extends keyof SwarmSettings>(key: K, value: SwarmSettings[K]) => {
      store.set({ ...settings(), [key]: value });
    };

    const safeAdd = <T,>(registry: Parameters<typeof ctx.add<T>>[0], item: T | (() => T | undefined)) => {
      try {
        return ctx.add(registry, item as never);
      } catch (err) {
        console.warn(`[swarm-runtime] OpenCode did not accept a GUI item:`, err);
        return () => {};
      }
    };

    safeAdd(Style, SWARM_GUI_STYLES);

    const [swarms, setSwarms] = createSignal<SwarmSummary[]>([]);
    const [selectedSwarmId, setSelectedSwarmId] = createSignal<string | null>(null);
    const [snapshot, setSnapshot] = createSignal<SwarmSnapshot | null>(null);
    const [rpcStatus, setRpcStatus] = createSignal<SwarmRpcStatus>({ state: "connected" });

    let lastPausedQuota = false;
    let lastVerifierStatus = "";
    let lastStalled = false;
    let lastCompletedId = "";
    let lastMonitorPostId: string | number | null = null;

    const getRpc = () => ctx.client.rpc(SWARM_RPC_DEF);
    const getCallOptions = () => {
      const location = ctx.sessions.current()?.location;
      return location ? { location } : {};
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
        const rpc = getRpc();
        const opts = getCallOptions();
        const rawList = await rpc.listSwarms({}, opts);
        const list = normalizeSwarmList(rawList);
        setSwarms(list);
        if (list.length > 0 && !selectedSwarmId()) {
          setSelectedSwarmId(list[0].id);
        }
        const targetId = selectedSwarmId();
        const sessionId = ctx.sessions.current()?.id;
        const rawSnap = await rpc.getSwarmSnapshot(
          targetId ? { swarmId: targetId } : sessionId ? { sessionId } : {},
          opts
        );
        const snap = normalizeSwarmSnapshot(rawSnap);
        setSnapshot(snap);
        setRpcStatus({ state: "connected" });
        if (snap) {
          maybeNotify(snap);
        }
      } catch (err) {
        const isUnavailable =
          typeof err === "object" && err !== null && "type" in err && (err as { type?: string }).type === "rpc.unavailable";
        setRpcStatus(
          isUnavailable
            ? { state: "unavailable" }
            : { state: "error", message: err instanceof Error ? err.message : String(err) }
        );
      }
    };

    createEffect(() => {
      selectedSwarmId();
      void ctx.sessions.current()?.id;
      void refresh();
    });

    const eventAbort = new AbortController();
    try {
      getRpc().events.on(
        "changed",
        () => {
          void refresh();
        },
        { signal: eventAbort.signal }
      );
    } catch {
      // Ignore if event subscription is unavailable at startup
    }

    const pollTimer = setInterval(() => {
      void refresh();
    }, 4000);

    onCleanup(() => {
      eventAbort.abort();
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
      ctx.layout.open(key, session);
    };

    const openSwarmSettings = () => {
      ctx.layout.settings(SWARM_SETTINGS_PAGE_ID);
    };

    safeAdd(SettingsPage, () => ({
      id: SWARM_SETTINGS_PAGE_ID,
      title: "Swarm Board",
      icon: "dot-grid" as const,
      entries: SETTINGS_ENTRIES,
      render: ({ target }) => (
        <SwarmSettingsView
          ctx={ctx}
          settings={settings}
          updateSetting={updateSetting}
          rpcStatus={rpcStatus}
          activeSwarmCount={() => swarms().length}
          onOpenPanel={() => openSwarmPanel(false)}
          onRefresh={() => void refresh()}
          target={target}
        />
      ),
    }));

    safeAdd(TitlebarItem, () => {
      if (!settings().pillbarShow) return undefined;
      const snap = snapshot();
      if (!snap && !settings().showWhenIdle) return undefined;
      const session = ctx.sessions.current();
      const pressed = session ? ctx.layout.state(`${ctx.id}:swarm`, session) === "visible" : false;
      const c = counts();
      const warn = c.paused || c.stalled ? " ⚠" : "";
      return {
        id: "swarm-open",
        icon: c.paused || c.stalled ? ("warning" as const) : ("dot-grid" as const),
        label: snap
          ? `Swarm: ${c.active} active · ${c.waiting} waiting · ${c.posts} posts${warn}`
          : "Swarm: Idle",
        title: c.paused
          ? "Swarm paused on quota — click to open Swarm Board"
          : c.stalled
            ? "Swarm stalled — click to open Swarm Board"
            : "Open Swarm Board",
        pressed,
        run: () => openSwarmPanel(true),
      };
    });

    safeAdd(ComposerPill, {
      id: "swarm-composer-pill",
      show() {
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
          icon: "dot-grid" as const,
          label,
          tone,
          run: () => openSwarmPanel(false),
        };
      },
    });

    safeAdd(Slot, {
      at: "window.bottom" as const,
      render: () => {
        const shouldShow = () => {
          if (!settings().bottomStrip) return false;
          const session = ctx.sessions.current();
          const sideVisible = session ? ctx.layout.state(`${ctx.id}:swarm`, session) === "visible" : false;
          return !sideVisible || settings().withSidePanel;
        };
        return (
          <Show when={shouldShow()}>
            <div
              class="swarm-gui-bottom-strip"
              style={{ cursor: "pointer" }}
              onClick={() => openSwarmPanel(true)}
            >
              <span>
                Swarm: {snapshot()?.title ?? "Idle"} · {counts().active} active · {counts().waiting} waiting ·{" "}
                {counts().posts} posts
              </span>
              <Show when={counts().paused || counts().stalled}>
                <span>{counts().paused ? "Paused on quota" : "Stalled"}</span>
              </Show>
            </div>
          </Show>
        );
      },
    });

    safeAdd(MenuItem, () => {
      const session = ctx.sessions.current();
      const opened = session ? ctx.layout.state(`${ctx.id}:swarm`, session) !== "closed" : false;
      return {
        menu: "session.panel" as const,
        id: "open-swarm",
        title: "Swarm",
        icon: "dot-grid" as const,
        description: "Open live Swarm Board",
        opened,
        run: () => openSwarmPanel(false),
      };
    });

    safeAdd(Command, () => ({
      id: "open",
      title: "Open Swarm Board",
      description: "Open the live Antigravity-style Swarm Board side panel",
      group: "Swarm",
      section: "navigation" as const,
      bind: "mod+shift+s",
      slash: { name: "swarm-board" },
      run: () => openSwarmPanel(false),
    }));

    safeAdd(Command, () => ({
      id: "settings",
      title: "Swarm Board Settings",
      description: "Configure Swarm Board surfaces and notifications",
      group: "Swarm",
      section: "general" as const,
      run: () => openSwarmSettings(),
    }));

    const swarmTab: PanelTab = {
      id: "swarm",
      title: "Swarm",
      pinned: true,
    };

    safeAdd(Panel, {
      id: "board",
      region: "side" as const,
      width: 480,
      mobile: {
        title: "Swarm",
        order: 50,
        kind: "tab" as const,
        cached: true,
      },
      list() {
        return settings().sidebarShow ? [swarmTab] : [];
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
              onOpenSettings={openSwarmSettings}
              rpcError={() => {
                const s = rpcStatus();
                if (s.state === "unavailable") {
                  return "Server plugin (local.swarm-runtime) is not loaded for this workspace.";
                }
                if (s.state === "error") return s.message;
                return undefined;
              }}
              onKillMember={async (swarmId, handle) => {
                await getRpc().killMember({ swarmId, handle }, getCallOptions());
                await refresh();
              }}
              onCompleteSwarm={async (swarmId) => {
                await getRpc().completeSwarm({ swarmId }, getCallOptions());
                await refresh();
              }}
              server={props.session.server}
            />
          </Suspense>
        );
      },
    });
  },
});
