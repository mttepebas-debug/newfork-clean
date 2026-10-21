// What the grid shows, from the week, the address and the edit (BEHAVIOR §1.4,
// §2, §9). Pure functions: each direction draws the same rows and columns.
import type { Employee, Job, Shift, ShiftType, Week } from "./model";
import { addDays, minutesOf, shiftMinutes, weekDates } from "./model";
import type { UrlState } from "./url";

export type SortMode = "az" | "job";

export type DisplaySettings = {
  sort: SortMode;
  showType: boolean;
  showLabels: boolean;
  showClock: boolean;
  totals: boolean;
  separators: boolean;
};

export const defaultDisplay: DisplaySettings = {
  sort: "az",
  showType: true,
  showLabels: true,
  showClock: true,
  totals: false,
  separators: false,
};

export type Column = {
  key: string;
  date: string;
  /** The location(s) a cell in this column belongs to. */
  locationIds: string[];
  groupId: string;
  dayIndex: number;
};

export type ColumnGroup = {
  id: string;
  name: string;
  locationIds: string[];
  columns: Column[];
};

export type Row =
  | { kind: "open"; key: "open" }
  | { kind: "group"; key: string; jobId: string | null; label: string }
  | { kind: "person"; key: string; employee: Employee };

export type SearchMark = "match" | "dim" | null;

export type CellCard = {
  shift: Shift;
  ghost: false;
  mark: SearchMark;
};

export type GhostCard = {
  ghost: true;
  id: string;
  locationName: string;
  start: string | null;
  end: string | null;
  title: string;
};

export type GridModel = {
  dates: string[];
  groups: ColumnGroup[];
  columns: Column[];
  rows: Row[];
  /** Shifts that pass the filters and search, by employee (or "open") and column key. */
  cells: Map<string, (CellCard | GhostCard)[]>;
  visibleEditable: Shift[];
  totals: { byEmployee: Map<string, number>; byDate: Map<string, number>; week: number } | null;
  noLocations: boolean;
  searchEmpty: { term: string; outside: boolean } | null;
};

export const cellKey = (rowKey: string, columnKey: string) => `${rowKey}|${columnKey}`;

export function jobOf(week: Week, id: string | null): Job | undefined {
  return id ? week.jobs.find((j) => j.id === id) : undefined;
}
export function typeOf(week: Week, id: string | null): ShiftType | undefined {
  return id ? week.shiftTypes.find((t) => t.id === id) : undefined;
}

/** "Type-Job", or the job alone (rule 32). */
export function shiftTitle(week: Week, shift: Shift, showType: boolean): string {
  const job = jobOf(week, shift.jobId)?.name ?? "Job";
  const type = typeOf(week, shift.shiftTypeId)?.name;
  return showType && type ? `${type}-${job}` : job;
}

/** Primary job, else the Owner job, else the first job held (rule 17). */
export function scheduleJobOf(week: Week, employee: Employee): string | null {
  if (employee.primaryJobId && employee.jobIds.includes(employee.primaryJobId)) return employee.primaryJobId;
  const owner = employee.jobIds.find((id) => jobOf(week, id)?.owner);
  return owner ?? employee.jobIds[0] ?? null;
}

export function shiftsForGrid(week: Week, editShifts: Shift[] | null): Shift[] {
  return editShifts ?? week.shifts;
}

function shiftPassesFilters(shift: Shift, url: UrlState): boolean {
  if (url.locations.length && !url.locations.includes(shift.locationId)) return false;
  if (url.jobs.length && !url.jobs.includes(shift.jobId)) return false;
  if (url.shiftTypes.length && (!shift.shiftTypeId || !url.shiftTypes.includes(shift.shiftTypeId))) return false;
  if (url.employees.length && (!shift.employeeId || !url.employees.includes(shift.employeeId))) return false;
  return true;
}

function employeePassesFilters(employee: Employee, url: UrlState): boolean {
  if (url.employees.length && !url.employees.includes(employee.id)) return false;
  if (url.locations.length && !employee.locationIds.some((id) => url.locations.includes(id))) return false;
  if (url.jobs.length && !employee.jobIds.some((id) => url.jobs.includes(id))) return false;
  if (url.shiftTypes.length && employee.shiftTypeIds.length && !employee.shiftTypeIds.some((id) => url.shiftTypes.includes(id))) {
    return false;
  }
  return true;
}

export function sortTimeOf(week: Week, shift: Shift): number {
  const own = minutesOf(shift.start);
  if (own !== null && !shift.hideTime) return own;
  return minutesOf(typeOf(week, shift.shiftTypeId)?.start ?? null) ?? own ?? 0;
}

export function buildGrid(args: {
  week: Week;
  url: UrlState;
  selectedDate: string;
  shifts: Shift[];
  editing: boolean;
  display: DisplaySettings;
  /** People who cannot take the dragged shift fold away (rule 95). */
  folded?: Set<string>;
}): GridModel {
  const { week, url, selectedDate, shifts, editing, display } = args;
  const dates = url.view === "day" ? [selectedDate] : weekDates(week.weekStart);
  const shownLocations = week.locations.filter((l) => !url.locations.length || url.locations.includes(l.id));

  const groups: ColumnGroup[] =
    url.layout === "unified"
      ? shownLocations.length
        ? [{ id: "unified", name: shownLocations.map((l) => l.name).join(" + "), locationIds: shownLocations.map((l) => l.id), columns: [] }]
        : []
      : shownLocations.map((l) => ({ id: l.id, name: l.name, locationIds: [l.id], columns: [] }));
  for (const group of groups) {
    group.columns = dates.map((date, dayIndex) => ({
      key: `${group.id}:${date}`,
      date,
      locationIds: group.locationIds,
      groupId: group.id,
      dayIndex,
    }));
  }
  const columns = groups.flatMap((g) => g.columns);
  const dateSet = new Set(dates);

  // Filters, then search (rule 123, 126).
  const filtered = shifts.filter((s) => dateSet.has(s.date) && shiftPassesFilters(s, url));
  const term = url.q.trim().toLowerCase();
  const shiftMatches = (s: Shift) => {
    const job = jobOf(week, s.jobId)?.name.toLowerCase() ?? "";
    const type = typeOf(week, s.shiftTypeId)?.name.toLowerCase() ?? "";
    return job.includes(term) || type.includes(term);
  };

  let people = week.employees.filter((e) => employeePassesFilters(e, url));
  people = people.filter((e) => !e.excluded || filtered.some((s) => s.employeeId === e.id));
  const peopleShifts = new Map<string, Shift[]>();
  for (const s of filtered) {
    if (!s.employeeId) continue;
    peopleShifts.set(s.employeeId, [...(peopleShifts.get(s.employeeId) ?? []), s]);
  }

  let searchEmpty: GridModel["searchEmpty"] = null;
  const nameMatch = (e: Employee) => e.name.toLowerCase().includes(term);
  if (term) {
    const before = people;
    people = people.filter((e) => nameMatch(e) || (peopleShifts.get(e.id) ?? []).some(shiftMatches));
    if (!people.length && before.length >= 0) {
      const outside = week.employees.some((e) => nameMatch(e)) ||
        shifts.some((s) => dateSet.has(s.date) && shiftMatches(s));
      searchEmpty = { term: url.q.trim(), outside };
    }
  }
  if (url.hideUnscheduled) people = people.filter((e) => (peopleShifts.get(e.id) ?? []).some((s) => !s.removed));
  if (args.folded?.size) people = people.filter((e) => !args.folded!.has(e.id));

  // Rows (rule 15-17).
  const rows: Row[] = [];
  if (editing) rows.push({ kind: "open", key: "open" });
  const byName = (a: Employee, b: Employee) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (display.sort === "job") {
    const groupsByJob = new Map<string | null, Employee[]>();
    for (const e of people) {
      const job = scheduleJobOf(week, e);
      groupsByJob.set(job, [...(groupsByJob.get(job) ?? []), e]);
    }
    const order = [...groupsByJob.keys()].sort((a, b) => {
      const rank = (id: string | null) => (id === null ? 1 : jobOf(week, id)?.management ? 2 : 0);
      return rank(a) - rank(b) || (jobOf(week, a)?.name ?? "").localeCompare(jobOf(week, b)?.name ?? "");
    });
    for (const jobId of order) {
      if (url.jobs.length && jobId && !url.jobs.includes(jobId)) continue;
      const members = (groupsByJob.get(jobId) ?? []).sort(byName);
      if (!members.length) continue;
      if (display.separators) {
        rows.push({ kind: "group", key: `group:${jobId ?? "none"}`, jobId, label: jobOf(week, jobId)?.name ?? "Unassigned job" });
      }
      for (const e of members) rows.push({ kind: "person", key: e.id, employee: e });
    }
  } else {
    for (const e of [...people].sort(byName)) rows.push({ kind: "person", key: e.id, employee: e });
  }

  // Cells (rule 25, 26).
  const cells = new Map<string, (CellCard | GhostCard)[]>();
  const visibleEditable: Shift[] = [];
  const shownPeople = new Set(people.map((e) => e.id));
  for (const s of filtered) {
    if (s.employeeId && !shownPeople.has(s.employeeId)) continue;
    if (!s.employeeId && !editing) continue;
    if (!s.employeeId && term && !shiftMatches(s)) continue;
    const column = columns.find((c) => c.date === s.date && c.locationIds.includes(s.locationId));
    if (!column) continue;
    const mark: SearchMark = !term
      ? null
      : (s.employeeId && nameMatch(week.employees.find((e) => e.id === s.employeeId)!)) || shiftMatches(s)
        ? "match"
        : "dim";
    const key = cellKey(s.employeeId ?? "open", column.key);
    cells.set(key, [...(cells.get(key) ?? []), { shift: s, ghost: false, mark }]);
    if (!s.removed) visibleEditable.push(s);
  }
  if (url.layout === "separate") {
    for (const column of columns) {
      for (const e of people) {
        const own = column.locationIds[0];
        const elsewhere: GhostCard[] = [
          ...shifts
            .filter((s) => s.employeeId === e.id && s.date === column.date && s.locationId !== own && !s.removed)
            .map((s) => ({
              ghost: true as const,
              id: `ghost:${s.id}:${column.key}`,
              locationName: week.locations.find((l) => l.id === s.locationId)?.name ?? "",
              start: s.start,
              end: s.end,
              title: shiftTitle(week, s, display.showType),
            })),
          ...week.outside
            .filter((g) => g.employeeId === e.id && g.date === column.date)
            .map((g) => ({ ghost: true as const, id: `outside:${g.id}:${column.key}`, locationName: g.locationName, start: g.start, end: g.end, title: g.jobName })),
        ];
        if (!elsewhere.length) continue;
        const key = cellKey(e.id, column.key);
        cells.set(key, [...(cells.get(key) ?? []), ...elsewhere]);
      }
    }
  }
  for (const [key, list] of cells) {
    cells.set(
      key,
      [...list].sort((a, b) => {
        if (a.ghost !== b.ghost) return a.ghost ? 1 : -1;
        if (a.ghost || b.ghost) return 0;
        return sortTimeOf(week, a.shift) - sortTimeOf(week, b.shift) || a.shift.id.localeCompare(b.shift.id);
      }),
    );
  }

  let totals: GridModel["totals"] = null;
  if (display.totals) {
    const byEmployee = new Map<string, number>();
    const byDate = new Map<string, number>();
    let weekTotal = 0;
    for (const s of filtered) {
      if (!s.employeeId || s.removed || !shownPeople.has(s.employeeId)) continue;
      const m = shiftMinutes(s);
      byEmployee.set(s.employeeId, (byEmployee.get(s.employeeId) ?? 0) + m);
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + m);
      weekTotal += m;
    }
    totals = { byEmployee, byDate, week: weekTotal };
  }

  return { dates, groups, columns, rows, cells, visibleEditable, totals, noLocations: !groups.length, searchEmpty };
}

/** Is the address's date inside the current week / today? (rule 6, 111c) */
export function isCurrentPeriod(view: "week" | "day", selectedDate: string, weekStart: string, today: string) {
  if (view === "day") return selectedDate === today;
  return today >= weekStart && today <= addDays(weekStart, 6);
}
