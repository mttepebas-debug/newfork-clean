import { describe, expect, it } from "vitest";
import { createReviewGuard } from "./review-guard";

// A2 Tur 6 (mockup-spec 17): a repeated click, tap or key press never answers what was just drawn under it, and the
// green button holds still for 400 ms after its meaning changes (Save → Next: Ana Ruiz).
describe("the green's hold", () => {
  it("holds for 400 ms when its meaning changes, not when it first shows", () => {
    const guard = createReviewGuard();
    guard.mean("maria|save|", 1_000);
    expect(guard.held(1_000)).toBe(false);
    guard.mean("maria|save|", 1_100);
    expect(guard.held(1_100)).toBe(false);
    guard.mean("maria|next|ana", 2_000);
    expect(guard.held(2_000)).toBe(true);
    expect(guard.held(2_250)).toBe(true);
    expect(guard.held(2_400)).toBe(false);
  });
  it("drops a key press on the green that comes less than 400 ms after the one before", () => {
    const guard = createReviewGuard();
    expect(guard.greenKey(1_000)).toBe(false);
    expect(guard.greenKey(1_090)).toBe(true);
    expect(guard.greenKey(1_180)).toBe(true);
    expect(guard.greenKey(1_600)).toBe(false);
  });
});

describe("repeated clicks and taps", () => {
  const click = (now: number, detail = 1, extra: Partial<{ touch: boolean; x: number; y: number; guarded: boolean }> = {}) => ({
    now,
    detail,
    touch: false,
    x: 0,
    y: 0,
    guarded: true,
    ...extra,
  });
  it("drops the second and third click of a double or triple click, each against the click before it", () => {
    const guard = createReviewGuard();
    expect(guard.click(click(1_000))).toBe(false);
    expect(guard.click(click(1_210, 2))).toBe(true);
    expect(guard.click(click(1_420, 3))).toBe(true);
  });
  it("counts a deliberate second click later than 400 ms, even when the system calls it a double click", () => {
    const guard = createReviewGuard();
    expect(guard.click(click(1_000))).toBe(false);
    expect(guard.click(click(1_450, 2))).toBe(false);
    expect(guard.repeatPress(1_500, 2)).toBe(true);
    expect(guard.repeatPress(2_000, 2)).toBe(false);
  });
  it("drops a guarded tap close to the one before, within 400 ms", () => {
    const guard = createReviewGuard();
    expect(guard.click(click(1_000, 1, { touch: true, x: 100, y: 100 }))).toBe(false);
    expect(guard.click(click(1_200, 1, { touch: true, x: 120, y: 110 }))).toBe(true);
    expect(guard.click(click(1_700, 1, { touch: true, x: 120, y: 110 }))).toBe(false);
    expect(guard.click(click(1_800, 1, { touch: true, x: 300, y: 110 }))).toBe(false);
    expect(guard.click(click(1_900, 1, { touch: true, x: 300, y: 110, guarded: false }))).toBe(false);
  });
});
