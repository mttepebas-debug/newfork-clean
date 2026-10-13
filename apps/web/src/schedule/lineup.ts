import type { ScheduleReadModel } from "@newfork/shared/schedule";

// Lineup (Mert 2026-10-13, read-only first stage): the day's live Schedule,
// shown per location and shift type, then by department and job. It reads the
// same published week the Schedule reads; nothing here decides who works.

type Closure = ScheduleReadModel["closures"][number];

export interface LineupRow {
  readonly shiftId: string;
  readonly employeeId: string;
  readonly name: string;
  readonly jobName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly crossesMidnight: boolean;
  readonly labels: readonly string[];
}

export interface LineupJob {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly rows: readonly LineupRow[];
}

export interface LineupDepartment {
  readonly id: string | null;
  readonly name: string;
  readonly jobs: readonly LineupJob[];
}

export interface LineupShift {
  /** The shift type's id, or "none" for shifts that have no shift type. */
  readonly key: string;
  readonly name: string;
  readonly color: string | null;
  readonly departments: readonly LineupDepartment[];
  readonly count: number;
}

export interface LineupLocation {
  readonly id: string;
  readonly name: string;
  /** A published closed day: the location has no lineup. */
  readonly closed: Closure | null;
  /** Published short hours that day. */
  readonly shortHours: Closure | null;
  readonly shifts: readonly LineupShift[];
}

export interface LineupFilters {
  readonly locationId?: string | null;
  readonly shiftTypeId?: string | null;
}

const NO_SHIFT_TYPE = "none";
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en-US", { sensitivity: "base" });

/** Postgres-style HH:MM compares as text; an empty time sorts last. */
function startKey(time: string): string {
  return time || "99:99";
}

export function lineupDay(
  model: ScheduleReadModel,
  date: string,
  filters: LineupFilters = {},
): LineupLocation[] {
  const employees = new Map(model.employees.map((employee) => [employee.id, employee]));
  const jobs = new Map(
    [...model.referenced_jobs.map((job) => ({ ...job, color: null as string | null, department_id: null as string | null })),
      ...model.jobs].map((job) => [job.id, job]),
  );
  const departments = new Map(model.departments.map((department) => [department.id, department]));
  const shiftTypes = new Map(
    [...model.referenced_shift_types.map((type) => ({ ...type, color: null as string | null, sort_order: Number.MAX_SAFE_INTEGER })),
      ...model.shift_types].map((type) => [type.id, type]),
  );

  const locations = [...model.locations]
    .filter((location) => !filters.locationId || location.id === filters.locationId)
    .sort((a, b) => a.sort_order - b.sort_order || byName(a, b));

  const dayShifts = model.shifts.filter(
    (shift) => shift.scheduled_date === date && shift.employee_id !== null,
  );

  return locations.map((location) => {
    const closures = model.closures.filter(
      (closure) =>
        closure.location_id === location.id &&
        closure.closed_date === date &&
        (closure.status ?? "published") === "published",
    );
    const closed = closures.find((closure) => closure.kind === "closed") ?? null;
    const shortHours = closures.find((closure) => closure.kind === "short") ?? null;

    const here = dayShifts.filter((shift) => shift.location_id === location.id);
    const keys = new Set<string>();
    // Every active shift type gets a place, scheduled or not (Mert 2026-10-13:
    // an empty shift stays as a short "No one is scheduled" card).
    for (const type of model.shift_types) keys.add(type.id);
    for (const shift of here) keys.add(shift.shift_type_id ?? NO_SHIFT_TYPE);

    const shifts = [...keys]
      .filter((key) => !filters.shiftTypeId || key === filters.shiftTypeId)
      .filter((key) => key !== NO_SHIFT_TYPE || here.some((shift) => !shift.shift_type_id))
      .map((key) => {
        const type = key === NO_SHIFT_TYPE ? null : shiftTypes.get(key) ?? null;
        const ofType = here.filter((shift) => (shift.shift_type_id ?? NO_SHIFT_TYPE) === key);
        const byDepartment = new Map<string | null, Map<string, LineupRow[]>>();
        for (const shift of ofType) {
          const job = jobs.get(shift.job_id);
          const departmentId = job?.department_id ?? null;
          const department = byDepartment.get(departmentId) ?? new Map<string, LineupRow[]>();
          byDepartment.set(departmentId, department);
          const rows = department.get(shift.job_id) ?? [];
          department.set(shift.job_id, rows);
          rows.push({
            shiftId: shift.id,
            employeeId: shift.employee_id!,
            name: employees.get(shift.employee_id!)?.display_name ?? "Team member",
            jobName: job?.name ?? "Job",
            startTime: shift.start_time,
            endTime: shift.end_time,
            crossesMidnight: shift.crosses_midnight,
            labels: shift.label_names ?? [],
          });
        }
        const departmentList: LineupDepartment[] = [...byDepartment.entries()]
          .map(([id, jobRows]) => ({
            id,
            name: id ? departments.get(id)?.name ?? "Department" : "Other",
            jobs: [...jobRows.entries()]
              .map(([jobId, rows]) => ({
                id: jobId,
                name: jobs.get(jobId)?.name ?? "Job",
                color: jobs.get(jobId)?.color ?? null,
                rows: [...rows].sort(
                  (a, b) => startKey(a.startTime).localeCompare(startKey(b.startTime)) || byName({ name: a.name }, { name: b.name }),
                ),
              }))
              .sort(byName),
          }))
          // Departments by name, shifts without one last (catalog order, BL-475).
          .sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || byName(a, b));
        return {
          key,
          name: type?.name ?? "No shift type",
          color: type?.color ?? null,
          departments: departmentList,
          count: ofType.length,
          order: type?.sort_order ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.order - b.order || byName(a, b))
      .map(({ order: _order, ...shift }) => shift);

    return { id: location.id, name: location.name, closed, shortHours, shifts };
  });
}

/** The seven days of the week that holds `weekStart`. */
export function lineupWeek(weekStart: string): string[] {
  const start = new Date(`${weekStart}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  });
}
