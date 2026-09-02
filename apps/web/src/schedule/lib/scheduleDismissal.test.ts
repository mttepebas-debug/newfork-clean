import { describe, expect, it } from "vitest";

import {
  clearFocusedShiftSearchFilters,
  dismissNextScheduleSearchLayer,
} from "./scheduleDismissal";

function dismiss(search: string, modelWeekStart = "2026-09-07") {
  return dismissNextScheduleSearchLayer({
    search: new URLSearchParams(search),
    modelWeekStart,
    currentWeekStart: "2026-09-07",
    today: "2026-09-10",
  });
}

describe("dismissNextScheduleSearchLayer", () => {
  it("returns daily view to weekly view", () => {
    const result = dismiss("date=2026-09-10&view=day");

    expect(result?.search.get("view")).toBe("week");
    expect(result?.search.get("date")).toBe("2026-09-10");
  });

  it("preserves the existing location-before-daily dismissal priority", () => {
    const first = dismiss("date=2026-09-10&view=day&locations=loc-1");

    expect(first?.search.has("locations")).toBe(false);
    expect(first?.search.get("view")).toBe("day");

    const second = dismiss(first?.search.toString() ?? "");
    expect(second?.search.get("view")).toBe("week");
  });

  it("dismisses content filters before a daily location focus", () => {
    const first = dismiss(
      "date=2026-09-10&view=day&locations=loc-1&jobs=job-1",
    );

    expect(first?.search.get("locations")).toBe("loc-1");
    expect(first?.search.has("jobs")).toBe(false);
    expect(first?.search.get("view")).toBe("day");
  });

  it("dismisses layered schedule filters in the reference priority order", () => {
    const first = dismiss(
      "date=2026-09-10&view=day&hideUnscheduled=true&locations=loc-1&shiftTypes=st-1&jobs=job-1&employees=emp-1",
    );

    expect(first?.search.get("hideUnscheduled")).toBeNull();
    expect(first?.search.get("locations")).toBe("loc-1");
    expect(first?.search.get("shiftTypes")).toBe("st-1");
    expect(first?.search.get("jobs")).toBe("job-1");
    expect(first?.search.get("employees")).toBe("emp-1");
    expect(first?.search.get("view")).toBe("day");
    expect(first?.clearFocusedShift).toBe(false);

    const second = dismiss(first?.search.toString() ?? "");
    expect(second?.search.get("locations")).toBe("loc-1");
    expect(second?.search.has("shiftTypes")).toBe(false);
    expect(second?.search.has("jobs")).toBe(false);
    expect(second?.search.has("employees")).toBe(false);
    expect(second?.search.get("view")).toBe("day");
    expect(second?.clearFocusedShift).toBe(true);

    const third = dismiss(second?.search.toString() ?? "");
    expect(third?.search.has("locations")).toBe(false);
    expect(third?.search.get("view")).toBe("day");

    const fourth = dismiss(third?.search.toString() ?? "");
    expect(fourth?.search.get("view")).toBe("week");
    expect(fourth?.search.get("date")).toBe("2026-09-10");

    const fifth = dismiss(fourth?.search.toString() ?? "");
    expect(fifth).toBeNull();
  });

  it("resets a non-current weekly period only after filters and daily view", () => {
    const result = dismiss("date=2026-08-03", "2026-08-03");

    expect(result?.search.get("date")).toBe("2026-09-10");
    expect(result?.search.get("view")).toBe("week");
  });
});

describe("clearFocusedShiftSearchFilters", () => {
  it("clears badge focus filters without dismissing user view context", () => {
    const result = clearFocusedShiftSearchFilters(
      new URLSearchParams(
        "date=2026-09-10&view=week&locations=loc-1&hideUnscheduled=true&shiftTypes=st-1&jobs=job-1&employees=emp-1",
      ),
    );

    expect(result?.has("shiftTypes")).toBe(false);
    expect(result?.has("jobs")).toBe(false);
    expect(result?.has("employees")).toBe(false);
    expect(result?.get("locations")).toBe("loc-1");
    expect(result?.get("hideUnscheduled")).toBe("true");
    expect(result?.get("view")).toBe("week");
  });

  it("returns null when no badge focus filters are present", () => {
    expect(
      clearFocusedShiftSearchFilters(new URLSearchParams("locations=loc-1")),
    ).toBeNull();
  });
});
