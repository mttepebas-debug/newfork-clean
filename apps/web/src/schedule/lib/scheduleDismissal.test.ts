import { describe, expect, it } from "vitest";

import {
  clearFocusedShiftSearchFilters,
  dismissNextScheduleSearchLayer,
  newestScheduleFilterKey,
  withScheduleSearchValue,
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

  // Mert, 2026-10-12: Esc and a blank press take the top bar's filters off one
  // at a time, the newest first.
  it("takes filters off one at a time, newest first", () => {
    let search = "date=2026-09-10&view=day&hideUnscheduled=true&locations=loc-1&shiftTypes=st-1&jobs=job-1&employees=emp-1";
    const removed: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      const before = new URLSearchParams(search);
      const result = dismiss(search);
      expect(result).not.toBeNull();
      const gone = [...before.keys()].filter((key) => !result!.search.has(key));
      expect(gone).toHaveLength(1);
      removed.push(gone[0]!);
      expect(result!.search.get("view")).toBe("day");
      search = result!.search.toString();
    }
    expect(removed).toEqual(["employees", "jobs", "shiftTypes", "locations", "hideUnscheduled"]);

    const weekly = dismiss(search);
    expect(weekly?.search.get("view")).toBe("week");
    expect(weekly?.search.get("date")).toBe("2026-09-10");
    expect(dismiss(weekly?.search.toString() ?? "")).toBeNull();
  });

  // S-228: the top bar search is a filter too, one step of the same cascade.
  it("takes the search off as one step, in the order it was typed", () => {
    let search = new URLSearchParams("date=2026-09-10");
    search = withScheduleSearchValue(search, "jobs", "job-1");
    search = withScheduleSearchValue(search, "q", "ali");

    expect(newestScheduleFilterKey(search)).toBe("q");
    const first = dismiss(search.toString());
    expect(first?.search.has("q")).toBe(false);
    expect(first?.search.get("jobs")).toBe("job-1");
  });

  it("follows the order filters were applied in, not a fixed order", () => {
    let search = new URLSearchParams("date=2026-09-10");
    search = withScheduleSearchValue(search, "jobs", "job-1");
    search = withScheduleSearchValue(search, "hideUnscheduled", "true");
    search = withScheduleSearchValue(search, "locations", "loc-1");
    // Changing the job again makes it the newest filter.
    search = withScheduleSearchValue(search, "jobs", "job-1,job-2");

    expect(newestScheduleFilterKey(search)).toBe("jobs");
    const first = dismiss(search.toString());
    expect(first?.search.has("jobs")).toBe(false);
    expect(first?.search.get("locations")).toBe("loc-1");
    expect(first?.search.get("hideUnscheduled")).toBe("true");

    const second = dismiss(first?.search.toString() ?? "");
    expect(second?.search.has("locations")).toBe(false);
    expect(second?.search.get("hideUnscheduled")).toBe("true");
  });

  it("takes a focused badge's shift type and job off in one step", () => {
    const result = dismissNextScheduleSearchLayer({
      search: new URLSearchParams("date=2026-09-10&locations=loc-1&shiftTypes=st-1&jobs=job-1"),
      modelWeekStart: "2026-09-07",
      currentWeekStart: "2026-09-07",
      today: "2026-09-10",
      focusedShift: true,
    });

    expect(result?.search.has("shiftTypes")).toBe(false);
    expect(result?.search.has("jobs")).toBe(false);
    expect(result?.search.get("locations")).toBe("loc-1");
    expect(result?.clearFocusedShift).toBe(true);
  });

  it("keeps a badge's focus while a newer filter goes first", () => {
    const result = dismissNextScheduleSearchLayer({
      search: new URLSearchParams("date=2026-09-10&shiftTypes=st-1&jobs=job-1&locations=loc-1"),
      modelWeekStart: "2026-09-07",
      currentWeekStart: "2026-09-07",
      today: "2026-09-10",
      focusedShift: true,
    });

    expect(result?.search.has("locations")).toBe(false);
    expect(result?.search.get("jobs")).toBe("job-1");
    expect(result?.clearFocusedShift).toBe(false);
  });

  it("keeps a badge's focus when an employee filter added on top of it goes", () => {
    const result = dismissNextScheduleSearchLayer({
      search: new URLSearchParams("date=2026-09-10&shiftTypes=st-1&jobs=job-1&employees=emp-1"),
      modelWeekStart: "2026-09-07",
      currentWeekStart: "2026-09-07",
      today: "2026-09-10",
      focusedShift: true,
    });

    expect(result?.search.has("employees")).toBe(false);
    expect(result?.search.get("shiftTypes")).toBe("st-1");
    expect(result?.search.get("jobs")).toBe("job-1");
    expect(result?.clearFocusedShift).toBe(false);
  });

  it("ignores an off Hide Unscheduled value", () => {
    expect(
      newestScheduleFilterKey(new URLSearchParams("jobs=job-1&hideUnscheduled=false")),
    ).toBe("jobs");
  });

  it("resets a non-current weekly period only after filters and daily view", () => {
    const result = dismiss("date=2026-08-03", "2026-08-03");

    expect(result?.search.get("date")).toBe("2026-09-10");
    expect(result?.search.get("view")).toBe("week");
  });

  // Mert 2026-10-21: the jump to this week left an edit of another week silently.
  it("keeps the edited week: while editing, nothing is left after filters and daily view", () => {
    const editing = (search: string) =>
      dismissNextScheduleSearchLayer({
        search: new URLSearchParams(search),
        modelWeekStart: "2026-08-03",
        currentWeekStart: "2026-09-07",
        today: "2026-09-10",
        editing: true,
      });

    expect(editing("date=2026-08-03&view=day")?.search.get("view")).toBe("week");
    expect(editing("date=2026-08-03&view=week&mode=edit")).toBeNull();
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
