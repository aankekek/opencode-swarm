import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { ModelOption } from "./recommendedModels.js";

export interface SearchableModelSelectProps {
  value: string;
  options: ModelOption[];
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  menuUpward?: boolean;
  onChange: (spec: string) => void;
}

export function SearchableModelSelect(props: SearchableModelSelectProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  let rootRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  const filteredOptions = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return props.options;
    const tokens = q.split(/\s+/).filter(Boolean);
    return props.options.filter((opt) => {
      const hay = `${opt.label} ${opt.spec}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  });

  const selectedLabel = createMemo(() => {
    const val = props.value;
    if (!val) return props.placeholder ?? "Select model...";
    const found = props.options.find((o) => o.spec === val);
    return found ? found.label : val;
  });

  createEffect(() => {
    if (!open()) return;
    setQuery("");
    queueMicrotask(() => {
      searchInputRef?.focus();
    });

    const onMouseDown = (e: MouseEvent) => {
      if (rootRef && !rootRef.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    });
  });

  const selectOption = (spec: string) => {
    setOpen(false);
    setQuery("");
    if (spec !== props.value) {
      props.onChange(spec);
    }
  };

  return (
    <div ref={rootRef} class="swarm-model-select">
      <button
        type="button"
        class="swarm-model-select-trigger"
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        aria-expanded={open()}
        aria-haspopup="listbox"
        onClick={() => {
          if (!props.disabled) setOpen((v) => !v);
        }}
      >
        <span class="swarm-model-select-value">{selectedLabel()}</span>
        <span class="swarm-model-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      <Show when={open()}>
        <div
          class={`swarm-model-select-menu${props.menuUpward ? " swarm-model-select-menu-upward" : ""}`}
          role="listbox"
          aria-label={`${props.ariaLabel} options`}
        >
          <div class="swarm-model-select-search-wrap">
            <input
              ref={searchInputRef}
              type="search"
              class="swarm-model-select-search"
              placeholder="Search models..."
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const first = filteredOptions()[0];
                  if (first) selectOption(first.spec);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
          </div>
          <div class="swarm-model-select-list">
            <Show
              when={filteredOptions().length > 0}
              fallback={<div class="swarm-model-select-empty">No matching models</div>}
            >
              <For each={filteredOptions()}>
                {(opt) => {
                  const isSelected = () => opt.spec === props.value;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected()}
                      class={`swarm-model-select-item${isSelected() ? " is-selected" : ""}`}
                      onClick={() => selectOption(opt.spec)}
                    >
                      <span class="swarm-model-select-item-label">{opt.label}</span>
                      <span class="swarm-model-select-item-right">
                        <Show when={opt.isRecommended}>
                          <span class="swarm-model-select-badge">Recommended</span>
                        </Show>
                        <Show when={isSelected()}>
                          <span class="swarm-model-select-check" aria-hidden="true">
                            ✓
                          </span>
                        </Show>
                      </span>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
