import { describe, expect, it } from "vitest";
import type { ScheduleEmployee } from "@newfork/shared/schedule";

import {
  formatEmployeeAvailabilitySummary,
  scheduleEmployeeAvailabilityRules,
} from "./availabilityIndicators";

const employee: ScheduleEmployee = {
  id: "55555555-5555-4555-8555-555555555555",
  employee_code: "NF-001",
  display_name: "Alex Rivera",
  location_ids: ["11111111-1111-4111-8111-111111111111"],
  job_ids: ["33333333-3333-4333-8333-333333333333"],
  primary_job_id: "33333333-3333-4333-8333-333333333333",
  availability: [
    { day: 0, mode: "unrestricted", windows: [] },
    { day: 1, mode: "unavailable", windows: [] },
    { day: 2, mode: "windows", windows: [{ start: "09:00", end: "15:00" }] },
    { day: 3, mode: "unrestricted", windows: [] },
    { day: 4, mode: "unrestricted", windows: [] },
    { day: 5, mode: "unrestricted", windows: [] },
    { day: 6, mode: "unrestricted", windows: [] },
  ],
};

describe("schedule availability indicators", () => {
  it("keeps only restricted availability rules for the employee row indicator", () => {
    expect(scheduleEmployeeAvailabilityRules(employee)).toHaveLength(2);
  });

  it("formats restricted availability rules for the employee row tooltip", () => {
    expect(
      formatEmployeeAvailabilitySummary(scheduleEmployeeAvailabilityRules(employee)),
    ).toBe(
      "Unavailable Monday all day · Unavailable outside Tuesday 09:00-15:00",
    );
  });
});
