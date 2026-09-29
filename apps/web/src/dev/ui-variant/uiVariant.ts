import { useSyncExternalStore } from "react";

// ponytail: DEV-only mockup switch for the Schedule top-right windows
// (?ui=a|b|c). Deleted once a variant is chosen and built for real.
export type UiVariant = "a" | "b" | "c";

export const UI_VARIANTS: readonly UiVariant[] = ["a", "b", "c"];
const STORAGE_KEY = "nf-ui-variant";
const EVENT = "nf-ui-variant";

export function readUiVariant(): UiVariant | null {
  const value = document.documentElement.dataset.uiVariant;
  return UI_VARIANTS.includes(value as UiVariant) ? (value as UiVariant) : null;
}

export function applyUiVariant(next: UiVariant | null): void {
  if (next) document.documentElement.dataset.uiVariant = next;
  else delete document.documentElement.dataset.uiVariant;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the switch still works for this page load.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function storedUiVariant(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function subscribeUiVariant(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

// Production never sets the attribute, so this is always null there.
export function useUiVariant(): UiVariant | null {
  return useSyncExternalStore(subscribeUiVariant, readUiVariant, () => null);
}
