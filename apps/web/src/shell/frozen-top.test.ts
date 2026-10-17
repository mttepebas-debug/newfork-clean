import { describe, expect, it } from "vitest";
import { stickyStack } from "./frozen-top";

// Every screen keeps its heading and tabs in place (Mert 2026-10-16); the
// heading never folds (Mert 2026-10-17, phone notes #4).
describe("stickyStack", () => {
  it("sticks each piece where it rests and fills the gap above it", () => {
    // heading 30–150 under the page's top padding, tabs 168–208 under an 18 px margin
    const stack = stickyStack([
      { top: 30, bottom: 150 },
      { top: 168, bottom: 208 },
    ]);
    expect(stack.tops).toEqual([30, 168]);
    expect(stack.gaps).toEqual([30, 18]);
    expect(stack.bottom).toBe(208);
  });

  it("is empty without pieces", () => {
    expect(stickyStack([])).toEqual({ tops: [], gaps: [], bottom: 0 });
  });
});
