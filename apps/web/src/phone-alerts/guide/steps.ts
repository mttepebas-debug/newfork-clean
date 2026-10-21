// Which steps the Home Screen guide teaches, by browser and Safari release (one table; the cards draw them).
// Mert's iPhone (iOS 26, 20 October 2026): the page's own Share button (navigator.share) opens a sheet
// with Add to Home Screen behind View More, so Safari 26 and 27 start there and keep Safari's own bar as
// the way back; the Add sheet shows ✕ and ✓ in its corners. Chrome on iPhone adds from its Share button
// at the right of the address bar, and names no iOS release, so its steps are one general set.

import type { SafariRelease } from "../install-state";
import type { GlyphId } from "./replica";

export type StepKind = "bar" | "menu" | "chrome" | "sheet" | "add" | "open";
export type StepSetKey = "share" | "share-18" | "27-compact" | "26-compact" | "bar" | "18" | "chrome";

export type GuideStep = {
  readonly kind: StepKind;
  readonly glyph: GlyphId;
  /** The short name on the progress chip. */
  readonly chip: string;
  /** With [≡] [•••] [Share] [✓] marks, drawn as glyph chips. */
  readonly title: string;
  readonly sub: string;
  /** The small line under the stage. */
  readonly note: string;
};

const LAYOUT_HINT = "See a Share icon in your bar? Tap it instead.";
const MENU_NOTE = "Menu order may differ on your iPhone.";

const step = {
  menu27: { kind: "bar", glyph: "pagemenu27", chip: "Menu", title: "Tap [≡] at the left end of the address bar", sub: LAYOUT_HINT, note: "" },
  more26: { kind: "bar", glyph: "more", chip: "More", title: "Tap [•••] at the right of the address bar", sub: LAYOUT_HINT, note: "" },
  shareMenu: { kind: "menu", glyph: "share", chip: "Share", title: "Tap Share", sub: "", note: MENU_NOTE },
  shareBar: { kind: "bar", glyph: "share", chip: "Share", title: "Tap [Share] in the bar at the bottom", sub: "", note: "" },
  chromeShare: { kind: "chrome", glyph: "share", chip: "Share", title: "Tap [Share] at the right of the address bar", sub: "", note: "" },
  sheet: { kind: "sheet", glyph: "a2hs", chip: "Add to Home Screen", title: "Tap View More, then Add to Home Screen", sub: "Or scroll down the list to find it.", note: MENU_NOTE },
  sheetShare: { kind: "sheet", glyph: "a2hs", chip: "Add to Home Screen", title: "Tap View More, then Add to Home Screen", sub: "Or scroll down the list to find it.", note: "Try it now opens this list for you." },
  sheet18: { kind: "sheet", glyph: "a2hs", chip: "Add to Home Screen", title: "Scroll down and tap Add to Home Screen", sub: "Not there? Tap Edit Actions at the end.", note: MENU_NOTE },
  sheet18Share: { kind: "sheet", glyph: "a2hs", chip: "Add to Home Screen", title: "Scroll down and tap Add to Home Screen", sub: "Not there? Tap Edit Actions at the end.", note: "Try it now opens this list for you." },
  add: { kind: "add", glyph: "check", chip: "Add", title: "Keep Open as Web App on, then tap [✓]", sub: "[✓] is at the top right.", note: "" },
  add18: { kind: "add", glyph: "check", chip: "Add", title: "Tap Add at the top right", sub: "", note: "" },
} satisfies Record<string, GuideStep>;

function open(browser: "safari" | "chrome"): GuideStep {
  return {
    kind: "open",
    glyph: "nf",
    chip: "Open",
    title: "Open Newfork from your Home Screen",
    sub: `It opens without ${browser === "chrome" ? "Chrome" : "Safari"}’s bar. Sign in there.`,
    note: "",
  };
}

/** The step set a device starts with: the page's own Share button where the browser has one. */
export function firstStepSet(browser: "safari" | "chrome", ios: SafariRelease | null, canShare: boolean): StepSetKey {
  if (browser === "chrome") return "chrome";
  if (canShare) return ios === 18 ? "share-18" : "share";
  return safariStepSet(ios, false);
}

/** Safari's own bar: Compact by release, or Share in the bar (iOS 18, or the person said their bar looks different). */
export function safariStepSet(ios: SafariRelease | null, bar: boolean): StepSetKey {
  if (ios === 18) return "18";
  if (bar) return "bar";
  return ios === 26 ? "26-compact" : "27-compact";
}

export function stepsFor(set: StepSetKey): readonly GuideStep[] {
  switch (set) {
    case "share":
      return [step.sheetShare, step.add, open("safari")];
    case "share-18":
      return [step.sheet18Share, step.add18, open("safari")];
    case "27-compact":
      return [step.menu27, step.shareMenu, step.sheet, step.add, open("safari")];
    case "26-compact":
      return [step.more26, step.shareMenu, step.sheet, step.add, open("safari")];
    case "bar":
      return [step.shareBar, step.sheet, step.add, open("safari")];
    case "18":
      return [step.shareBar, step.sheet18, step.add18, open("safari")];
    case "chrome":
      return [step.chromeShare, step.sheet, step.add, open("chrome")];
  }
}

/** The iOS release a set's pictures show. */
export function pictureRelease(set: StepSetKey, ios: SafariRelease | null): SafariRelease {
  if (set === "18" || set === "share-18") return 18;
  if (set === "26-compact") return 26;
  return ios === 26 ? 26 : 27;
}

/** Whether the set opens the share sheet from the page (its last button does it). */
export const sharesFromPage = (set: StepSetKey) => set === "share" || set === "share-18";
