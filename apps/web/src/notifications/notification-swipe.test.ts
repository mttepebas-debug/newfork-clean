import { describe, expect, it } from "vitest";
import { swipeAxis, swipeEnd, swipeOffset } from "./notification-swipe";

// S-251 (variant A, frame.js): on a phone a row is dragged either way to show Read (or, once read, Unread) under it.
describe("swipeAxis", () => {
  it("waits for about 8 px before it decides", () => {
    expect(swipeAxis(0, 0)).toBeNull();
    expect(swipeAxis(7, 0)).toBeNull();
    expect(swipeAxis(-5, 5)).toBeNull();
  });

  it("lets the list scroll when the finger goes more up or down than sideways", () => {
    expect(swipeAxis(6, 12)).toBe("y");
    expect(swipeAxis(9, -9)).toBe("y");
    expect(swipeAxis(12, 6)).toBe("x");
    expect(swipeAxis(-8, 2)).toBe("x");
  });
});

describe("swipeOffset", () => {
  it("follows the finger, never past nine tenths of the row", () => {
    expect(swipeOffset(40, 390)).toBe(40);
    expect(swipeOffset(-40, 390)).toBe(-40);
    expect(swipeOffset(500, 390)).toBe(351);
    expect(swipeOffset(-500, 390)).toBe(-351);
  });
});

describe("swipeEnd", () => {
  it("springs back under 72 px", () => {
    expect(swipeEnd(0, 390)).toEqual({ action: "close" });
    expect(swipeEnd(71, 390)).toEqual({ action: "close" });
    expect(swipeEnd(-71.5, 390)).toEqual({ action: "close" });
  });

  it("stays open from 72 px, with its action on the side the row left", () => {
    expect(swipeEnd(72, 390)).toEqual({ action: "open", side: "left" });
    expect(swipeEnd(-72, 390)).toEqual({ action: "open", side: "right" });
    expect(swipeEnd(194, 390)).toEqual({ action: "open", side: "left" });
  });

  it("does its action at once from half the row", () => {
    expect(swipeEnd(195, 390)).toEqual({ action: "act" });
    expect(swipeEnd(-300, 390)).toEqual({ action: "act" });
  });
});
