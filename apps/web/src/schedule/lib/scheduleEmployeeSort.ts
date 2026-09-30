import { managementJobIds } from "@newfork/shared";
import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";

export type ScheduleEmployeeSortMode = "alphabetical" | "byJob";

type Jobs = ScheduleReadModel["jobs"];
type Departments = ScheduleReadModel["departments"];

/**
 * The groups of Job/Position from top to bottom: every job outside
 * Management in the Schedule's job order, then "Unassigned job" (null), then
 * Management's jobs (EMP-001 item 13).
 */
function jobPositionOrder(jobs: Jobs, departments: Departments): (Jobs[number] | null)[] {
  const management = managementJobIds(departments, jobs);
  return [
    ...jobs.filter((job) => !management.has(job.id)),
    null,
    ...jobs.filter((job) => management.has(job.id)),
  ];
}

export function sortScheduleEmployees(
  employees: readonly ScheduleEmployee[],
  jobs: Jobs,
  departments: Departments,
  mode: ScheduleEmployeeSortMode,
): ScheduleEmployee[] {
  const jobRank = new Map(
    jobPositionOrder(jobs, departments).map((job, index) => [job?.id ?? null, index]),
  );
  const rank = new Map(
    employees.map((employee) => [
      employee.id,
      jobRank.get(primaryScheduleJobId(employee, jobs))!,
    ]),
  );
  const employeeName = (employee: ScheduleEmployee) =>
    employee.display_name.trim().toLocaleLowerCase();
  return [...employees].sort((a, b) => {
    if (mode === "byJob") {
      const aJobRank = rank.get(a.id)!;
      const bJobRank = rank.get(b.id)!;
      if (aJobRank !== bJobRank) return aJobRank - bJobRank;
    }
    return (
      employeeName(a).localeCompare(employeeName(b)) || a.id.localeCompare(b.id)
    );
  });
}

export function createSortedScheduleModel(
  model: ScheduleReadModel,
  mode: ScheduleEmployeeSortMode,
): ScheduleReadModel {
  return {
    ...model,
    employees: sortScheduleEmployees(model.employees, model.jobs, model.departments, mode),
  };
}

export function groupScheduleEmployeesByJob(
  employees: readonly ScheduleEmployee[],
  jobs: Jobs,
  departments: Departments,
): {
  readonly job: Jobs[number] | null;
  readonly employees: readonly ScheduleEmployee[];
}[] {
  // One row each (K5): a person sits under the one job primaryScheduleJobId gives.
  const groups = new Map<string | null, ScheduleEmployee[]>();
  for (const employee of employees) {
    const jobId = primaryScheduleJobId(employee, jobs);
    const bucket = groups.get(jobId);
    if (bucket) bucket.push(employee);
    else groups.set(jobId, [employee]);
  }
  return jobPositionOrder(jobs, departments)
    .map((job) => ({ job, employees: groups.get(job?.id ?? null) ?? [] }))
    .filter((group) => group.employees.length > 0);
}

/**
 * The job a person's row sits under in Job/Position and a new shift starts
 * with, in the order the Employees list names a job: the primary job they
 * were given (any job, a Management one too); failing that the Owner job, for
 * the owner it is never marked primary on (EMP-001 S2, K5); then the first
 * job they hold, in the Schedule's job order. Null when they hold none here.
 */
export function primaryScheduleJobId(
  employee: ScheduleEmployee,
  jobs: Jobs,
): string | null {
  const primary = employee.primary_job_id;
  if (primary && jobs.some((job) => job.id === primary)) return primary;
  const held = jobs.filter((job) => employee.job_ids.includes(job.id));
  return (held.find((job) => job.system_key === "owner") ?? held[0])?.id ?? null;
}

export function isExcludedEmployeeVisibleForWeek(
  employee: Pick<ScheduleEmployee, "id" | "is_excluded_from_schedule">,
  shifts: readonly Pick<ScheduleShift, "employee_id" | "scheduled_date">[],
  weekStart: string,
  addDays: (date: string, offset: number) => string,
): boolean {
  if (!employee.is_excluded_from_schedule) return true;
  const weekDates = new Set(
    Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
  );
  return shifts.some(
    (shift) =>
      shift.employee_id === employee.id && weekDates.has(shift.scheduled_date),
  );
}
