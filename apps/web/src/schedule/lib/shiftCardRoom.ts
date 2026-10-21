// A card's words are centred between its edges, and both sides keep the room
// the widest corner mark needs, so a mark never touches the words (Mert,
// 2026-10-12). The card (ShiftCard) and the column measurer use the same
// numbers. Every top mark sits level with the card's first line (Mert,
// 2026-10-14: "Her zaman için ilk satır meta datayla aynı hizada olsun").

/** Widths in px of the card's marks, as drawn (checked in the browser). */
export const SHIFT_CARD_MARK = {
  availability: 10, // the orange dot (its 18px place to press reaches past it)
  live: 30, // the green dot and LIVE
  newLabel: 22, // the green NEW
  spinner: 12, // saving
  pin: 17, // a ghost's location pin
  stack: 26, // "x2" of open shifts
  // The manager note's paperclip: how far it reaches from the card's outer
  // left edge (1px border, 5px in, 15px wide).
  note: 21,
} as const;

const GAP = 4; // between a mark and the words
const BADGE_PAD = 8; // the card's own side padding
const BORDER = 1;
const TOP_RIGHT = 6; // the top-right mark row's distance from the edge
const BOTTOM_RIGHT = 4; // NEW's distance from the edge
const STACK_LEFT = 5; // "x2" sits top left
const ROW_GAP = 3;

/** A fitted week too narrow for the side room: the words take the card's width. */
export const SHIFT_CARD_TIGHT_SIDE = 2;

export interface ShiftCardCorners {
  /** Marks in the top-right row, right to left. */
  readonly top: readonly number[];
  readonly bottom?: number;
  readonly stack?: boolean;
  /** A manager note's mark: how far from the card's outer left edge it reaches. */
  readonly note?: number;
}

function rowWidth(widths: readonly number[]): number {
  return widths.length
    ? widths.reduce((sum, width) => sum + width, 0) + ROW_GAP * (widths.length - 1)
    : 0;
}

/** The padding each side of a card's words gets. */
export function shiftCardSideRoom({
  top,
  bottom = 0,
  stack = false,
  note = 0,
}: ShiftCardCorners): number {
  const row = rowWidth(top);
  const topEdge = row ? TOP_RIGHT + row : 0;
  const bottomEdge = bottom ? BOTTOM_RIGHT + bottom : 0;
  const stackEdge = stack ? STACK_LEFT + SHIFT_CARD_MARK.stack : 0;
  const edge = Math.max(topEdge, bottomEdge, stackEdge, note);
  return edge ? Math.max(2, edge + GAP - BADGE_PAD) : 2;
}

/**
 * How far the first line's marks reach in from each outer edge of the card,
 * border included: on the left the note's paperclip and "x2", on the right
 * the top-right row.
 */
export function shiftCardFirstLineEdges({
  left = [],
  right = [],
}: {
  readonly left?: readonly number[];
  readonly right?: readonly number[];
}): { readonly left: number; readonly right: number } {
  const row = rowWidth(right);
  return {
    left: Math.max(0, ...left),
    right: row ? BORDER + TOP_RIGHT + row : 0,
  };
}

/** How far NEW, beside the last line while editing, reaches in from the card's outer right edge. */
export function shiftCardLastLineReach(newMark: boolean): number {
  return newMark ? BORDER + BOTTOM_RIGHT + SHIFT_CARD_MARK.newLabel : 0;
}

/** The left reach of "x2" on an open shift's card. */
export const SHIFT_CARD_STACK_REACH = BORDER + STACK_LEFT + SHIFT_CARD_MARK.stack;

/**
 * In a narrow week the first line keeps clear of the marks beside it: the
 * words start 4px past a mark. This is that side's inset: the reach and the
 * gap, less the card's border, its padding and the words' own 2px.
 */
export function shiftCardFirstLineInset(reach: number, pad: number): number {
  return Math.max(0, reach + GAP - BORDER - pad - SHIFT_CARD_TIGHT_SIDE);
}
