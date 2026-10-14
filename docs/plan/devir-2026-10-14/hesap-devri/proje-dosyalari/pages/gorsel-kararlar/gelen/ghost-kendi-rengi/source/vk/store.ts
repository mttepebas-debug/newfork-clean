// The ghost card picks on this test page. "original" is main's ghost today.
// The pick is remembered per browser and written on <html> so the CSS can
// follow it.
import { useSyncExternalStore } from "react";

export const items = {
  ghost: {
    title: "Ghost shift color",
    hint: "Edit mode: a shift the person has at the other location. Each variant keeps the real card's own color.",
    options: {
      original: "Original (today): one dead grey hatch for every ghost",
      a: "A · Own color drained toward grey (dead tone), text like the real card",
      b: "B · Own color, very pale (washed out), text like the real card",
      c: "C · Own color in a dead tone, with the fine hatch of today's ghost",
      d: "D · Own color, pale and sunk in (the Oct 11 recipe)",
      e: "E · The real card with 70% of its color drained",
      f: "F · Own color in a dead tone, dashed edge",
      g: "G · Switched-off button: grey, its color only as a faint left edge",
      h: "H · Drained: its color nearly gone, quiet grey text",
      i: "I · See-through: the real card at half strength (below AA)",
      j: "J · Fogged: its color under a white veil, quiet grey text",
    },
  },
} as const;

export type ItemKey = keyof typeof items;
export type OptionKey<K extends ItemKey> = keyof (typeof items)[K]["options"] & string;

const KEY = "newfork.scheduleGK.variants.v1";
const listeners = new Set<() => void>();
type Picks = { [K in ItemKey]: string };
let picks: Picks = (() => {
  const fallback: Picks = { ghost: "original" };
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Picks>;
    for (const item of Object.keys(items) as ItemKey[]) {
      const value = saved[item];
      if (value && value in items[item].options) fallback[item] = value;
    }
  } catch {
    // Storage blocked: start on the original.
  }
  return fallback;
})();

function writeRoot(): void {
  for (const item of Object.keys(items) as ItemKey[]) {
    document.documentElement.dataset[`vk${item[0]!.toUpperCase()}${item.slice(1)}`] = picks[item];
  }
}
writeRoot();

export function getPick<K extends ItemKey>(item: K): OptionKey<K> {
  return picks[item] as OptionKey<K>;
}

export function setPick<K extends ItemKey>(item: K, value: OptionKey<K>): void {
  picks = { ...picks, [item]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    // Storage blocked: the pick lasts for this tab.
  }
  writeRoot();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePick<K extends ItemKey>(item: K): OptionKey<K> {
  return useSyncExternalStore(subscribe, () => picks[item] as OptionKey<K>);
}
