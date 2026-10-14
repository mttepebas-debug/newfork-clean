// Yeni look: every top mark sits level with the card's first line, and a
// mark never gives the card a row of its own (Mert, 2026-10-14 01:15Z: "Her
// zaman için ilk satır meta datayla aynı hizada olsun"). The card keeps the
// middle of its first line in --rk-l1-mid (px from the top of its padding
// box); vk.css and the mark drafts place the marks on it.
import { useLayoutEffect, type RefObject } from "react";

export function useFirstLineMid(ref: RefObject<HTMLElement | null>, on: boolean): void {
  useLayoutEffect(() => {
    const badge = ref.current;
    if (!on || !badge) return undefined;
    const content = badge.querySelector<HTMLElement>("[data-shift-badge-content]");
    if (!content) return undefined;
    const set = () => {
      const first = content.firstElementChild;
      if (!first) return;
      const card = badge.getBoundingClientRect();
      const line = first.getBoundingClientRect();
      // Half pixels, so the marks settle.
      const mid = Math.round((line.top + line.height / 2 - card.top - badge.clientTop) * 2) / 2;
      const value = `${mid}px`;
      if (badge.style.getPropertyValue("--rk-l1-mid") !== value) badge.style.setProperty("--rk-l1-mid", value);
    };
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    // The card's height (its row) and the words' own box (a band's padding).
    const observer = new ResizeObserver(set);
    observer.observe(badge);
    observer.observe(content, { box: "border-box" });
    return () => observer.disconnect();
  }, [ref, on]);
}

/** The words start this far past a mark beside them. */
export const LINE1_GAP = 4;

/**
 * How far the first line's marks reach in from each outer edge of the card
 * (border included): `left` as the drafts give it (a note mark's width, which
 * counts from the outer edge), `right` the widths of the top-right row.
 */
export function firstLineEdges({
  left = [],
  right = [],
}: {
  readonly left?: readonly number[];
  readonly right?: readonly number[];
}): { readonly left: number; readonly right: number } {
  const BORDER = 1;
  const TOP_RIGHT = 6;
  const ROW_GAP = 3;
  const row = right.length ? right.reduce((sum, width) => sum + width, 0) + ROW_GAP * (right.length - 1) : 0;
  return { left: Math.max(0, ...left), right: row ? BORDER + TOP_RIGHT + row : 0 };
}

/** The first line's inset on one side: the reach, the gap, less the card's border, padding and the words' 2px. */
export function firstLineInset(reach: number, pad: number): number {
  return Math.max(0, reach + LINE1_GAP - 1 - pad - 2);
}
