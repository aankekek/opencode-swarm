import type { SwarmGuiContext, SwarmSettings } from "./types.js";

export interface SwarmSettingsViewProps {
  ctx: SwarmGuiContext;
  settings: () => SwarmSettings;
  updateSetting: <K extends keyof SwarmSettings>(key: K, value: SwarmSettings[K]) => void;
}

export function SwarmSettingsView(props: SwarmSettingsViewProps) {
  const { SettingsLayout, SettingsSection, SettingsRow, Switch } = props.ctx.ui;

  return (
    <SettingsLayout title="Swarm Board">
      <SettingsSection title="Surfaces">
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
      </SettingsSection>

      <SettingsSection title="Notifications">
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
      </SettingsSection>
    </SettingsLayout>
  );
}
