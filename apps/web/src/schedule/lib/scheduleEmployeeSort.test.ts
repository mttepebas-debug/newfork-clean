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
    system_key: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Server",
    color: "#10b981",
    sort_order: 1,
    department_id: null,
    system_key: null,
  },
];
const departments: ScheduleReadModel["departments"] = [];

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
      departments,
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
      departments,
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
      departments,
      "byJob",
    );

    expect(sorted.map((item) => item.display_name)).toEqual([
      "Server Employee",
      "Host Employee",
    ]);
    expect(
      groupScheduleEmployeesByJob(sorted, referenceOrderedJobs, departments).map(
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
      departments,
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
      referenced_jobs: [],
      referenced_shift_types: [],
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
      departments,
      "byJob",
    );

    const groups = groupScheduleEmployeesByJob(rows, jobs, departments);

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
      departments,
      "byJob",
    );

    const groups = groupScheduleEmployeesByJob(rows, jobs, departments);

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

// EMP-001 C (item 13, K5): Management's job groups sit at the bottom of
// Job/Position, under "Unassigned job". A Management job can be somebody's
// primary; only the Owner job never is, so an owner with no other primary
// sits under Owner. Everybody has one row.
describe("Management's groups and the owner's row in Job/Position (EMP-001 C)", () => {
  const management = "d0000000-0000-4000-8000-000000000001";
  const kitchen = "d0000000-0000-4000-8000-000000000002";
  const c2Departments: ScheduleReadModel["departments"] = [
    { id: management, name: "Leadership", color: "#3C7A68", sort_order: 0, system_key: "management" },
    { id: kitchen, name: "Kitchen", color: "#3C7A68", sort_order: 1, system_key: null },
  ];
  // Management's jobs come first in the Schedule's own job order here, so only
  // the rule can put them last.
  const owner = { id: "0f000000-0000-4000-8000-000000000001", name: "Owner", color: "#4478A8", sort_order: 0, department_id: management, system_key: "owner" as const };
  const manager = { id: "0f000000-0000-4000-8000-000000000002", name: "Manager", color: "#4478A8", sort_order: 1, department_id: management, system_key: null };
  const cook = { id: "ff000000-0000-4000-8000-00000000000c", name: "Cook", color: "#D39A36", sort_order: 2, department_id: kitchen, system_key: null };
  const c2Jobs: ScheduleReadModel["jobs"] = [owner, manager, cook];

  const person = (n: number, display_name: string, job_ids: string[], primary_job_id: string | null) =>
    employee({ id: `e0000000-0000-4000-8000-00000000000${n}`, display_name, job_ids, primary_job_id });
  const cookOnly = person(1, "Cem Cook", [cook.id], cook.id);
  const managerPrimary = person(2, "Mia Manager", [manager.id, cook.id], manager.id);
  const ownerOnly = person(3, "Olcay Owner", [owner.id], null);
  const ownerWhoCooks = person(4, "Olcay Owner", [owner.id, cook.id], cook.id);
  const noJob = person(5, "Nia None", [], null);
  const remoteNoPrimary = person(6, "Rana Remote", [manager.id, cook.id], null);

  const groupsOf = (rows: readonly ScheduleEmployee[]) =>
    groupScheduleEmployeesByJob(sortScheduleEmployees(rows, c2Jobs, c2Departments, "byJob"), c2Jobs, c2Departments).map(
      (group) => [group.job?.name ?? "Unassigned job", group.employees.map((row) => row.display_name)],
    );

  it("takes the stored primary, a Management job too; then the Owner job; then the first job held", () => {
    expect(primaryScheduleJobId(managerPrimary, c2Jobs)).toBe(manager.id);
    expect(primaryScheduleJobId(ownerOnly, c2Jobs)).toBe(owner.id);
    expect(primaryScheduleJobId(ownerWhoCooks, c2Jobs)).toBe(cook.id);
    expect(primaryScheduleJobId(remoteNoPrimary, c2Jobs)).toBe(manager.id);
    expect(primaryScheduleJobId(noJob, c2Jobs)).toBeNull();
  });

  it("files an owner who holds only the Owner job under Owner, at the bottom", () => {
    expect(groupsOf([ownerOnly, cookOnly])).toEqual([
      ["Cook", ["Cem Cook"]],
      ["Owner", ["Olcay Owner"]],
    ]);
  });

  it("files an owner whose primary is Cook under Cook, and nowhere else", () => {
    expect(groupsOf([ownerWhoCooks, cookOnly])).toEqual([["Cook", ["Cem Cook", "Olcay Owner"]]]);
  });

  it("lists the other job groups, then Unassigned job, then Management's; nobody is in two", () => {
    const everybody = [managerPrimary, noJob, ownerOnly, cookOnly, remoteNoPrimary];
    expect(groupsOf(everybody)).toEqual([
      ["Cook", ["Cem Cook"]],
      ["Unassigned job", ["Nia None"]],
      ["Owner", ["Olcay Owner"]],
      ["Manager", ["Mia Manager", "Rana Remote"]],
    ]);
    // The flat Job/Position order is the same walk.
    expect(sortScheduleEmployees(everybody, c2Jobs, c2Departments, "byJob").map((row) => row.display_name)).toEqual([
      "Cem Cook",
      "Nia None",
      "Olcay Owner",
      "Mia Manager",
      "Rana Remote",
    ]);
  });
});
