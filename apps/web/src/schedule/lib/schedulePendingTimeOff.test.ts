import { describe, expect, it } from "vitest";
import type { ScheduleEmployee } from "@newfork/shared/schedule";
import { formatPendingTimeOffLine, schedulePendingTimeOff } from "./scheduleAvailabilityMark";

// Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer is a warning on the
// Schedule cell, apart from approved time off.
type Projection = NonNullable<ScheduleEmployee["weekly_availability"]>[number];

// Los Angeles in January: UTC-8 the whole week; Monday is 2035-01-15.
const allFriday = { start_at: "2035-01-19T08:00:00Z", end_at: "2035-01-20T08:00:00Z" };
const tuesdayMorning = { start_at: "2035-01-16T17:00:00Z", end_at: "2035-01-16T21:00:00Z" };
function projection(overrides: Partial<Projection> = {}): Projection {
  return {
    location_id: "ad425000-0000-4000-8000-000000000006", location_name: "West", timezone: "America/Los_Angeles",
    week_start: "2035-01-15", status: "ready", unavailable_intervals: [], leave_intervals: [],
    clock_segments: [{ start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-23T08:00:00Z", offset_seconds: -28800 }],
    days: Array.from({ length: 7 }, (_, i) => ({ date: `2035-01-${15 + i}`, has_unavailable: false, all_day: false })),
    ...overrides,
  } as Projection;
}

describe("time off waiting for an answer on the Schedule week", () => {
  it("is read by local day, all day or by its hours", () => {
    expect(schedulePendingTimeOff(projection({ pending_leave_intervals: [allFriday, tuesdayMorning] }))).toEqual(new Map([
      ["2035-01-16", [{ from: 540, to: 780 }]],
      ["2035-01-19", [{ from: 0, to: 1440 }]],
    ]));
  });

  it("is nothing in an older reply, or a week that cannot be read", () => {
    expect(schedulePendingTimeOff(projection()).size).toBe(0);
    expect(schedulePendingTimeOff(projection({ status: "unknown", pending_leave_intervals: [allFriday] })).size).toBe(0);
  });

  // Mert, 2026-10-23 (D): the window's second line, under "<name> asked for time off".
  it("says when, in the cell's window", () => {
    expect(formatPendingTimeOffLine("2035-01-19", [{ from: 0, to: 1440 }], "12h")).toBe("Fri, Jan 19, all day");
    expect(formatPendingTimeOffLine("2035-01-16", [{ from: 540, to: 780 }], "12h")).toBe("Tue, Jan 16, 9:00 AM – 1:00 PM");
    expect(formatPendingTimeOffLine("2035-01-16", [{ from: 540, to: 780 }], "24h")).toBe("Tue, Jan 16, 09:00 – 13:00");
  });
});
