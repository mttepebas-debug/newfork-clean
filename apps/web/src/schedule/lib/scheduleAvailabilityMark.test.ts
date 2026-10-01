import { describe, expect, it } from "vitest";
import type { ScheduleEmployee } from "@newfork/shared/schedule";

import {
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  mergeAvailabilityMarks,
  scheduleAvailabilityMarks,
  windowsDuringShift,
} from "./scheduleAvailabilityMark";

type Projection = NonNullable<ScheduleEmployee["weekly_availability"]>[number];

// New York in October: UTC-4 the whole week.
const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
function projection(overrides: Partial<Projection>): Projection {
  return {
    location_id: "loc",
    location_name: "Main Dining",
    timezone: "America/New_York",
    week_start: week[0]!,
    status: "ready",
    unavailable_intervals: [],
    employee_intervals: [],
    leave_intervals: [],
    clock_segments: [{ start_at: "2026-10-19T04:00:00Z", end_at: "2026-10-27T04:00:00Z", offset_seconds: -4 * 3600 }],
    days: week.map((date) => ({ date, has_unavailable: false, all_day: false })),
    ...overrides,
  } as Projection;
}
const marked = (dates: readonly string[], allDay: readonly string[] = []) =>
  week.map((date) => ({ date, has_unavailable: dates.includes(date), all_day: allDay.includes(date) }));

describe("scheduleAvailabilityMarks", () => {
  it("reads the employee's own hours on the local day", () => {
    const after2 = { start_at: "2026-10-20T18:00:00Z", end_at: "2026-10-21T04:00:00Z" };
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [after2],
      employee_intervals: [after2],
      days: marked(["2026-10-20"]),
    }));
    expect(marks.get("2026-10-20")).toEqual({ kind: "unavailable", windows: [{ from: 840, to: 1440, source: "employee" }] });
    expect(marks.has("2026-10-21")).toBe(false);
  });

  it("names hours no own mark touches a manager note", () => {
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [{ start_at: "2026-10-19T04:00:00Z", end_at: "2026-10-19T20:00:00Z" }],
      employee_intervals: [],
      days: marked(["2026-10-19"]),
    }));
    expect(marks.get("2026-10-19")).toEqual({ kind: "unavailable", windows: [{ from: 0, to: 960, source: "manager" }] });
  });

  it("puts the note's words for that weekday on the manager's hours only (G14)", () => {
    const mine = { start_at: "2026-10-19T20:00:00Z", end_at: "2026-10-19T22:00:00Z" };
    const notes = ["", "School mornings", "", "", "", "", ""];
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [{ start_at: "2026-10-19T04:00:00Z", end_at: "2026-10-19T16:00:00Z" }, mine],
      employee_intervals: [mine],
      manager_notes: notes,
      days: marked(["2026-10-19"]),
    }));
    expect(marks.get("2026-10-19")).toEqual({ kind: "unavailable", windows: [
      { from: 0, to: 720, source: "manager", note: "School mornings" },
      { from: 960, to: 1080, source: "employee" },
    ] });
  });

  it("leaves the words out when there are none to read", () => {
    const night = { start_at: "2026-10-20T04:00:00Z", end_at: "2026-10-20T10:00:00Z" };
    for (const manager_notes of [null, undefined, ["", "Mornings", " ", "", "", "", ""]]) {
      const marks = scheduleAvailabilityMarks(projection({ unavailable_intervals: [night], manager_notes, days: marked(["2026-10-20"]) }));
      expect(marks.get("2026-10-20")).toEqual({ kind: "unavailable", windows: [{ from: 0, to: 360, source: "manager" }] });
    }
  });

  it("marks approved time off red even on a day with no unavailable flag", () => {
    const marks = scheduleAvailabilityMarks(projection({
      leave_intervals: [{ start_at: "2026-10-24T04:00:00Z", end_at: "2026-10-25T04:00:00Z" }],
    }));
    expect(marks.get("2026-10-24")).toEqual({ kind: "time_off", ranges: [{ from: 0, to: 1440 }] });
    expect(marks.size).toBe(1);
  });

  it("lets time off win over the employee's preference on the same day", () => {
    const allDay = { start_at: "2026-10-24T04:00:00Z", end_at: "2026-10-25T04:00:00Z" };
    const marks = scheduleAvailabilityMarks(projection({
      unavailable_intervals: [allDay],
      employee_intervals: [allDay],
      leave_intervals: [{ start_at: "2026-10-24T13:00:00Z", end_at: "2026-10-24T17:00:00Z" }],
      days: marked(["2026-10-24"], ["2026-10-24"]),
    }));
    expect(marks.get("2026-10-24")).toEqual({ kind: "time_off", ranges: [{ from: 540, to: 780 }] });
  });

  it("reads nothing from a projection that is not ready", () => {
    expect(scheduleAvailabilityMarks(projection({ status: "unknown", days: [] })).size).toBe(0);
  });
});

describe("mergeAvailabilityMarks", () => {
  it("keeps one copy of the same window from two locations in one zone", () => {
    const mark = { kind: "unavailable" as const, windows: [{ from: 840, to: 1440, source: "employee" as const }] };
    expect(mergeAvailabilityMarks(mark, mark)).toEqual(mark);
  });
  it("lets time off win", () => {
    const off = { kind: "time_off" as const, ranges: [{ from: 0, to: 1440 }] };
    expect(mergeAvailabilityMarks({ kind: "unavailable", windows: [{ from: 0, to: 60, source: "employee" }] }, off)).toEqual(off);
  });
});

describe("formatting", () => {
  it("uses the prototype's wording", () => {
    expect(formatAvailabilityRange("unavailable", { from: 840, to: 1080 }, "12h")).toBe("Unavailable 2:00 PM – 6:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 840, to: 1440 }, "12h")).toBe("Unavailable after 2:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 0, to: 960 }, "12h")).toBe("Unavailable until 4:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 0, to: 1440 }, "12h")).toBe("Unavailable all day");
    expect(formatAvailabilityRange("time_off", { from: 0, to: 1440 }, "12h")).toBe("Approved time off, all day");
    expect(formatAvailabilityRange("time_off", { from: 540, to: 780 }, "12h")).toBe("Approved time off 9:00 AM – 1:00 PM");
    expect(formatAvailabilityRange("unavailable", { from: 840, to: 1080 }, "24h")).toBe("Unavailable 14:00 – 18:00");
    expect(formatAvailabilityMarkDay("2026-10-20")).toBe("Tue, Oct 20");
  });
});

describe("windowsDuringShift", () => {
  const windows = [
    { from: 0, to: 600, source: "manager" as const },
    { from: 840, to: 1440, source: "employee" as const },
  ];
  it("keeps the windows the shift touches", () => {
    expect(windowsDuringShift(windows, "16:00:00", "22:00:00")).toEqual([windows[1]]);
  });
  it("runs an overnight shift to the end of its day", () => {
    expect(windowsDuringShift(windows, "23:00", "02:00")).toEqual([windows[1]]);
  });
  it("shows the whole day when the shift touches none", () => {
    expect(windowsDuringShift(windows, "11:00", "13:00")).toEqual(windows);
  });
});
