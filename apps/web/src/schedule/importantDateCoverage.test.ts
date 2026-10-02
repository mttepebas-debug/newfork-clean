import { describe, expect, it } from "vitest";
import type { ScheduleReadModel } from "@newfork/shared/schedule";

import { scheduleImportantDateCoversDate } from "./importantDateCoverage";

function importantDate(
  overrides: Partial<ScheduleReadModel["important_dates"][number]> = {},
): ScheduleReadModel["important_dates"][number] {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    location_id: null,
    title: "Holiday",
    type: "holiday",
    starts_on: "2025-12-31",
    ends_on: "2025-12-31",
    recurrence: "none",
    ...overrides,
  };
}

describe("scheduleImportantDateCoversDate", () => {
  it("matches one-time important dates by full date range", () => {
    expect(
      scheduleImportantDateCoversDate(
        importantDate({ starts_on: "2026-08-18", ends_on: "2026-08-19" }),
        "2026-08-19",
      ),
    ).toBe(true);
    expect(
      scheduleImportantDateCoversDate(
        importantDate({ starts_on: "2026-08-18", ends_on: "2026-08-19" }),
        "2027-08-19",
      ),
    ).toBe(false);
  });

  it("matches annual important dates by month and day", () => {
    expect(
      scheduleImportantDateCoversDate(
        importantDate({
          starts_on: "2025-07-04",
          ends_on: "2025-07-04",
          recurrence: "annual",
        }),
        "2026-07-04",
      ),
    ).toBe(true);
  });

  it("matches annual ranges that cross the end of the year", () => {
    const yearEndRange = importantDate({
      starts_on: "2025-12-31",
      ends_on: "2026-01-02",
      recurrence: "annual",
    });

    expect(scheduleImportantDateCoversDate(yearEndRange, "2027-01-01")).toBe(true);
    expect(scheduleImportantDateCoversDate(yearEndRange, "2027-01-03")).toBe(false);
  });

  it("shows a 29 February closed day on 28 February in a year without it, as the Schedule closes it (KK-92 d)", () => {
    const leapDay = importantDate({ starts_on: "2024-02-29", ends_on: "2024-02-29", recurrence: "annual" });

    expect(scheduleImportantDateCoversDate(leapDay, "2027-02-28")).toBe(true);
    expect(scheduleImportantDateCoversDate(leapDay, "2028-02-28")).toBe(false);
  });
});
