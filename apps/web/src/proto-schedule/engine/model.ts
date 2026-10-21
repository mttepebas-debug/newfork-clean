// The prototype's own view of a schedule week. It is read once from the
// real API (GET /schedule/reference) and from then on lives in memory: every
// edit here stays in this browser tab and never reaches the server.
import type { ScheduleReadModel } from "@newfork/shared";

export type ViewMode = "week" | "day";

export type Location = {
  id: string;
  name: string;
  shortName: string;
  timezone: string;
};

export type Job = {
  id: string;
  name: string;
  color: string;
  departmentId: string | null;
  departmentName: string | null;
  /** Management jobs sort after everyone else (rule 16). */
  management: boolean;
  owner: boolean;
};

export type ShiftType = {
  id: string;
  name: string;
  color: string;
  start: string | null;
  end: string | null;
};

export type Employee = {
  id: string;
  name: string;
  code: string;
  locationIds: string[];
  jobIds: string[];
  primaryJobId: string | null;
  /** Empty: every shift type is allowed. */
  shiftTypeIds: string[];
  excluded: boolean;
};

export type Shift = {
  id: string;
  locationId: string;
  /** null: an open shift, waiting for someone. */
  employeeId: string | null;
  jobId: string;
  shiftTypeId: string | null;
  date: string;
  start: string | null;
  end: string | null;
  breakMinutes: number;
  note: string;
  labels: string[];
  hideTime: boolean;
  /** Where the shift came from: on the server, or made in this tab. */
  origin: "live" | "new";
  /** A live shift changed in this edit (shows "New", titled Edited). */
  edited?: boolean;
  /** A live shift taken off in this edit: shown struck through, can be restored. */
  removed?: boolean;
};

/** The same person's shift somewhere the viewer cannot reach (ghost_shifts). */
export type OutsideShift = {
  id: string;
  employeeId: string;
  locationId: string;
  locationName: string;
  date: string;
  start: string | null;
  end: string | null;
  jobName: string;
};

export type Policy = "allow" | "warn" | "confirm" | "block";

export type Closure = {
  locationId: string;
  date: string;
  title: string;
  kind: "closed" | "short";
};

export type DayPost = {
  locationId: string | null;
  from: string;
  to: string;
  title: string;
  day: "open" | "closed" | "short";
};

export type Week = {
  weekStart: string;
  locations: Location[];
  jobs: Job[];
  shiftTypes: ShiftType[];
  employees: Employee[];
  shifts: Shift[];
  closures: Closure[];
  posts: DayPost[];
  outside: OutsideShift[];
  timeFormat: "12h" | "24h";
  closedPolicy: Policy;
};

const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : null);

export function readWeek(model: ScheduleReadModel): Week {
  const departments = new Map(model.departments.map((d) => [d.id, d]));
  const policy = model.settings?.conflict_rules?.closed_location;
  return {
    closedPolicy: policy === "block" ? "block" : "confirm",
    outside: (model.ghost_shifts ?? []).map((g) => ({
      id: g.id,
      employeeId: g.employee_id,
      locationId: g.location_id,
      locationName: g.location_name,
      date: g.scheduled_date,
      start: hhmm(g.start_time),
      end: hhmm(g.end_time),
      jobName: g.job_name ?? "",
    })),
    weekStart: model.week_start,
    timeFormat: model.settings?.time_format === "24h" ? "24h" : "12h",
    locations: [...model.locations]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => ({ id: l.id, name: l.name, shortName: l.short_name ?? l.name, timezone: l.timezone })),
    jobs: model.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      color: j.color ?? "#64748b",
      departmentId: j.department_id ?? null,
      departmentName: j.department_id ? (departments.get(j.department_id)?.name ?? null) : null,
      management: j.department_id ? departments.get(j.department_id)?.system_key === "management" : false,
      owner: j.system_key === "owner",
    })),
    shiftTypes: [...model.shift_types]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color ?? "#64748b",
        start: hhmm(t.default_start_time),
        end: hhmm(t.default_end_time),
      })),
    employees: model.employees.map((e) => ({
      id: e.id,
      name: e.display_name,
      code: e.employee_code ?? "",
      locationIds: e.location_ids ?? [],
      jobIds: e.job_ids ?? [],
      primaryJobId: e.primary_job_id ?? null,
      shiftTypeIds: e.shift_type_ids ?? [],
      excluded: Boolean(e.is_excluded_from_schedule),
    })),
    shifts: model.shifts.map((s) => ({
      id: s.id,
      locationId: s.location_id,
      employeeId: s.employee_id ?? null,
      jobId: s.job_id,
      shiftTypeId: s.shift_type_id ?? null,
      date: s.scheduled_date,
      start: hhmm(s.start_time),
      end: hhmm(s.end_time),
      breakMinutes: s.unpaid_break_minutes ?? 0,
      note: s.note ?? "",
      labels: s.label_names ?? [],
      hideTime: Boolean(s.hide_time_on_badge),
      origin: "live" as const,
    })),
    closures: model.closures
      .filter((c) => c.status !== "unpublished")
      .map((c) => ({ locationId: c.location_id, date: c.closed_date, title: c.title, kind: c.kind })),
    posts: (model.important_dates ?? []).map((d) => ({
      locationId: d.location_id,
      from: d.starts_on,
      to: d.ends_on,
      title: d.title,
      day: d.day === "closed" || d.day === "short" ? d.day : "open",
    })),
  };
}

// ---- dates -------------------------------------------------------------

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
export const weekdayOf = (iso: string) => weekdayFmt.format(new Date(`${iso}T12:00:00Z`));
export const monthOf = (iso: string) => monthFmt.format(new Date(`${iso}T12:00:00Z`));
export const dayNumberOf = (iso: string) => Number(iso.slice(8, 10));
export const isWeekend = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

// ---- times -------------------------------------------------------------

export function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Paid length in minutes; a shift that ends at or before it starts runs past midnight. */
export function shiftMinutes(shift: Pick<Shift, "start" | "end" | "breakMinutes">): number {
  const s = minutesOf(shift.start);
  const e = minutesOf(shift.end);
  if (s === null || e === null) return 0;
  const length = e > s ? e - s : e + 24 * 60 - s;
  return Math.max(0, length - shift.breakMinutes);
}

export function formatTime(time: string | null, format: "12h" | "24h", compact = false): string {
  if (!time) return "";
  const [h = 0, m = 0] = time.split(":").map(Number);
  if (format === "24h") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "a" : "p";
  if (compact) return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatRange(shift: Pick<Shift, "start" | "end">, format: "12h" | "24h", compact = false) {
  if (!shift.start || !shift.end) return "No time";
  return `${formatTime(shift.start, format, compact)}–${formatTime(shift.end, format, compact)}`;
}

export function formatHours(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}
