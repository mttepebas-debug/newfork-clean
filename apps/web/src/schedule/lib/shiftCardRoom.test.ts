import { describe, expect, it } from "vitest";

import {
  SHIFT_CARD_MARK,
  SHIFT_CARD_STACK_REACH,
  SHIFT_CARD_TIGHT_SIDE,
  shiftCardFirstLineEdges,
  shiftCardFirstLineInset,
  shiftCardSideRoom,
} from "./shiftCardRoom";

// Mert, 2026-10-12: a card's words are centred, and both sides keep the room
// of its widest corner mark, so a mark never touches the words.
describe("shiftCardRoom", () => {
  it("keeps 2px a side on a card with no mark", () => {
    expect(shiftCardSideRoom({ top: [] })).toBe(2);
    expect(SHIFT_CARD_TIGHT_SIDE).toBe(2);
  });

  it("keeps the widest corner's room, plus 4px, less the card's own 8px padding", () => {
    // LIVE: 6px from the edge, 30 wide.
    expect(shiftCardSideRoom({ top: [SHIFT_CARD_MARK.live] })).toBe(6 + 30 + 4 - 8);
    // The orange dot and the spinner side by side, 3px apart.
    expect(
      shiftCardSideRoom({ top: [SHIFT_CARD_MARK.availability, SHIFT_CARD_MARK.spinner] }),
    ).toBe(6 + 10 + 3 + 12 + 4 - 8);
    // NEW at the bottom, 4px from the edge, is wider than the spinner above.
    expect(
      shiftCardSideRoom({ top: [SHIFT_CARD_MARK.spinner], bottom: SHIFT_CARD_MARK.newLabel }),
    ).toBe(4 + 22 + 4 - 8);
    // "x2" top left, 5px in.
    expect(shiftCardSideRoom({ top: [], stack: true })).toBe(5 + 26 + 4 - 8);
    // The paperclip reaches 21px in from the card's outer edge.
    expect(shiftCardSideRoom({ top: [], note: SHIFT_CARD_MARK.note })).toBe(21 + 4 - 8);
    // A mark smaller than the padding still keeps the 2px.
    expect(shiftCardSideRoom({ top: [], note: 3 })).toBe(2);
  });

  // Mert, 2026-10-14: every top mark sits level with the first line.
  it("says how far the first line's marks reach in from each outer edge", () => {
    expect(shiftCardFirstLineEdges({})).toEqual({ left: 0, right: 0 });
    expect(
      shiftCardFirstLineEdges({
        left: [SHIFT_CARD_MARK.note, SHIFT_CARD_STACK_REACH],
        right: [SHIFT_CARD_MARK.availability, SHIFT_CARD_MARK.live],
      }),
    ).toEqual({ left: 1 + 5 + 26, right: 1 + 6 + 10 + 3 + 30 });
  });

  it("keeps a narrow week's first line 4px clear of the marks beside it", () => {
    // LIVE reaches 37px in; the line starts at border 1 + padding 8 + 2.
    expect(shiftCardFirstLineInset(37, 8)).toBe(37 + 4 - 1 - 8 - 2);
    // The compact band's 5px padding asks more of the line.
    expect(shiftCardFirstLineInset(37, 5)).toBe(37 + 4 - 1 - 5 - 2);
    // Nothing beside the line takes nothing.
    expect(shiftCardFirstLineInset(0, 8)).toBe(0);
  });
});
