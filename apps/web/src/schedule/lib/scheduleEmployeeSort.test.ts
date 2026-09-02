import type { ScheduleEmployee, ScheduleReadModel } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  createSortedScheduleModel,
  groupScheduleEmployeesByJob,
  isExcludedEmployeeVisibleForWeek,
  primaryScheduleJobId,
  sortScheduleEmployees,
} from "./scheduleEmployeeSort";

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
    location_ids: ["44444444-4444-4444-8444-444444444444"],
    job_ids: [],
    shift_type_ids: [],
    is_excluded_from_schedule: false,
    primary_job_id: null,
    availability: null,
    ...overrides,
  };
}

describe("scheduleEmployeeSort", () => {
  it("sorts employees A-Z by display name, then id like the reference schedule", () => {
    const sorted = sortScheduleEmployees(
      [
        employee({
          id: "33333333-3333-4333-8333-333333333336",
          employee_code: "NF-003",
          display_name: "Zoe",
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          employee_code: "NF-001",
          display_name: "Ada",
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333333",
          employee_code: "NF-999",
          display_name: "Ada",
        }),
      ],
      jobs,
      "alphabetical",
    );

    expect(sorted.map((item) => item.employee_code)).toEqual([
      "NF-999",
      "NF-001",
      "NF-003",
    ]);
  });

  it("sorts by primary job rank and keeps A-Z order inside each job", () => {
    const sorted = sortScheduleEmployees(
      [
        employee({
          id: "33333333-3333-4333-8333-333333333334",
          display_name: "Aaron Server",
          primary_job_id: jobs[1]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          display_name: "Zoe Host",
          primary_job_id: jobs[0]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333336",
          display_name: "Alice Server",
          primary_job_id: jobs[1]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333337",
          display_name: "Morgan No Primary",
          primary_job_id: null,
        }),
      ],
      jobs,
      "byJob",
    );

    expect(sorted.map((item) => item.display_name)).toEqual([
      "Zoe Host",
      "Aaron Server",
      "Alice Server",
      "Morgan No Primary",
    ]);
  });

  it("uses the reference job order for by-job sorting instead of re-sorting jobs", () => {
    const referenceOrderedJobs: ScheduleReadModel["jobs"] = [
      { ...jobs[1]!, sort_order: 99 },
      { ...jobs[0]!, sort_order: 0 },
    ];
    const sorted = sortScheduleEmployees(
      [
        employee({
          id: "33333333-3333-4333-8333-333333333334",
          display_name: "Host Employee",
          primary_job_id: jobs[0]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          display_name: "Server Employee",
          primary_job_id: jobs[1]!.id,
        }),
      ],
      referenceOrderedJobs,
      "byJob",
    );

    expect(sorted.map((item) => item.display_name)).toEqual([
      "Server Employee",
      "Host Employee",
    ]);
    expect(
      groupScheduleEmployeesByJob(sorted, referenceOrderedJobs).map(
        (group) => group.job?.name ?? "No job/position",
      ),
    ).toEqual(["Server", "Host"]);
  });

  it("falls back to assigned job ids when a primary job is missing", () => {
    const sorted = sortScheduleEmployees(
      [
        employee({
          id: "33333333-3333-4333-8333-333333333334",
          display_name: "Aaron Server",
          job_ids: [jobs[1]!.id],
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          display_name: "Zoe Host",
          job_ids: [jobs[0]!.id],
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333336",
          display_name: "Alice Server",
          job_ids: [jobs[1]!.id],
        }),
      ],
      jobs,
      "byJob",
    );

    expect(sorted.map((item) => item.display_name)).toEqual([
      "Zoe Host",
      "Aaron Server",
      "Alice Server",
    ]);
  });

  it("creates the sorted schedule model used by the grid without mutating the source", () => {
    const source = {
      workspace_id: "66666666-6666-4666-8666-666666666666",
      week_start: "2026-08-17",
      week_start_day: "monday",
      locations: [],
      departments: [],
      jobs,
      shift_types: [],
      employees: [
        employee({
          id: "33333333-3333-4333-8333-333333333334",
          display_name: "Aaron Server",
          job_ids: [jobs[1]!.id],
          primary_job_id: jobs[1]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          display_name: "Zoe Host",
          job_ids: [jobs[0]!.id],
          primary_job_id: jobs[0]!.id,
        }),
      ],
      shifts: [],
      closures: [],
      important_dates: [],
      settings: { time_format: "12h" },
    } satisfies ScheduleReadModel;

    const sorted = createSortedScheduleModel(source, "byJob");

    expect(sorted.employees.map((item) => item.display_name)).toEqual([
      "Zoe Host",
      "Aaron Server",
    ]);
    expect(source.employees.map((item) => item.display_name)).toEqual([
      "Aaron Server",
      "Zoe Host",
    ]);
  });

  it("groups sorted rows by job and places no-job employees last", () => {
    const rows = sortScheduleEmployees(
      [
        employee({
          id: "33333333-3333-4333-8333-333333333334",
          display_name: "Aaron Server",
          primary_job_id: jobs[1]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          display_name: "Zoe Host",
          primary_job_id: jobs[0]!.id,
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333337",
          display_name: "Morgan No Primary",
        }),
      ],
      jobs,
      "byJob",
    );

    const groups = groupScheduleEmployeesByJob(rows, jobs);

    expect(groups.map((group) => group.job?.name ?? "No job/position")).toEqual([
      "Host",
      "Server",
      "No job/position",
    ]);
    expect(groups[0]?.employees.map((item) => item.display_name)).toEqual([
      "Zoe Host",
    ]);
  });

  it("groups employees by assigned job ids when a primary job is missing", () => {
    const rows = sortScheduleEmployees(
      [
        employee({
          id: "33333333-3333-4333-8333-333333333334",
          display_name: "Aaron Server",
          job_ids: [jobs[1]!.id],
        }),
        employee({
          id: "33333333-3333-4333-8333-333333333335",
          display_name: "Zoe Host",
          job_ids: [jobs[0]!.id],
        }),
      ],
      jobs,
      "byJob",
    );

    const groups = groupScheduleEmployeesByJob(rows, jobs);

    expect(groups.map((group) => group.job?.name ?? "No job/position")).toEqual([
      "Host",
      "Server",
    ]);
    expect(groups[0]?.employees.map((item) => item.display_name)).toEqual([
      "Zoe Host",
    ]);
    expect(groups[1]?.employees.map((item) => item.display_name)).toEqual([
      "Aaron Server",
    ]);
  });

  it("falls back to assigned jobs when the primary job is outside the schedule reference", () => {
    expect(
      primaryScheduleJobId(
        employee({
          primary_job_id: "99999999-9999-4999-8999-999999999999",
          job_ids: [jobs[1]!.id],
        }),
        jobs,
      ),
    ).toBe(jobs[1]!.id);
  });

  it("shows excluded employees only when they have a shift in the active week", () => {
    const excluded = employee({
      id: "33333333-3333-4333-8333-333333333338",
      is_excluded_from_schedule: true,
    });
    const addDays = (_date: string, offset: number) =>
      `2026-08-${String(17 + offset).padStart(2, "0")}`;

    expect(
      isExcludedEmployeeVisibleForWeek(
        excluded,
        [{ employee_id: excluded.id, scheduled_date: "2026-08-19" }],
        "2026-08-17",
        addDays,
      ),
    ).toBe(true);
    expect(
      isExcludedEmployeeVisibleForWeek(
        excluded,
        [{ employee_id: excluded.id, scheduled_date: "2026-08-30" }],
        "2026-08-17",
        addDays,
      ),
    ).toBe(false);
  });
});
