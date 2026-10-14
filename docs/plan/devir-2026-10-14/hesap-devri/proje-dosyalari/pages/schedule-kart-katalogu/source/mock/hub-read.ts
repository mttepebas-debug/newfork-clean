// The Employee Hub's reads for the signed-in employee: the hub read model
// (shifts, open shifts, teammates' shifts, own time-off requests, team) and the
// published, employee-scoped Schedule board. Mirrors get_employee_hub_service
// and get_employee_schedule_board_service in supabase/schema.sql.
import { addDays, localInstant, mondayOf, shiftSpan } from "./time";
import { WORKSPACE_ID, ZONE, world, type Shift } from "./world";
import { employee, employeeName, invalid, jobName, locationName, refuse, viewerEmployeeId } from "./requests-people";
import { publishedShifts } from "./hub-shifts";
import { displayStatus, periodsJson, records, cancellationContext, releasedFor, sweep } from "./requests-time-off";

/** employee_hub_actor_service: only somebody with an employee record of their own has a hub. */
export function hubActor() {
  const id = viewerEmployeeId();
  const person = id ? employee(id) : undefined;
  if (!person) refuse("authz.out_of_scope", 403, "employee profile required");
  return person;
}

const hhmm = (value: string | null | undefined) => (value ? value.slice(0, 5) : null);
const sortName = (name: string) => { const parts = name.split(" "); return `${parts.at(-1)} ${parts[0]}`; };
const monthDay = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00Z`));
const byTime = (a: Shift, b: Shift) => a.scheduled_date.localeCompare(b.scheduled_date) || (a.start_time ?? "").localeCompare(b.start_time ?? "");

function hubShift(shift: Shift, note: string, withName: boolean) {
  return {
    id: shift.id,
    location_id: shift.location_id,
    location_name: locationName(shift.location_id),
    job_name: jobName(shift.job_id),
    scheduled_date: shift.scheduled_date,
    time_basis: shift.time_basis ?? "explicit",
    time_snapshot: shift.time_snapshot ?? null,
    time_timezone: shift.time_timezone ?? ZONE,
    start_time: hhmm(shift.start_time),
    end_time: hhmm(shift.end_time),
    note,
    employee_id: shift.employee_id,
    ...(withName ? { employee_name: employeeName(shift.employee_id) } : {}),
  };
}

export function employeeHub(query: URLSearchParams) {
  sweep();
  const me = hubActor();
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || to > addDays(from, 62)) {
    invalid("employee hub date range is invalid");
  }
  const mine = new Set(me.location_ids);
  const inRange = (shift: Shift) => shift.scheduled_date >= from && shift.scheduled_date <= to;
  const shifts = publishedShifts().filter(inRange).sort(byTime);
  const requests = records()
    .filter((record) => record.employee_id === me.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((record) => {
      const dates = record.segments.map((segment) => segment.segment_date).sort();
      const first = dates[0]!;
      const last = dates.at(-1)!;
      return {
        id: record.id,
        kind: "time_off" as const,
        request_type: record.request_type,
        cancellation: cancellationContext(record),
        periods: periodsJson(record),
        decision_events: [...record.events]
          .filter((event) => ["approved", "denied", "revoked", "expired"].includes(event.action))
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((event) => ({
            id: event.id, action: event.action, note: event.note, created_at: event.created_at,
            revision: event.revision ?? null, released_assignments: releasedFor(record, event),
          })),
        status: record.status,
        display_status: displayStatus(record),
        decide_by: record.decide_by,
        title: `${record.request_type === "time_off_cancellation" ? "Cancel approved leave · " : "Time off · "}${monthDay(first)}${first !== last ? `–${monthDay(last)}` : ""}`,
        detail: record.reason || "No note",
        revision: record.revision,
        created_at: record.created_at,
        can_cancel: record.status === "pending",
      };
    });
  return {
    workspace_id: WORKSPACE_ID,
    employee: { id: me.id, display_name: me.display_name },
    time_off_timezone: ZONE,
    settings: { time_format: "12h" as const, time_off_lead_hours: 24 },
    locations: world.locations
      .filter((location) => mine.has(location.id))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((location) => ({ id: location.id, name: location.name, timezone: location.timezone })),
    shifts: shifts.filter((shift) => shift.employee_id === me.id).map((shift) => hubShift(shift, shift.note ?? "", false)),
    open_shifts: shifts.filter((shift) => !shift.employee_id && mine.has(shift.location_id)).map((shift) => hubShift(shift, shift.note ?? "", false)),
    team_shifts: shifts.filter((shift) => shift.employee_id && shift.employee_id !== me.id && mine.has(shift.location_id))
      .map((shift) => hubShift(shift, "", true)),
    requests,
    team: world.employees
      .filter((person) => person.id !== me.id && person.location_ids.some((place) => mine.has(place)))
      .sort((a, b) => sortName(a.display_name).localeCompare(sortName(b.display_name)))
      .map((person) => ({
        id: person.id,
        display_name: person.display_name,
        job_names: person.job_ids.map((job) => jobName(job)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
        location_names: world.locations.filter((location) => person.location_ids.includes(location.id))
          .sort((a, b) => a.sort_order - b.sort_order).map((location) => location.name),
      })),
  };
}

/** The employee's own unavailable marks around the week (the board warns only on these). */
function ownUnavailable(employeeId: string, weekStart: string) {
  const person = employee(employeeId);
  const spans: { start: number; end: number }[] = [];
  for (let day = -1; day < 8; day += 1) {
    const date = addDays(weekStart, day);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const mark of person?.unavailable.filter((item) => item.weekday === weekday) ?? []) {
      const end = mark.to === "24:00" ? localInstant(addDays(date, 1), "00:00", ZONE) : localInstant(date, mark.to, ZONE);
      spans.push({ start: localInstant(date, mark.from, ZONE), end });
    }
  }
  return spans;
}

export function employeeBoard(query: URLSearchParams) {
  const me = hubActor();
  const date = query.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid("date is invalid");
  const weekStart = mondayOf(date);
  const allowed = world.locations.filter((location) => me.location_ids.includes(location.id))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const allowedIds = new Set(allowed.map((location) => location.id));
  const publications = world.publications.filter((item) => item.week_start === weekStart && allowedIds.has(item.location_id));
  const shifts = publications.flatMap((item) => item.shifts)
    .filter((shift) => shift.scheduled_date >= weekStart && shift.scheduled_date <= addDays(weekStart, 6))
    .sort((a, b) => byTime(a, b) || a.id.localeCompare(b.id));
  const unavailable = ownUnavailable(me.id, weekStart);
  const warnings = (shift: Shift) => {
    const codes: string[] = [];
    if (world.closures.some((closure) => closure.location_id === shift.location_id && closure.closed_date === shift.scheduled_date && closure.is_all_day)) codes.push("closed_location");
    const span = shiftSpan(shift, ZONE);
    if (shift.employee_id === me.id && span && unavailable.some((item) => item.start < span.end && span.start < item.end)) codes.push("availability");
    if (shift.employee_id && shifts.some((other) => other.id !== shift.id && other.employee_id === shift.employee_id
      && other.scheduled_date === shift.scheduled_date && !shift.crosses_midnight && !other.crosses_midnight
      && shift.start_time < other.end_time && shift.end_time > other.start_time)) codes.push("overlap");
    return codes;
  };
  const visible = world.employees.filter((person) => person.location_ids.some((place) => allowedIds.has(place)))
    .sort((a, b) => sortName(a.display_name).localeCompare(sortName(b.display_name)) || a.id.localeCompare(b.id));
  return {
    workspace_id: WORKSPACE_ID,
    week_start: weekStart,
    week_start_day: "monday",
    settings: { time_format: "12h" },
    locations: allowed.map((location) => {
      const publication = publications.find((item) => item.location_id === location.id);
      return {
        id: location.id, name: location.name, timezone: location.timezone, sort_order: location.sort_order,
        publication_status: publication ? "published" : "unpublished", published_at: publication?.published_at ?? null,
      };
    }),
    shift_types: world.shift_types,
    shift_labels: [],
    employees: visible.map((person) => ({
      id: person.id,
      employee_code: person.employee_code,
      display_name: person.display_name,
      location_ids: person.location_ids.filter((place) => allowedIds.has(place)).sort(),
      job_ids: [...person.job_ids].sort(),
      primary_job_id: person.primary_job_id,
    })),
    shifts: shifts.map((shift) => ({
      id: shift.id,
      location_id: shift.location_id,
      employee_id: shift.employee_id,
      job_id: shift.job_id,
      shift_type_id: shift.shift_type_id,
      scheduled_date: shift.scheduled_date,
      time_basis: shift.time_basis ?? "explicit",
      time_snapshot: shift.time_snapshot ?? null,
      time_timezone: shift.time_timezone ?? ZONE,
      start_time: hhmm(shift.start_time),
      end_time: hhmm(shift.end_time),
      crosses_midnight: shift.crosses_midnight,
      unpaid_break_minutes: shift.unpaid_break_minutes ?? 0,
      hide_time_on_badge: shift.hide_time_on_badge ?? false,
      note: !shift.employee_id || shift.employee_id === me.id ? shift.note ?? "" : "",
      label_ids: shift.label_ids ?? [],
      label_names: shift.label_names ?? [],
      warning_codes: warnings(shift),
    })),
    closures: world.closures
      .filter((closure) => allowedIds.has(closure.location_id) && closure.closed_date >= weekStart && closure.closed_date <= addDays(weekStart, 6))
      .map(({ id, location_id, closed_date, title, is_all_day }) => ({ id, location_id, closed_date, title, is_all_day, kind: "closed" as const, opens: null, closes: null })),
    important_dates: [],
    departments: world.departments,
    jobs: world.jobs,
    referenced_jobs: [],
    referenced_shift_types: [],
  };
}
