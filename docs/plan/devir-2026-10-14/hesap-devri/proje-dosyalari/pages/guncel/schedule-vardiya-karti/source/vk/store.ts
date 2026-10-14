// The variant picks on this test page: one per item (published check, drag,
// ghost shift). "original" is main's behavior today. The pick is remembered
// per browser and also written on <html> so the CSS can follow it.
import { useSyncExternalStore } from "react";

export const items = {
  tick: {
    title: "3 · Published check",
    status: "Karar verildi",
    hint: "Edit mode. Mert chose 6 on 2026-10-09; the other marks were turned down.",
    options: {
      t6: "6 · Chosen: no mark on published, \"New\" on unpublished",
    },
  },
  drag: {
    title: "4 · While dragging a shift",
    status: "Karar verildi",
    hint: "Edit mode, drag a shift to another person. Mert chose B on 2026-10-09.",
    options: {
      d2: "B · Chosen: hide people who can't take it at the shift's own location",
    },
  },
  ghost: {
    title: "10 · Ghost shift",
    status: "Karar bekliyor",
    hint: "A shift the person has at the other location (grey card).",
    options: {
      original: "Original (11b, chosen 2026-09-26): grey hatch, still",
      g1: "1 · Amber hatch, still",
      g2: "2 · Other location's color, still",
      g3: "3 · Stronger grey hatch, still",
      g4: "4 · Grey hatch with a light sweep",
      g5: "5 · Moving dashed outline",
      g6: "6 · Slow breathing outline",
      g7: "7 · Grey hatch with an amber edge, still",
      g8: "8 · Amber stripes that slowly slide",
      g9: "9 · Violet tint, the pin pulses",
      g10: "10 · Calm grey; amber pulse when you work on that person",
      g11: "11 · Teal hatch, still",
      g12: "12 · Soft red hatch, still",
      g13: "13 · Grey hatch, one amber flash every 4 seconds",
      g14: "14 · Grey hatch that drifts very slowly",
      g15: "15 · Ink blue hatch (the note's color), still",
      g16: "16 · Grey hatch, the pin sends out a ring",
      g17: "17 · Amber fading into grey from the left, still",
      g18: "18 · Grey hatch, a small nudge every 5 seconds",
      g19: "19 · Calm grey; solid amber when you work on that person",
      g20: "20 · Calm grey; red pulse when you work on that person",
      g5a: "5a · Moving dashes: long and slow, dark grey",
      g5b: "5b · Moving dashes: amber",
      g5c: "5c · Moving dashes: red",
      g5d: "5d · Moving dashes: the other location's color",
      g5e: "5e · Dashes stand still; they move when you work on that person",
    },
  },
} as const;

export type ItemKey = keyof typeof items;
export type OptionKey<K extends ItemKey> = keyof (typeof items)[K]["options"] & string;

const KEY = "newfork.scheduleVK.variants.v1";
const listeners = new Set<() => void>();
type Picks = { [K in ItemKey]: string };
let picks: Picks = (() => {
  const fallback: Picks = { tick: "t6", drag: "d2", ghost: "original" };
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Picks>;
    for (const item of Object.keys(items) as ItemKey[]) {
      const value = saved[item];
      if (value && value in items[item].options) fallback[item] = value;
    }
  } catch {
    // Storage blocked: start on the originals.
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
