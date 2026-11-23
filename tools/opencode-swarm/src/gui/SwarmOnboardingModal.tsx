import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { SwarmModelCatalogItem, SwarmRoleConfig } from "../../src/rpc.js";
import {
  buildSortedModelOptions,
  RECOMMENDED_ROLE_TARGETS,
  resolveRecommendedRoleModels,
  type SwarmControlRole,
} from "./recommendedModels.js";
import { SearchableModelSelect } from "./SearchableModelSelect.js";
import type { SwarmGuiContext } from "./types.js";
import { createDismissedFlag } from "./useDismissed.js";

const ROLE_ORDER: SwarmControlRole[] = ["coordinator", "worker", "verifier", "monitor"];

export interface SwarmOnboardingModalProps {
  ctx: SwarmGuiContext;
  loadRoleConfig: () => Promise<SwarmRoleConfig | null>;
  onApplyModels: (selections: Record<SwarmControlRole, string>) => Promise<{ ok: boolean; errors: string[] }>;
  onComplete: () => void;
  onSkip: () => void;
}

export function SwarmOnboardingModal(props: SwarmOnboardingModalProps) {
  const { Button, Dialog, Loader } = props.ctx.ui;
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [catalog, setCatalog] = createSignal<SwarmModelCatalogItem[]>([]);
  const [stepIndex, setStepIndex] = createSignal<number>(-1); // -1 = choose mode, 0..3 = manual role steps
  const [selections, setSelections] = createSignal<Record<SwarmControlRole, string>>({
    coordinator: RECOMMENDED_ROLE_TARGETS.coordinator.fallbackSpec,
    worker: RECOMMENDED_ROLE_TARGETS.worker.fallbackSpec,
    verifier: RECOMMENDED_ROLE_TARGETS.verifier.fallbackSpec,
    monitor: RECOMMENDED_ROLE_TARGETS.monitor.fallbackSpec,
  });

  const recommended = createMemo(() => resolveRecommendedRoleModels(catalog()));
  const isDismissed = createDismissedFlag();

  onMount(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const cfg = await props.loadRoleConfig();
      if (isDismissed()) return;
      const models = cfg?.models ?? [];
      setCatalog(models);
      const rec = resolveRecommendedRoleModels(models, cfg?.roleModels);
      setSelections(rec);
    } catch (err) {
      if (isDismissed()) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      if (!isDismissed()) setLoading(false);
    }
  });

  const applyAndFinish = async (chosen: Record<SwarmControlRole, string>) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await props.onApplyModels(chosen);
      if (isDismissed()) return;
      if (!res.ok) {
        const msg = res.errors.join("; ") || "Failed to apply one or more role models.";
        setErrorMsg(msg);
        props.ctx.toast.show({
          title: "Could not save all Swarm models",
          description: msg,
          variant: "error",
        });
        return;
      }
      props.ctx.toast.show({
        title: "Swarm role models configured",
        description: `Coordinator: ${chosen.coordinator}`,
        variant: "success",
      });
      props.onComplete();
    } catch (err) {
      if (isDismissed()) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      if (!isDismissed()) setSaving(false);
    }
  };

  const currentRole = createMemo(() => {
    const idx = stepIndex();
    return idx >= 0 && idx < ROLE_ORDER.length ? ROLE_ORDER[idx] : "coordinator";
  });

  const currentOptions = createMemo(() => {
    const role = currentRole();
    return buildSortedModelOptions(catalog(), selections()[role], recommended()[role]);
  });

  const setRoleSelection = (role: SwarmControlRole, spec: string) => {
    setSelections((prev) => ({ ...prev, [role]: spec }));
  };

  return (
    <Dialog title="🐝 Swarm Model Setup" size="large">
      <div class="swarm-onboard-root">
        <Show when={errorMsg()}>
          <div class="swarm-overlay-error">{errorMsg()}</div>
        </Show>

        <Show
          when={!loading()}
          fallback={
            <div class="swarm-overlay-loading">
              <Loader size="normal" />
              <span>Loading available models...</span>
            </div>
          }
        >
          <Show
            when={stepIndex() === -1}
            fallback={
              (() => {
                const idx = () => stepIndex();
                const role = () => currentRole();
                const target = () => RECOMMENDED_ROLE_TARGETS[role()];
                const recSpec = () => recommended()[role()];
                const pickedSpec = () => selections()[role()];
                const isRecSelected = () => pickedSpec() === recSpec();
                return (
                  <div class="swarm-onboard-step">
                    <div class="swarm-onboard-step-head">
                      <span class="swarm-onboard-step-pill">
                        Question {idx() + 1} of {ROLE_ORDER.length}
                      </span>
                      <h3>Choose {target().title} Model</h3>
                      <p>{target().subtitle}</p>
                    </div>

                    <div class="swarm-onboard-choices">
                      <button
                        type="button"
                        class={`swarm-onboard-option-card${isRecSelected() ? " is-selected" : ""}`}
                        onClick={() => setRoleSelection(role(), recSpec())}
                      >
                        <div class="swarm-onboard-option-top">
                          <strong>★ {recSpec()}</strong>
                          <span class="swarm-model-select-badge">Recommended</span>
                        </div>
                        <span class="swarm-onboard-option-sub">
                          {target().displayLabel}
                        </span>
                      </button>

                      <div class={`swarm-onboard-custom-card${!isRecSelected() ? " is-selected" : ""}`}>
                        <div class="swarm-onboard-custom-head">
                          <strong>Pick from catalog (A–Z search)</strong>
                          <span>Type to filter by provider, model, or variant</span>
                        </div>
                        <SearchableModelSelect
                          value={pickedSpec()}
                          options={currentOptions()}
                          disabled={saving()}
                          ariaLabel={`${target().title} model`}
                          onChange={(spec) => setRoleSelection(role(), spec)}
                        />
                      </div>
                    </div>

                    <div class="swarm-onboard-footer">
                      <Button
                        variant="ghost"
                        disabled={saving()}
                        onClick={() => setStepIndex((i) => Math.max(-1, i - 1))}
                      >
                        Back
                      </Button>
                      <div class="swarm-onboard-footer-right">
                        <Button variant="ghost" disabled={saving()} onClick={() => props.onSkip()}>
                          Skip for now
                        </Button>
                        <Show
                          when={idx() < ROLE_ORDER.length - 1}
                          fallback={
                            <Button
                              variant="contrast"
                              disabled={saving()}
                              onClick={() => void applyAndFinish(selections())}
                            >
                              {saving() ? "Saving..." : "Save & Finish"}
                            </Button>
                          }
                        >
                          <Button
                            variant="contrast"
                            disabled={saving()}
                            onClick={() => setStepIndex((i) => i + 1)}
                          >
                            Next ({idx() + 2}/{ROLE_ORDER.length})
                          </Button>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              })()
            }
          >
            <div class="swarm-onboard-intro">
              <p class="swarm-onboard-question">
                Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?
              </p>

              <div class="swarm-onboard-mode-cards">
                <button
                  type="button"
                  class="swarm-onboard-mode-card is-primary"
                  disabled={saving()}
                  onClick={() => void applyAndFinish(recommended())}
                >
                  <div class="swarm-onboard-option-top">
                    <strong>Use Recommended Models</strong>
                    <span class="swarm-model-select-badge">Recommended</span>
                  </div>
                  <p class="swarm-onboard-mode-desc">
                    Apply tuned defaults for all 4 roles right away:
                  </p>
                  <div class="swarm-onboard-rec-grid">
                    <For each={ROLE_ORDER}>
                      {(role) => (
                        <div class="swarm-onboard-rec-row">
                          <span class="swarm-onboard-rec-role">{RECOMMENDED_ROLE_TARGETS[role].title}</span>
                          <span class="swarm-onboard-rec-spec">{recommended()[role]}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </button>

                <button
                  type="button"
                  class="swarm-onboard-mode-card"
                  disabled={saving()}
                  onClick={() => setStepIndex(0)}
                >
                  <div class="swarm-onboard-option-top">
                    <strong>Pick Manually (4 Questions)</strong>
                  </div>
                  <p class="swarm-onboard-mode-desc">
                    Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.
                  </p>
                </button>
              </div>

              <div class="swarm-onboard-footer">
                <span />
                <Button variant="ghost" disabled={saving()} onClick={() => props.onSkip()}>
                  Skip for now
                </Button>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </Dialog>
  );
}
