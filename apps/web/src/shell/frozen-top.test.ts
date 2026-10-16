import { describe, expect, it } from "vitest";
import { foldPoint, nextFolded, stickyStack } from "./frozen-top";

// Every screen keeps its heading and tabs in place; on a phone the heading
// folds to one line once the page has moved (Mert 2026-10-16, "B").
describe("stickyStack", () => {
  it("sticks each piece where it rests and fills the gap above it", () => {
    // heading 30–150 under the page's top padding, tabs 168–208 under an 18 px margin
    const stack = stickyStack(
      [
        { top: 30, bottom: 150 },
        { top: 168, bottom: 208 },
      ],
      false,
    );
    expect(stack.tops).toEqual([30, 168]);
    expect(stack.gaps).toEqual([30, 18]);
    expect(stack.bottom).toBe(208);
  });

  it("folded: stacks from the top with small gaps and skips a hidden piece", () => {
    // workspace bar hidden, heading 44 high, tabs 40 high
    const stack = stickyStack(
      [
        { top: 30, bottom: 30 },
        { top: 30, bottom: 74 },
        { top: 92, bottom: 132 },
      ],
      true,
    );
    expect(stack.tops).toEqual([0, 0, 44 + 6]);
    expect(stack.gaps).toEqual([0, 0, 6]);
    expect(stack.bottom).toBe(44 + 6 + 40);
  });

  it("is empty without pieces", () => {
    expect(stickyStack([], false)).toEqual({ tops: [], gaps: [], bottom: 0 });
  });
});

describe("foldPoint", () => {
  it("folds once the content has passed where the folded stack ends, so nothing jumps", () => {
    // full stack ends at 345, folded at 56: content reaches 56 after 289 px
    expect(foldPoint(345, 56)).toEqual({ on: 297, off: 281 });
  });

  it("never folds before 24 px of scrolling", () => {
    expect(foldPoint(60, 56)).toEqual({ on: 24, off: 8 });
  });
});

describe("nextFolded", () => {
  const point = { on: 100, off: 84 };
  it("folds past the fold point and opens again only well above it", () => {
    expect(nextFolded(false, 90, point)).toBe(false);
    expect(nextFolded(false, 101, point)).toBe(true);
    expect(nextFolded(true, 90, point)).toBe(true);
    expect(nextFolded(true, 84, point)).toBe(false);
  });
});
