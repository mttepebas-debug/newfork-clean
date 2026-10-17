import { describe, expect, it } from "vitest";
import type { WeeklyPreference } from "@newfork/shared";
import { ownAvailabilityClash } from "./own-availability";

// 2035-01-15 is a Monday (day 1).
function week(monday: WeeklyPreference["days"][number] | null = null): WeeklyPreference {
  return { days: Array.from({ length: 7 }, (_, day) => (day === 1 && monday ? monday : { day, all_day: false, ranges: [] })) };
}
const shift = (start_time: string, end_time: string) => ({ scheduled_date: "2035-01-15", start_time, end_time });

describe("a shift on hours the employee marked unavailable (spec Kurallar 5)", () => {
  it("says the day and the hours they marked", () => {
    expect(ownAvailabilityClash(week({ day: 1, all_day: false, ranges: [{ start: "18:00", end: "24:00" }] }), shift("17:00", "22:00"), "12h"))
      .toBe("Mon after 6:00 PM");
    expect(ownAvailabilityClash(week({ day: 1, all_day: false, ranges: [{ start: "00:00", end: "11:00" }] }), shift("09:00", "13:00"), "12h"))
      .toBe("Mon before 11:00 AM");
    expect(ownAvailabilityClash(week({ day: 1, all_day: false, ranges: [{ start: "15:00", end: "22:00" }] }), shift("16:00", "20:00"), "24h"))
      .toBe("Mon 15:00 – 22:00");
    expect(ownAvailabilityClash(week({ day: 1, all_day: true, ranges: [] }), shift("09:00", "13:00"), "12h"))
      .toBe("Mon all day");
  });

  it("says nothing when the shift misses the marked hours, or nothing is marked", () => {
    expect(ownAvailabilityClash(week({ day: 1, all_day: false, ranges: [{ start: "18:00", end: "24:00" }] }), shift("09:00", "17:00"), "12h")).toBeNull();
    expect(ownAvailabilityClash(week(), shift("09:00", "17:00"), "12h")).toBeNull();
    expect(ownAvailabilityClash(undefined, shift("09:00", "17:00"), "12h")).toBeNull();
  });

  it("counts an overnight shift to the end of its day", () => {
    expect(ownAvailabilityClash(week({ day: 1, all_day: false, ranges: [{ start: "22:00", end: "24:00" }] }), shift("20:00", "02:00"), "12h"))
      .toBe("Mon after 10:00 PM");
  });

  it("a shift without hours yet says nothing", () => {
    expect(ownAvailabilityClash(week({ day: 1, all_day: true, ranges: [] }), shift("", ""), "12h")).toBeNull();
  });
});
