import { describe, expect, it } from "vitest";
import { schedulePublishFindingSchema, scheduleWeeklyLocationSchema } from "./index";

// Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer reaches the Schedule week apart
// from approved time off, and the publish note says which table its request is in.
const id = "af9c0000-0000-4000-8000-000000000001";
const other = "af9c0000-0000-4000-8000-000000000002";
const days = Array.from({ length: 7 }, (_, index) => ({ date: `2035-01-${String(14 + index).padStart(2, "0")}`, has_unavailable: false, all_day: false }));
const week = {
  location_id: id, location_name: "Kadikoy", timezone: "Europe/Istanbul", week_start: "2035-01-14", status: "ready",
  unavailable_intervals: [], leave_intervals: [], days,
  clock_segments: [{ start_at: "2035-01-13T21:00:00Z", end_at: "2035-01-21T21:00:00Z", offset_seconds: 10_800 }],
};
const waiting = { start_at: "2035-01-16T21:00:00Z", end_at: "2035-01-17T21:00:00Z" };

describe("time off waiting for an answer in the Schedule week", () => {
  it("keeps its hours apart from the approved ones", () => {
    const read = scheduleWeeklyLocationSchema.parse({ ...week, pending_leave_intervals: [waiting] });
    expect(read.pending_leave_intervals).toEqual([waiting]);
    expect(read.leave_intervals).toEqual([]);
  });
  it("reads an older reply without them", () => {
    expect(scheduleWeeklyLocationSchema.parse(week).pending_leave_intervals).toBeUndefined();
  });
  it("refuses hours that end before they start", () => {
    const backwards = { start_at: waiting.end_at, end_at: waiting.start_at };
    expect(scheduleWeeklyLocationSchema.safeParse({ ...week, pending_leave_intervals: [backwards] }).success).toBe(false);
  });
});

describe("the publish note's table", () => {
  const note = { id: "time_off_pending:1", code: "time_off_pending", severity: "soft", overrideable: false, tier: "note",
    message: "Ali has time off waiting for a decision on Jan 15", location_id: id, employee_id: id, scheduled_date: "2035-01-15",
    shift_ids: [other], time_off_request_id: other };
  it("says whether the request is in the new table or the old one", () => {
    expect(schedulePublishFindingSchema.parse({ ...note, time_off_source: "current" }).time_off_source).toBe("current");
    expect(schedulePublishFindingSchema.parse({ ...note, time_off_source: "legacy" }).time_off_source).toBe("legacy");
    expect(schedulePublishFindingSchema.parse(note).time_off_source).toBeUndefined();
    expect(schedulePublishFindingSchema.safeParse({ ...note, time_off_source: "other" }).success).toBe(false);
  });
});
