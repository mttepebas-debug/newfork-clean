// Which version of each item the test page shows. "original" is main's own
// code, the rest are prototypes. Choices are remembered per browser.
import { useSyncExternalStore } from "react";

export const items = {
  newSchedule: {
    title: "2 · New Schedule window",
    options: {
      original: "Original (main) = Sep 28 style B, chosen then",
      v1: "1 · Clean list",
      v2: "2 · Live + draft cards",
      v3: "3 · Wide table",
      v4: "4 · Tabs",
      v5: "5 · Side drawer",
      sa: "Sep 28 · A · Newfork style (all top-right windows)",
      sc: "Sep 28 · C · Competitors' style (all top-right windows)",
    },
  },
  export: {
    title: "5 · Export menu",
    options: {
      original: "Original (main) = Sep 16 D, chosen then",
      v1: "1 · Quick dropdown",
      v2: "2 · Tidy side panel",
      v3: "3 · Big preview window",
      v4: "4 · Three steps",
      v5: "5 · Ready-made uses",
      oa: "Sep 16 · A · Format cards",
      ob: "Sep 16 · B · Settings rows",
      oc: "Sep 16 · C · Preview first",
      oe: "Sep 16 · E · Key-value rows, button group",
      of: "Sep 16 · F · Preview with an accordion",
    },
  },
  topBar: {
    title: "7 · Top bar (long names)",
    options: {
      original: "Original (main) = Oct 6 A",
      a: "A · Buttons stay put, filters move below",
      b: "B · Icons shrink first (same as Oct 6 B)",
      c: "C · One Filters button (same as Oct 6 C)",
      d: "D · Two fixed rows",
    },
  },
  unpublish: {
    title: "8 · Unpublish window",
    options: {
      original: "Original (main)",
      v1: "1 · Short question",
      v2: "2 · Who is affected",
      v3: "3 · Location cards",
      v4: "4 · Now / after",
      v5: "5 · Small pop-up",
    },
  },
  defaultHours: {
    title: "9 · Review default hours",
    options: {
      original: "Original (main)",
      v1: "1 · Button with a count",
      v2: "2 · Notice above the grid",
      v3: "3 · Per shift type",
    },
  },
} as const;

export type ItemKey = keyof typeof items;
export type OptionOf<K extends ItemKey> = keyof (typeof items)[K]["options"];

const PREFIX = "newfork.scheduleTopBar.variant.";
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
applyTopBarAttribute();

function applyTopBarAttribute(): void {
  document.documentElement.dataset.stTopbar = current.topBar;
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
  if (key === "topBar") applyTopBarAttribute();
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
