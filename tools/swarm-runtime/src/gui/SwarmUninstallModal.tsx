import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { UninstallCategoryId, UninstallPlan, UninstallResult, UninstallSelection } from "../../src/rpc.js";
import type { SwarmGuiContext } from "./types.js";

export interface SwarmUninstallModalProps {
  ctx: SwarmGuiContext;
  loadPlan: () => Promise<UninstallPlan | null>;
  onExecute: (categories: Partial<UninstallSelection>) => Promise<UninstallResult | null>;
  onResetGuiStore: () => void;
  onClose: () => void;
}

function formatBytes(bytes?: number): string {
  if (typeof bytes !== "number" || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SwarmUninstallModal(props: SwarmUninstallModalProps) {
  const { Button, Dialog, Loader } = props.ctx.ui;
  const [loading, setLoading] = createSignal(true);
  const [running, setRunning] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [plan, setPlan] = createSignal<UninstallPlan | null>(null);
  const [result, setResult] = createSignal<UninstallResult | null>(null);
  const [resetGuiStore, setResetGuiStore] = createSignal(true);
  const [selected, setSelected] = createSignal<UninstallSelection>({
    pluginRegistration: true,
    gitWorktreesAndBranches: true,
    runtimeData: true,
    buildArtifacts: true,
    tempFiles: true,
  });

  onMount(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const p = await props.loadPlan();
      setPlan(p);
      if (p) {
        const init = { ...selected() };
        for (const cat of p.categories) {
          init[cat.id] = cat.defaultChecked;
        }
        setSelected(init);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  });

  const selectedCount = createMemo(() => {
    const s = selected();
    return Object.values(s).filter(Boolean).length + (resetGuiStore() ? 1 : 0);
  });

  const toggleCategory = (id: UninstallCategoryId) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = async () => {
    setRunning(true);
    setErrorMsg(null);
    try {
      const res = await props.onExecute(selected());
      if (resetGuiStore()) {
        props.onResetGuiStore();
      }
      setResult(res);
      if (res?.ok) {
        props.ctx.toast.show({
          title: "Swarm plugin uninstalled",
          description: "Reload or restart OpenCode to finish unloading.",
          variant: "success",
        });
      } else if (res) {
        props.ctx.toast.show({
          title: "Uninstall completed with warnings",
          description: `${res.errors.length} error(s) — check verification checklist.`,
          variant: "error",
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog title="Uninstall Swarm Plugin — Removal Checklist" size="large">
      <div class="swarm-uninstall-root">
        <Show when={errorMsg()}>
          <div class="swarm-overlay-error">{errorMsg()}</div>
        </Show>

        <Show
          when={!loading()}
          fallback={
            <div class="swarm-overlay-loading">
              <Loader size="normal" />
              <span>Scanning config, git worktrees, runtime data, and temp files...</span>
            </div>
          }
        >
          <Show
            when={result() === null}
            fallback={
              (() => {
                const res = () => result()!;
                return (
                  <div class="swarm-uninstall-report">
                    <div class={`swarm-uninstall-banner${res().ok ? " is-ok" : " is-warn"}`}>
                      <strong>
                        {res().ok
                          ? "All selected Swarm items removed and verified"
                          : "Uninstall completed with remaining items"}
                      </strong>
                      <span>
                        {res().removed.length} removed · {res().edited.length} config(s) updated · {res().skipped.length} skipped · {res().errors.length} error(s)
                      </span>
                    </div>

                    <div class="swarm-uninstall-section">
                      <strong>Verification Checklist</strong>
                      <div class="swarm-uninstall-checks">
                        <For each={res().verification}>
                          {(chk) => (
                            <div class={`swarm-uninstall-check-row${chk.passed ? " is-pass" : " is-fail"}`}>
                              <span>{chk.passed ? "✓" : "✗"}</span>
                              <div>
                                <strong>{chk.label}</strong>
                                <div class="swarm-uninstall-detail">{chk.detail}</div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>

                    <Show when={res().errors.length > 0}>
                      <div class="swarm-uninstall-section">
                        <strong>Errors</strong>
                        <ul class="swarm-uninstall-list">
                          <For each={res().errors}>{(err) => <li>{err}</li>}</For>
                        </ul>
                      </div>
                    </Show>

                    <Show when={res().nextSteps.length > 0}>
                      <div class="swarm-uninstall-section">
                        <strong>Final Host Reload Commands</strong>
                        <pre class="swarm-uninstall-code">{res().nextSteps.join("\n")}</pre>
                      </div>
                    </Show>

                    <div class="swarm-uninstall-footer">
                      <span />
                      <Button variant="contrast" onClick={() => props.onClose()}>
                        Close
                      </Button>
                    </div>
                  </div>
                );
              })()
            }
          >
            <Show when={plan()}>
              {(p) => (
                <div class="swarm-uninstall-plan">
                  <p class="swarm-uninstall-intro">
                    Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.
                  </p>

                  <div class="swarm-uninstall-categories">
                    <For each={p().categories}>
                      {(cat) => {
                        const isChecked = () => selected()[cat.id];
                        return (
                          <div class={`swarm-uninstall-card${isChecked() ? " is-checked" : ""}`}>
                            <label class="swarm-uninstall-card-head">
                              <input
                                type="checkbox"
                                checked={isChecked()}
                                disabled={running()}
                                onChange={() => toggleCategory(cat.id)}
                              />
                              <div class="swarm-uninstall-card-title">
                                <strong>{cat.title}</strong>
                                <span>{cat.description}</span>
                              </div>
                              <span class="swarm-uninstall-count">
                                {cat.items.length === 0 ? "Clean" : `${cat.items.length} item${cat.items.length === 1 ? "" : "s"}`}
                              </span>
                            </label>

                            <Show
                              when={cat.items.length > 0}
                              fallback={<div class="swarm-uninstall-empty">Nothing detected on disk</div>}
                            >
                              <ul class="swarm-uninstall-items">
                                <For each={cat.items}>
                                  {(item) => (
                                    <li>
                                      <span class="swarm-uninstall-kind">{item.kind}</span>
                                      <code class="swarm-uninstall-path">{item.path}</code>
                                      <span class="swarm-uninstall-detail">
                                        {item.detail}
                                        {item.sizeBytes ? ` (${formatBytes(item.sizeBytes)})` : ""}
                                      </span>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                          </div>
                        );
                      }}
                    </For>

                    <div class={`swarm-uninstall-card${resetGuiStore() ? " is-checked" : ""}`}>
                      <label class="swarm-uninstall-card-head">
                        <input
                          type="checkbox"
                          checked={resetGuiStore()}
                          disabled={running()}
                          onChange={() => setResetGuiStore((v) => !v)}
                        />
                        <div class="swarm-uninstall-card-title">
                          <strong>6. Swarm GUI Settings Store</strong>
                          <span>Reset saved GUI preferences and onboarding state back to defaults.</span>
                        </div>
                        <span class="swarm-uninstall-count">1 store</span>
                      </label>
                    </div>
                  </div>

                  <div class="swarm-uninstall-preserved">
                    <strong>Preserved (Not Removed)</strong>
                    <ul>
                      <For each={p().preserved}>{(line) => <li>{line}</li>}</For>
                    </ul>
                  </div>

                  <div class="swarm-uninstall-footer">
                    <Button variant="ghost" disabled={running()} onClick={() => props.onClose()}>
                      Cancel
                    </Button>
                    <Button
                      variant="contrast"
                      disabled={running() || selectedCount() === 0}
                      onClick={() => void handleConfirm()}
                    >
                      {running() ? "Removing..." : "Confirm & Remove Selected Items"}
                    </Button>
                  </div>
                </div>
              )}
            </Show>
          </Show>
        </Show>
      </div>
    </Dialog>
  );
}
