// Yeni look: the words of a card are centred between its edges, and both sides
// keep the room the widest corner mark needs, so a mark never touches the words
// (Mert, 2026-10-12). The card and the column measurer use the same numbers.

/** Widths in px of the marks, as drawn (checked in the browser). */
export const MARK = {
  availability: 18, // the orange "!"
  live: 30, // the green LIVE label
  newLabel: 30, // the green NEW label
  spinner: 12, // saving
  pin: 17, // a ghost's location pin (Mert, 2026-10-13: a little bigger)
  stack: 26, // "x2" of open shifts
} as const;

const GAP = 4; // between a mark and the words
const BADGE_PAD = 8; // the card's own side padding
const TOP_RIGHT = 6; // the top-right mark row's distance from the edge
const BOTTOM_RIGHT = 4; // the NEW / LIVE label's distance from the edge
const STACK_LEFT = 5; // "x2" sits top left (Mert, 2026-10-12, 17:04)
const ROW_GAP = 3;

/** Tight band: marks keep rows of their own above and below the words. */
export const TIGHT = {
  side: 2,
  top: 25, // 1px border + 6 + a 15px mark (13px line + border) + 3
  bottom: 23, // 1px border + 4 + a 15px label + 3
} as const;

export interface Corner {
  /** Marks in the top-right row, right to left. */
  readonly top: readonly number[];
  readonly bottom?: number;
  readonly stack?: boolean;
  /** A manager note's mark: how far from the left edge it reaches (mark drafts). */
  readonly note?: number;
}

/** The content padding each side gets. */
export function sideRoom({ top, bottom = 0, stack = false, note = 0 }: Corner): number {
  const row = top.length ? top.reduce((sum, width) => sum + width, 0) + ROW_GAP * (top.length - 1) : 0;
  const topEdge = row ? TOP_RIGHT + row : 0;
  const bottomEdge = bottom ? BOTTOM_RIGHT + bottom : 0;
  const stackEdge = stack ? STACK_LEFT + MARK.stack : 0;
  const edge = Math.max(topEdge, bottomEdge, stackEdge, note);
  return edge ? Math.max(2, edge + GAP - BADGE_PAD) : 2;
}
