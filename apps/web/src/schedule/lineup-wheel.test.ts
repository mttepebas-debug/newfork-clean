import { describe, expect, it } from "vitest";

import {
  WHEEL,
  crossedEdge,
  dockPlace,
  easeInOut,
  easeOut,
  flingTarget,
  foldOffset,
  foldTravel,
  monthEdges,
  releaseVelocity,
  seekDuration,
  wheelCell,
  wheelDateText,
  wheelIndex,
  wheelIso,
} from "./lineup-wheel";

// E · Çark tarih (Mert 2026-10-17): the phone Lineup's day wheel, its numbers kept where a test can hold them.

describe("the wheel's days", () => {
  it("counts days from its anchor both ways, across months and years", () => {
    expect(wheelIso("2026-10-14", 0)).toBe("2026-10-14");
    expect(wheelIso("2026-10-14", 18)).toBe("2026-11-01");
    expect(wheelIso("2026-10-14", -14)).toBe("2026-09-30");
    expect(wheelIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(wheelIndex("2026-10-14", "2026-11-01")).toBe(18);
    expect(wheelIndex("2026-10-14", "2025-10-14")).toBe(-365);
  });

  it("names the weekday, and the month on its first day", () => {
    expect(wheelCell("2026-10-14")).toEqual({ top: "WED", day: 14, first: false, label: "Wednesday, October 14, 2026" });
    expect(wheelCell("2026-11-01")).toEqual({ top: "NOV", day: 1, first: true, label: "Sunday, November 1, 2026" });
  });

  it("writes the date button's day, with the year when it isn't this year", () => {
    expect(wheelDateText("2026-11-07", "2026-10-14")).toBe("Sat, Nov 7");
    expect(wheelDateText("2027-01-15", "2026-10-14")).toBe("Fri, Jan 15, 2027");
  });

  it("puts a month edge half a day before each first of the month", () => {
    const edges = monthEdges("2026-10-14", 40);
    expect(edges).toEqual([-13.5, 17.5]);
    expect(crossedEdge(16.8, 18.2, edges)).toBe(17.5);
    expect(crossedEdge(18.2, 16.8, edges)).toBe(17.5);
    expect(crossedEdge(10, 17.4, edges)).toBeNull();
  });
});

describe("the wheel's spin", () => {
  it("takes the release speed over the last 100 ms, never a window under 24 ms, capped", () => {
    const W = 50;
    // A slow push to the left: 50 px in 200 ms is a day later per 200 ms.
    const slow: [number, number][] = [[0, 300], [100, 275], [200, 250]];
    expect(releaseVelocity(slow, 200, W)).toBeCloseTo(0.5 / 100, 6);
    // Two events 3 ms apart can't fake a huge speed: the window is at least 24 ms.
    expect(releaseVelocity([[0, 300], [3, 280]], 3, W)).toBeCloseTo(0.4 / 24, 6);
    // A hard throw is capped at VMAX.
    expect(releaseVelocity([[0, 400], [30, 0]], 30, W)).toBe(WHEEL.vmax);
    expect(releaseVelocity([[0, 0], [30, 400]], 30, W)).toBe(-WHEEL.vmax);
    // The finger rested before letting go: no spin.
    expect(releaseVelocity(slow, 200 + WHEEL.staleRelease + 1, W)).toBe(0);
  });

  it("spins further the faster the flick, stops on a whole day, never past the ends", () => {
    const soft = flingTarget(0, 0.005, 400);
    const hard = flingTarget(0, WHEEL.vmax, 400);
    expect(Number.isInteger(soft.to)).toBe(true);
    expect(soft.to).toBe(Math.round((0.005 * 0.005) / (2 * WHEEL.decel)));
    // The hardest throw runs about four weeks.
    expect(hard.to).toBeGreaterThanOrEqual(24);
    expect(hard.to).toBeLessThanOrEqual(28);
    expect(flingTarget(0, -WHEEL.vmax, 400).to).toBe(-hard.to);
    expect(flingTarget(395, WHEEL.vmax, 400).to).toBe(400);
    expect(hard.duration).toBeLessThanOrEqual(2200);
    expect(flingTarget(3.2, 0, 400)).toEqual({ to: 3, duration: 300 });
  });

  it("turns to a tapped day in 480 ms plus 60 ms a day, at most twenty days' worth", () => {
    expect(seekDuration(1)).toBe(540);
    expect(seekDuration(5)).toBe(780);
    expect(seekDuration(90)).toBe(1680);
  });

  it("eases from 0 to 1", () => {
    for (const ease of [easeOut, easeInOut]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(0.5)).toBeGreaterThan(0);
    }
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });
});

describe("the phone top's fold", () => {
  it("starts once the list meets the shift tabs and stops when the wheel reaches the separator", () => {
    // The date row slides up behind the header's line until the wheel sits 4 px under it.
    const travel = foldTravel({ wheelTop: 300, headerBottom: 218 });
    expect(travel).toBe(78);
    expect(foldOffset(100, 213, travel)).toBe(0);
    expect(foldOffset(213, 213, travel)).toBe(0);
    expect(foldOffset(250, 213, travel)).toBe(37);
    expect(foldOffset(291, 213, travel)).toBe(78);
    expect(foldOffset(900, 213, travel)).toBe(78);
    expect(foldTravel({ wheelTop: 100, headerBottom: 120 })).toBe(0);
  });
});

describe("the Publish dock", () => {
  it("sits 10 px over the bottom bar, centred on the line where More begins", () => {
    expect(dockPlace({ bar: { top: 782 }, moreLeft: 306, viewport: { width: 390, height: 844 } })).toEqual({
      left: 306,
      bottom: 72,
    });
  });

  it("keeps clear of the screen's edges with no bar under it", () => {
    expect(dockPlace({ bar: null, moreLeft: null, viewport: { width: 740, height: 900 } })).toEqual({
      left: null,
      bottom: 16,
    });
  });
});
