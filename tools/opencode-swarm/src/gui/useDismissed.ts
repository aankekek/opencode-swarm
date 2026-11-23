import { onCleanup } from "solid-js";

/**
 * Creates a flag that flips to `true` when the owning reactive scope is
 * disposed (for example when a dialog is dismissed via Escape or an
 * outside click).
 *
 * Must be called during component setup (or inside a `createRoot` callback)
 * because it registers an `onCleanup` handler. The returned getter is safe to
 * call at any time, including after disposal; it is intended to be checked
 * after every `await` so async work that outlives its dialog does not write
 * UI state or fire global side effects.
 */
export function createDismissedFlag(): () => boolean {
  let dismissed = false;
  onCleanup(() => {
    dismissed = true;
  });
  return () => dismissed;
}
