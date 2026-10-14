// The look picks on this page. "original" is main today; "yeni" is the card
// after Mert's comments on this page (2026-10-12, 7:03–7:13 AM California).
// The pick is remembered per browser and written on #root so the CSS can
// follow it; the catalog (outside #root) sets its own per sample.
import { createContext, useContext, useSyncExternalStore } from "react";
import { LIVE, NEWMARK, NOTE, UNAVAIL, type MarkDraft } from "./marks";

declare const __RK_MARKS__: boolean;

/** The mark drafts (vk/marks.ts) as picker options: "O" and 1–10 (the note mark 1–15). */
function draftItem(title: string, hint: string, family: Record<string, MarkDraft>) {
  const keys = Object.keys(family);
  return {
    title,
    hint,
    short: Object.fromEntries(keys.map((key) => [key, key === "original" ? "O" : key.slice(1)])),
    options: Object.fromEntries(keys.map((key) => [key, `${key === "original" ? "Original" : key.slice(1)}: ${family[key]!.name}`])),
  };
}

export const items = {
  look: {
    title: "Shift card look",
    hint: "Original is main today. Yeni follows Mert's comments of Oct 12: LIVE top right, an edited shift says NEW, no icon on a removed shift, the \"!\" of a live shift in the name cell, centred words, a spinner while saving, a closed day like time off.",
    short: { original: "Original", yeni: "Yeni" },
    options: {
      original: "Original: main today",
      yeni: "Yeni: Mert's comments of Oct 12",
    },
  },
  unavail: draftItem("Orange \"!\" (unavailable)", "Ten drafts of the availability mark (Mert, Oct 13). It changes on the card, in an empty cell's corner and by the name.", UNAVAIL),
  live: draftItem("LIVE label", "Ten drafts of LIVE. Shown while editing a live week, Yeni look only.", LIVE),
  newmark: draftItem("NEW label", "Ten drafts of NEW: a shift added or changed in the draft, not yet published.", NEWMARK),
  notemark: draftItem("Manager note mark", "Sixteen drafts of the note's corner mark (11–16: the paperclip, Oct 14; 16 is Mert's pick); hovering it opens the note.", NOTE),
};

/** The drafts' pickers show only on the drafts page (RK_MARKS=1 build). */
export const DRAFT_ITEMS = ["unavail", "live", "newmark", "notemark"] as const;
type DraftKey = (typeof DRAFT_ITEMS)[number];
export const marksBuild = typeof __RK_MARKS__ !== "undefined" && __RK_MARKS__;
const isDraft = (item: string): item is DraftKey => (DRAFT_ITEMS as readonly string[]).includes(item);

/** Mert's picks from the drafts (2026-10-13 3:41 PM California): "!" 5 dot,
 * LIVE 1 dot + Live, NEW 7 plain word. The note mark was not picked: today's. */
export const CHOSEN: Record<DraftKey, string> = { unavail: "u5", live: "l1", newmark: "n7", notemark: "o16" };
const ORIGINAL: Record<DraftKey, string> = { unavail: "original", live: "original", newmark: "original", notemark: "original" };

/** The marks a look wears outside the drafts page: Yeni wears Mert's picks. */
export function lookMarks(look: string): Record<DraftKey, string> {
  return look === "yeni" ? CHOSEN : ORIGINAL;
}

export type ItemKey = keyof typeof items;
export type OptionKey<K extends ItemKey> = keyof (typeof items)[K]["options"] & string;

const KEY = "newfork.cards.look.v1";
const listeners = new Set<() => void>();
type Picks = { [K in ItemKey]: string };
let picks: Picks = (() => {
  // The drafts page starts on Mert's picks.
  const fallback: Picks = { look: "yeni", ...CHOSEN };
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Picks>;
    for (const item of Object.keys(items) as ItemKey[]) {
      if (!marksBuild && isDraft(item)) continue;
      const value = saved[item];
      if (value && value in items[item].options) fallback[item] = value;
    }
  } catch {
    // Storage blocked: start on the new look.
  }
  return fallback;
})();

function writeRoot(): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.dataset.rkLook = picks.look;
  root.dataset.rkUnavail = getPick("unavail");
  root.dataset.rkLive = getPick("live");
  root.dataset.rkNew = getPick("newmark");
  root.dataset.rkNote = getPick("notemark");
}

export function getPick<K extends ItemKey>(item: K): OptionKey<K> {
  if (!marksBuild && isDraft(item)) return lookMarks(picks.look)[item] as OptionKey<K>;
  return picks[item] as OptionKey<K>;
}
writeRoot();

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

/** The catalog draws each look side by side: a card inside this context
 * wears the given pick instead of the page's. */
export const ForcedPicks = createContext<Partial<Record<ItemKey, string>>>({});

export function usePick<K extends ItemKey>(item: K): OptionKey<K> {
  const forced = useContext(ForcedPicks);
  const live = useSyncExternalStore(subscribe, () => getPick(item));
  const look = useSyncExternalStore(subscribe, () => picks.look);
  if (forced[item]) return forced[item] as OptionKey<K>;
  // A look forced on a sample brings its own marks.
  if (!marksBuild && isDraft(item)) return lookMarks(forced.look ?? look)[item] as OptionKey<K>;
  return live;
}

export function subscribePicks(listener: () => void): () => void {
  return subscribe(listener);
}
