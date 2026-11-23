import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { SetRoleModelResult, SwarmRoleConfig } from "../../src/rpc.js";
import { buildSortedModelOptions, type SwarmControlRole } from "./recommendedModels.js";
import { SearchableModelSelect } from "./SearchableModelSelect.js";
import type { SwarmGuiContext, SwarmSnapshot } from "./types.js";
import { createDismissedFlag } from "./useDismissed.js";

export type { SwarmControlRole };

export interface SwarmControlOverlayProps {
  ctx: SwarmGuiContext;
  snapshot: () => SwarmSnapshot | null;
  counts: () => { active: number; waiting: number; posts: number; paused: boolean; stalled: boolean };
  isBuzzing: () => boolean;
  loadRoleConfig: () => Promise<SwarmRoleConfig | null>;
  onSetRoleModel: (role: SwarmControlRole, modelSpec: string) => Promise<SetRoleModelResult | null>;
  onOpenBoard: () => void;
  onOpenSetupWizard?: () => void;
  onClose: () => void;
}

const ROLE_META: Array<{ role: SwarmControlRole; title: string; subtitle: string }> = [
  {
    role: "coordinator",
    title: "Coordinator",
    subtitle: "@coordinator — leads planning, spawning & board coordination",
  },
  {
    role: "worker",
    title: "Worker",
    subtitle: "@worker — executes tasks (changing mid-swarm stops, switches & reruns)",
  },
  {
    role: "verifier",
    title: "Verifier",
    subtitle: "@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",
  },
  {
    role: "monitor",
    title: "Monitor",
    subtitle: "@monitor — watches stalls and nudges blocked threads",
  },
];

export function SwarmControlOverlay(props: SwarmControlOverlayProps) {
  const { Button, Dialog, Loader } = props.ctx.ui;
  const [config, setConfig] = createSignal<SwarmRoleConfig | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [savingRole, setSavingRole] = createSignal<SwarmControlRole | null>(null);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const isDismissed = createDismissedFlag();

  const fetchConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await props.loadRoleConfig();
      if (isDismissed()) return;
      setConfig(res);
    } catch (err) {
      if (isDismissed()) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      if (!isDismissed()) setLoading(false);
    }
  };

  onMount(() => {
    void fetchConfig();
  });

  const optionsForRole = (role: SwarmControlRole) => {
    const current = config()?.roleModels[role] ?? "";
    return buildSortedModelOptions(config()?.models ?? [], current);
  };

  const roleCounts = (role: SwarmControlRole) => {
    const snap = props.snapshot();
    if (!snap) return { working: 0, waiting: 0 };
    let working = 0;
    let waiting = 0;
    for (const m of snap.members) {
      if ((m.role ?? "").toLowerCase() !== role) continue;
      const st = m.state.toLowerCase();
      if (st === "working" || st === "active") working++;
      else if (st === "waiting" || st === "idle") waiting++;
    }
    return { working, waiting };
  };

  const handleModelChange = async (role: SwarmControlRole, nextSpec: string) => {
    if (!nextSpec) return;
    setSavingRole(role);
    setErrorMsg(null);
    try {
      const res = await props.onSetRoleModel(role, nextSpec);
      if (isDismissed()) return;
      if (!res || !res.ok) {
        const err = res?.error ?? `Failed to switch ${role} model`;
        setErrorMsg(err);
        props.ctx.toast.show({ title: `Failed to switch ${role}`, description: err, variant: "error" });
        return;
      }
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              roleModels: {
                ...prev.roleModels,
                [role]: res.model,
              },
            }
          : prev
      );
      const rerunNote =
        res.rerunMembers.length > 0
          ? `Stopped, switched & rerunning: ${res.rerunMembers.map((h) => `@${h}`).join(", ")}`
          : res.switchedMembers.length > 0
            ? `Updated: ${res.switchedMembers.map((h) => `@${h}`).join(", ")}`
            : `Default saved for next ${role}`;
      props.ctx.toast.show({
        title: `${role} → ${res.model}`,
        description: rerunNote,
        variant: "success",
      });
    } catch (err) {
      if (isDismissed()) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      props.ctx.toast.show({ title: `Failed to switch ${role}`, description: msg, variant: "error" });
    } finally {
      if (!isDismissed()) setSavingRole(null);
    }
  };

  return (
    <Dialog title="🐝 Swarm Control" size="large">
      <div class="swarm-overlay-root">
        <div class="swarm-overlay-top">
          <div class="swarm-overlay-status">
            <span class="swarm-overlay-badge">
              {props.isBuzzing() ? "🐝 Swarm: Buzzing" : "🐝 Swarm: Dozing"}
            </span>
            <div class="swarm-overlay-meta">
              <strong>{props.snapshot()?.title ?? "No active swarm"}</strong>
              <span>
                {props.counts().active} active · {props.counts().waiting} waiting · {props.counts().posts} posts
              </span>
            </div>
          </div>
          <div class="swarm-overlay-actions">
            <Show when={props.onOpenSetupWizard}>
              <Button
                variant="ghost"
                size="small"
                onClick={() => props.onOpenSetupWizard?.()}
              >
                Setup Wizard
              </Button>
            </Show>
            <Button
              variant="contrast"
              onClick={() => {
                props.onOpenBoard();
                props.onClose();
              }}
            >
              Board
            </Button>
          </div>
        </div>

        <Show when={errorMsg()}>
          <div class="swarm-overlay-error">{errorMsg()}</div>
        </Show>

        <Show
          when={!loading() || config() !== null}
          fallback={
            <div class="swarm-overlay-loading">
              <Loader size="normal" />
              <span>Loading role models...</span>
            </div>
          }
        >
          <div class="swarm-overlay-roles">
            <For each={ROLE_META}>
              {(item, idx) => {
                const rc = () => roleCounts(item.role);
                const currentSpec = () => config()?.roleModels[item.role] ?? "";
                const busy = () => savingRole() === item.role;
                const opts = createMemo(() => optionsForRole(item.role));
                return (
                  <div class="swarm-overlay-role-row">
                    <div class="swarm-overlay-role-info">
                      <div class="swarm-overlay-role-head">
                        <strong>{item.title}</strong>
                        <Show when={rc().working > 0 || rc().waiting > 0}>
                          <span class="swarm-overlay-role-count">
                            {rc().working > 0 ? `${rc().working} working` : `${rc().waiting} waiting`}
                          </span>
                        </Show>
                      </div>
                      <span class="swarm-overlay-role-sub">{item.subtitle}</span>
                    </div>
                    <div class="swarm-overlay-select-wrap">
                      <SearchableModelSelect
                        value={currentSpec()}
                        options={opts()}
                        disabled={busy()}
                        ariaLabel={`${item.title} model`}
                        menuUpward={idx() >= ROLE_META.length - 1}
                        onChange={(spec) => void handleModelChange(item.role, spec)}
                      />
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </Dialog>
  );
}
