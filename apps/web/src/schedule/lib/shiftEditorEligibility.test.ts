import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
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
    
    department_id: null,
    system_key: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Server",
    color: "#10b981",
    
    department_id: null,
    system_key: null,
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

const locationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const model: ScheduleReadModel = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: {
    time_format: "12h",
  },
  locations: [
    {
      id: locationId,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: null,
    },
  ],
  departments: [],
  jobs,
  referenced_jobs: [],
  referenced_shift_types: [],
  shift_types: [],
  shift_labels: [],
  employees: [
    employee({
      id: "66666666-6666-4666-8666-666666666666",
      display_name: "Morning Server",
      location_ids: [locationId],
      job_ids: [jobs[1]!.id],
      primary_job_id: jobs[1]!.id,
    }),
    employee({
      id: "77777777-7777-4777-8777-777777777777",
      display_name: "Busy Server",
      location_ids: [locationId],
      job_ids: [jobs[1]!.id],
      primary_job_id: jobs[1]!.id,
    }),
    employee({
      id: "88888888-8888-4888-8888-888888888888",
      display_name: "Night Server",
      location_ids: [locationId],
      job_ids: [jobs[1]!.id],
      primary_job_id: jobs[1]!.id,
      // Unavailable before 16:00 on Monday 2026-08-17.
      weekly_availability: [{
        location_id: locationId, location_name: "Main Dining", timezone: "America/Los_Angeles", week_start: "2026-08-17", status: "ready",
        unavailable_intervals: [{ start_at: "2026-08-17T07:00:00Z", end_at: "2026-08-17T23:00:00Z" }], leave_intervals: [],
        clock_segments: [{ start_at: "2026-08-17T07:00:00Z", end_at: "2026-08-24T07:00:00Z", offset_seconds: -25200 }],
        days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${17 + index}`, has_unavailable: index === 0, all_day: false })),
      }],
    }),
  ],
  shifts: [],
  closures: [],
  important_dates: [],
};

const busyShift: ScheduleShift = {
  id: "99999999-9999-4999-8999-999999999999",
  location_id: locationId,
  employee_id: "77777777-7777-4777-8777-777777777777",
  job_id: jobs[1]!.id,
  shift_type_id: null,
  scheduled_date: "2026-08-17",
  start_time: "09:00",
  end_time: "13:00",
  crosses_midnight: false,
  unpaid_break_minutes: 0,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "",
  warning_codes: [],
};

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

  it("filters overlapping assignments while keeping employees available for authoritative capacity review", () => {
    expect(
      getShiftEditorEligibleEmployees({
        employees: model.employees,
        locationId,
        jobId: jobs[1]!.id,
        model: { ...model, shifts: [busyShift] },
        value: {
          location_id: locationId,
          employee_id: null,
          job_id: jobs[1]!.id,
          shift_type_id: null,
          scheduled_date: "2026-08-17",
          start_time: "09:30",
          end_time: "12:00",
          unpaid_break_minutes: 0,
          hide_time_on_badge: false,
          label_ids: [],
          label_names: [],
          note: "",
        },
      }).map((item) => item.display_name),
    ).toEqual(["Morning Server", "Night Server"]);

    expect(
      getShiftEditorEligibleEmployees({
        employees: model.employees,
        locationId,
        jobId: jobs[1]!.id,
        model: { ...model, shifts: [busyShift] },
        value: {
          location_id: locationId,
          employee_id: null,
          job_id: jobs[1]!.id,
          shift_type_id: null,
          scheduled_date: "2026-08-17",
          start_time: "17:00",
          end_time: "20:00",
          unpaid_break_minutes: 0,
          hide_time_on_badge: false,
          label_ids: [],
          label_names: [],
          note: "",
        },
      }).map((item) => item.display_name),
    ).toEqual(["Morning Server", "Busy Server", "Night Server"]);
  });

  it("does not remove employees for editor-level time validation states", () => {
    expect(
      getShiftEditorEligibleEmployees({
        employees: model.employees,
        locationId,
        jobId: jobs[1]!.id,
        model: { ...model, shifts: [] },
        value: {
          location_id: locationId,
          employee_id: null,
          job_id: jobs[1]!.id,
          shift_type_id: null,
          scheduled_date: "2026-08-17",
          start_time: "09:00",
          end_time: "09:00",
          unpaid_break_minutes: 0,
          hide_time_on_badge: false,
          label_ids: [],
          label_names: [],
          note: "",
        },
      }).map((item) => item.display_name),
    ).toEqual(["Morning Server", "Busy Server", "Night Server"]);
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
