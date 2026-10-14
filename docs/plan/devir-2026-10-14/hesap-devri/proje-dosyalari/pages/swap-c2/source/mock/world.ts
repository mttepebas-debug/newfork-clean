// The demo restaurant the Schedule test page runs on: catalog, people, time
// off, publications, drafts and templates, kept in this browser tab (and in
// localStorage when the browser allows it).
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { viewerRole } from "./viewer";
import { reseedAll } from "./store";

export const ZONE = "America/New_York";
export const WORKSPACE_ID = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
export const OWNER_USER_ID = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
export const OWNER_NAME = "Mert Tepebas";
export const MANAGER_USER_ID = "3c1f7a20-5d4e-4b8a-9e61-7f2a90c4d311";
export const MANAGER_NAME = "Rachel Adams";
export const EMPLOYEE_USER_ID = "8a6e2b14-0c3f-4d7a-b2e5-19d4c6f0a722";
declare const __ATLAS_NS__: string;
const STORAGE_KEY = `newfork.atlas.${__ATLAS_NS__}world.v1`;

/** The three people the atlas can sign in as. */
export const viewers = {
  owner: { userId: OWNER_USER_ID, membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4", name: OWNER_NAME, email: "owner@harborvine.test", employeeId: null as string | null },
  manager: { userId: MANAGER_USER_ID, membershipId: "5e0d3a9c-7b21-4f6e-8c4d-a1b2c3d4e5f6", name: MANAGER_NAME, email: "rachel@harborvine.test", employeeId: null as string | null },
  employee: { userId: EMPLOYEE_USER_ID, membershipId: "9f8e7d6c-5b4a-4321-8fed-cba987654321", name: "Maria Lopez", email: "maria@harborvine.test", employeeId: "00000601-0000-4000-8000-000000000601" as string | null },
};
export const viewer = viewers[viewerRole];

export const demoUser = {
  id: viewer.userId,
  aud: "authenticated",
  role: "authenticated",
  email: viewer.email,
  email_confirmed_at: "2026-09-01T12:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: { display_name: viewer.name },
  created_at: "2026-09-01T12:00:00Z",
};

// Fixed ids keep links and saved state stable across reloads.
const id = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const LOC = { downtown: id(0x101), uptown: id(0x102) };
export const DEPT = { foh: id(0x201), kitchen: id(0x202), bar: id(0x203) };
export const JOB = {
  server: id(0x301), host: id(0x302), busser: id(0x303),
  line: id(0x304), prep: id(0x305), dish: id(0x306),
  bartender: id(0x307), barback: id(0x308),
};
export const TYPE = { breakfast: id(0x401), lunch: id(0x402), dinner: id(0x403), close: id(0x404) };
export const LABEL = { training: id(0x501), opener: id(0x502), closer: id(0x503), event: id(0x504) };

export interface Shift {
  id: string;
  location_id: string;
  employee_id: string | null;
  job_id: string;
  shift_type_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  time_basis?: "explicit" | "type_default";
  time_snapshot?: unknown;
  time_timezone?: string | null;
  unpaid_break_minutes: number;
  hide_time_on_badge: boolean;
  label_ids: string[];
  label_names: string[];
  note: string;
  revision: number;
  source_published_shift_id?: string | null;
  pending_op_type?: "create" | "update" | "delete" | null;
  locked?: boolean | null;
}

export interface Publication {
  id: string;
  location_id: string;
  week_start: string;
  version: number;
  published_at: string;
  published_by_name: string;
  source_draft_id: string | null;
  source_draft_name: string | null;
  shifts: Shift[];
}

export interface Draft {
  id: string;
  week_start: string;
  name: string;
  revision: number;
  location_ids: string[];
  shifts: Shift[];
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  week_start: string;
  source_kind: "blank" | "published" | "draft";
  source_draft_id: string | null;
  source_revision: number;
  revision: number;
  dirty: boolean;
  last_heartbeat: string;
  expires_at: string;
  location_ids: string[];
  shifts: Shift[];
  undo: Shift[][];
  status: "active" | "closed";
}

export interface TemplateShift {
  id: string;
  location_id: string;
  employee_id: string | null;
  job_id: string;
  shift_type_id: string | null;
  day_offset: number;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  time_basis?: "explicit" | "type_default";
  time_snapshot?: unknown;
  time_timezone?: string | null;
  unpaid_break_minutes: number;
  hide_time_on_badge: boolean;
  label_ids: string[];
  label_names: string[];
  note: string;
}

export interface Template {
  id: string;
  name: string;
  revision: number;
  created_by_name: string;
  updated_at: string;
  shifts: TemplateShift[];
}

export interface Employee {
  id: string;
  employee_code: string;
  display_name: string;
  location_ids: string[];
  job_ids: string[];
  primary_job_id: string;
  // Weekly marks the employee made: weekday (0 = Sunday) and local hours.
  unavailable: { weekday: number; from: string; to: string }[];
}

export interface TimeOff {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  // Local hours on a partial day; null is all day.
  from: string | null;
  to: string | null;
  status: "approved" | "pending";
  reason: string;
}

export interface World {
  version: 1;
  seeded_week: string;
  locations: { id: string; name: string; short_name: string; color: string; timezone: string; sort_order: number }[];
  departments: { id: string; name: string; color: string; system_key: "management" | null }[];
  jobs: { id: string; department_id: string | null; name: string; color: string; system_key: "owner" | null }[];
  shift_types: { id: string; name: string; color: string; sort_order: number; default_start_time: string; default_end_time: string; default_revision: number }[];
  shift_labels: { id: string; name: string; color: string; sort_order: number }[];
  employees: Employee[];
  time_off: TimeOff[];
  publications: Publication[];
  drafts: Draft[];
  sessions: Session[];
  templates: Template[];
  // A closed day at one location (public.schedule_closures): one row per day,
  // from the published closed-day important dates (mock/dates-service.ts keeps them in step).
  closures: { id: string; location_id: string; closed_date: string; end_date: string | null; title: string; is_all_day: boolean; shift_type_ids: string[]; important_date_id?: string }[];
  // The published, unarchived important dates the Schedule shows; location_ids
  // lists a date's locations ([] = all), location_id is set when there is one.
  important_dates: { id: string; location_id: string | null; location_ids?: string[]; title: string; type: "holiday" | "event" | "blackout" | "closed_day"; starts_on: string; ends_on: string; recurrence: "none" | "annual" }[];
}

const employees: Employee[] = [
  { id: id(0x601), employee_code: "HV-001", display_name: "Maria Lopez", location_ids: [LOC.downtown], job_ids: [JOB.server, JOB.host], primary_job_id: JOB.server, unavailable: [] },
  { id: id(0x602), employee_code: "HV-002", display_name: "Jake Thompson", location_ids: [LOC.downtown, LOC.uptown], job_ids: [JOB.server, JOB.bartender], primary_job_id: JOB.server, unavailable: [] },
  { id: id(0x603), employee_code: "HV-003", display_name: "Priya Patel", location_ids: [LOC.downtown], job_ids: [JOB.host, JOB.server], primary_job_id: JOB.host, unavailable: [{ weekday: 1, from: "00:00", to: "14:00" }] },
  { id: id(0x604), employee_code: "HV-004", display_name: "Ethan Brooks", location_ids: [LOC.downtown], job_ids: [JOB.busser, JOB.server], primary_job_id: JOB.busser, unavailable: [] },
  { id: id(0x605), employee_code: "HV-005", display_name: "Sophie Martin", location_ids: [LOC.downtown, LOC.uptown], job_ids: [JOB.bartender, JOB.barback], primary_job_id: JOB.bartender, unavailable: [{ weekday: 0, from: "00:00", to: "24:00" }] },
  { id: id(0x606), employee_code: "HV-006", display_name: "Daniel Kim", location_ids: [LOC.downtown], job_ids: [JOB.barback, JOB.busser], primary_job_id: JOB.barback, unavailable: [] },
  { id: id(0x607), employee_code: "HV-007", display_name: "Carlos Rivera", location_ids: [LOC.downtown], job_ids: [JOB.line, JOB.prep], primary_job_id: JOB.line, unavailable: [] },
  { id: id(0x608), employee_code: "HV-008", display_name: "Aisha Johnson", location_ids: [LOC.downtown, LOC.uptown], job_ids: [JOB.line], primary_job_id: JOB.line, unavailable: [{ weekday: 5, from: "18:00", to: "24:00" }] },
  { id: id(0x609), employee_code: "HV-009", display_name: "Tom Becker", location_ids: [LOC.downtown], job_ids: [JOB.prep, JOB.dish], primary_job_id: JOB.prep, unavailable: [] },
  { id: id(0x60a), employee_code: "HV-010", display_name: "Luis Hernandez", location_ids: [LOC.downtown], job_ids: [JOB.dish], primary_job_id: JOB.dish, unavailable: [] },
  { id: id(0x60b), employee_code: "HV-011", display_name: "Emma Wilson", location_ids: [LOC.uptown], job_ids: [JOB.server, JOB.host], primary_job_id: JOB.server, unavailable: [] },
  { id: id(0x60c), employee_code: "HV-012", display_name: "Noah Garcia", location_ids: [LOC.uptown], job_ids: [JOB.server], primary_job_id: JOB.server, unavailable: [] },
  { id: id(0x60d), employee_code: "HV-013", display_name: "Olivia Chen", location_ids: [LOC.uptown], job_ids: [JOB.host], primary_job_id: JOB.host, unavailable: [] },
  { id: id(0x60e), employee_code: "HV-014", display_name: "Marcus Reed", location_ids: [LOC.uptown], job_ids: [JOB.line, JOB.prep], primary_job_id: JOB.line, unavailable: [] },
  { id: id(0x60f), employee_code: "HV-015", display_name: "Grace Murphy", location_ids: [LOC.uptown], job_ids: [JOB.bartender], primary_job_id: JOB.bartender, unavailable: [] },
  { id: id(0x610), employee_code: "HV-016", display_name: "Sam Okafor", location_ids: [LOC.uptown], job_ids: [JOB.dish, JOB.prep], primary_job_id: JOB.dish, unavailable: [] },
];
const E = Object.fromEntries(employees.map((employee) => [employee.display_name.split(" ")[0]!.toLowerCase(), employee.id])) as Record<string, string>;

const shiftTypes: World["shift_types"] = [
  { id: TYPE.breakfast, name: "Breakfast", color: "#F59E0B", sort_order: 0, default_start_time: "07:00", default_end_time: "12:00", default_revision: 1 },
  { id: TYPE.lunch, name: "Lunch", color: "#10B981", sort_order: 1, default_start_time: "11:00", default_end_time: "16:00", default_revision: 1 },
  { id: TYPE.dinner, name: "Dinner", color: "#6366F1", sort_order: 2, default_start_time: "16:00", default_end_time: "22:00", default_revision: 1 },
  { id: TYPE.close, name: "Close", color: "#EC4899", sort_order: 3, default_start_time: "18:00", default_end_time: "23:30", default_revision: 1 },
];
const labels: World["shift_labels"] = [
  { id: LABEL.training, name: "Training", color: "#0EA5E9", sort_order: 0 },
  { id: LABEL.opener, name: "Opener", color: "#84CC16", sort_order: 1 },
  { id: LABEL.closer, name: "Closer", color: "#F97316", sort_order: 2 },
  { id: LABEL.event, name: "Private event", color: "#A855F7", sort_order: 3 },
];

type Pattern = [employee: string | null, job: string, type: keyof typeof TYPE, days: number[], label?: keyof typeof LABEL, start?: string, end?: string];

// One week at each location (days: 0 = Monday).
const downtownWeek: Pattern[] = [
  ["maria", JOB.server, "lunch", [0, 1, 4, 5]],
  ["maria", JOB.server, "dinner", [6]],
  ["jake", JOB.server, "dinner", [0, 2, 3, 4]],
  ["priya", JOB.host, "dinner", [1, 2, 4, 5]],
  ["priya", JOB.host, "lunch", [6]],
  ["ethan", JOB.busser, "dinner", [0, 1, 4, 5, 6]],
  ["sophie", JOB.bartender, "close", [2, 3, 4, 5], "closer"],
  ["daniel", JOB.barback, "close", [4, 5]],
  ["daniel", JOB.barback, "dinner", [1]],
  ["carlos", JOB.line, "lunch", [0, 1, 2, 3, 4], "opener"],
  ["aisha", JOB.line, "dinner", [1, 2, 3, 5, 6]],
  ["tom", JOB.prep, "breakfast", [0, 2, 4, 5]],
  ["luis", JOB.dish, "dinner", [2, 3, 4, 5, 6]],
  [null, JOB.server, "dinner", [4, 5]],
  [null, JOB.busser, "lunch", [5]],
];
const uptownWeek: Pattern[] = [
  ["emma", JOB.server, "lunch", [0, 1, 2, 3]],
  ["emma", JOB.server, "dinner", [5]],
  ["noah", JOB.server, "dinner", [1, 2, 4, 5, 6]],
  ["olivia", JOB.host, "dinner", [3, 4, 5]],
  ["marcus", JOB.line, "dinner", [0, 2, 3, 4, 5]],
  ["grace", JOB.bartender, "close", [3, 4, 5, 6], "closer"],
  ["sam", JOB.dish, "dinner", [2, 4, 5, 6]],
  ["jake", JOB.bartender, "close", [6]],
  [null, JOB.host, "lunch", [6]],
];

function patternShifts(patterns: Pattern[], locationId: string, weekStart: string): Shift[] {
  return patterns.flatMap(([employee, job, type, days, label, start, end]) => {
    const shiftType = shiftTypes.find((item) => item.id === TYPE[type])!;
    return days.map((day) => {
      const labelRow = label ? labels.find((item) => item.id === LABEL[label]) : undefined;
      const startTime = start ?? shiftType.default_start_time;
      const endTime = end ?? shiftType.default_end_time;
      return {
        id: uuid(),
        location_id: locationId,
        employee_id: employee ? E[employee]! : null,
        job_id: job,
        shift_type_id: shiftType.id,
        scheduled_date: addDays(weekStart, day),
        start_time: startTime,
        end_time: endTime,
        crosses_midnight: endTime <= startTime,
        time_basis: "type_default" as const,
        time_snapshot: { shift_type_id: shiftType.id, default_revision: 1, start_time: shiftType.default_start_time, end_time: shiftType.default_end_time, timezone: ZONE },
        time_timezone: ZONE,
        unpaid_break_minutes: 30,
        hide_time_on_badge: false,
        label_ids: labelRow ? [labelRow.id] : [],
        label_names: labelRow ? [labelRow.name] : [],
        note: "",
        revision: 1,
      };
    });
  });
}

function toTemplateShifts(shifts: Shift[], weekStart: string, keepPeople: boolean): TemplateShift[] {
  return shifts.map((shift) => ({
    id: uuid(),
    location_id: shift.location_id,
    employee_id: keepPeople ? shift.employee_id : null,
    job_id: shift.job_id,
    shift_type_id: shift.shift_type_id,
    day_offset: Math.round((Date.parse(shift.scheduled_date) - Date.parse(weekStart)) / 86_400_000),
    start_time: shift.start_time,
    end_time: shift.end_time,
    crosses_midnight: shift.crosses_midnight,
    time_basis: shift.time_basis,
    time_snapshot: shift.time_snapshot,
    time_timezone: shift.time_timezone,
    unpaid_break_minutes: shift.unpaid_break_minutes,
    hide_time_on_badge: shift.hide_time_on_badge,
    label_ids: [...shift.label_ids],
    label_names: [...shift.label_names],
    note: shift.note,
  }));
}

function seed(): World {
  const thisWeek = mondayOf(todayIn(ZONE));
  const lastWeek = addDays(thisWeek, -7);
  const nextWeek = addDays(thisWeek, 7);
  const now = new Date();
  const publishedAt = (weekStart: string) => iso(localInstant(addDays(weekStart, -4), "15:20", ZONE));
  const publication = (locationId: string, weekStart: string, patterns: Pattern[]): Publication => ({
    id: uuid(),
    location_id: locationId,
    week_start: weekStart,
    version: 1,
    published_at: publishedAt(weekStart),
    published_by_name: OWNER_NAME,
    source_draft_id: null,
    source_draft_name: null,
    shifts: patternShifts(patterns, locationId, weekStart).filter((shift) => {
      // Nobody works through their own approved time off.
      const day = (Date.parse(shift.scheduled_date) - Date.parse(weekStart)) / 86_400_000;
      if (weekStart === thisWeek) return !(shift.employee_id === E.maria && (day === 2 || day === 3));
      if (weekStart === nextWeek) return !((shift.employee_id === E.jake && day <= 1) || (shift.employee_id === E.olivia && (day === 4 || day === 5)));
      return true;
    }),
  });
  const nextDraftShifts = patternShifts(downtownWeek, LOC.downtown, nextWeek)
    .filter((shift) => !(shift.employee_id === E.jake && shift.scheduled_date <= addDays(nextWeek, 1)));
  const standardDowntown = patternShifts(downtownWeek, LOC.downtown, thisWeek);
  const standardUptown = patternShifts(uptownWeek, LOC.uptown, thisWeek);
  const brunch: Shift[] = patternShifts([
    [null, JOB.server, "breakfast", [5, 6], "event"],
    [null, JOB.server, "breakfast", [5, 6], "event"],
    [null, JOB.host, "breakfast", [5, 6]],
    [null, JOB.line, "breakfast", [5, 6]],
    [null, JOB.bartender, "lunch", [5, 6], "event"],
  ], LOC.downtown, thisWeek);
  const updated = (days: number) => iso(now.getTime() - days * 86_400_000);
  return {
    version: 1,
    seeded_week: thisWeek,
    locations: [
      { id: LOC.downtown, name: "Harbor & Vine Downtown", short_name: "DTWN", color: "#2563EB", timezone: ZONE, sort_order: 0 },
      { id: LOC.uptown, name: "Harbor & Vine Uptown", short_name: "UPTN", color: "#059669", timezone: ZONE, sort_order: 1 },
    ],
    departments: [
      { id: DEPT.bar, name: "Bar", color: "#7C3AED", system_key: null },
      // Every workspace has Management with Manager and Owner (set up at onboarding).
      { id: id(0x204), name: "Management", color: "#475569", system_key: "management" },
      { id: DEPT.foh, name: "Front of House", color: "#2563EB", system_key: null },
      { id: DEPT.kitchen, name: "Kitchen", color: "#DC2626", system_key: null },
    ],
    jobs: [
      { id: id(0x309), department_id: id(0x204), name: "Manager", color: "#64748B", system_key: null },
      { id: id(0x30a), department_id: id(0x204), name: "Owner", color: "#334155", system_key: "owner" },
      { id: JOB.barback, department_id: DEPT.bar, name: "Barback", color: "#8B5CF6", system_key: null },
      { id: JOB.bartender, department_id: DEPT.bar, name: "Bartender", color: "#7C3AED", system_key: null },
      { id: JOB.busser, department_id: DEPT.foh, name: "Busser", color: "#60A5FA", system_key: null },
      { id: JOB.dish, department_id: DEPT.kitchen, name: "Dishwasher", color: "#F87171", system_key: null },
      { id: JOB.host, department_id: DEPT.foh, name: "Host", color: "#3B82F6", system_key: null },
      { id: JOB.line, department_id: DEPT.kitchen, name: "Line Cook", color: "#DC2626", system_key: null },
      { id: JOB.prep, department_id: DEPT.kitchen, name: "Prep Cook", color: "#EF4444", system_key: null },
      { id: JOB.server, department_id: DEPT.foh, name: "Server", color: "#2563EB", system_key: null },
    ],
    // Close's default hours were shortened after these weeks were written, so
    // "Review default hours" has real work to show.
    shift_types: shiftTypes.map((type) => type.id === TYPE.close ? { ...type, default_end_time: "23:00", default_revision: 2 } : type),
    shift_labels: labels,
    employees,
    time_off: [
      { id: id(0x701), employee_id: E.maria!, start_date: addDays(thisWeek, 2), end_date: addDays(thisWeek, 3), from: null, to: null, status: "approved", reason: "Family trip" },
      { id: id(0x702), employee_id: E.jake!, start_date: nextWeek, end_date: addDays(nextWeek, 1), from: null, to: null, status: "approved", reason: "Moving day" },
      { id: id(0x703), employee_id: E.noah!, start_date: addDays(thisWeek, 3), end_date: addDays(thisWeek, 3), from: "15:00", to: "23:59", status: "approved", reason: "Class" },
      { id: id(0x704), employee_id: E.olivia!, start_date: addDays(nextWeek, 4), end_date: addDays(nextWeek, 5), from: null, to: null, status: "approved", reason: "Wedding" },
    ],
    publications: [
      publication(LOC.downtown, lastWeek, downtownWeek),
      publication(LOC.uptown, lastWeek, uptownWeek),
      publication(LOC.downtown, thisWeek, downtownWeek),
      publication(LOC.uptown, thisWeek, uptownWeek),
      // Next week is out too (the atlas's Shift Hub and Requests reach ahead);
      // the Downtown draft above is the manager's next round of edits.
      publication(LOC.downtown, nextWeek, downtownWeek),
      publication(LOC.uptown, nextWeek, uptownWeek),
    ],
    drafts: [
      { id: id(0x801), week_start: nextWeek, name: "Next week plan", revision: 3, location_ids: [LOC.downtown], shifts: nextDraftShifts, created_at: updated(2), updated_at: updated(1) },
    ],
    sessions: [],
    templates: [
      { id: id(0x901), name: "Standard week", revision: 2, created_by_name: OWNER_NAME, updated_at: updated(12), shifts: [...toTemplateShifts(standardDowntown, thisWeek, true), ...toTemplateShifts(standardUptown, thisWeek, true)] },
      { id: id(0x902), name: "Downtown open shifts", revision: 1, created_by_name: OWNER_NAME, updated_at: updated(30), shifts: toTemplateShifts(standardDowntown, thisWeek, false) },
      { id: id(0x903), name: "Weekend brunch event", revision: 1, created_by_name: "Rachel Adams", updated_at: updated(5), shifts: toTemplateShifts(brunch, thisWeek, false) },
    ],
    // The closed-day important dates below, one row per location and day (the
    // yearly Christmas closure for this year and the next two, like closure_days).
    closures: (() => {
      const year = Number(thisWeek.slice(0, 4));
      const christmasYear = `${year}-12-25` >= thisWeek ? year : year + 1;
      const row = (dateId: string, locationId: string, day: string, title: string): World["closures"][number] => ({
        id: `${day.replaceAll("-", "")}-0000-4000-8${locationId.slice(-3)}-${dateId.slice(-12)}`,
        location_id: locationId, closed_date: day, end_date: null, title, is_all_day: true, shift_type_ids: [], important_date_id: dateId,
      });
      return [
        row(id(0xa03), LOC.downtown, addDays(thisWeek, 15), "Kitchen deep clean & hood service"),
        ...[0, 1, 2].flatMap((n) => [LOC.downtown, LOC.uptown].map((locationId) => row(id(0xa07), locationId, `${christmasYear + n}-12-25`, "Christmas Day"))),
      ];
    })(),
    // Holidays, events, blackouts and closed days around this month and the next
    // (the full records, with notes and history, live in mock/dates-service.ts).
    important_dates: (() => {
      const year = Number(thisWeek.slice(0, 4));
      // The next time a month-day comes round, from this week on.
      const next = (monthDay: string) => (`${year}-${monthDay}` >= thisWeek ? `${year}-${monthDay}` : `${year + 1}-${monthDay}`);
      const thanksgivingOf = (y: number) => {
        const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
        return `${y}-11-${String(1 + ((4 - first + 7) % 7) + 21).padStart(2, "0")}`;
      };
      const thanksgiving = thanksgivingOf(year) >= thisWeek ? thanksgivingOf(year) : thanksgivingOf(year + 1);
      const laborDayOf = (y: number) => {
        const first = new Date(Date.UTC(y, 8, 1)).getUTCDay();
        return `${y}-09-${String(1 + ((8 - first) % 7)).padStart(2, "0")}`;
      };
      const laborDay = laborDayOf(year) < thisWeek ? laborDayOf(year) : laborDayOf(year - 1);
      const all = { location_id: null, location_ids: [] as string[] };
      const at = (locationId: string) => ({ location_id: locationId, location_ids: [locationId] });
      return [
        { id: id(0xa01), ...all, title: "Halloween", type: "event", starts_on: next("10-31"), ends_on: next("10-31"), recurrence: "annual" },
        { id: id(0xa02), ...all, title: "Thanksgiving", type: "holiday", starts_on: thanksgiving, ends_on: thanksgiving, recurrence: "none" },
        { id: id(0xa03), ...at(LOC.downtown), title: "Kitchen deep clean & hood service", type: "closed_day", starts_on: addDays(thisWeek, 15), ends_on: addDays(thisWeek, 15), recurrence: "none" },
        { id: id(0xa04), ...at(LOC.uptown), title: "Hartwell private buyout", type: "event", starts_on: addDays(thisWeek, 12), ends_on: addDays(thisWeek, 12), recurrence: "none" },
        { id: id(0xa05), ...at(LOC.downtown), title: "Downtown Restaurant Week", type: "event", starts_on: addDays(thisWeek, 28), ends_on: addDays(thisWeek, 34), recurrence: "none" },
        { id: id(0xa06), ...all, title: "Christmas Eve", type: "holiday", starts_on: next("12-24"), ends_on: next("12-24"), recurrence: "annual" },
        { id: id(0xa07), ...all, title: "Christmas Day", type: "closed_day", starts_on: next("12-25"), ends_on: next("12-25"), recurrence: "annual" },
        { id: id(0xa08), ...all, title: "New Year's Eve", type: "blackout", starts_on: next("12-31"), ends_on: next("12-31"), recurrence: "annual" },
        { id: id(0xa09), ...all, title: "Labor Day", type: "holiday", starts_on: laborDay, ends_on: laborDay, recurrence: "none" },
        { id: id(0xa0a), ...at(LOC.downtown), title: "Fall menu launch", type: "event", starts_on: addDays(thisWeek, -10), ends_on: addDays(thisWeek, -10), recurrence: "none" },
      ] satisfies World["important_dates"];
    })(),
  };
}

function load(): World {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as World;
      // A saved world from an earlier week is reseeded so "this week" has a schedule.
      if (parsed.version === 1 && parsed.seeded_week === mondayOf(todayIn(ZONE))) return parsed;
    }
  } catch {
    // Storage blocked or unreadable: start fresh.
  }
  return seed();
}

export let world: World = load();

// Direct supabase-js table reads (settings catalog, account profile...) are
// answered by whichever area registers the table.
const tables = new Map<string, () => Record<string, unknown>[]>();
/**
 * An area's writes to its table (supabase-js insert/update/delete). Each gets
 * full rows and returns the row as saved; a refusal is thrown as
 * { code, message, hint?, details? }, the shape PostgREST answers with.
 */
export interface TableWrites {
  insert?(values: Record<string, unknown>): Record<string, unknown>;
  update?(row: Record<string, unknown>, values: Record<string, unknown>): Record<string, unknown>;
  remove?(row: Record<string, unknown>): void;
}
const writers = new Map<string, TableWrites>();
export function registerTable(table: string, rows: () => Record<string, unknown>[], writes?: TableWrites): void {
  tables.set(table, rows);
  if (writes) writers.set(table, writes);
}
export function tableWrites(table: string): TableWrites | undefined {
  return writers.get(table);
}

export function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
  } catch {
    // Storage blocked: the tab keeps its own copy.
  }
}

export function resetWorld(): void {
  world = seed();
  persist();
  reseedAll();
}

export function tableRows(table: string): Record<string, unknown>[] {
  const registered = tables.get(table);
  if (registered) return registered();
  if (table === "user_profiles") return [{ user_id: viewer.userId, display_name: viewer.name, phone: null, phone_e164: null, avatar_object_path: null }];
  if (table === "user_preferences") return [{ user_id: viewer.userId, theme: "light", time_format: "system", date_format: "system" }];
  if (table === "account_organization_history") return [{ user_id: viewer.userId }];
  return [];
}
