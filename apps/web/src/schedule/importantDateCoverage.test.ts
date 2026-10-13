import { describe, expect, it } from "vitest";
import type { ScheduleReadModel } from "@newfork/shared/schedule";

import { scheduleImportantDateCoversDate } from "./importantDateCoverage";

function post(
  overrides: Partial<ScheduleReadModel["important_dates"][number]> = {},
): ScheduleReadModel["important_dates"][number] {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    location_id: null,
    title: "Holiday",
    category: "holiday",
    category_other: null,
    starts_on: "2025-12-31",
    ends_on: "2025-12-31",
    status: "published",
    publish_at: null,
    day: "open",
    opens: null,
    closes: null,
    event_from: null,
    event_until: null,
    ...overrides,
  };
}

describe("scheduleImportantDateCoversDate", () => {
  it("covers the post's own days, across a year end too", () => {
    const span = post({ starts_on: "2026-12-31", ends_on: "2027-01-02" });
    expect(scheduleImportantDateCoversDate(span, "2026-12-30")).toBe(false);
    expect(scheduleImportantDateCoversDate(span, "2026-12-31")).toBe(true);
    expect(scheduleImportantDateCoversDate(span, "2027-01-02")).toBe(true);
    expect(scheduleImportantDateCoversDate(span, "2027-01-03")).toBe(false);
  });

  it("does not repeat: a yearly post's next year is its own record (EKRAN-08)", () => {
    expect(scheduleImportantDateCoversDate(post(), "2026-12-31")).toBe(false);
  });
});
