import type { ScheduleEmployee, ScheduleReadModel } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  clampShiftEditorCount,
  getShiftEditorEligibleEmployees,
  getShiftEditorEligibleJobs,
  getShiftEditorSelectedEmployee,
  shouldDisableShiftEditorEmployeePicker,
  shouldShowShiftEditorCountStepper,
} from "./shiftEditorEligibility";

const jobs: ScheduleReadModel["jobs"] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Host",
    color: "#f59e0b",
    sort_order: 0,
    department_id: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Server",
    color: "#10b981",
    sort_order: 1,
    department_id: null,
  },
];

function employee(overrides: Partial<ScheduleEmployee>): ScheduleEmployee {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    employee_code: "NF-001",
    display_name: "Ada",
    location_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    job_ids: [jobs[0]!.id],
    shift_type_ids: [],
    is_excluded_from_schedule: false,
    primary_job_id: jobs[0]!.id,
    availability: null,
    ...overrides,
  };
}

const employees = [
  employee({
    id: "33333333-3333-4333-8333-333333333333",
    display_name: "Ada Host",
  }),
  employee({
    id: "44444444-4444-4444-8444-444444444444",
    display_name: "Sam Server",
    location_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    job_ids: [jobs[1]!.id],
    primary_job_id: jobs[1]!.id,
  }),
  employee({
    id: "55555555-5555-4555-8555-555555555555",
    display_name: "Patio Only",
    location_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    job_ids: [jobs[0]!.id, jobs[1]!.id],
  }),
];

describe("shiftEditorEligibility", () => {
  it("selects the active employee by id and returns null for unassigned", () => {
    expect(getShiftEditorSelectedEmployee(employees, null)).toBeNull();
    expect(
      getShiftEditorSelectedEmployee(
        employees,
        "44444444-4444-4444-8444-444444444444",
      )?.display_name,
    ).toBe("Sam Server");
  });

  it("filters eligible employees by location and job", () => {
    expect(
      getShiftEditorEligibleEmployees({
        employees,
        locationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        jobId: jobs[1]!.id,
      }).map((item) => item.display_name),
    ).toEqual(["Sam Server"]);
  });

  it("keeps all jobs for unassigned shifts and filters jobs for selected employees", () => {
    expect(
      getShiftEditorEligibleJobs({
        jobs,
        selectedEmployee: null,
        employeeId: null,
      }).map((item) => item.name),
    ).toEqual(["Host", "Server"]);

    expect(
      getShiftEditorEligibleJobs({
        jobs,
        selectedEmployee: employees[0]!,
        employeeId: employees[0]!.id,
      }).map((item) => item.name),
    ).toEqual(["Host"]);
  });

  it("shows count stepper only for unassigned create targets", () => {
    expect(
      shouldShowShiftEditorCountStepper({
        mode: "create",
        targetEmployeeId: null,
        valueEmployeeId: null,
      }),
    ).toBe(true);
    expect(
      shouldShowShiftEditorCountStepper({
        mode: "create",
        targetEmployeeId: employees[0]!.id,
        valueEmployeeId: employees[0]!.id,
      }),
    ).toBe(false);
    expect(
      shouldShowShiftEditorCountStepper({
        mode: "edit",
        targetEmployeeId: null,
        valueEmployeeId: null,
      }),
    ).toBe(false);
  });

  it("clamps count and disables employee picker while multi-create is active", () => {
    expect(clampShiftEditorCount(0)).toBe(1);
    expect(clampShiftEditorCount(7)).toBe(7);
    expect(clampShiftEditorCount(20)).toBe(10);
    expect(
      shouldDisableShiftEditorEmployeePicker({
        showCountStepper: true,
        count: 2,
      }),
    ).toBe(true);
    expect(
      shouldDisableShiftEditorEmployeePicker({
        showCountStepper: true,
        count: 1,
      }),
    ).toBe(false);
  });
});
