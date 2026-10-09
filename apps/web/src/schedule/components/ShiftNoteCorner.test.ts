import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { placeNoteCard } from "./ShiftNoteCorner";

// BL-199: where a manager note opens beside its shift card.
describe("placeNoteCard", () => {
  const screen = { width: 1280, height: 800 };
  const shiftAt = (top: number, left = 600) => ({ top, bottom: top + 44, left, width: 150 });

  it("opens above the shift when the note fits there", () => {
    expect(placeNoteCard(shiftAt(500), 60, screen)).toEqual({ left: 675, top: 432, side: "above" });
  });

  it("opens below when a long note would leave the top of the screen (Sat 26, top 266)", () => {
    const place = placeNoteCard(shiftAt(266), 272, screen);
    expect(place).toEqual({ left: 675, top: 318, side: "below" });
    expect(place.top + 272).toBeLessThanOrEqual(screen.height - 8);
  });

  it("opens below a shift at the top of the grid", () => {
    expect(placeNoteCard(shiftAt(20), 60, screen)).toMatchObject({ top: 72, side: "below" });
  });

  it("takes the roomier side and stays 8px inside when it fits neither", () => {
    const short = { width: 1280, height: 400 };
    const high = placeNoteCard(shiftAt(120), 272, short);
    expect(high.side).toBe("below");
    expect(high.top).toBe(400 - 8 - 272);
    const low = placeNoteCard(shiftAt(240), 272, short);
    expect(low.side).toBe("above");
    expect(low.top).toBe(8);
  });

  it("never lets a note taller than the screen start above its top edge", () => {
    expect(placeNoteCard(shiftAt(100), 500, { width: 1280, height: 300 }).top).toBe(8);
  });

  it("keeps the note's 272px inside the screen at either side", () => {
    expect(placeNoteCard(shiftAt(500, 0), 60, screen).left).toBe(144);
    expect(placeNoteCard(shiftAt(500, 1250), 60, screen).left).toBe(1280 - 144);
  });
});

// BL-297: the note corner and the Tooltip time their bubbles in one place,
// so a change to the close delay reaches both.
describe("hover bubble timing", () => {
  it.each(["src/schedule/components/ShiftNoteCorner.tsx", "src/shell/Tooltip.tsx"])(
    "%s uses the shared useHoverBubble and keeps no timers of its own",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("useHoverBubble(");
      expect(source).not.toMatch(/setTimeout|clearTimeout|CLOSE_DELAY_MS/);
    },
  );
});
