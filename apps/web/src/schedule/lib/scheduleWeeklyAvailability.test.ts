import { describe, expect, it } from "vitest";
import type { ScheduleEmployee, ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { scheduleEmployeeSchema } from "@newfork/shared";
import { weeklyEmployeeSummary, weeklyTargetAvailability } from "./scheduleWeeklyAvailability";
import { evaluateScheduleShiftConflicts } from "../schedule-conflicts";

const loc = "ad425000-0000-4000-8000-000000000006";
const emp = "ad425000-0000-4000-8000-000000000004";
const job = "ad425000-0000-4000-8000-000000000009";
const projection: NonNullable<ScheduleEmployee["weekly_availability"]>[number] = {
  location_id: loc, location_name: "West", timezone: "America/Los_Angeles", week_start: "2035-01-15", status: "ready",
  unavailable_intervals: [{ start_at: "2035-01-16T02:00:00Z", end_at: "2035-01-16T04:00:00Z" }],
  leave_intervals: [], clock_segments: [{ start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-23T08:00:00Z", offset_seconds: -28800 }],
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2035-01-${15 + i}`, has_unavailable: i === 0, all_day: false })),
};
const employee: ScheduleEmployee = { id: emp, employee_code: "E-1", display_name: "Weekly Read", location_ids: [loc], job_ids: [job], weekly_availability: [projection] };
const input = { employee_id: emp, location_id: loc, job_id: job, shift_type_id: null, scheduled_date: "2035-01-15", start_time: "18:00", end_time: "20:00", time_basis: "explicit" } as ScheduleShiftMutationInput;
describe("weekly Schedule advisory projection", () => {
  it("preserves the projection through the actual employee response schema", () => {
    expect(scheduleEmployeeSchema.parse(employee).weekly_availability).toEqual([projection]);
  });
  it("rejects incomplete or reversed intervals instead of treating malformed data as available", () => {
    for (const invalid of [{ ...projection, days: [] }, { ...projection, clock_segments: [] },
      { ...projection, unavailable_intervals: [{ start_at: "2035-01-16T04:00:00Z", end_at: "2035-01-16T02:00:00Z" }] }]) {
      expect(scheduleEmployeeSchema.safeParse({ ...employee, weekly_availability: [invalid] }).success).toBe(false);
    }
  });
  it("uses half-open physical intervals", () => {
    expect(weeklyTargetAvailability(employee, input)).toBe("unavailable");
    expect(weeklyTargetAvailability(employee, { ...input, start_time: "16:00", end_time: "18:00" })).toBe("available");
    expect(weeklyTargetAvailability(employee, { ...input, start_time: "20:00", end_time: "22:00" })).toBe("available");
  });
  it("treats an empty projection as available and a missing one as no data", () => {
    expect(weeklyTargetAvailability({ ...employee, weekly_availability: [{ ...projection, unavailable_intervals: [] }] }, input)).toBe("available");
    expect(weeklyTargetAvailability({ ...employee, weekly_availability: undefined }, input)).toBeNull();
  });
  it("keeps approved leave a hard blocker even when a preference also overlaps", () => {
    const withLeave = { ...employee, weekly_availability: [{ ...projection, leave_intervals: projection.unavailable_intervals }] };
    expect(weeklyTargetAvailability(withLeave, input)).toBe("time_off");
    const model = { settings: { time_format: "12h" }, employees: [withLeave], locations: [{ id: loc, name: "West" }], jobs: [{ id: job, name: "Server" }], shift_types: [], closures: [] } as unknown as ScheduleReadModel;
    expect(evaluateScheduleShiftConflicts(model, [], input)).toEqual([expect.objectContaining({ type: "time_off" })]);
    expect(evaluateScheduleShiftConflicts({ ...model, employees: [employee] }, [], input)).toEqual([expect.objectContaining({ type: "availability", rule_kind: "weekly" })]);
  });
  it("only warns, for the employee's own mark and a manager's reminder alike (BL-186)", () => {
    const reminderOnly = { ...employee, weekly_availability: [{ ...projection, employee_intervals: [] }] };
    const ownMark = { ...employee, weekly_availability: [{ ...projection, employee_intervals: projection.unavailable_intervals }] };
    expect(weeklyTargetAvailability(reminderOnly, input)).toBe("reminder");
    expect(weeklyTargetAvailability(ownMark, input)).toBe("unavailable");
    const model = { settings: { time_format: "12h", conflict_rules: { approved_time_off: "block", closed_location: "confirm", minimum_travel: "confirm", minimum_rest: "confirm" } },
      employees: [reminderOnly], locations: [{ id: loc, name: "West" }], jobs: [{ id: job, name: "Server" }], shift_types: [], closures: [] } as unknown as ScheduleReadModel;
    expect(evaluateScheduleShiftConflicts(model, [], input)).toEqual([expect.objectContaining({ type: "availability", severity: "warn" })]);
    expect(evaluateScheduleShiftConflicts({ ...model, employees: [ownMark] }, [], input)).toEqual([expect.objectContaining({ type: "availability", severity: "warn" })]);
  });
  it("adds nothing for availability it cannot place; the server's answer is the one that counts (BL-186)", () => {
    const model = { settings: { time_format: "12h" }, employees: [{ ...employee, weekly_availability: [] }],
      locations: [{ id: loc, name: "West" }], jobs: [{ id: job, name: "Server" }], shift_types: [], closures: [] } as unknown as ScheduleReadModel;
    expect(evaluateScheduleShiftConflicts(model, [], input)).toEqual([]);
  });
  it("uses actual hours rather than the selected shift type identity", () => {
    expect(weeklyTargetAvailability(employee, { ...input, shift_type_id: job, start_time: "10:00", end_time: "12:00" })).toBe("available");
  });
  it("does not trust default hours that disagree with their saved snapshot", () => {
    expect(weeklyTargetAvailability(employee, { ...input, time_basis: "type_default", time_snapshot: {
      shift_type_id: job, default_revision: 1, start_time: "10:00", end_time: "12:00", timezone: projection.timezone,
    } })).toBe("unknown");
  });
  it("covers overnight assignments and 24:00 endpoints", () => {
    const night = { ...employee, weekly_availability: [{ ...projection, unavailable_intervals: [{ start_at: "2035-01-16T09:00:00Z", end_at: "2035-01-16T10:00:00Z" }] }] };
    expect(weeklyTargetAvailability(night, { ...input, start_time: "22:00", end_time: "02:00" })).toBe("unavailable");
    expect(weeklyTargetAvailability(night, { ...input, start_time: "22:00", end_time: "24:00" })).toBe("available");
  });
  it.each([
    { ...input, time_timezone: "America/New_York" }, { ...input, location_id: job },
    { ...input, scheduled_date: "2035-01-22" },
    { ...input, start_time: "" }, { ...input, start_time: "20:00" },
  ])("does not label unmatched or unverified shift clocks available", value => {
    expect(weeklyTargetAvailability(employee, value)).toBe("unknown");
  });
  it("does not label missing/unknown location projections available", () => {
    expect(weeklyTargetAvailability({ ...employee, weekly_availability: [] }, input)).toBe("unknown");
    expect(weeklyTargetAvailability({ ...employee, weekly_availability: [{ ...projection, status: "unknown" }] }, input)).toBe("unknown");
  });
  it("uses the post-transition occurrence of a repeated wall clock", () => {
    const fall = { ...employee, weekly_availability: [{ ...projection, week_start: "2035-10-29",
      clock_segments: [
        { start_at: "2035-10-29T07:00:00Z", end_at: "2035-11-04T09:00:00Z", offset_seconds: -25200 },
        { start_at: "2035-11-04T09:00:00Z", end_at: "2035-11-06T08:00:00Z", offset_seconds: -28800 },
      ], unavailable_intervals: [{ start_at: "2035-11-04T09:15:00Z", end_at: "2035-11-04T09:45:00Z" }],
    }] };
    expect(weeklyTargetAvailability(fall, { ...input, scheduled_date: "2035-11-04", start_time: "01:15", end_time: "01:45" })).toBe("unavailable");
  });
  it("does not normalize a nonexistent spring clock into availability", () => {
    const spring = { ...employee, weekly_availability: [{ ...projection, week_start: "2035-03-05", unavailable_intervals: [],
      clock_segments: [
        { start_at: "2035-03-05T08:00:00Z", end_at: "2035-03-11T10:00:00Z", offset_seconds: -28800 },
        { start_at: "2035-03-11T10:00:00Z", end_at: "2035-03-13T07:00:00Z", offset_seconds: -25200 },
      ],
    }] };
    expect(weeklyTargetAvailability(spring, { ...input, scheduled_date: "2035-03-11", start_time: "02:15", end_time: "03:15" })).toBe("unknown");
  });
  it("builds a source-private weekly row summary and clears it when restrictions disappear", () => {
    expect(weeklyEmployeeSummary(employee)).toBe("West: 2035-01-15 unavailable hours");
    expect(weeklyEmployeeSummary({ ...employee, weekly_availability: [{ ...projection, days: [] }] })).toBe("");
    expect(weeklyEmployeeSummary({ ...employee, weekly_availability: [{ ...projection, status: "unknown" }] })).toContain("needs checking");
  });
});
