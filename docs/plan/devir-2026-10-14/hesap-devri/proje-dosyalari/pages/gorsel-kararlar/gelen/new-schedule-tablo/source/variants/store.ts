// Which version of each item the test page shows. "original" is main's own
// code, the rest are prototypes. Choices are remembered per browser.
import { useSyncExternalStore } from "react";

export const items = {
  newSchedule: {
    title: "New Schedule window",
    options: {
      original: "Original (main)",
      a: "A · Table, row menu",
      b: "B · Table with tabs",
    },
  },
} as const;

export type ItemKey = keyof typeof items;
export type OptionOf<K extends ItemKey> = keyof (typeof items)[K]["options"];

const PREFIX = "newfork.nsTable.variant.";
const listeners = new Set<() => void>();
const current: Record<string, string> = {};

for (const key of Object.keys(items) as ItemKey[]) {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(PREFIX + key);
  } catch {
    // Storage blocked: start from the defaults.
  }
  current[key] = saved && saved in items[key].options ? saved : "original";
}
applyAttribute();

/** A and B take Export and Templates out of the top bar (CSS reads this). */
function applyAttribute(): void {
  document.documentElement.dataset.stNs = current.newSchedule;
}

export function getChoice<K extends ItemKey>(key: K): OptionOf<K> {
  return current[key] as OptionOf<K>;
}

export function setChoice(key: ItemKey, value: string): void {
  current[key] = value;
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage blocked: the choice lasts for this tab.
  }
  applyAttribute();
  listeners.forEach((listener) => listener());
}

export function useChoice<K extends ItemKey>(key: K): OptionOf<K> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getChoice(key),
  );
}
