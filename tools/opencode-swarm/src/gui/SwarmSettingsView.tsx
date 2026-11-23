import { onMount } from "solid-js";
import type { SwarmGuiContext, SwarmSettings } from "./types.js";

export interface SwarmRpcStatus {
  state: "connected" | "unavailable" | "error";
  message?: string;
}

export interface SwarmSettingsViewProps {
  ctx: SwarmGuiContext;
  settings: () => SwarmSettings;
  updateSetting: <K extends keyof SwarmSettings>(key: K, value: SwarmSettings[K]) => void;
  rpcStatus: () => SwarmRpcStatus;
  activeSwarmCount: () => number;
  onOpenPanel: () => void;
  onOpenSetupWizard?: () => void;
  onOpenUninstall?: () => void;
  onRefresh: () => void;
  target?: string;
}

export function SwarmSettingsView(props: SwarmSettingsViewProps) {
  const { SettingsLayout, SettingsSection, SettingsRow, Switch, Button } = props.ctx.ui;

  onMount(() => {
    if (!props.target || typeof document === "undefined") return;
    queueMicrotask(() => {
      document
        .querySelector(`[data-action="${CSS.escape(props.target!)}"]`)
        ?.scrollIntoView({ block: "start" });
    });
  });

  const statusDescription = () => {
    const s = props.rpcStatus();
    if (s.state === "connected") {
      const count = props.activeSwarmCount();
      return `Connected to local.opencode-swarm (${count} swarm${count === 1 ? "" : "s"} recorded).`;
    }
    if (s.state === "unavailable") {
      return "Server plugin (local.opencode-swarm) is not loaded for this workspace.";
    }
    return s.message ? `RPC error: ${s.message}` : "Unable to reach local.opencode-swarm.";
  };

  return (
    <SettingsLayout title="Swarm Board">
      <SettingsSection title="Surfaces">
        <div data-action="swarm-board.sidebarShow">
          <SettingsRow
            title="Show Swarm side tab"
            description="Display the Swarm Board panel in the session side pane"
          >
            <Switch
              label="Show Swarm side tab"
              hideLabel
              checked={props.settings().sidebarShow}
              onChange={(checked: boolean) => props.updateSetting("sidebarShow", checked)}
            />
          </SettingsRow>
        </div>

        <div data-action="swarm-board.pillbarShow">
          <SettingsRow
            title="Show titlebar status pill"
            description="Show live active, waiting, and post counts in the window titlebar"
          >
            <Switch
              label="Show titlebar status pill"
              hideLabel
              checked={props.settings().pillbarShow}
              onChange={(checked: boolean) => props.updateSetting("pillbarShow", checked)}
            />
          </SettingsRow>
        </div>

        <div data-action="swarm-board.showWhenIdle">
          <SettingsRow
            title="Show titlebar pill when idle"
            description="Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active"
          >
            <Switch
              label="Show titlebar pill when idle"
              hideLabel
              checked={props.settings().showWhenIdle}
              onChange={(checked: boolean) => props.updateSetting("showWhenIdle", checked)}
            />
          </SettingsRow>
        </div>

        <div data-action="swarm-board.composerPill">
          <SettingsRow
            title="Show composer pill"
            description="Show active handles and verifier status above the message composer"
          >
            <Switch
              label="Show composer pill"
              hideLabel
              checked={props.settings().composerPill}
              onChange={(checked: boolean) => props.updateSetting("composerPill", checked)}
            />
          </SettingsRow>
        </div>

        <div data-action="swarm-board.bottomStrip">
          <SettingsRow
            title="Show bottom summary strip"
            description="Display a compact one-line swarm summary bar at the bottom of the window"
          >
            <Switch
              label="Show bottom summary strip"
              hideLabel
              checked={props.settings().bottomStrip}
              onChange={(checked: boolean) => props.updateSetting("bottomStrip", checked)}
            />
          </SettingsRow>
        </div>

        <div data-action="swarm-board.withSidePanel">
          <SettingsRow
            title="Keep bottom strip when side panel is open"
            description="Show the bottom summary strip even while the Swarm side panel is visible"
          >
            <Switch
              label="Keep bottom strip when side panel is open"
              hideLabel
              checked={props.settings().withSidePanel}
              onChange={(checked: boolean) => props.updateSetting("withSidePanel", checked)}
            />
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title="Notifications">
        <div data-action="swarm-board.toastEnabled">
          <SettingsRow
            title="Event toasts"
            description="Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion"
          >
            <Switch
              label="Event toasts"
              hideLabel
              checked={props.settings().toastEnabled}
              onChange={(checked: boolean) => props.updateSetting("toastEnabled", checked)}
            />
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title="Plugin Status & Actions">
        <div data-action="swarm-board.status">
          <SettingsRow title="Swarm Runtime" description={statusDescription()}>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button size="small" variant="ghost" onClick={props.onRefresh}>
                Refresh
              </Button>
              {props.onOpenSetupWizard && (
                <Button size="small" variant="ghost" onClick={props.onOpenSetupWizard}>
                  Setup Role Models
                </Button>
              )}
              <Button size="small" variant="neutral" onClick={props.onOpenPanel}>
                Open Swarm Board
              </Button>
            </div>
          </SettingsRow>
        </div>
      </SettingsSection>

      {props.onOpenUninstall && (
        <SettingsSection title="Uninstall">
          <div data-action="swarm-board.uninstall">
            <SettingsRow
              title="Uninstall Swarm Plugin"
              description="Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files"
            >
              <Button size="small" variant="ghost" onClick={props.onOpenUninstall}>
                Uninstall...
              </Button>
            </SettingsRow>
          </div>
        </SettingsSection>
      )}
    </SettingsLayout>
  );
}
