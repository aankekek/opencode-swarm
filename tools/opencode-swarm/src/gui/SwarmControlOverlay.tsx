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

const ROLE_META: Array<{ role: SwarmControlRole; icon: string; title: string; subtitle: string }> = [
  {
    role: "coordinator",
    icon: "🧭",
    title: "Coordinator",
    subtitle: "Plans, spawns & coordinates the board",
  },
  {
    role: "worker",
    icon: "🛠️",
    title: "Worker",
    subtitle: "Executes assigned tasks & edits",
  },
  {
    role: "verifier",
    icon: "🛡️",
    title: "Verifier",
    subtitle: "Read-only independent PASS/FAIL gate",
  },
  {
    role: "monitor",
    icon: "📡",
    title: "Monitor",
    subtitle: "Detects stalls & nudges blocked threads",
  },
];

function shortModelLabel(model?: string, variant?: string): string {
  if (!model) return "";
  const tail = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  return variant ? `${tail}#${variant}` : tail;
}

export function SwarmControlOverlay(props: SwarmControlOverlayProps) {
  const { Button, Dialog, Loader } = props.ctx.ui;
  const [config, setConfig] = createSignal<SwarmRoleConfig | null>(null);
  const [draftModels, setDraftModels] = createSignal<Partial<Record<SwarmControlRole, string>>>({});
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const isDismissed = createDismissedFlag();

  const fetchConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await props.loadRoleConfig();
      if (isDismissed()) return;
      setConfig(res);
      if (res?.roleModels) {
        setDraftModels({ ...res.roleModels });
      }
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

  const savedModelFor = (role: SwarmControlRole): string => config()?.roleModels[role] ?? "";
  const draftModelFor = (role: SwarmControlRole): string => draftModels()[role] ?? savedModelFor(role);

  const optionsForRole = (role: SwarmControlRole) => {
    return buildSortedModelOptions(config()?.models ?? [], draftModelFor(role));
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

  const changedRoles = createMemo(() => {
    return ROLE_META.filter((item) => {
      const saved = savedModelFor(item.role);
      const draft = draftModelFor(item.role);
      return Boolean(draft) && draft !== saved;
    });
  });

  const hasChanges = createMemo(() => changedRoles().length > 0);

  const affectedWorkingCount = createMemo(() => {
    let total = 0;
    for (const item of changedRoles()) {
      if (item.role === "coordinator") continue;
      total += roleCounts(item.role).working;
    }
    return total;
  });

  const handleSelectDraft = (role: SwarmControlRole, nextSpec: string) => {
    if (!nextSpec) return;
    setErrorMsg(null);
    setDraftModels((prev) => ({ ...prev, [role]: nextSpec }));
  };

  const handleReset = () => {
    const saved = config()?.roleModels;
    if (saved) setDraftModels({ ...saved });
    setErrorMsg(null);
  };

  const handleApply = async () => {
    const changes = changedRoles();
    if (changes.length === 0 || saving()) return;
    setSaving(true);
    setErrorMsg(null);

    const updatedRoleModels: Partial<Record<SwarmControlRole, string>> = {
      ...(config()?.roleModels ?? {}),
    };
    const appliedSummaries: string[] = [];
    const rerunHandles: string[] = [];
    const errors: string[] = [];

    try {
      for (const item of changes) {
        const nextSpec = draftModelFor(item.role);
        const res = await props.onSetRoleModel(item.role, nextSpec);
        if (isDismissed()) return;
        if (!res || !res.ok) {
          errors.push(`${item.title}: ${res?.error ?? "failed"}`);
          continue;
        }
        updatedRoleModels[item.role] = res.model;
        appliedSummaries.push(`${item.title} → ${res.model}`);
        for (const h of res.rerunMembers) {
          if (!rerunHandles.includes(h)) rerunHandles.push(h);
        }
      }

      setConfig((prev) =>
        prev
          ? {
              ...prev,
              roleModels: {
                ...prev.roleModels,
                ...updatedRoleModels,
              },
            }
          : prev
      );

      if (errors.length > 0) {
        const msg = errors.join("; ");
        setErrorMsg(msg);
        props.ctx.toast.show({
          title: "Some role switches failed",
          description: msg,
          variant: "error",
        });
      } else {
        props.ctx.toast.show({
          title: `Updated ${appliedSummaries.length} role${appliedSummaries.length === 1 ? "" : "s"}`,
          description:
            rerunHandles.length > 0
              ? `Switched & rerunning: ${rerunHandles.map((h) => `@${h}`).join(", ")}`
              : appliedSummaries.join(" · "),
          variant: "success",
        });
      }
    } catch (err) {
      if (isDismissed()) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      props.ctx.toast.show({ title: "Failed to apply role models", description: msg, variant: "error" });
    } finally {
      if (!isDismissed()) setSaving(false);
    }
  };

  const members = createMemo(() => props.snapshot()?.members ?? []);

  return (
    <Dialog title="🐝 Swarm Control" size="large">
      <div class="swarm-overlay-root">
        <div
          class={`swarm-overlay-top${props.isBuzzing() ? " is-buzzing" : ""}${
            props.counts().paused || props.counts().stalled ? " is-alert" : ""
          }`}
        >
          <div class="swarm-overlay-status">
            <span class={`swarm-overlay-badge${props.isBuzzing() ? " is-buzzing" : ""}`}>
              <span class="swarm-overlay-dot" aria-hidden="true" />
              {props.isBuzzing() ? "🐝 Swarm: Buzzing" : "🐝 Swarm: Dozing"}
            </span>
            <div class="swarm-overlay-meta">
              <strong>{props.snapshot()?.title ?? "No active swarm"}</strong>
              <div class="swarm-overlay-stats">
                <span class="swarm-overlay-stat">{props.counts().active} active</span>
                <span class="swarm-overlay-stat">{props.counts().waiting} waiting</span>
                <span class="swarm-overlay-stat">{props.counts().posts} posts</span>
                <Show when={props.counts().paused}>
                  <span class="swarm-overlay-stat is-danger">Quota paused</span>
                </Show>
                <Show when={props.counts().stalled && !props.counts().paused}>
                  <span class="swarm-overlay-stat is-warn">Stalled</span>
                </Show>
              </div>
            </div>
          </div>
          <div class="swarm-overlay-actions">
            <Show when={props.onOpenSetupWizard}>
              <Button variant="ghost" size="small" onClick={() => props.onOpenSetupWizard?.()}>
                Setup Wizard
              </Button>
            </Show>
            <Button
              variant="contrast"
              size="small"
              onClick={() => {
                props.onOpenBoard();
                props.onClose();
              }}
            >
              Open Board
            </Button>
          </div>
        </div>

        <Show when={members().length > 0}>
          <div class="swarm-overlay-roster" aria-label="Active swarm members">
            <For each={members()}>
              {(m) => {
                const st = m.state.toLowerCase();
                const isWorking = st === "working" || st === "active";
                const isKilled = st === "killed";
                const modelTag = shortModelLabel(m.model, m.variant);
                return (
                  <span
                    class={`swarm-overlay-member-chip${isWorking ? " is-working" : ""}${
                      isKilled ? " is-killed" : ""
                    }`}
                  >
                    <span class="swarm-overlay-member-dot" aria-hidden="true" />
                    <span class="swarm-overlay-member-handle">@{m.handle}</span>
                    <Show when={modelTag}>
                      <span class="swarm-overlay-member-model">{modelTag}</span>
                    </Show>
                  </span>
                );
              }}
            </For>
          </div>
        </Show>

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
                const draftSpec = () => draftModelFor(item.role);
                const isDirty = () => Boolean(draftSpec()) && draftSpec() !== savedModelFor(item.role);
                const opts = createMemo(() => optionsForRole(item.role));
                return (
                  <div class={`swarm-overlay-role-card${isDirty() ? " is-dirty" : ""}`}>
                    <div class="swarm-overlay-role-info">
                      <div class="swarm-overlay-role-head">
                        <span class="swarm-overlay-role-title">
                          <span aria-hidden="true">{item.icon}</span>
                          <strong>{item.title}</strong>
                        </span>
                        <div class="swarm-overlay-role-badges">
                          <Show when={isDirty()}>
                            <span class="swarm-overlay-dirty-pill">Modified</span>
                          </Show>
                          <Show when={rc().working > 0 || rc().waiting > 0}>
                            <span class={`swarm-overlay-role-count${rc().working > 0 ? " is-working" : ""}`}>
                              {rc().working > 0 ? `${rc().working} working` : `${rc().waiting} waiting`}
                            </span>
                          </Show>
                        </div>
                      </div>
                      <span class="swarm-overlay-role-sub">{item.subtitle}</span>
                    </div>
                    <div class="swarm-overlay-select-wrap">
                      <SearchableModelSelect
                        value={draftSpec()}
                        options={opts()}
                        disabled={saving()}
                        ariaLabel={`${item.title} model`}
                        menuUpward={idx() >= 2}
                        onChange={(spec) => handleSelectDraft(item.role, spec)}
                      />
                    </div>
                    <Show when={isDirty() && item.role !== "coordinator" && rc().working > 0}>
                      <span class="swarm-overlay-role-warn">
                        Applying will interrupt & rerun {rc().working} working {item.role}
                        {rc().working === 1 ? "" : "s"}
                      </span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        <div class="swarm-overlay-footer">
          <div class="swarm-overlay-footer-note">
            <Show
              when={hasChanges()}
              fallback={<span>No pending model changes — running members are untouched.</span>}
            >
              <span>
                {changedRoles().length} role change{changedRoles().length === 1 ? "" : "s"} ready
                <Show when={affectedWorkingCount() > 0}>
                  {` · interrupts ${affectedWorkingCount()} working member${affectedWorkingCount() === 1 ? "" : "s"}`}
                </Show>
              </span>
            </Show>
          </div>
          <div class="swarm-overlay-footer-actions">
            <Show when={hasChanges()}>
              <Button variant="ghost" size="small" disabled={saving()} onClick={handleReset}>
                Reset
              </Button>
            </Show>
            <Button variant="ghost" size="small" disabled={saving()} onClick={() => props.onClose()}>
              Close
            </Button>
            <Button
              variant="contrast"
              size="small"
              disabled={!hasChanges() || saving()}
              onClick={() => void handleApply()}
            >
              {saving() ? "Applying..." : "Apply Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
