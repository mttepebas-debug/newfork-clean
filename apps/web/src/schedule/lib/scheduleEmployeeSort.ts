import { managementJobIds } from "@newfork/shared";
import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";

export type ScheduleEmployeeSortMode = "alphabetical" | "byJob";

type Jobs = ScheduleReadModel["jobs"];
type Departments = ScheduleReadModel["departments"];

export function sortScheduleEmployees(
  employees: readonly ScheduleEmployee[],
  jobs: Jobs,
  departments: Departments,
  mode: ScheduleEmployeeSortMode,
): ScheduleEmployee[] {
  const jobRank = new Map(jobs.map((job, index) => [job.id, index]));
  const rank = new Map(
    employees.map((employee) => {
      const jobId = primaryScheduleJobId(employee, jobs, departments);
      return [employee.id, jobId ? jobRank.get(jobId)! : Number.MAX_SAFE_INTEGER];
    }),
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
  const rankedJobs = [...jobs];
  const groups = new Map<string, ScheduleEmployee[]>();
  const unassignedJobEmployees: ScheduleEmployee[] = [];
  for (const employee of employees) {
    const primaryJobId = primaryScheduleJobId(employee, jobs, departments);
    if (!primaryJobId) {
      unassignedJobEmployees.push(employee);
      continue;
    }
    const bucket = groups.get(primaryJobId);
    if (bucket) bucket.push(employee);
    else groups.set(primaryJobId, [employee]);
  }
  const rankedGroups: {
    readonly job: Jobs[number] | null;
    readonly employees: ScheduleEmployee[];
  }[] = rankedJobs
    .map((job) => ({ job, employees: groups.get(job.id) ?? [] }))
    .filter((group) => group.employees.length > 0);
  if (unassignedJobEmployees.length) {
    rankedGroups.push({ job: null, employees: unassignedJobEmployees });
  }
  return rankedGroups;
}

/**
 * The primary job somebody was given, which is always outside Management: a
 * Management job is primary by its department and the database never stores
 * it as primary (BL-218). Null when none was named or it is archived.
 */
export function nonManagementPrimaryJobId(
  employee: ScheduleEmployee,
  jobs: Jobs,
): string | null {
  const primary = employee.primary_job_id;
  return primary && jobs.some((job) => job.id === primary) ? primary : null;
}

/**
 * The job a person's row sits under in Job/Position and a new shift starts
 * with: their primary job outside Management; failing that the first
 * Management job they work, then the first job they work, in the Schedule's
 * job order. The separate Management group and the second row are BL-218 .6.
 */
export function primaryScheduleJobId(
  employee: ScheduleEmployee,
  jobs: Jobs,
  departments: Departments,
): string | null {
  const primary = nonManagementPrimaryJobId(employee, jobs);
  if (primary) return primary;
  const management = managementJobIds(departments, jobs);
  const held = jobs.filter((job) => employee.job_ids.includes(job.id));
  return (held.find((job) => management.has(job.id)) ?? held[0])?.id ?? null;
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
