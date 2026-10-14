// Which variant the test page shows for each of Mert's Schedule items
// (1, 6, 15, 16 of his 2026-10-09 list). "today" is main's own behaviour.
// The choice is remembered per browser and mirrored on <html> as
// data-v-<item>="<key>", so CSS can follow it without React.
import { useSyncExternalStore } from "react";

export type ItemKey = "i1" | "i6" | "i6c" | "i15" | "i16";
export type VariantKey = "today" | "a" | "b" | "c" | "lock";

export interface ItemDefinition {
  readonly title: string;
  /** "Karar verildi" or "Karar bekliyor" (2026-10-09 gece işi). */
  readonly status: string;
  readonly options: Readonly<Partial<Record<VariantKey, string>>>;
}

// 2026-10-09 08:13Z, Mert: 1 → A, 6 (look) → Original, 15 → B, 16 → A. The
// turned-down variants are gone from the page. Still open: what a click on a
// whole-day time off cell does (item 6's second half).
export const items: Readonly<Record<ItemKey, ItemDefinition>> = {
  i1: {
    title: "1 · Name \"!\" shows unavailable days",
    status: "Karar verildi",
    options: { a: "A · Soft tint (chosen)" },
  },
  i6: {
    title: "6 · Approved time off cell: look",
    status: "Karar verildi",
    options: { today: "Original: flat red, \"TIME OFF\" (chosen)" },
  },
  i6c: {
    title: "6 · Click on a whole-day time off cell",
    status: "Karar bekliyor",
    options: {
      today: "Original (today): Add shift opens; saving is refused",
      lock: "Locked: no Add shift; a click explains why",
    },
  },
  i15: {
    title: "15 · \"!\" window while scrolling",
    status: "Karar verildi",
    options: { b: "B · Closes on scroll (chosen)" },
  },
  i16: {
    title: "16 · Time off hover and drag",
    status: "Karar verildi",
    options: { a: "A · Calm (chosen)" },
  },
};

const KEY = "newfork.scheduleTest.musaitlikIzin.v2";
const defaults: Record<ItemKey, VariantKey> = { i1: "a", i6: "today", i6c: "today", i15: "b", i16: "a" };
const listeners = new Set<() => void>();

let current: Record<ItemKey, VariantKey> = (() => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Record<ItemKey, VariantKey>> | null;
    const next = { ...defaults };
    for (const item of Object.keys(items) as ItemKey[]) {
      const value = saved?.[item];
      if (value && value in items[item].options) next[item] = value;
    }
    return next;
  } catch {
    return { ...defaults };
  }
})();

function mirror(): void {
  for (const item of Object.keys(current) as ItemKey[]) {
    document.documentElement.dataset[`v${item.slice(1)}`] = current[item];
  }
}
mirror();

export function getVariant(item: ItemKey): VariantKey {
  return current[item];
}

export function setVariant(item: ItemKey, next: VariantKey): void {
  current = { ...current, [item]: next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice lasts for this tab.
  }
  mirror();
  listeners.forEach((listener) => listener());
}

export function useVariant(item: ItemKey): VariantKey {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current[item],
  );
}
