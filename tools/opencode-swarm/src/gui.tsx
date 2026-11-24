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
import SWARM_RPC_DEF, {
  type SetRoleModelResult,
  type SwarmRoleConfig,
  type UninstallPlan,
  type UninstallResult,
  type UninstallSelection,
} from "../src/rpc.js";
import { SWARM_GUI_STYLES } from "./gui/styles.js";
import { SwarmControlOverlay, type SwarmControlRole } from "./gui/SwarmControlOverlay.js";
import { SwarmOnboardingModal } from "./gui/SwarmOnboardingModal.js";
import { SwarmSettingsView, type SwarmRpcStatus } from "./gui/SwarmSettingsView.js";
import { SwarmUninstallModal } from "./gui/SwarmUninstallModal.js";
import {
  applyIfCurrent,
  DEFAULT_SWARM_SETTINGS,
  normalizeSwarmList,
  normalizeSwarmSnapshot,
  snapshotSignature,
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
  {
    id: "swarm-board.autoSpawnVerifier",
    title: "Auto-spawn verifier",
    description: "Automatically spawn or wake @verifier when all worker tracks finish",
    keywords: "swarm verifier auto spawn gate verification",
  },
  {
    id: "swarm-board.status",
    title: "Setup Role Models",
    description: "Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",
    keywords: "swarm models onboarding wizard setup",
  },
  {
    id: "swarm-board.uninstall",
    title: "Uninstall Swarm Plugin",
    description: "Review removal checklist and completely uninstall Swarm Runtime",
    keywords: "swarm uninstall remove cleanup reset",
  },
];

const HIDE_SUBAGENT_PILL_CSS = `
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`;

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
        console.warn(`[opencode-swarm] OpenCode did not accept a GUI item:`, err);
        return () => {};
      }
    };

    safeAdd(Style, SWARM_GUI_STYLES);

    const [swarms, setSwarms] = createSignal<SwarmSummary[]>([]);
    const [selectedSwarmId, setSelectedSwarmId] = createSignal<string | null>(null);
    const [userPinnedSwarmId, setUserPinnedSwarmId] = createSignal<string | null>(null);
    const [snapshot, setSnapshot] = createSignal<SwarmSnapshot | null>(null);
    // Non-null only when the snapshot was resolved from the current session id and
    // that swarm is live. This is what allows the GUI surfaces to exist at all.
    const [sessionSwarmId, setSessionSwarmId] = createSignal<string | null>(null);
    const [boardUrl, setBoardUrl] = createSignal<string>("");
    const [mountedDirectory, setMountedDirectory] = createSignal<string | undefined>(undefined);
    const [rpcStatus, setRpcStatus] = createSignal<SwarmRpcStatus>({ state: "connected" });
    const [autoSpawnVerifier, setAutoSpawnVerifier] = createSignal<boolean>(true);

    let lastPausedQuota = false;
    let lastVerifierStatus = "";
    let lastStalled = false;
    let lastCompletedId = "";
    let lastMonitorPostId: string | number | null = null;
    let refreshSeq = 0;
    let lastDir: string | undefined;
    let lastSessionId: string | null = null;
    let lastSnapshotSignature = snapshotSignature(null);
    const dismissedSwarmBySession = new Map<string, string>();

    const currentSessionId = () => ctx.sessions.current()?.id ?? null;
    // Tab existence depends only on the session's summon evidence. RPC transport
    // failures must surface inside the panel (rpcError), never by unmounting the tab.
    const activeForThisSession = () => sessionSwarmId() !== null;
    const currentDirectory = () => ctx.sessions.current()?.location?.directory ?? mountedDirectory();

    const clearSwarmUiForSession = (sid: string | null, dismissedId?: string) => {
      if (sid) {
        dismissedSwarmBySession.set(sid, dismissedId || "*");
      }
      const session = ctx.sessions.current();
      if (session) {
        try {
          ctx.layout.hide(`${ctx.id}:swarm`, session);
        } catch {
          // Ignore if panel is already closed
        }
      }
      setSessionSwarmId(null);
      setSnapshot(null);
      lastSnapshotSignature = snapshotSignature(null);
      setSelectedSwarmId(null);
      setUserPinnedSwarmId(null);
      setBoardUrl("");
    };
    const getRpc = () => ctx.client.rpc(SWARM_RPC_DEF);
    const getCallOptions = (timeoutMs = 8000) => {
      const loc =
        ctx.sessions.current()?.location ?? (mountedDirectory() ? { directory: mountedDirectory()! } : undefined);
      const signal = AbortSignal.timeout(timeoutMs);
      return loc ? { location: loc, signal } : { signal };
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
      const mySeq = ++refreshSeq;
      try {
        const rpc = getRpc();
        const opts = getCallOptions();
        const rawList = await rpc.listSwarms({}, opts);
        if (mySeq !== refreshSeq) return;
        const list = normalizeSwarmList(rawList);
        setSwarms(list);

        // Selection is only ever set explicitly by the user (panel history browsing).
        // Never auto-select a swarm from the list: a session without a swarm stays null.
        const currentSelected = selectedSwarmId();
        if (currentSelected && !list.some((s) => s.id === currentSelected)) {
          setSelectedSwarmId(null);
          setUserPinnedSwarmId(null);
        }

        const sid = currentSessionId();
        const pinnedId = sid ? userPinnedSwarmId() : null;
        const viaSession = Boolean(sid) && !pinnedId;
        const rawSnap = await rpc.getSwarmSnapshot(
          pinnedId ? { swarmId: pinnedId } : sid ? { sessionId: sid } : {},
          opts
        );
        if (mySeq !== refreshSeq) return;
        if (
          rawSnap &&
          typeof rawSnap === "object" &&
          typeof (rawSnap as { boardUrl?: unknown }).boardUrl === "string" &&
          (rawSnap as { boardUrl: string }).boardUrl
        ) {
          // Sticky within a session: never clear to "" from a poll, otherwise the
          // empty `iframeSrc` unmounts the board iframe and the next tick reloads it.
          setBoardUrl((rawSnap as { boardUrl: string }).boardUrl);
        }
        const snap = normalizeSwarmSnapshot(rawSnap);
        const dismissed = sid ? dismissedSwarmBySession.get(sid) : undefined;
        if (viaSession && snap && dismissed && (dismissed === "*" || dismissed === snap.swarmId) && snap.status !== "running") {
          return;
        }
        const sig = snapshotSignature(snap);
        if (sig !== lastSnapshotSignature) {
          lastSnapshotSignature = sig;
          setSnapshot(snap);
        }
        // Sticky summon evidence for the session: any non-null session-resolved
        // snapshot means this session is a member of a swarm, whatever its status
        // (running, completing, completed, interrupted). A pinned (history) fetch
        // must not clear or overwrite it, and a poll never writes null here — only
        // the session-change effect or explicit session exit clears it.
        if (viaSession && snap) {
          if (sid && dismissed) dismissedSwarmBySession.delete(sid);
          setSessionSwarmId(snap.swarmId);
        }
        const currentRpc = rpcStatus();
        if (currentRpc.state !== "connected") {
          setRpcStatus({ state: "connected" });
          // Re-arm push events after a transport recovery: the underlying event
          // stream may have ended while `ctx.client` stayed identical.
          forceEventResubscribe();
        }
        void rpc
          .getRoleConfig(pinnedId ? { swarmId: pinnedId } : sid ? { sessionId: sid } : {}, opts)
          .then((rawCfg) => {
            applyIfCurrent(mySeq, refreshSeq, () => {
              const cfg = (rawCfg && typeof rawCfg === "object" && "output" in rawCfg
                ? (rawCfg as { output?: SwarmRoleConfig }).output
                : rawCfg) as SwarmRoleConfig | undefined;
              if (typeof cfg?.autoSpawnVerifier === "boolean") {
                setAutoSpawnVerifier(cfg.autoSpawnVerifier);
              }
            });
          })
          .catch(() => {});
        if (snap) {
          maybeNotify(snap);
        }
      } catch (err) {
        if (mySeq !== refreshSeq) return;
        const isUnavailable =
          typeof err === "object" && err !== null && "type" in err && (err as { type?: string }).type === "rpc.unavailable";
        const nextStatus: SwarmRpcStatus = isUnavailable
          ? { state: "unavailable" }
          : { state: "error", message: err instanceof Error ? err.message : String(err) };
        const currentRpc = rpcStatus();
        const sameStatus =
          currentRpc.state === nextStatus.state &&
          (nextStatus.state !== "error" ||
            currentRpc.message === (nextStatus as { message?: string }).message);
        if (!sameStatus) {
          setRpcStatus(nextStatus);
        }
      }
    };

    createEffect(() => {
      const dir = currentDirectory();
      const sessionId = currentSessionId();
      void ctx.sessions.current()?.pending;
      selectedSwarmId();
      if (dir !== lastDir) lastDir = dir;
      if (sessionId !== lastSessionId) {
        lastSessionId = sessionId;
        setUserPinnedSwarmId(null);
        setSelectedSwarmId(null);
        setSnapshot(null);
        lastSnapshotSignature = snapshotSignature(null);
        setSessionSwarmId(null);
        setBoardUrl("");
        setSwarms([]);
      }
      void refresh();
    });

    let subscribedClient: unknown = null;
    let eventAbort: AbortController | undefined;
    const ensureEventSubscription = () => {
      if (subscribedClient === ctx.client) return;
      eventAbort?.abort();
      subscribedClient = ctx.client;
      eventAbort = new AbortController();
      try {
        ctx.client.rpc(SWARM_RPC_DEF).events.on(
          "changed",
          (ev) => {
            if (ev && typeof ev === "object" && (ev as { reason?: string }).reason === "session_exited") {
              const handle = (ev as { handle?: string }).handle;
              const swId = (ev as { swarmId?: string }).swarmId;
              const sid = currentSessionId();
              if (!handle || handle === sid) {
                clearSwarmUiForSession(sid, swId);
                return;
              }
            }
            void refresh();
          },
          { signal: eventAbort.signal }
        );
      } catch {
        // Ignore if event subscription is unavailable at startup
      }
    };
    function forceEventResubscribe() {
      try {
        eventAbort?.abort();
        subscribedClient = null;
        ensureEventSubscription();
      } catch {
        // Ignore if event resubscription fails; the poll keeps the UI alive.
      }
    }
    ensureEventSubscription();

    createEffect(() => {
      try {
        const serversApi = ctx.servers;
        if (!serversApi) return;
        const builtin = serversApi
          .list()
          .map((id) => serversApi.get(id))
          .find((s) => s?.builtin);
        const data = builtin?.data as { on?: (event: string, fn: () => void) => () => void } | undefined;
        if (!data || typeof data.on !== "function") return;
        const unsub = data.on("session.tool.success", () => {
          void refresh();
        });
        onCleanup(() => unsub());
      } catch {
        // Ignore if builtin server data events are unavailable
      }
    });

    const pollTimer = setInterval(() => {
      ensureEventSubscription();
      void refresh();
    }, 2000);

    onCleanup(() => {
      eventAbort?.abort();
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

    const isBuzzing = createMemo(() => {
      const snap = snapshot();
      const c = counts();
      return Boolean(
        snap && (c.active > 0 || (snap.status === "running" && snap.members.some((m) => m.state.toLowerCase() === "working")))
      );
    });

    safeAdd(Style, () => (isBuzzing() ? HIDE_SUBAGENT_PILL_CSS : undefined));

    const openOnboardingWizard = () => {
      ctx.dialogs.open((dialog) => (
        <SwarmOnboardingModal
          ctx={ctx}
          loadRoleConfig={async () => {
            const targetId = selectedSwarmId();
            const sessionId = ctx.sessions.current()?.id;
            return (await getRpc().getRoleConfig(
              targetId ? { swarmId: targetId } : sessionId ? { sessionId } : {},
              getCallOptions()
            )) as SwarmRoleConfig | null;
          }}
          onApplyModels={async (selections) => {
            const errors: string[] = [];
            const targetId = selectedSwarmId();
            const sessionId = ctx.sessions.current()?.id;
            for (const role of ["coordinator", "worker", "verifier", "monitor"] as const) {
              const model = selections[role];
              if (!model) continue;
              const res = (await getRpc().setRoleModel(
                {
                  role,
                  model,
                  ...(targetId ? { swarmId: targetId } : {}),
                  ...(sessionId ? { sessionId } : {}),
                },
                getCallOptions()
              )) as SetRoleModelResult | null;
              if (!res?.ok) {
                errors.push(`${role}: ${res?.error ?? "failed"}`);
              }
            }
            void refresh();
            return { ok: errors.length === 0, errors };
          }}
          onComplete={() => {
            updateSetting("onboardingComplete", true);
            dialog.close();
          }}
          onSkip={() => {
            updateSetting("onboardingComplete", true);
            dialog.close();
          }}
        />
      ));
    };

    const exitSwarmModeForCurrentSession = async () => {
      const sid = currentSessionId();
      const activeId = sessionSwarmId() ?? snapshot()?.swarmId ?? "";
      try {
        await getRpc().completeSwarm(
          {
            swarmId: activeId,
            exitSession: true,
            ...(sid ? { sessionId: sid } : {}),
            summary: "Exited Swarm mode",
          },
          getCallOptions()
        );
      } catch {
        // Still clear local GUI state even if RPC failed or swarm already ended
      }
      clearSwarmUiForSession(sid, activeId);
      ctx.toast.show({
        title: "Exited Swarm mode",
        description: "Swarm UI removed for this session. Back to the original composer.",
      });
    };

    const openSwarmOverlay = () => {
      ctx.dialogs.open((dialog) => (
        <SwarmControlOverlay
          ctx={ctx}
          snapshot={snapshot}
          counts={counts}
          isBuzzing={isBuzzing}
          loadRoleConfig={async () => {
            const targetId = selectedSwarmId();
            const sessionId = ctx.sessions.current()?.id;
            return (await getRpc().getRoleConfig(
              targetId ? { swarmId: targetId } : sessionId ? { sessionId } : {},
              getCallOptions()
            )) as SwarmRoleConfig | null;
          }}
          onSetRoleModel={async (role: SwarmControlRole, modelSpec: string) => {
            const targetId = selectedSwarmId();
            const sessionId = ctx.sessions.current()?.id;
            const res = (await getRpc().setRoleModel(
              {
                role,
                model: modelSpec,
                ...(targetId ? { swarmId: targetId } : {}),
                ...(sessionId ? { sessionId } : {}),
              },
              getCallOptions()
            )) as SetRoleModelResult | null;
            void refresh();
            return res;
          }}
          onOpenBoard={() => openSwarmPanel(false)}
          onOpenSetupWizard={() => {
            dialog.close();
            openOnboardingWizard();
          }}
          onExitSwarmMode={exitSwarmModeForCurrentSession}
          onClose={() => dialog.close()}
        />
      ));
    };

    const openUninstallModal = () => {
      ctx.dialogs.open((dialog) => (
        <SwarmUninstallModal
          ctx={ctx}
          loadPlan={async () => {
            return (await getRpc().previewUninstall({}, getCallOptions(30_000))) as UninstallPlan | null;
          }}
          onExecute={async (categories: Partial<UninstallSelection>) => {
            return (await getRpc().executeUninstall({ categories }, getCallOptions(120_000))) as UninstallResult | null;
          }}
          onResetGuiStore={() => {
            store.set(DEFAULT_SWARM_SETTINGS);
          }}
          onClose={() => dialog.close()}
        />
      ));
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
          autoSpawnVerifier={autoSpawnVerifier}
          onToggleAutoSpawnVerifier={async (enabled: boolean) => {
            const prev = autoSpawnVerifier();
            setAutoSpawnVerifier(enabled);
            try {
              const res = await getRpc().setAutoSpawnVerifier({ enabled }, getCallOptions());
              const out = (res && typeof res === "object" && "output" in res
                ? (res as { output?: { autoSpawnVerifier?: boolean } }).output
                : res) as { autoSpawnVerifier?: boolean } | undefined;
              if (typeof out?.autoSpawnVerifier === "boolean") {
                setAutoSpawnVerifier(out.autoSpawnVerifier);
              }
            } catch (err) {
              setAutoSpawnVerifier(prev);
              ctx.toast.show({
                title: "Failed to update Auto-spawn verifier",
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
              });
            }
          }}
          onOpenPanel={() => openSwarmPanel(false)}
          onOpenSetupWizard={openOnboardingWizard}
          onOpenUninstall={openUninstallModal}
          onRefresh={() => void refresh()}
          target={target}
        />
      ),
    }));

    safeAdd(TitlebarItem, () => {
      if (!activeForThisSession()) return undefined;
      if (!settings().pillbarShow) return undefined;
      const snap = snapshot();
      const session = ctx.sessions.current();
      const pressed = session ? ctx.layout.state(`${ctx.id}:swarm`, session) === "visible" : false;
      const c = counts();
      const warn = c.paused || c.stalled ? " ⚠" : "";
      const buzzing = isBuzzing();
      return {
        id: "swarm-open",
        label: buzzing
          ? `🐝 Swarm: Buzzing (${c.active} active · ${c.posts} posts)${warn}`
          : snap
            ? `🐝 Swarm: Dozing (${c.posts} posts)${warn}`
            : "🐝 Swarm: Dozing",
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
      show(input) {
        if (input.session.directory) {
          setMountedDirectory(input.session.directory);
        }
        if (!activeForThisSession()) return undefined;
        if (!settings().composerPill) return undefined;
        const snap = snapshot();
        const c = counts();
        const verifier = (snap?.verifierStatus ?? "").toUpperCase();
        let tone: ComposerPillTone | undefined;
        if (c.paused || verifier === "FAIL") tone = "danger";
        else if (c.stalled) tone = "warning";
        return {
          label: isBuzzing() ? "🐝 Swarm: Buzzing" : "🐝 Swarm: Dozing",
          ...(tone ? { tone } : {}),
          title: "Click to configure Swarm role models or open Board",
          run: () => openSwarmOverlay(),
        };
      },
    });

    safeAdd(Slot, {
      at: "window.bottom" as const,
      render: () => {
        const shouldShow = () => {
          if (!activeForThisSession()) return false;
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
      if (!activeForThisSession()) return undefined;
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

    safeAdd(Command, () => ({
      id: "setup-models",
      title: "Swarm Model Setup Wizard",
      description: "Choose recommended or manual models for Swarm roles",
      group: "Swarm",
      section: "model" as const,
      run: () => openOnboardingWizard(),
    }));

    safeAdd(Command, () => ({
      id: "exit-session",
      title: "Exit Swarm Mode (Current Session)",
      description: "Stop active swarm and remove all Swarm UI from the current session",
      group: "Swarm",
      section: "general" as const,
      run: () => void exitSwarmModeForCurrentSession(),
    }));

    safeAdd(Command, () => ({
      id: "uninstall",
      title: "Uninstall Swarm Plugin",
      description: "Open the Swarm removal checklist and completely uninstall Swarm Runtime",
      group: "Swarm",
      section: "general" as const,
      run: () => openUninstallModal(),
    }));

    const swarmTab: PanelTab = {
      id: "swarm",
      title: "Swarm",
      pinned: false,
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
        return activeForThisSession() && settings().sidebarShow ? [swarmTab] : [];
      },
      render(props) {
        if (props.session.directory) {
          setMountedDirectory(props.session.directory);
        }
        return (
          <Suspense fallback={<div style={{ padding: "12px" }}>Loading Swarm Board...</div>}>
            <SwarmPanelView
              ctx={ctx}
              snapshot={snapshot}
              boardUrl={boardUrl}
              swarms={swarms}
              selectedSwarmId={selectedSwarmId}
              sessionId={() => props.session.id}
              onSelectSwarm={(id) => {
                setUserPinnedSwarmId(id);
                setSelectedSwarmId(id);
              }}
              onRefresh={() => void refresh()}
              onOpenSettings={openSwarmSettings}
              rpcError={() => {
                const s = rpcStatus();
                if (s.state === "unavailable") {
                  return "Server plugin (local.opencode-swarm) is not loaded for this workspace.";
                }
                if (s.state === "error") return s.message;
                return undefined;
              }}
              onCompleteSwarm={async (swarmId) => {
                await getRpc().completeSwarm({ swarmId }, getCallOptions());
                await refresh();
              }}
              onExitSwarmMode={exitSwarmModeForCurrentSession}
              server={props.session.server}
            />
          </Suspense>
        );
      },
    });
  },
});
