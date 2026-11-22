import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { SetRoleModelResult, SwarmRoleConfig } from "../../src/rpc.js";
import type { SwarmGuiContext, SwarmSnapshot } from "./types.js";

export type SwarmControlRole = "coordinator" | "worker" | "verifier" | "monitor";

export interface SwarmControlOverlayProps {
  ctx: SwarmGuiContext;
  snapshot: () => SwarmSnapshot | null;
  counts: () => { active: number; waiting: number; posts: number; paused: boolean; stalled: boolean };
  isBuzzing: () => boolean;
  loadRoleConfig: () => Promise<SwarmRoleConfig | null>;
  onSetRoleModel: (role: SwarmControlRole, modelSpec: string) => Promise<SetRoleModelResult | null>;
  onOpenBoard: () => void;
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

  const fetchConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await props.loadRoleConfig();
      setConfig(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void fetchConfig();
  });

  const modelOptions = createMemo(() => {
    const cfg = config();
    const specs: Array<{ spec: string; label: string }> = [];
    const seen = new Set<string>();
    for (const m of cfg?.models ?? []) {
      const base = `${m.providerID}/${m.id}`;
      if (!seen.has(base)) {
        seen.add(base);
        specs.push({ spec: base, label: m.name ? `${base} (${m.name})` : base });
      }
      for (const v of m.variants ?? []) {
        const withVar = `${base}#${v}`;
        if (!seen.has(withVar)) {
          seen.add(withVar);
          specs.push({ spec: withVar, label: withVar });
        }
      }
    }
    return specs;
  });

  const optionsForRole = (role: SwarmControlRole) => {
    const current = config()?.roleModels[role] ?? "";
    const base = modelOptions();
    if (current && !base.some((o) => o.spec === current)) {
      return [{ spec: current, label: `${current} (current)` }, ...base];
    }
    return base;
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
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      props.ctx.toast.show({ title: `Failed to switch ${role}`, description: msg, variant: "error" });
    } finally {
      setSavingRole(null);
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
              {(item) => {
                const rc = () => roleCounts(item.role);
                const currentSpec = () => config()?.roleModels[item.role] ?? "";
                const busy = () => savingRole() === item.role;
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
                    <select
                      class="swarm-gui-select swarm-overlay-select"
                      value={currentSpec()}
                      disabled={busy()}
                      aria-label={`${item.title} model`}
                      onChange={(e) => void handleModelChange(item.role, e.currentTarget.value)}
                    >
                      <Show when={optionsForRole(item.role).length === 0}>
                        <option value="">No models available</option>
                      </Show>
                      <For each={optionsForRole(item.role)}>
                        {(opt) => (
                          <option value={opt.spec} selected={opt.spec === currentSpec()}>
                            {opt.label}
                          </option>
                        )}
                      </For>
                    </select>
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
