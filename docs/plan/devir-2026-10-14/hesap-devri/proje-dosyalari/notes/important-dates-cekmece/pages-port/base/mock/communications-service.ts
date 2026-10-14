// Demo backend for communications: announcements (list, write, publish,
// unpublish, archive, restore, acknowledge) and the notification inbox (the
// page, the sidebar badge, the account inbox). Mirrors get_announcements_service,
// save_announcement_audience_service, publish_announcement_service,
// set_announcement_state_service, acknowledge_announcement_service and the
// inbox functions in supabase/schema.sql at the level the screens show.
import { ApiError, type Handler } from "./api";
import { domainStore } from "./store";
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { viewerRole } from "./viewer";
/** The three demo voices the notices and announcements were written for (admin reads as owner, a Shift Lead as manager). */
type Role = "owner" | "manager" | "employee";
import {
  DEPT, JOB, LOC, MANAGER_NAME, MANAGER_USER_ID, OWNER_NAME, OWNER_USER_ID, WORKSPACE_ID, ZONE,
  viewer, viewers, world,
} from "./world";

type Route = (method: string, path: string, handler: Handler) => void;

const nowIso = () => new Date().toISOString();
const ago = (minutes: number) => iso(Date.now() - minutes * 60_000);
const HOUR = 60;
const DAY = 24 * 60;

function fail(status: number, error: string, reason?: string): never {
  throw new ApiError(status, reason ? { error, reason } : { error });
}

// ---------- shared: locations and who a message reaches ----------

const addresses: Record<string, { street: string; city: string; region: string; postal: string; phone: string }> = {
  [LOC.downtown]: { street: "120 Water Street", city: "New York", region: "NY", postal: "10005", phone: "+12125550142" },
  [LOC.uptown]: { street: "2280 Broadway", city: "New York", region: "NY", postal: "10024", phone: "+12125550187" },
};

/** A location as locationSchema reads it. */
export function locationRecord(location: (typeof world.locations)[number]) {
  const address = addresses[location.id];
  return {
    id: location.id,
    workspace_id: WORKSPACE_ID,
    name: location.name,
    short_name: location.short_name,
    phone: address?.phone ?? null,
    street_address: address?.street ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postal_code: address?.postal ?? "",
    country_code: "US",
    timezone: location.timezone,
    sort_order: location.sort_order,
    archived_at: null,
  };
}

export interface Audience {
  roles?: string[];
  locationIds: string[];
  departmentIds?: string[];
  jobIds?: string[];
}

/** The facts the atlas knows about each person it can sign in as. */
function personOf(role: Role) {
  const employee = role === "employee" ? world.employees.find((item) => item.id === viewers.employee.employeeId) : undefined;
  return {
    role,
    locationIds: role === "owner" ? world.locations.map((location) => location.id) : employee?.location_ids ?? [LOC.downtown],
    jobIds: employee?.job_ids ?? [],
    departmentIds: employee ? [...new Set(employee.job_ids.map((id) => world.jobs.find((job) => job.id === id)?.department_id).filter(Boolean) as string[])] : [],
  };
}

/** Does a message for this audience reach the person signed in as `role`? */
export function reachesRole(role: Role, audience: Audience): boolean {
  const person = personOf(role);
  if (audience.roles?.length && !audience.roles.includes(role)) return false;
  if (audience.locationIds.length && !audience.locationIds.some((id) => person.locationIds.includes(id))) return false;
  if (audience.departmentIds?.length && !audience.departmentIds.some((id) => person.departmentIds.includes(id))) return false;
  if (audience.jobIds?.length && !audience.jobIds.some((id) => person.jobIds.includes(id))) return false;
  return true;
}

/** How many people of the workspace an audience reaches (16 employees, a manager, the owner). */
export function audienceSize(audience: Audience): number {
  const employees = world.employees.filter((employee) => {
    if (audience.roles?.length && !audience.roles.includes("employee")) return false;
    if (audience.locationIds.length && !audience.locationIds.some((id) => employee.location_ids.includes(id))) return false;
    const departments = employee.job_ids.map((id) => world.jobs.find((job) => job.id === id)?.department_id);
    if (audience.departmentIds?.length && !audience.departmentIds.some((id) => departments.includes(id))) return false;
    if (audience.jobIds?.length && !audience.jobIds.some((id) => employee.job_ids.includes(id))) return false;
    return true;
  }).length;
  const staff = (["owner", "manager"] as const).filter((role) => reachesRole(role, audience)).length;
  return employees + staff;
}

// ---------- notifications ----------

type Category = "announcement" | "request" | "schedule" | "security" | "requests" | "payroll" | "people" | "communications" | "system";

interface Notice {
  id: string;
  scope: "account" | "workspace";
  category: Category;
  type_key: string;
  severity: "info" | "success" | "warning" | "action_required";
  title: string;
  body: string;
  action_url: string | null;
  source_type: string;
  source_id: string | null;
  created_at: string;
  seen_at: string | null;
  read_at: string | null;
  dismissed: boolean;
}

function notice(
  minutesAgo: number,
  fields: Pick<Notice, "category" | "type_key" | "severity" | "title" | "body" | "action_url" | "source_type"> & { read?: boolean; scope?: "account"; source_id?: string | null },
): Notice {
  const created = ago(minutesAgo);
  return {
    id: uuid(),
    scope: fields.scope ?? "workspace",
    category: fields.category,
    type_key: fields.type_key,
    severity: fields.severity,
    title: fields.title,
    body: fields.body,
    action_url: fields.action_url,
    source_type: fields.source_type,
    source_id: fields.source_id ?? uuid(),
    created_at: created,
    seen_at: fields.read ? created : null,
    read_at: fields.read ? ago(Math.max(minutesAgo - 30, 1)) : null,
    dismissed: false,
  };
}

/** "Sat, Oct 18", as the termination notice writes a shift's day. */
const dayLine = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The first Sunday of November: clocks go back. */
function dstEnd(): string {
  const today = todayIn(ZONE);
  const year = Number(today.slice(0, 4));
  const of = (y: number) => {
    const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
    return `${y}-11-${String(1 + ((7 - first) % 7)).padStart(2, "0")}`;
  };
  return of(year) >= today ? of(year) : of(year + 1);
}

function seedNotices(ids: { announcements: Record<string, string> }): Record<Role, Notice[]> {
  const thisWeek = mondayOf(todayIn(ZONE));
  const nextWeek = addDays(thisWeek, 7);
  const published = iso(localInstant(addDays(thisWeek, -4), "15:20", ZONE));
  const publishedMinutes = Math.max(Math.round((Date.now() - Date.parse(published)) / 60_000), 5);
  const dst = dstEnd();
  const minutesSince = (date: string, clock: string) => Math.max(Math.round((Date.now() - localInstant(date, clock, ZONE)) / 60_000), 5);
  const security = (minutes: number, title: string, body: string): Notice =>
    notice(minutes, { scope: "account", category: "security", type_key: "security.new_sign_in", severity: "info", title, body, action_url: null, source_type: "account", read: true });
  const dstNotice = (minutes: number) => notice(minutes, {
    category: "system", type_key: "system.daylight_saving", severity: "info",
    title: `Clocks go back on ${shortDate(dst)}`,
    body: "Overnight shifts that night run one hour longer. Schedule shows the extra hour.",
    action_url: null, source_type: "system",
  });
  const announcement = (key: string, minutes: number, title: string, read: boolean) => notice(minutes, {
    category: "communications", type_key: "communications.announcement.available", severity: "info",
    title: `New announcement: ${title}`, body: "Open Announcements to read it.",
    action_url: `/app/announcements/${ids.announcements[key]}`, source_type: "announcement", source_id: ids.announcements[key] ?? null, read,
  });
  return {
    owner: [
      notice(3 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Tom Becker", body: `${shortDate(addDays(nextWeek, 2))} · Jury duty summons. Waiting for your review.`, action_url: "/app/schedule/requests", source_type: "time_off_request" }),
      notice(5 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Ethan Brooks", body: "Family emergency. His shifts in the next two days would open.", action_url: "/app/schedule/requests", source_type: "time_off_request" }),
      notice(2 * HOUR + 10, { category: "requests", type_key: "requests.shift_change.submitted", severity: "action_required", title: "Shift swap needs approval", body: "Jake Thompson and Noah Garcia want to swap Saturday dinner at Uptown.", action_url: "/app/schedule/requests", source_type: "shift_exchange_case" }),
      notice(5 * HOUR, { category: "requests", type_key: "availability.weekly_updated", severity: "info", title: "Availability updated: Sophie Martin", body: "Sophie is no longer available on Sundays, starting next week.", action_url: "/app/availability", source_type: "weekly_availability" }),
      notice(1 * DAY + 3 * HOUR, { category: "people", type_key: "people.employee_document.expiring", severity: "warning", title: "Food handler card expiring", body: "Luis Hernandez's food handler card expires in 14 days.", action_url: "/app/employees/documents", source_type: "employee_document" }),
      announcement("cooler", 1 * DAY + 5 * HOUR, "Walk-in cooler repair on Tuesday", false),
      dstNotice(2 * DAY),
      notice(publishedMinutes, { category: "schedule", type_key: "schedule.published", severity: "success", title: "Downtown schedule published", body: `Week of ${shortDate(thisWeek)} · 52 shifts, 3 open.`, action_url: "/app/schedule", source_type: "schedule_publication", read: true }),
      security(3 * DAY + 2 * HOUR, "New sign-in to your account", "Chrome on Windows · New York, NY. If this wasn't you, change your password."),
      notice(6 * DAY, { category: "people", type_key: "people.invitation_accepted", severity: "success", title: "Emma Wilson joined Harbor & Vine", body: "She accepted her invitation and finished onboarding.", action_url: "/app/employees", source_type: "employee", read: true }),
      notice(50 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Sophie Martin", body: `${shortDate(addDays(nextWeek, 7))} – ${shortDate(addDays(nextWeek, 9))} · Visiting family in Chicago.`, action_url: "/app/schedule/requests", source_type: "time_off_request", read: true }),
      security(12 * DAY, "Your password was changed", "If you didn't change it, reset your password now."),
    ],
    manager: [
      notice(3 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Tom Becker", body: `${shortDate(addDays(nextWeek, 2))} · Jury duty summons. Waiting for your review.`, action_url: "/app/schedule/requests", source_type: "time_off_request" }),
      notice(5 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Ethan Brooks", body: "Family emergency. His shifts in the next two days would open.", action_url: "/app/schedule/requests", source_type: "time_off_request" }),
      notice(3 * HOUR, { category: "requests", type_key: "requests.shift_change.submitted", severity: "action_required", title: "Shift swap needs approval", body: "Maria Lopez wants to give away her Friday lunch shift. Ethan Brooks offered to take it.", action_url: "/app/schedule/requests", source_type: "shift_exchange_case" }),
      notice(5 * HOUR, { category: "requests", type_key: "availability.weekly_updated", severity: "info", title: "Availability updated: Sophie Martin", body: "Sophie is no longer available on Sundays, starting next week.", action_url: "/app/availability", source_type: "weekly_availability" }),
      announcement("holiday", 3 * DAY, "Holiday time-off requests are open", false),
      notice(1 * DAY + 3 * HOUR, { category: "people", type_key: "people.employee_document.expiring", severity: "warning", title: "Food handler card expiring", body: "Luis Hernandez's food handler card expires in 14 days.", action_url: "/app/employees/documents", source_type: "employee_document", read: true }),
      dstNotice(2 * DAY),
      notice(publishedMinutes, { category: "schedule", type_key: "schedule.published", severity: "success", title: "Downtown schedule published", body: `Mert Tepebas published the week of ${shortDate(thisWeek)}.`, action_url: "/app/schedule", source_type: "schedule_publication", read: true }),
      announcement("pos", 6 * DAY, "New POS terminals: training this week", true),
      security(9 * DAY, "New sign-in to your account", "Safari on Mac · New York, NY. If this wasn't you, change your password."),
      // The owner ended Brian Foster's employment 24 days ago; his two unstarted
      // Downtown shifts opened and the Downtown manager was told (BL-768).
      notice(minutesSince(addDays(todayIn(ZONE), -24), "23:00"), { category: "schedule", type_key: "schedule.termination.shifts_unassigned", severity: "action_required", title: "Brian's 2 shifts are unassigned", body: `${dayLine(addDays(todayIn(ZONE), -22))}, 5:00 PM–11:00 PM (Downtown); ${dayLine(addDays(todayIn(ZONE), -20))}, 11:00 AM–4:00 PM (Downtown)`, action_url: `/app/schedule?date=${addDays(todayIn(ZONE), -22)}`, source_type: "employee_termination", read: true }),
    ],
    employee: [
      notice(3 * HOUR, { category: "requests", type_key: "requests.shift_change.status_changed", severity: "info", title: "Ethan offered to take your shift", body: "Your Friday lunch shift is waiting for Rachel Adams to approve the change.", action_url: "/app/employee-hub/shift-hub", source_type: "shift_exchange_case" }),
      announcement("cooler", 1 * DAY + 5 * HOUR, "Walk-in cooler repair on Tuesday", false),
      announcement("holiday", 3 * DAY, "Holiday time-off requests are open", false),
      notice(publishedMinutes, { category: "schedule", type_key: "schedule.published", severity: "info", title: "Your schedule is ready", body: `Week of ${shortDate(thisWeek)}: 4 shifts at Harbor & Vine Downtown.`, action_url: "/app/employee-hub", source_type: "schedule_publication", read: true }),
      notice(6 * DAY, { category: "schedule", type_key: "schedule.important_date.available", severity: "info", title: "Closed: Kitchen deep clean & hood service", body: `Downtown is closed on ${shortDate(addDays(thisWeek, 15))}.`, action_url: "/app/employee-hub/schedule", source_type: "important_date", read: true }),
      announcement("pos", 6 * DAY, "New POS terminals: training this week", true),
      notice(minutesSince(addDays(thisWeek, -2), "10:31"), { category: "requests", type_key: "requests.time_off.status_changed", severity: "success", title: "Time off approved: Cousin's wedding in San Diego", body: `${shortDate(addDays(nextWeek, 9))} – ${shortDate(addDays(nextWeek, 10))}. Rachel Adams: "Have a great time!"`, action_url: "/app/employee-hub/my-availability", source_type: "time_off_request", read: true }),
      notice(minutesSince(addDays(thisWeek, -14), "09:40"), { category: "requests", type_key: "requests.time_off.status_changed", severity: "success", title: "Time off approved: Family trip", body: `${shortDate(addDays(thisWeek, 2))} – ${shortDate(addDays(thisWeek, 3))}. Rachel Adams approved your request.`, action_url: "/app/employee-hub/my-availability", source_type: "time_off_request", read: true }),
      security(1 * DAY, "New sign-in to your account", "Safari on iPhone · Brooklyn, NY. If this wasn't you, change your password."),
    ],
  };
}

// ---------- announcements ----------

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: "general" | "operations" | "schedule";
  status: "draft" | "scheduled" | "published" | "unpublished";
  audience_roles: string[];
  location_ids: string[];
  department_ids: string[];
  job_ids: string[];
  archived_at: string | null;
  publish_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  action_url: string | null;
  author_user_id: string;
  author_name: string;
  revision: number;
  content_revision: number;
  delivered_to: number;
  /** Acknowledged by people the atlas does not sign in as. */
  other_acknowledgements: number;
  /** The three atlas people: when they read and acknowledged it. */
  read: Partial<Record<Role, string>>;
  acknowledged: Partial<Record<Role, string>>;
  acknowledged_before: Role[];
  created_at: string;
  updated_at: string;
}

function seedAnnouncements(): Announcement[] {
  const thisWeek = mondayOf(todayIn(ZONE));
  const base = (fields: Partial<Announcement> & Pick<Announcement, "title" | "body" | "category" | "status">, minutesAgo: number, by: "owner" | "manager"): Announcement => {
    const created = ago(minutesAgo);
    const published = fields.status === "published" || fields.status === "unpublished" ? created : null;
    return {
      id: uuid(),
      audience_roles: [],
      location_ids: [],
      department_ids: [],
      job_ids: [],
      archived_at: null,
      publish_at: published,
      published_at: published,
      expires_at: null,
      action_url: null,
      author_user_id: by === "owner" ? OWNER_USER_ID : MANAGER_USER_ID,
      author_name: by === "owner" ? OWNER_NAME : MANAGER_NAME,
      revision: 1,
      content_revision: 1,
      delivered_to: 0,
      other_acknowledgements: 0,
      read: {},
      acknowledged: {},
      acknowledged_before: [],
      created_at: created,
      updated_at: created,
      ...fields,
    };
  };
  const items: Announcement[] = [
    base({
      title: "Holiday time-off requests are open",
      body: "Send your time-off requests for Thanksgiving through New Year's by the end of the month. New Year's Eve is a blackout date: no time off that night. We'll confirm every request within a week.",
      category: "schedule", status: "published", action_url: "/app/employee-hub", other_acknowledgements: 9,
    }, 3 * DAY, "owner"),
    base({
      title: "New POS terminals: training this week",
      body: "The new handheld terminals arrive Wednesday. Every server and bartender does a 20-minute training before their shift; managers sign you off. Old terminals go away on Monday.",
      category: "operations", status: "published", audience_roles: ["manager", "employee"],
      expires_at: iso(Date.now() + 10 * 86_400_000), other_acknowledgements: 12, read: { employee: ago(5 * DAY), manager: ago(6 * DAY) }, acknowledged: { employee: ago(5 * DAY) },
    }, 6 * DAY, "owner"),
    base({
      title: "Walk-in cooler repair on Tuesday",
      body: "The technician arrives at 7 AM. Keep the walk-in door closed; prep moves proteins to the reach-ins by 6:30. Expect the lunch prep list to start 30 minutes late.",
      category: "operations", status: "published", location_ids: [LOC.downtown], other_acknowledgements: 3,
    }, 1 * DAY + 5 * HOUR, "manager"),
    base({
      title: "Hartwell buyout: staffing",
      body: "Uptown is closed to the public for a 120-guest private event. We need 6 servers and 2 bartenders from 5:30 PM. Pick up the open shifts in Shift Hub.",
      category: "schedule", status: "published", location_ids: [LOC.uptown], job_ids: [JOB.server, JOB.bartender], other_acknowledgements: 4,
    }, 2 * DAY, "owner"),
    base({
      title: "Fall menu tasting notes",
      body: "Thanks for tasting the fall menu. Key talking points: the braised short rib is gluten free, the squash risotto can be made vegan, and the cider spritz is our new happy hour special.",
      category: "general", status: "published", location_ids: [LOC.downtown], department_ids: [DEPT.foh],
      other_acknowledgements: 4, read: { employee: ago(9 * DAY) }, acknowledged: { employee: ago(9 * DAY) },
    }, 10 * DAY, "manager"),
    base({
      title: "Thanksgiving prix fixe menu",
      body: "Thanksgiving is prix fixe only: three courses at $65, seatings from noon to 7 PM. Menu cards and allergen notes will be at the host stand the week before.",
      category: "general", status: "scheduled", publish_at: iso(localInstant(addDays(thisWeek, 11), "10:00", ZONE)),
    }, 1 * DAY, "owner"),
    base({
      title: "Winter uniform update",
      body: "Starting in November, front of house wears the new charcoal aprons. Pick yours up from the office; we'll collect the old ones.",
      category: "general", status: "draft", audience_roles: ["employee"],
    }, 4 * HOUR, "owner"),
    base({
      title: "Server section rotation",
      body: "Sections rotate every Monday from next week. Check the host stand chart before your first table.",
      category: "operations", status: "draft", location_ids: [LOC.downtown], job_ids: [JOB.server],
    }, 2 * HOUR, "manager"),
    base({
      title: "Labor Day brunch hours",
      body: "Brunch runs until 3 PM on Labor Day. Dinner service starts at 5 PM as usual.",
      category: "schedule", status: "published", expires_at: ago(30 * DAY), other_acknowledgements: 11,
      read: { employee: ago(34 * DAY), manager: ago(35 * DAY) },
    }, 36 * DAY, "owner"),
    base({
      title: "Summer patio hours",
      body: "The patio opens at 4 PM on weekdays and noon on weekends through Labor Day.",
      category: "operations", status: "published", archived_at: ago(20 * DAY), other_acknowledgements: 14,
    }, 80 * DAY, "owner"),
  ];
  for (const item of items) {
    if (item.status === "published") item.delivered_to = audienceSize(audienceOf(item));
    if (item.archived_at) item.revision = 2;
  }
  return items;
}

const audienceOf = (item: Pick<Announcement, "audience_roles" | "location_ids" | "department_ids" | "job_ids">): Audience => ({
  roles: item.audience_roles, locationIds: item.location_ids, departmentIds: item.department_ids, jobIds: item.job_ids,
});

function seed() {
  const announcements = seedAnnouncements();
  const keyed = {
    holiday: announcements[0]!.id,
    pos: announcements[1]!.id,
    cooler: announcements[2]!.id,
  };
  return { announcements, notices: seedNotices({ announcements: keyed }), replays: [] as { key: string; at: number; result: unknown }[] };
}

const store = domainStore("communications", seed);

/**
 * PAGES: the desktop and phone frames both run a scenario's clicks, so the
 * same write can arrive twice within moments (the other frame's result is
 * already in the shared store). The second gets the first one's answer.
 */
function replayed<T>(what: unknown, run: () => T): T {
  const key = `${viewerRole}:${JSON.stringify(what)}`;
  const now = Date.now();
  const list = (store.data.replays ?? []).filter((one) => now - one.at < 4_000);
  store.data.replays = list;
  const hit = list.find((one) => one.key === key);
  if (hit) return hit.result as T;
  const result = run();
  list.push({ key, at: now, result });
  store.save();
  return result;
}

// ---------- notification helpers other areas use ----------

/** Puts a notification in the inbox of each atlas person a change reaches. */
export function notifyPeople(input: {
  locationIds: string[];
  roles?: string[];
  departmentIds?: string[];
  jobIds?: string[];
  exceptUserId?: string;
  category: Category;
  type_key: string;
  severity?: Notice["severity"];
  title: string;
  body: string;
  action_url: string | null;
  subject_type: string;
  subject_id: string | null;
}): void {
  for (const role of ["owner", "manager", "employee"] as const) {
    if (viewers[role].userId === input.exceptUserId) continue;
    if (!reachesRole(role, { roles: input.roles, locationIds: input.locationIds, departmentIds: input.departmentIds, jobIds: input.jobIds })) continue;
    const list = store.data.notices[role];
    // A newer version of the same subject replaces the old one (superseded).
    for (const item of list) {
      if (item.source_id === input.subject_id && item.type_key === input.type_key) item.dismissed = true;
    }
    list.unshift({
      id: uuid(), scope: "workspace", category: input.category, type_key: input.type_key,
      severity: input.severity ?? "info", title: input.title, body: input.body, action_url: input.action_url,
      source_type: input.subject_type, source_id: input.subject_id, created_at: nowIso(), seen_at: null, read_at: null, dismissed: false,
    });
  }
  store.save();
}

/** An account security notice for the signed-in person (mandatory, in-app). */
export function notifyAccount(input: { type_key: string; title: string; body: string; severity?: Notice["severity"] }): void {
  store.data.notices[viewerRole].unshift({
    id: uuid(), scope: "account", category: "security", type_key: input.type_key, severity: input.severity ?? "info",
    title: input.title, body: input.body, action_url: null, source_type: "account", source_id: uuid(),
    created_at: nowIso(), seen_at: null, read_at: null, dismissed: false,
  });
  store.save();
}

/** Withdraws the notifications about a subject (an unpublished or archived record). */
export function withdrawNotices(subjectId: string): void {
  for (const role of ["owner", "manager", "employee"] as const) {
    for (const item of store.data.notices[role]) if (item.source_id === subjectId) item.dismissed = true;
  }
  store.save();
}

const myNotices = (accountOnly: boolean) =>
  store.data.notices[viewerRole].filter((item) => !item.dismissed && (!accountOnly || item.scope === "account"));

// PAGES: a shift change notice opens its request (?case=<id>), as the real
// notifier writes it. The hub's requests are seeded apart from these notices,
// so the link is made when the notice is read (hub-exchanges.ts says which).
let shiftCaseOf: (role: Role) => string | null = () => null;
export function linkShiftCases(find: (role: Role) => string | null): void {
  shiftCaseOf = find;
}
function withCase(item: Notice): string | null {
  if (!item.action_url || !item.type_key.startsWith("requests.shift_change.") || item.action_url.includes("case=")) return item.action_url;
  const id = shiftCaseOf(viewerRole);
  return id ? `${item.action_url}${item.action_url.includes("?") ? "&" : "?"}case=${id}` : item.action_url;
}

/** PAGES setups (hub-setups.ts): the communications demo data and its save. */
export const commsData = () => store.data;
export const saveComms = () => store.save();
export type DemoNotice = Notice;
export { notice as demoNotice };

function noticeRecord(item: Notice) {
  return {
    id: item.id,
    workspace_id: item.scope === "account" ? null : WORKSPACE_ID,
    scope: item.scope,
    category: item.category,
    type_key: item.type_key,
    severity: item.severity,
    safe_preview: item.body,
    title: item.title,
    body: item.body,
    action_url: withCase(item),
    group_key: null,
    source_type: item.source_type,
    source_id: item.source_id,
    created_at: item.created_at,
    seen_at: item.seen_at,
    read_at: item.read_at,
    visibility_state: "visible" as const,
  };
}

export function unreadNoticeCount(): number {
  return myNotices(false).filter((item) => !item.read_at).length;
}

/** The dashboard's newest unread notifications (at most five). */
export function latestNotices(limit = 5) {
  return myNotices(false)
    .filter((item) => item.scope === "workspace" && !item.read_at)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit)
    .map(noticeRecord);
}

function inbox(query: URLSearchParams, accountOnly: boolean) {
  const category = query.get("category");
  const severity = query.get("severity");
  const readState = query.get("read_state") ?? (query.get("unread_only") === "true" ? "unread" : null);
  const limit = Math.min(Math.max(Number(query.get("limit") ?? 30) || 30, 1), 50);
  const offset = Number(query.get("cursor") ?? 0) || 0;
  const sameCategory = (value: string) =>
    value === category
    || (category === "communications" && value === "announcement")
    || (category === "requests" && value === "request");
  const all = myNotices(accountOnly);
  const rows = all
    .filter((item) => !category || sameCategory(item.category))
    .filter((item) => !severity || item.severity === severity)
    .filter((item) => readState === "unread" || readState === "unseen" ? !item.read_at
      : readState === "read" || readState === "seen" ? Boolean(item.read_at) : true)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
  const page = rows.slice(offset, offset + limit);
  return {
    workspace_id: accountOnly ? null : WORKSPACE_ID,
    unread_count: all.filter((item) => !item.read_at).length,
    next_cursor: offset + limit < rows.length ? String(offset + limit) : null,
    notifications: page.map(noticeRecord),
  };
}

function act(body: any, accountOnly: boolean) {
  const action = body?.action;
  if (!["seen", "read", "unread", "dismiss", "read_all"].includes(action)) fail(400, "Valid notification action required");
  const list = myNotices(accountOnly);
  if (action === "read_all") {
    const unread = list.filter((item) => !item.read_at);
    for (const item of unread) { item.read_at = nowIso(); item.seen_at ??= item.read_at; }
    store.save();
    return { status: "saved" as const, affected: unread.length };
  }
  const item = list.find((entry) => entry.id === body?.notification_id);
  if (!item) fail(404, "Notification not found");
  if (action === "seen") item.seen_at ??= nowIso();
  if (action === "read") { item.read_at = nowIso(); item.seen_at ??= item.read_at; }
  if (action === "unread") item.read_at = null;
  if (action === "dismiss") item.dismissed = true;
  // Reading an announcement's notice marks the announcement read too.
  if (action === "read" && item.source_type === "announcement") {
    const announcement = store.data.announcements.find((entry) => entry.id === item.source_id);
    if (announcement) announcement.read[viewerRole] ??= item.read_at!;
  }
  store.save();
  return { status: "saved" as const, affected: 1 };
}

// ---------- announcements: who may do what ----------

/** communication_reason for announcements (K1-K3). */
function controls(item: Pick<Announcement, "location_ids" | "author_user_id">): boolean {
  if (viewerRole === "owner") return true;
  if (viewerRole !== "manager") return false;
  return item.location_ids.length === 1 && item.location_ids[0] === LOC.downtown && item.author_user_id !== OWNER_USER_ID;
}

const expired = (item: Announcement) => Boolean(item.expires_at && Date.parse(item.expires_at) <= Date.now());

/** A published announcement out to this reader (past its end it reaches nobody, K12). */
function reachesMe(item: Announcement): boolean {
  return item.status === "published" && !item.archived_at && !expired(item) && reachesRole(viewerRole, audienceOf(item));
}

const visibleToMe = (item: Announcement) => controls(item) || reachesMe(item);

/** The scheduled release (a cron in the real app): a due scheduled announcement goes out on read. */
function releaseDue(): void {
  let changed = false;
  for (const item of store.data.announcements) {
    if (item.status === "scheduled" && !item.archived_at && item.publish_at && Date.parse(item.publish_at) <= Date.now()) {
      item.status = "published";
      item.published_at = item.publish_at;
      item.delivered_to = audienceSize(audienceOf(item));
      announce(item);
      changed = true;
    }
  }
  if (changed) store.save();
}

function announce(item: Announcement): void {
  notifyPeople({
    roles: item.audience_roles, locationIds: item.location_ids, departmentIds: item.department_ids, jobIds: item.job_ids,
    exceptUserId: item.author_user_id,
    category: "communications", type_key: "communications.announcement.available", severity: "info",
    title: `New announcement: ${item.title}`, body: "Open Announcements to read it.",
    action_url: `/app/announcements/${item.id}`, subject_type: "announcement", subject_id: item.id,
  });
}

function names(ids: string[], list: { id: string; name: string }[]): string[] {
  return ids.map((id) => list.find((item) => item.id === id)?.name ?? "Archived selection");
}

function announcementRecord(item: Announcement) {
  const mine = controls(item);
  const archived = Boolean(item.archived_at);
  const acknowledgedCount = item.other_acknowledgements + Object.keys(item.acknowledged).length;
  return {
    id: item.id,
    workspace_id: WORKSPACE_ID,
    title: item.title,
    body: item.body,
    category: item.category,
    status: item.status,
    display_status: item.status === "published" && expired(item) ? "expired" as const : item.status,
    publish_error_code: null,
    audience_roles: item.audience_roles.length ? item.audience_roles : ["owner", "admin", "manager", "employee"],
    location_ids: item.location_ids,
    location_names: names(item.location_ids, world.locations),
    department_ids: item.department_ids,
    department_names: names(item.department_ids, world.departments),
    job_ids: item.job_ids,
    job_names: names(item.job_ids, world.jobs),
    archived_at: item.archived_at,
    publish_at: item.publish_at,
    published_at: item.published_at,
    expires_at: item.expires_at,
    action_url: item.action_url,
    author_name: item.author_name,
    author_user_id: item.author_user_id,
    revision: item.revision,
    content_revision: item.content_revision,
    acknowledged_count: mine ? acknowledgedCount : undefined,
    recipient_count: mine ? item.delivered_to : null,
    publish_failed_at: null,
    content_changed_since_acknowledged: item.acknowledged_before.includes(viewerRole) && !item.acknowledged[viewerRole],
    created_at: item.created_at,
    updated_at: item.updated_at,
    read_at: item.read[viewerRole] ?? null,
    acknowledged_at: item.acknowledged[viewerRole] ?? null,
    can_edit: mine && !archived,
    can_publish: mine && !archived && ["draft", "scheduled", "unpublished"].includes(item.status),
    can_unpublish: mine && !archived && item.status === "published",
    can_archive: mine && !archived,
    can_restore: mine && archived,
  };
}

/** Published announcements the reader sees, newest first (the dashboard's list). */
export function activeAnnouncements(limit = 5) {
  releaseDue();
  return store.data.announcements
    .filter((item) => visibleToMe(item) && item.status === "published" && !item.archived_at && !expired(item))
    .sort((left, right) => (right.published_at ?? "").localeCompare(left.published_at ?? ""))
    .slice(0, limit)
    .map(announcementRecord);
}

function find(id: string): Announcement {
  const item = store.data.announcements.find((entry) => entry.id === id);
  if (!item || !visibleToMe(item)) fail(403, "Not allowed", "authz.out_of_scope");
  return item;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAnnouncement(input: any) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  const roles: string[] = Array.isArray(input?.audience_roles) ? input.audience_roles : [];
  const ok = title.length >= 1 && title.length <= 120 && body.length >= 1 && body.length <= 5000
    && ["general", "operations", "schedule"].includes(input?.category)
    && roles.every((role) => ["owner", "admin", "manager", "employee"].includes(role))
    && [input?.location_ids, input?.department_ids ?? [], input?.job_ids ?? []].every((list) => Array.isArray(list) && list.every((id: unknown) => typeof id === "string" && UUID.test(id)))
    && (input?.action_url === null || input?.action_url === undefined || /^\/app(?:[/?#]|$)/.test(String(input.action_url).trim()));
  if (!ok) fail(400, "Valid announcement required");
  if (input.publish_at && input.expires_at && Date.parse(input.expires_at) <= Date.parse(input.publish_at)) {
    fail(400, "expiry must follow publication");
  }
  return {
    title,
    body,
    category: input.category as Announcement["category"],
    // Every role ticked is the same as none: everyone.
    audience_roles: roles.length === 4 ? [] : [...new Set(roles)],
    location_ids: [...new Set<string>(input.location_ids)],
    department_ids: [...new Set<string>(input.department_ids ?? [])],
    job_ids: [...new Set<string>(input.job_ids ?? [])],
    publish_at: input.publish_at ?? null,
    expires_at: input.expires_at ?? null,
    action_url: input.action_url ? String(input.action_url).trim() : null,
  };
}

// ---------- routes ----------

export function communicationsRoutes(route: Route): void {
  const base = "/v1/workspaces/:workspaceId/communications";

  route("GET", `${base}/notifications`, ({ query }) => inbox(query, false));
  route("POST", `${base}/notifications/action`, ({ body }) => replayed(["notice", body], () => act(body, false)));
  route("GET", "/v1/account/notifications", ({ query }) => inbox(query, true));
  route("POST", "/v1/account/notifications/action", ({ body }) => act(body, true));

  route("GET", `${base}/announcements`, () => {
    releaseDue();
    const manage = viewerRole !== "employee";
    return {
      workspace_id: WORKSPACE_ID,
      can_manage: manage,
      can_target_workspace: viewerRole === "owner",
      locations: manage
        ? world.locations.filter((location) => viewerRole === "owner" || location.id === LOC.downtown).map((location) => ({ id: location.id, name: location.name }))
        : [],
      departments: manage ? world.departments.map((department) => ({ id: department.id, name: department.name })) : [],
      jobs: manage ? world.jobs.map((job) => ({ id: job.id, name: job.name, department_id: job.department_id })) : [],
      announcements: store.data.announcements
        .filter(visibleToMe)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map(announcementRecord),
    };
  });

  route("POST", `${base}/announcements`, ({ body }) => replayed(["save", body], () => saveAnnouncement(body)));

  function saveAnnouncement(body: any) {
    if (body?.announcement_id && !body?.expected_revision) fail(400, "Valid announcement required");
    const input = parseAnnouncement(body?.announcement);
    let item: Announcement;
    if (body?.announcement_id) {
      item = find(body.announcement_id);
      if (!controls(item)) fail(403, "Not allowed", "authz.out_of_scope");
      if (!controls({ location_ids: input.location_ids, author_user_id: item.author_user_id })) fail(403, "Not allowed", "authz.out_of_scope");
      if (item.revision !== body.expected_revision) fail(409, "stale announcement revision", "announcement.changed");
      if (item.archived_at) fail(409, "announcement can no longer be edited", "announcement.archived");
      const contentChanged = item.title !== input.title || item.body !== input.body || item.category !== input.category || item.action_url !== input.action_url;
      Object.assign(item, input);
      if (contentChanged) {
        item.content_revision += 1;
        // Acknowledgements start over when the content changes (K4).
        item.acknowledged_before = [...new Set([...item.acknowledged_before, ...Object.keys(item.acknowledged) as Role[]])];
        item.acknowledged = {};
        item.other_acknowledgements = 0;
      }
      // A scheduled one with its time taken away waits as a draft (P10).
      if (item.status === "scheduled" && !input.publish_at) item.status = "draft";
      item.revision += 1;
      item.updated_at = nowIso();
      if (item.status === "published") {
        item.delivered_to = expired(item) ? 0 : audienceSize(audienceOf(item));
        if (contentChanged) announce(item);
      }
    } else {
      if (!controls({ location_ids: input.location_ids, author_user_id: viewer.userId })) fail(403, "Not allowed", "authz.out_of_scope");
      item = {
        id: uuid(), ...input, status: "draft", archived_at: null, published_at: null,
        author_user_id: viewer.userId, author_name: viewer.name, revision: 1, content_revision: 1, delivered_to: 0,
        other_acknowledgements: 0, read: {}, acknowledged: {}, acknowledged_before: [], created_at: nowIso(), updated_at: nowIso(),
      };
      store.data.announcements.push(item);
    }
    store.save();
    return { status: item.status, announcement_id: item.id, revision: item.revision, recipient_count: item.delivered_to };
  }

  for (const action of ["publish", "unpublish", "archive", "restore"] as const) {
    route("POST", `${base}/announcements/:announcementId/${action}`, ({ params, body }) => replayed([action, params.announcementId, body], () => {
      if (!Number.isInteger(body?.expected_revision)) fail(400, "Valid announcement revision required");
      const item = find(params.announcementId);
      if (!controls(item)) fail(403, "Not allowed", "authz.out_of_scope");
      if (item.revision !== body.expected_revision) fail(409, "stale announcement revision", "announcement.changed");
      let told = 0;
      if (action === "publish") {
        if (item.archived_at || !["draft", "scheduled", "unpublished"].includes(item.status)) fail(409, "stale announcement revision", "announcement.changed");
        if (expired(item)) fail(400, "This announcement has expired");
        if (item.publish_at && Date.parse(item.publish_at) > Date.now()) {
          item.status = "scheduled";
          item.published_at = null;
        } else {
          item.status = "published";
          item.published_at = nowIso();
          item.publish_at ??= item.published_at;
          item.delivered_to = audienceSize(audienceOf(item));
          told = item.delivered_to;
          announce(item);
        }
      } else if (action === "unpublish") {
        if (item.archived_at || item.status !== "published") fail(409, "stale announcement revision", "announcement.changed");
        item.status = "unpublished";
        told = item.delivered_to;
        withdrawNotices(item.id);
      } else if (action === "archive") {
        if (item.archived_at) fail(409, "stale announcement revision", "announcement.changed");
        item.archived_at = nowIso();
        withdrawNotices(item.id);
      } else {
        if (!item.archived_at) fail(409, "stale announcement revision", "announcement.changed");
        item.archived_at = null;
      }
      item.revision += 1;
      item.updated_at = nowIso();
      store.save();
      return { status: item.status, announcement_id: item.id, revision: item.revision, recipient_count: told, archived_at: item.archived_at };
    }));
  }

  route("POST", `${base}/announcements/:announcementId/acknowledge`, ({ params }) => replayed(["ack", params.announcementId], () => {
    const item = find(params.announcementId);
    if (!reachesMe(item)) fail(403, "Not allowed", "authz.out_of_scope");
    const at = nowIso();
    item.acknowledged[viewerRole] ??= at;
    item.read[viewerRole] ??= at;
    for (const notice of store.data.notices[viewerRole]) {
      if (notice.source_id === item.id && !notice.read_at) { notice.read_at = at; notice.seen_at ??= at; }
    }
    store.save();
    return { status: "saved", affected: 1 };
  }));
}
