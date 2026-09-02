import { describe, expect, it } from "vitest";

import {
  hasVisibleScheduleShiftForEmployee,
  isScheduleEmployeeEligible,
  matchesScheduleEmployeeFilters,
} from "./employeeEligibility";

describe("employeeEligibility", () => {
  it("matches location, shift type, and job for focused schedule badges", () => {
    expect(
      isScheduleEmployeeEligible(
        {
          job_ids: ["job-1", "job-2"],
          location_ids: ["loc-1", "loc-2"],
          shift_type_ids: ["type-1", "type-2"],
        },
        { locationId: "loc-2", shiftTypeId: "type-1", jobId: "job-2" },
      ),
    ).toBe(true);

    expect(
      isScheduleEmployeeEligible(
        {
          job_ids: ["job-1"],
          location_ids: ["loc-1"],
          shift_type_ids: ["type-1"],
        },
        { locationId: "loc-2", shiftTypeId: "type-1", jobId: "job-1" },
      ),
    ).toBe(false);
  });

  it("treats clock-only focus as location plus job eligibility", () => {
    expect(
      isScheduleEmployeeEligible(
        {
          job_ids: ["job-1"],
          location_ids: ["loc-1"],
          shift_type_ids: [],
        },
        { locationId: "loc-1", shiftTypeId: null, jobId: "job-1" },
      ),
    ).toBe(true);
  });

  it("requires one employee match in every active filter category", () => {
    const employee = {
      job_ids: ["job-1", "job-2"],
      location_ids: ["loc-1", "loc-2"],
      shift_type_ids: ["type-1", "type-2"],
    };

    expect(
      matchesScheduleEmployeeFilters(employee, {
        locationIds: ["loc-1"],
        shiftTypeIds: ["type-2"],
        jobIds: ["job-2", "job-3"],
      }),
    ).toBe(true);
    expect(
      matchesScheduleEmployeeFilters(employee, {
        locationIds: ["loc-1"],
        shiftTypeIds: ["type-2"],
        jobIds: ["job-3"],
      }),
    ).toBe(false);
  });

  it("uses focus context as the strict hide-unscheduled visibility filter", () => {
    const shifts = [
      {
        employee_id: "emp-1",
        location_id: "loc-1",
        shift_type_id: "type-1",
        job_id: "job-1",
        scheduled_date: "2026-04-20",
      },
      {
        employee_id: "emp-1",
        location_id: "loc-1",
        shift_type_id: "type-2",
        job_id: "job-2",
        scheduled_date: "2026-04-21",
      },
      {
        employee_id: "emp-2",
        location_id: "loc-1",
        shift_type_id: "type-1",
        job_id: "job-1",
        scheduled_date: "2026-04-20",
      },
    ];

    expect(
      hasVisibleScheduleShiftForEmployee(shifts, "emp-1", {
        weekDates: ["2026-04-20"],
        locationIds: ["loc-2"],
        shiftTypeIds: [],
        jobIds: [],
        focusContext: {
          locationId: "loc-1",
          shiftTypeId: "type-1",
          jobId: "job-1",
        },
      }),
    ).toBe(true);
    expect(
      hasVisibleScheduleShiftForEmployee(shifts, "emp-1", {
        weekDates: ["2026-04-20"],
        locationIds: [],
        shiftTypeIds: [],
        jobIds: [],
        focusContext: {
          locationId: "loc-1",
          shiftTypeId: "type-2",
          jobId: "job-2",
        },
      }),
    ).toBe(false);
  });
});
