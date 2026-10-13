import { describe, expect, it } from "vitest";

import { clampDrag } from "./DayTrack";
import { DAY, paidMinutes, shiftSpan, shortClock } from "./day";
import { placeList } from "./fields";
import { chooseFit, fitTightness, LANE_MAX, LANE_MIN, placeWindow, ROOMY } from "./fit";

describe("chooseFit: the window never scrolls (Mert, 2026-10-12)", () => {
  it("stacks the columns when everything fits", () => {
    expect(chooseFit({ room: 700, top: 200, side: 220, lanes: 3 })).toEqual(ROOMY);
  });

  it("puts the second column beside the first when stacked is too tall", () => {
    expect(chooseFit({ room: 420, top: 200, side: 220, lanes: 3 })).toEqual({ wide: true, laneHeight: LANE_MAX, cap: Infinity });
    // The form has no person rows: beside is as tight as it gets.
    expect(chooseFit({ room: 100, top: 200, side: 220, lanes: 0 }).wide).toBe(true);
  });

  it("makes person rows shorter, then lists the rest in one more list", () => {
    expect(chooseFit({ room: 500, top: 200, side: 220, lanes: 10 })).toEqual({ wide: true, laneHeight: 30, cap: Infinity });
    expect(chooseFit({ room: 500, top: 200, side: 220, lanes: 20 })).toEqual({ wide: true, laneHeight: LANE_MIN, cap: 10 });
  });

  it("ranks each step as tighter than the one before, so a fit never loosens while open", () => {
    const steps = [
      ROOMY,
      chooseFit({ room: 420, top: 200, side: 220, lanes: 3 }),
      chooseFit({ room: 500, top: 200, side: 220, lanes: 10 }),
      chooseFit({ room: 500, top: 200, side: 220, lanes: 20 }),
    ].map(fitTightness);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(new Set(steps).size).toBe(steps.length);
  });
});

describe("placeWindow", () => {
  const screen = { width: 1440, height: 900 };
  const size = { width: 404, height: 400, planned: 456 };
  const cell = (left: number, top: number) => ({ left, top, right: left + 120, bottom: top + 40, width: 120, height: 40 });

  it("opens right of the cell, pointing at it", () => {
    expect(placeWindow(cell(300, 300), size, screen)).toEqual({ left: 430, top: 248, side: "right", arrowTop: 72 });
  });

  it("opens left of the cell when the right has no room", () => {
    expect(placeWindow(cell(1200, 300), size, screen)).toMatchObject({ left: 786, side: "left" });
  });

  it("stays on the screen, room for the rule box included, near the bottom", () => {
    const place = placeWindow(cell(300, 860), size, screen);
    expect(place.top + size.planned).toBeLessThanOrEqual(screen.height - 8);
  });
});

describe("placeList", () => {
  it("opens below when the list fits, above when it does not and there is more room", () => {
    expect(placeList({ top: 100, bottom: 132 }, 200, 900)).toEqual({ up: false, maxHeight: 200 });
    expect(placeList({ top: 800, bottom: 832 }, 200, 900)).toEqual({ up: true, maxHeight: 200 });
  });

  it("is never taller than the room it has", () => {
    expect(placeList({ top: 300, bottom: 332 }, 2000, 900)).toEqual({ up: false, maxHeight: 556 });
  });
});

describe("the time line", () => {
  const origin = 300; // 5 AM

  it("keeps the start on the shift's own day; only the end runs into the next morning", () => {
    expect(clampDrag(origin, DAY - 15, DAY + 120)).toEqual({ s: DAY - 15, e: DAY + 120 });
    expect(clampDrag(origin, DAY, DAY + 120)).toBeNull();
  });

  it("refuses a shift shorter than 15 minutes, longer than 20 hours or off the line", () => {
    expect(clampDrag(origin, 600, 610)).toBeNull();
    expect(clampDrag(origin, 600, 600 + 20 * 60 + 15)).toBeNull();
    expect(clampDrag(origin, 240, 600)).toBeNull();
    expect(clampDrag(origin, 600, origin + DAY + 15)).toBeNull();
  });

  it("reads overnight shifts as ending the next day and counts paid minutes", () => {
    expect(shiftSpan("22:00", "02:00")).toEqual({ s: 1320, e: 1560 });
    expect(shiftSpan("09:00", "09:00")).toBeNull();
    expect(paidMinutes({ start_time: "09:00", end_time: "17:00", unpaid_break_minutes: 30 })).toBe(450);
  });

  it("writes short clock labels in both settings", () => {
    expect(shortClock(7 * 60 + 30, "12h")).toBe("7:30a");
    expect(shortClock(12 * 60, "12h")).toBe("12p");
    expect(shortClock(7 * 60, "24h")).toBe("07");
  });
});
