import type { LineupDay, LineupDayLineup, LineupTarget } from "@newfork/shared";
import type { ScheduleReadModel } from "@newfork/shared/schedule";

// Lineup (Mert 2026-10-13): the day's lineups, per location and shift type, then by department and job.
// The rows and the publish state come from the lineup day read (LINEUP-PUBLISH-WEB: the live Schedule with
// what the lineup changed, the one source employees see too); the Schedule read only gives the catalog
// around it (every shift type gets a place, the week, the time format). Nothing here decides who works.

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

/** Where a lineup stands for its staff (LINEUP-PUBLISH). */
export interface LineupPublish {
  /** The lineup a command names. */
  readonly target: LineupTarget;
  readonly status: LineupDayLineup["status"];
  /** Employees see it now. */
  readonly published: boolean;
  readonly sharedAt: string | null;
  readonly sharedByName: string | null;
  readonly askAck: boolean;
  /** Acknowledged of the version staff see, and how many on it have the app ("Read 7/11"). */
  readonly acknowledged: number;
  readonly withApp: number;
  readonly notes: LineupDayLineup["notes"];
}

export interface LineupShift {
  /** The shift type's id, or "none" for shifts that have no shift type. */
  readonly key: string;
  readonly name: string;
  readonly color: string | null;
  readonly departments: readonly LineupDepartment[];
  readonly count: number;
  readonly publish: LineupPublish;
}

export interface LineupClosure {
  readonly title: string;
  readonly opens?: string | null;
  readonly closes?: string | null;
}

export interface LineupLocation {
  readonly id: string;
  readonly name: string;
  /** A published closed day: the location has no lineup. */
  readonly closed: LineupClosure | null;
  /** Published short hours that day. */
  readonly shortHours: LineupClosure | null;
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

const published = <T extends { readonly status: string | null }>(closure: T | null): T | null =>
  closure && (closure.status ?? "published") === "published" ? closure : null;

function emptyLineup(typeId: string | null): LineupDayLineup {
  return {
    id: null, shift_type_id: typeId, shift_type_name: null, color: null, status: "draft", version: null,
    shared_at: null, ask_ack: null, acknowledged: null, revision: null, published: false, version_id: null,
    shared_by: null, shared_by_name: null, people: 0, with_app: 0,
    notes: { specials: "", n86: "", shift_notes: "" }, rows: [],
  };
}

/**
 * The day's lineups as the page shows them: the day read's rows grouped by department and job, every active
 * shift type of the catalog in its place (Mert 2026-10-13: an empty shift stays as a short card), filtered.
 */
export function lineupDay(
  read: LineupDay,
  catalog: Pick<ScheduleReadModel, "shift_types"> | null,
  filters: LineupFilters = {},
): LineupLocation[] {
  const types = catalog?.shift_types ?? [];
  const order = new Map(types.map((type) => [type.id, type.sort_order]));
  return read.locations
    .filter((location) => !filters.locationId || location.id === filters.locationId)
    .map((location) => {
      const closed = published(location.closed);
      const byType = new Map(location.lineups.map((lineup) => [lineup.shift_type_id ?? NO_SHIFT_TYPE, lineup]));
      if (!closed) for (const type of types) if (!byType.has(type.id)) byType.set(type.id, emptyLineup(type.id));
      const shifts = closed ? [] : [...byType.entries()]
        .filter(([key]) => !filters.shiftTypeId || key === filters.shiftTypeId)
        .map(([key, lineup]) => {
          const type = types.find((item) => item.id === key);
          const rows = lineup.rows.filter((row) => row.employee_id !== null);
          const byDepartment = new Map<string | null, { name: string; jobs: Map<string, { name: string; color: string | null; rows: LineupRow[] }> }>();
          for (const row of rows) {
            const department = byDepartment.get(row.department_id) ??
              { name: row.department_id ? row.department_name ?? "Department" : "Other", jobs: new Map() };
            byDepartment.set(row.department_id, department);
            const jobKey = row.job_id ?? "none";
            const job = department.jobs.get(jobKey) ?? { name: row.job_name ?? "Job", color: row.job_color, rows: [] };
            department.jobs.set(jobKey, job);
            job.rows.push({
              shiftId: row.shift_id ?? row.id ?? `${row.employee_id}-${row.start_time}`,
              employeeId: row.employee_id!,
              name: row.name ?? "Team member",
              jobName: row.job_name ?? "Job",
              startTime: row.start_time,
              endTime: row.end_time,
              crossesMidnight: row.crosses_midnight,
              labels: row.label_names ?? [],
            });
          }
          const departments: LineupDepartment[] = [...byDepartment.entries()]
            .map(([id, department]) => ({
              id,
              name: department.name,
              jobs: [...department.jobs.entries()]
                .map(([jobId, job]) => ({
                  id: jobId,
                  name: job.name,
                  color: job.color,
                  rows: [...job.rows].sort(
                    (a, b) => startKey(a.startTime).localeCompare(startKey(b.startTime)) || byName(a, b),
                  ),
                }))
                .sort(byName),
            }))
            // Departments by name, shifts without one last (catalog order, BL-475).
            .sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || byName(a, b));
          return {
            key,
            name: lineup.shift_type_name ?? type?.name ?? "No shift type",
            color: lineup.color ?? type?.color ?? null,
            departments,
            count: rows.length,
            order: key === NO_SHIFT_TYPE ? Number.MAX_SAFE_INTEGER : order.get(key) ?? Number.MAX_SAFE_INTEGER - 1,
            publish: {
              target: { location_id: location.id, service_date: read.date, shift_type_id: lineup.shift_type_id },
              status: lineup.status,
              published: lineup.published,
              sharedAt: lineup.shared_at,
              sharedByName: lineup.shared_by_name,
              askAck: lineup.ask_ack ?? false,
              acknowledged: lineup.acknowledged ?? 0,
              withApp: lineup.with_app,
              notes: lineup.notes,
            },
          };
        })
        .sort((a, b) => a.order - b.order || byName(a, b))
        .map(({ order: _order, ...shift }) => shift);
      return {
        id: location.id,
        name: location.name,
        closed,
        shortHours: published(location.short_hours),
        shifts,
      };
    });
}

/** A lineup the manager can publish now: people on it, not published, the day not over. */
export function canPublish(shift: LineupShift): boolean {
  return shift.count > 0 && !shift.publish.published && shift.publish.status !== "past";
}

/** Lineups waiting to be published: the Publish button's badge. */
export function unpublishedCount(locations: readonly LineupLocation[]): number {
  return locations.reduce((sum, location) => sum + location.shifts.filter(canPublish).length, 0);
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

function minutes(time: string): number {
  const [hours = "0", mins = "0"] = time.split(":");
  return Number(hours) * 60 + Number(mins);
}

function shiftRows(shift: LineupShift): LineupRow[] {
  return shift.departments.flatMap((department) => department.jobs.flatMap((job) => job.rows));
}

/** Minutes after the day's midnight the row ends; past midnight runs over 24 h. */
function endsAt(row: LineupRow): number {
  return minutes(row.endTime) + (row.crossesMidnight ? 24 * 60 : 0);
}

/** When the shift's first person comes in and its last one leaves. */
export function lineupShiftSpan(shift: LineupShift): { firstIn: string; lastOut: string } | null {
  const rows = shiftRows(shift);
  if (!rows.length) return null;
  const first = rows.reduce((a, b) => (minutes(b.startTime) < minutes(a.startTime) ? b : a));
  const last = rows.reduce((a, b) => (endsAt(b) > endsAt(a) ? b : a));
  return { firstIn: first.startTime, lastOut: last.endTime };
}

/**
 * The shift a phone opens on (Mert 2026-10-14: one shift at a time, under
 * tabs): the chosen one; today, the first one still on the floor at `now`
 * (HH:MM), else the last one with people; another day, the first one with
 * people; else the first.
 */
export function phoneLineupShift(
  shifts: readonly LineupShift[],
  chosen: string,
  now: string | null,
): LineupShift | null {
  const picked = shifts.find((shift) => shift.key === chosen);
  if (picked) return picked;
  const staffed = shifts.filter((shift) => shift.count > 0);
  if (now !== null) {
    const at = minutes(now);
    const onFloor = staffed.find((shift) => shiftRows(shift).some((row) => endsAt(row) > at));
    if (onFloor) return onFloor;
    if (staffed.length) return staffed[staffed.length - 1]!;
  }
  return staffed[0] ?? shifts[0] ?? null;
}
