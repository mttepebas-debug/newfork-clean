// Demo backend for weekly availability: the team list (Availability page),
// one person's week (My availability, the Employees drawer's Availability
// section), the manager's private reminders and notes, and the workspace's
// entry mode (Settings > Scheduling). Mirrors weekly_team_read_service,
// weekly_preferences_read_service / _save_service and the settings services
// in supabase/schema.sql. The employee's saved week is written back to
// world.employees[].unavailable, which the Schedule's availability checks read.
import * as shared from "@newfork/shared";
import { ApiError, type Handler } from "./api";
import { domainStore } from "./store";
import { iso, minutesOf } from "./time";
import { viewerRole } from "./viewer";
import { LOC, persist, viewer, viewers, world, type Employee } from "./world";
import { notifyPeople } from "./communications-service";

type Route = (method: string, path: string, handler: Handler) => void;
type Mode = "shift_type" | "time_range";

interface Day { day: number; all_day: boolean; shift_type_ids: string[]; ranges: { start: string; end: string }[] }
interface Preference { input_mode: Mode; days: Day[] }
interface EmployeeRecord { revision: number; updated_at: string; preference: Preference }
interface ManagerRecord extends EmployeeRecord { enabled: boolean; notes: string[] }

interface AvailabilityData {
  settings: { input_mode: Mode; onboarding_required: boolean; revision: number };
  employee: Record<string, EmployeeRecord>;
  manager: Record<string, ManagerRecord>;
  /** Idempotency keys already answered: a replay gets the same result. */
  commands: Record<string, string>;
}

const DAY_MS = 86_400_000;
const ago = (days: number) => iso(Date.now() - days * DAY_MS);

function fail(status: number, error: string, reason?: string): never {
  throw new ApiError(status, reason ? { error, reason } : { error });
}

function emptyPreference(mode: Mode): Preference {
  return { input_mode: mode, days: Array.from({ length: 7 }, (_, day) => ({ day, all_day: false, shift_type_ids: [], ranges: [] })) };
}

/** An employee's weekly marks (world.ts) as a saved week. */
function fromMarks(marks: Employee["unavailable"]): Preference {
  const preference = emptyPreference("time_range");
  for (const mark of marks) {
    const day = preference.days[mark.weekday]!;
    if (mark.from === "00:00" && mark.to === "24:00") day.all_day = true;
    else day.ranges.push({ start: mark.from, end: mark.to });
  }
  for (const day of preference.days) day.ranges.sort((left, right) => left.start.localeCompare(right.start));
  return preference;
}

/** A saved week as the Schedule's weekly marks. */
function toMarks(preference: Preference): Employee["unavailable"] {
  const marks: Employee["unavailable"] = [];
  for (const day of preference.days) {
    if (day.all_day) { marks.push({ weekday: day.day, from: "00:00", to: "24:00" }); continue; }
    for (const range of day.ranges) marks.push({ weekday: day.day, from: range.start, to: range.end });
    for (const typeId of day.shift_type_ids) {
      const type = world.shift_types.find((item) => item.id === typeId);
      if (!type) continue;
      // An overnight type is unavailable to midnight on its own day.
      const end = minutesOf(type.default_end_time) <= minutesOf(type.default_start_time) ? "24:00" : type.default_end_time;
      marks.push({ weekday: day.day, from: type.default_start_time, to: end });
    }
  }
  return marks;
}

function seed(): AvailabilityData {
  const byName = (name: string) => world.employees.find((item) => item.display_name === name)!;
  // Who has not sent their week yet.
  const missing = new Set(["Ethan Brooks", "Luis Hernandez", "Noah Garcia", "Olivia Chen", "Sam Okafor"]);
  const employee: Record<string, EmployeeRecord> = {};
  world.employees.forEach((person, index) => {
    if (missing.has(person.display_name)) return;
    employee[person.id] = { revision: person.unavailable.length ? 2 : 1, updated_at: ago(3 + (index % 9)), preference: fromMarks(person.unavailable) };
  });
  const notes = (byDay: Record<number, string>) => Array.from({ length: 7 }, (_, day) => byDay[day] ?? "");
  const reminder = (name: string, byDay: Record<number, string>, days: number): [string, ManagerRecord] => {
    const person = byName(name);
    return [person.id, { revision: 1, updated_at: ago(days), preference: fromMarks(person.unavailable), enabled: true, notes: notes(byDay) }];
  };
  return {
    settings: { input_mode: "time_range", onboarding_required: true, revision: 3 },
    employee,
    manager: Object.fromEntries([
      reminder("Priya Patel", { 1: "Class until 1:30 PM; can start at 2 PM at the earliest." }, 12),
      reminder("Jake Thompson", { 5: "Prefers the Uptown bar on Fridays.", 6: "Prefers the Uptown bar on Saturdays." }, 20),
      reminder("Aisha Johnson", { 5: "Second job Friday nights: lunch only." }, 8),
    ]),
    commands: {},
  };
}

const store = domainStore("availability", seed);

// ---------- who may read and write ----------

const permissions = () => shared.permissionsForRole(viewerRole) as readonly string[];
const places = () => (viewerRole === "owner" ? world.locations.map((location) => location.id) : [LOC.downtown]);

/** weekly_preference_manager_scope: a person at one of the reader's locations. */
function inScope(person: Employee, permission: "availability.read" | "availability.manage"): boolean {
  if (viewerRole === "employee" || !permissions().includes(permission)) return false;
  return person.location_ids.some((id) => places().includes(id));
}

function person(id: string): Employee {
  const found = world.employees.find((item) => item.id === id);
  if (!found) fail(403, "Not allowed", "authz.out_of_scope");
  return found;
}

function shiftTypes() {
  return [...world.shift_types]
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
    .map((type) => ({
      id: type.id,
      name: type.name,
      start_time: type.default_start_time || null,
      end_time: type.default_end_time || null,
      archived: false,
      selectable: Boolean(type.default_start_time && type.default_end_time && type.default_start_time !== type.default_end_time),
    }));
}

const settingsRecord = () => ({ ...store.data.settings });

function readModel(employeeId: string) {
  const target = person(employeeId);
  const own = target.id === viewers[viewerRole].employeeId;
  const canManage = inScope(target, "availability.manage");
  const canRead = inScope(target, "availability.read");
  if (!own && !canRead && !canManage) fail(403, "Not allowed", "authz.out_of_scope");
  const mode = store.data.settings.input_mode;
  const saved = store.data.employee[target.id];
  const reminder = store.data.manager[target.id];
  return {
    employee_id: target.id,
    employee_name: target.display_name,
    can_edit_employee: own,
    can_manage: canManage,
    settings: settingsRecord(),
    employee: saved
      ? { revision: saved.revision, submitted: true, updated_at: saved.updated_at, preference: saved.preference }
      : { revision: 0, submitted: false, updated_at: null, preference: emptyPreference(mode) },
    // The reader who may not see the reminders gets null (their own week included).
    manager: canManage || canRead
      ? reminder
        ? { revision: reminder.revision, submitted: true, updated_at: reminder.updated_at, preference: reminder.preference, enabled: reminder.enabled, notes: reminder.notes }
        : { revision: 0, submitted: false, updated_at: null, preference: emptyPreference(mode), enabled: true, notes: ["", "", "", "", "", "", ""] }
      : null,
    shift_types: shiftTypes(),
    time_format: "12h" as const,
  };
}

// ---------- validation ----------

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

function validPreference(value: any, mode: Mode): value is Preference {
  if (!value || value.input_mode !== mode || !Array.isArray(value.days) || value.days.length !== 7) return false;
  if (new Set(value.days.map((day: Day) => day.day)).size !== 7) return false;
  const types = shiftTypes().filter((type) => type.selectable).map((type) => type.id);
  return value.days.every((day: Day) => {
    if (!Number.isInteger(day.day) || day.day < 0 || day.day > 6 || typeof day.all_day !== "boolean") return false;
    if (!Array.isArray(day.ranges) || !Array.isArray(day.shift_type_ids)) return false;
    if (day.all_day && (day.ranges.length || day.shift_type_ids.length)) return false;
    if (mode === "time_range" ? day.shift_type_ids.length : day.ranges.length) return false;
    if (!day.shift_type_ids.every((id) => types.includes(id))) return false;
    return day.ranges.every((range, index) => CLOCK.test(range.start) && END.test(range.end) && range.end > range.start
      && (index === 0 || range.start > day.ranges[index - 1]!.end));
  });
}

/** A mode change converts every saved week (AVAIL-001). */
function convert(preference: Preference, mode: Mode): Preference {
  if (preference.input_mode === mode) return preference;
  const types = shiftTypes().filter((type) => type.selectable);
  return {
    input_mode: mode,
    days: preference.days.map((day) => {
      if (day.all_day) return { day: day.day, all_day: true, shift_type_ids: [], ranges: [] };
      if (mode === "shift_type") {
        // A type is unavailable when any marked hour falls in its default hours.
        const ids = types.filter((type) => day.ranges.some((range) => {
          const start = minutesOf(type.start_time!);
          let end = minutesOf(type.end_time!);
          if (end <= start) end = 24 * 60;
          return minutesOf(range.start) < end && start < (range.end === "24:00" ? 24 * 60 : minutesOf(range.end));
        })).map((type) => type.id);
        return { day: day.day, all_day: false, shift_type_ids: ids, ranges: [] };
      }
      // The marked types' hours, merged into ranges.
      const spans = day.shift_type_ids
        .map((id) => types.find((type) => type.id === id))
        .filter(Boolean)
        .map((type) => {
          const end = minutesOf(type!.end_time!) <= minutesOf(type!.start_time!) ? "24:00" : type!.end_time!;
          return { start: type!.start_time!, end };
        })
        .sort((left, right) => left.start.localeCompare(right.start));
      const ranges: { start: string; end: string }[] = [];
      for (const span of spans) {
        const last = ranges[ranges.length - 1];
        if (last && span.start <= last.end) last.end = span.end > last.end ? span.end : last.end;
        else ranges.push({ ...span });
      }
      return { day: day.day, all_day: false, shift_type_ids: [], ranges };
    }),
  };
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------- routes ----------

export function availabilityRoutes(route: Route): void {
  const base = "/v1/workspaces/:workspaceId/availability";

  route("GET", `${base}/weekly/team`, () => {
    if (viewerRole === "employee" || !permissions().includes("availability.read")) fail(403, "Not allowed", "authz.missing_permission");
    const mode = store.data.settings.input_mode;
    return {
      locations: world.locations.filter((location) => places().includes(location.id)).map((location) => ({ id: location.id, name: location.name })),
      time_format: "12h",
      shift_types: shiftTypes(),
      employees: world.employees
        .filter((employee) => employee.location_ids.some((id) => places().includes(id)))
        .sort((left, right) => left.display_name.localeCompare(right.display_name))
        .map((employee) => ({
          id: employee.id,
          display_name: employee.display_name,
          employee_code: employee.employee_code,
          location_ids: employee.location_ids,
          submitted: Boolean(store.data.employee[employee.id]),
          preference: store.data.employee[employee.id]?.preference ?? emptyPreference(mode),
          can_open: inScope(employee, "availability.manage"),
        })),
    };
  });

  route("GET", `${base}/weekly`, ({ query }) => {
    const employeeId = query.get("employee_id") ?? viewers[viewerRole].employeeId;
    // Owners and managers have no employee record of their own here.
    if (!employeeId) fail(403, "Not allowed", "authz.out_of_scope");
    return readModel(employeeId);
  });

  route("POST", `${base}/weekly`, ({ body }) => {
    const key = `${viewerRole}:${JSON.stringify(body)}`;
    const target = person(body?.employee_id);
    const model = readModel(target.id);
    const source = body?.source;
    if (source !== "employee" && source !== "manager") fail(400, "Choose whose week to save");
    if (source === "employee" && !model.can_edit_employee) fail(403, "Not allowed", "authz.out_of_scope");
    if (source === "manager" && !model.can_manage) fail(403, "Not allowed", "authz.out_of_scope");
    // The same save sent again (an uncertain network) answers the same.
    if (store.data.commands[key]) return { model };
    const mode = store.data.settings.input_mode;
    if (body.preference?.input_mode !== mode) fail(409, "Use the current organization entry mode");
    if (!validPreference(body.preference, mode)) fail(400, "Check the weekly unavailable hours");
    const prior = source === "employee" ? model.employee : model.manager!;
    if (body.expected_revision !== prior.revision) fail(409, "Availability changed. Reload before saving; your draft has not been saved.");
    if (body.settings_revision !== store.data.settings.revision) fail(409, "Availability settings changed. Reload before saving.");
    const preference: Preference = { input_mode: mode, days: [...body.preference.days].sort((left: Day, right: Day) => left.day - right.day) };
    const now = new Date().toISOString();
    if (source === "employee") {
      if (body.notes !== undefined || body.enabled !== undefined || body.copy_employee_revision !== undefined) {
        fail(403, "Manager fields cannot be saved with employee preferences", "authz.out_of_scope");
      }
      const submitted = Boolean(store.data.employee[target.id]);
      const before = store.data.employee[target.id]?.preference ?? emptyPreference(mode);
      store.data.employee[target.id] = { revision: prior.revision + 1, updated_at: now, preference };
      // The Schedule's availability reads the employee's own week.
      target.unavailable = toMarks(preference);
      persist();
      const changed = preference.days
        .filter((day) => JSON.stringify(day) !== JSON.stringify(before.days.find((item) => item.day === day.day)))
        .map((day) => dayNames[day.day]);
      // A save that changes no day is news only the first time (S-32; BL-790).
      if (changed.length || !submitted) notifyPeople({
        roles: ["owner", "admin", "manager"],
        locationIds: target.location_ids,
        exceptUserId: viewer.userId,
        category: "requests",
        type_key: "availability.weekly_updated",
        title: `Availability updated: ${target.display_name}`,
        body: `Weekly availability updated. ${changed.length ? `Changed days: ${changed.join(", ")}.` : "Week confirmed."}`,
        action_url: `/app/availability?employeeId=${target.id}&section=availability`,
        subject_type: "weekly_availability",
        subject_id: target.id,
      });
    } else {
      const notes: unknown = body.notes;
      if (typeof body.enabled !== "boolean" || !Array.isArray(notes) || notes.length !== 7
        || notes.some((note) => typeof note !== "string" || note.length > 1000)) {
        fail(400, "Include reminder state and seven valid notes");
      }
      if (body.copy_employee_revision !== undefined
        && (body.copy_employee_revision !== model.employee.revision || JSON.stringify(preference) !== JSON.stringify(model.employee.preference))) {
        fail(409, "Employee preferences changed. Copy the latest saved week again.");
      }
      const previous = store.data.manager[target.id];
      if (previous && !previous.enabled && !body.enabled && JSON.stringify(previous.preference) !== JSON.stringify(preference)) {
        fail(400, "Turn reminders on before editing or copying");
      }
      store.data.manager[target.id] = {
        revision: prior.revision + 1, updated_at: now, preference, enabled: body.enabled,
        notes: (notes as string[]).map((note) => note.trim()),
      };
    }
    store.data.commands[key] = now;
    store.save();
    return { model: readModel(target.id) };
  });

  const settingsRead = () => ({
    settings: settingsRecord(),
    can_edit: permissions().includes("settings.schedule_rules.manage"),
    missing_shift_types: [],
  });

  route("GET", `${base}/weekly/settings`, () => {
    if (viewerRole === "employee") fail(403, "Not allowed", "authz.missing_permission");
    return settingsRead();
  });

  route("POST", `${base}/weekly/settings`, ({ body }) => {
    if (!settingsRead().can_edit) fail(403, "Not allowed", "authz.missing_permission");
    if (!["shift_type", "time_range"].includes(body?.input_mode) || typeof body?.onboarding_required !== "boolean"
      || !Number.isInteger(body?.expected_revision)) {
      fail(400, "Provide valid availability settings.");
    }
    if (body.expected_revision !== store.data.settings.revision) fail(409, "Availability settings changed. Reload before saving.");
    const mode = body.input_mode as Mode;
    if (mode !== store.data.settings.input_mode) {
      for (const record of [...Object.values(store.data.employee), ...Object.values(store.data.manager)]) {
        record.preference = convert(record.preference, mode);
      }
    }
    store.data.settings = { input_mode: mode, onboarding_required: body.onboarding_required, revision: store.data.settings.revision + 1 };
    store.save();
    return settingsRead();
  });
}
