// Which Templates window the test page shows. "today" is main's own dialog;
// a, b and c are the Stage 2 prototypes. The choice is remembered per browser.
import { useSyncExternalStore } from "react";

export type TemplatesVariant = "today" | "a" | "b" | "c";
export const variantNames: Record<TemplatesVariant, string> = {
  today: "Original · today's app",
  a: "A · Library",
  b: "B · Side panel",
  c: "C · Step by step",
};

const KEY = "newfork.scheduleTest.templatesVariant";
const listeners = new Set<() => void>();
let current: TemplatesVariant = (() => {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved && saved in variantNames ? (saved as TemplatesVariant) : "a";
  } catch {
    return "a";
  }
})();

export function getVariant(): TemplatesVariant {
  return current;
}

export function setVariant(next: TemplatesVariant): void {
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: the choice lasts for this tab.
  }
  listeners.forEach((listener) => listener());
}

export function useVariant(): TemplatesVariant {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVariant,
  );
}
