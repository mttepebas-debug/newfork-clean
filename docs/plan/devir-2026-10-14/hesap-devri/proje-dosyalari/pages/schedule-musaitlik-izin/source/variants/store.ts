// Which variant the test page shows for each of Mert's Schedule items
// (1, 6, 15, 16 of his 2026-10-09 list). "today" is main's own behaviour.
// The choice is remembered per browser and mirrored on <html> as
// data-v-<item>="<key>", so CSS can follow it without React.
import { useSyncExternalStore } from "react";

export type ItemKey = "i1" | "i6" | "i15" | "i16";
export type VariantKey = "today" | "a" | "b" | "c";

export interface ItemDefinition {
  readonly title: string;
  readonly options: Readonly<Record<VariantKey, string>>;
}

export const items: Readonly<Record<ItemKey, ItemDefinition>> = {
  i1: {
    title: "1 · Name \"!\" shows unavailable days",
    options: { today: "Original (today)", a: "A · Soft tint", b: "B · Tint + hours", c: "C · Spotlight" },
  },
  i6: {
    title: "6 · Approved time off cell",
    options: { today: "Original (today)", a: "A · Locked flat", b: "B · Stripes + lock", c: "C · Hours drawn" },
  },
  i15: {
    title: "15 · \"!\" window while scrolling",
    options: { today: "Original (today)", a: "A · Follows the \"!\"", b: "B · Closes on scroll", c: "C · Follows, then docks" },
  },
  i16: {
    title: "16 · Time off hover and drag",
    options: { today: "Original (today)", a: "A · Calm", b: "B · Reveal", c: "C · Push back" },
  },
};

const KEY = "newfork.scheduleTest.musaitlikIzin";
const defaults: Record<ItemKey, VariantKey> = { i1: "a", i6: "a", i15: "a", i16: "a" };
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
