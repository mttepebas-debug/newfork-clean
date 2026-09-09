import { describe, expect, it } from "vitest";
import { availabilityDateOverrideBounds, availabilityForDate, availabilityVersionForDate, assessEmployeeAvailability, type AvailabilityDateOverride, type AvailabilityDay } from "./availability";
import { availabilityProposalSchema } from "./availability-lifecycle";
import { scheduleAvailabilityDaySchema } from "./index";

const days: AvailabilityDay[] = Array.from({ length: 7 }, (_, day) => ({ day, mode: "windows", windows: [{ start: "09:00", end: "18:00" }], blocked_shift_type_ids: ["afa30000-0000-4000-8000-000000000004"] }));
const base = { id: "afa30000-0000-4000-8000-000000000001", revision: 1, timezone: "UTC", kind: "weekly" as const, days, effective_from: "2034-01-01", effective_until: null };
const off: AvailabilityDateOverride = { segment_date: "2035-01-15", start_time: "10:00", end_time: "17:00", ends_next_day: false, mode: "unavailable" };
const overlay = { ...base, id: "afa30000-0000-4000-8000-000000000002", revision: 2, kind: "temporary" as const, days: days.map(d => ({ ...d, mode: "unavailable" as const, windows: [], blocked_shift_type_ids: [] })), date_overrides: [off], ...availabilityDateOverrideBounds([off]) };
const employee = { availability_versions: [overlay, base] };
describe("dated availability hours", () => {
  it("preserves second precision in actual Schedule day responses", () => {
    const day = { day: 1, mode: "windows", windows: [{ start: "09:00:01", end: "10:00:59" }, { start: "17:00:00", end: "24:00" }] };
    expect(scheduleAvailabilityDaySchema.parse(day)).toEqual(day);
  });
  it("keeps base selection and applies exact dated hours in calendar previews", () => {
    expect(availabilityVersionForDate(employee.availability_versions, "2035-01-15")?.id).toBe(base.id);
    expect(availabilityForDate(employee, "2035-01-15")?.[1]).toEqual({ ...days[1], windows: [{ start: "09:00", end: "10:00" }, { start: "17:00", end: "18:00" }] });
    expect(assessEmployeeAvailability(employee, "2035-01-15", "10:00", "17:00").coverage).toBe("none");
    expect(assessEmployeeAvailability(employee, "2035-01-16", "09:00", "18:00").coverage).toBe("full");
  });
  it("preserves remaining pieces after an explicit subset replacement", () => {
    const next = { ...overlay, revision: 3, replace_version_ids: [overlay.id], date_overrides: [{ ...off, mode: "available" as const, start_time: "12:00", end_time: "13:00" }] };
    expect(availabilityForDate({ availability_versions: [...employee.availability_versions, next] }, "2035-01-15")?.[1]?.windows).toEqual([
      { start: "09:00", end: "10:00" }, { start: "12:00", end: "13:00" }, { start: "17:00", end: "18:00" },
    ]);
  });
  it("retains outside hours when a later weekly pattern changes", () => {
    const expanded = { ...base, revision: 4, days: days.map(d => ({ ...d, windows: [{ start: "08:00", end: "20:00" }] })) };
    expect(availabilityForDate({ availability_versions: [...employee.availability_versions, expanded] }, "2035-01-15")?.[1]?.windows).toEqual([{ start: "08:00", end: "10:00" }, { start: "17:00", end: "20:00" }]);
  });
  it("includes next-day hours and treats midnight as the end of the first date", () => {
    const night = { ...off, start_time: "23:00", end_time: "02:00", ends_next_day: true };
    expect(availabilityDateOverrideBounds([night]).effective_until).toBe("2035-01-16");
    expect(availabilityDateOverrideBounds([{ ...night, end_time: "00:00" }]).effective_until).toBe("2035-01-15");
    expect(() => availabilityDateOverrideBounds([{ ...night, segment_date: "" }])).not.toThrow();
  });
  it("does not certify differing zones or repeated-clock choices through a weekday preview", () => {
    expect(availabilityForDate({ availability_versions: [base, { ...overlay, timezone: "America/Los_Angeles" }] }, "2035-01-15")).toBeNull();
    expect(availabilityForDate({ availability_versions: [base, { ...overlay, date_overrides: [{ ...off, start_fold: "earlier" }] }] }, "2035-01-15")).toBeNull();
  });
  it("validates effective dates and prevents hidden weekly or type changes", () => {
    expect(availabilityProposalSchema.safeParse(overlay).success).toBe(true);
    expect(availabilityProposalSchema.safeParse({ ...overlay, effective_until: null }).success).toBe(false);
    expect(availabilityProposalSchema.safeParse({ ...overlay, days }).success).toBe(false);
    expect(availabilityProposalSchema.safeParse({ ...overlay, kind: "weekly" }).success).toBe(false);
  });
  it("blocks contradictory local pieces while allowing touching periods", () => {
    expect(availabilityProposalSchema.safeParse({ ...overlay, date_overrides: [off, { ...off, start_time: "12:00", end_time: "13:00", mode: "available" }] }).success).toBe(false);
    expect(availabilityProposalSchema.safeParse({ ...overlay, date_overrides: [off, { ...off, start_time: "17:00", end_time: "18:00", mode: "available" }] }).success).toBe(true);
  });
});
