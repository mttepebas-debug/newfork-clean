import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";

export type ScheduleEmployeeSortMode = "alphabetical" | "byJob";

export function sortScheduleEmployees(
  employees: readonly ScheduleEmployee[],
  jobs: ScheduleReadModel["jobs"],
  mode: ScheduleEmployeeSortMode,
): ScheduleEmployee[] {
  const jobRank = buildScheduleJobRank(jobs);
  const employeeName = (employee: ScheduleEmployee) =>
    employee.display_name.trim().toLocaleLowerCase();
  return [...employees].sort((a, b) => {
    if (mode === "byJob") {
      const aJobRank = primaryScheduleJobRank(a, jobRank);
      const bJobRank = primaryScheduleJobRank(b, jobRank);
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
    employees: sortScheduleEmployees(model.employees, model.jobs, mode),
  };
}

export function groupScheduleEmployeesByJob(
  employees: readonly ScheduleEmployee[],
  jobs: ScheduleReadModel["jobs"],
): {
  readonly job: ScheduleReadModel["jobs"][number] | null;
  readonly employees: readonly ScheduleEmployee[];
}[] {
  const rankedJobs = [...jobs];
  const groups = new Map<string, ScheduleEmployee[]>();
  const unassignedJobEmployees: ScheduleEmployee[] = [];
  for (const employee of employees) {
    const primaryJobId = primaryScheduleJobId(employee, jobs);
    if (!primaryJobId) {
      unassignedJobEmployees.push(employee);
      continue;
    }
    const bucket = groups.get(primaryJobId);
    if (bucket) bucket.push(employee);
    else groups.set(primaryJobId, [employee]);
  }
  const rankedGroups: {
    readonly job: ScheduleReadModel["jobs"][number] | null;
    readonly employees: ScheduleEmployee[];
  }[] = rankedJobs
    .map((job) => ({ job, employees: groups.get(job.id) ?? [] }))
    .filter((group) => group.employees.length > 0);
  if (unassignedJobEmployees.length) {
    rankedGroups.push({ job: null, employees: unassignedJobEmployees });
  }
  return rankedGroups;
}

export function primaryScheduleJobId(
  employee: ScheduleEmployee,
  jobs: ScheduleReadModel["jobs"],
): string | null {
  const validJobIds = new Set(jobs.map((job) => job.id));
  if (employee.primary_job_id && validJobIds.has(employee.primary_job_id)) {
    return employee.primary_job_id;
  }
  for (const job of jobs) {
    if (employee.job_ids.includes(job.id)) return job.id;
  }
  return null;
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

function buildScheduleJobRank(jobs: ScheduleReadModel["jobs"]): Map<string, number> {
  return new Map(
    jobs.map((job, index) => [job.id, index]),
  );
}

function primaryScheduleJobRank(
  employee: ScheduleEmployee,
  jobRank: ReadonlyMap<string, number>,
): number {
  if (employee.primary_job_id && jobRank.has(employee.primary_job_id)) {
    return jobRank.get(employee.primary_job_id)!;
  }
  for (const jobId of employee.job_ids) {
    const rank = jobRank.get(jobId);
    if (rank !== undefined) return rank;
  }
  return Number.MAX_SAFE_INTEGER;
}
