// Demo backend for the notification inbox (the page, the sidebar badge, the
// account inbox) and the notices other areas send. Mirrors the inbox functions
// in supabase/schema.sql at the level the screens show. Announcements live in
// announcements-service.ts.
import { ApiError, type Handler } from "./api";
import { domainStore } from "./store";
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { viewerRole } from "./viewer";
/** The three demo voices the notices were written for (admin reads as owner, a Shift Lead as manager). */
type Role = "owner" | "manager" | "employee";
import { LOC, POST, WORKSPACE_ID, ZONE, viewer, viewers, world } from "./world";

type Route = (method: string, path: string, handler: Handler) => void;

const nowIso = () => new Date().toISOString();
const ago = (minutes: number) => iso(Date.now() - minutes * 60_000);
const HOUR = 60;
const DAY = 24 * 60;

function fail(status: number, error: string, reason?: string): never {
  throw new ApiError(status, reason ? { error, reason } : { error });
}

// ---------- shared: locations and who a message reaches ----------

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

function seedNotices(): Record<Role, Notice[]> {
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
  const announcement = (id: string, minutes: number, title: string, body: string, read: boolean) => notice(minutes, {
    category: "communications", type_key: "communications.announcement.available", severity: "info",
    title, body, action_url: `/app/announcements/${id}`, source_type: "announcement", source_id: id, read,
  });
  const cooler = (read: boolean) => announcement(POST.cooler, 1 * DAY + 5 * HOUR, "Walk-in cooler repair on Tuesday",
    "The technician arrives at 7 AM. Keep the walk-in door closed; prep moves proteins to the reach-ins by 6:30.", read);
  const holiday = (read: boolean) => announcement(POST.holiday, 3 * DAY, "Holiday time-off requests are open",
    "Send your time-off requests for Thanksgiving through New Year's by the end of the month. We'll confirm every request within a week.", read);
  const pos = (read: boolean) => announcement(POST.pos, 6 * DAY, "New POS terminals: training this week",
    "The new handheld terminals arrive Wednesday. Every server and bartender does a 20-minute training before their shift; managers sign you off.", read);
  return {
    owner: [
      notice(3 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Tom Becker", body: `${shortDate(addDays(nextWeek, 2))} · Jury duty summons. Waiting for your review.`, action_url: "/app/schedule/requests", source_type: "time_off_request" }),
      notice(5 * HOUR, { category: "requests", type_key: "requests.time_off.submitted", severity: "action_required", title: "Time-off request from Ethan Brooks", body: "Family emergency. His shifts in the next two days would open.", action_url: "/app/schedule/requests", source_type: "time_off_request" }),
      notice(2 * HOUR + 10, { category: "requests", type_key: "requests.shift_change.submitted", severity: "action_required", title: "Shift swap needs approval", body: "Jake Thompson and Noah Garcia want to swap Saturday dinner at Uptown.", action_url: "/app/schedule/requests", source_type: "shift_exchange_case" }),
      notice(5 * HOUR, { category: "requests", type_key: "availability.weekly_updated", severity: "info", title: "Availability updated: Sophie Martin", body: "Sophie is no longer available on Sundays, starting next week.", action_url: "/app/availability", source_type: "weekly_availability" }),
      notice(1 * DAY + 3 * HOUR, { category: "people", type_key: "people.employee_document.expiring", severity: "warning", title: "Food handler card expiring", body: "Luis Hernandez's food handler card expires in 14 days.", action_url: "/app/employees/documents", source_type: "employee_document" }),
      cooler(false),
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
      holiday(false),
      notice(1 * DAY + 3 * HOUR, { category: "people", type_key: "people.employee_document.expiring", severity: "warning", title: "Food handler card expiring", body: "Luis Hernandez's food handler card expires in 14 days.", action_url: "/app/employees/documents", source_type: "employee_document", read: true }),
      dstNotice(2 * DAY),
      notice(publishedMinutes, { category: "schedule", type_key: "schedule.published", severity: "success", title: "Downtown schedule published", body: `Mert Tepebas published the week of ${shortDate(thisWeek)}.`, action_url: "/app/schedule", source_type: "schedule_publication", read: true }),
      pos(true),
      security(9 * DAY, "New sign-in to your account", "Safari on Mac · New York, NY. If this wasn't you, change your password."),
      // The owner ended Brian Foster's employment 24 days ago; his two unstarted
      // Downtown shifts opened and the Downtown manager was told (BL-768).
      notice(minutesSince(addDays(todayIn(ZONE), -24), "23:00"), { category: "schedule", type_key: "schedule.termination.shifts_unassigned", severity: "action_required", title: "Brian's 2 shifts are unassigned", body: `${dayLine(addDays(todayIn(ZONE), -22))}, 5:00 PM–11:00 PM (Downtown); ${dayLine(addDays(todayIn(ZONE), -20))}, 11:00 AM–4:00 PM (Downtown)`, action_url: `/app/schedule?date=${addDays(todayIn(ZONE), -22)}`, source_type: "employee_termination", read: true }),
    ],
    employee: [
      notice(3 * HOUR, { category: "requests", type_key: "requests.shift_change.status_changed", severity: "info", title: "Ethan offered to take your shift", body: "Your Friday lunch shift is waiting for Rachel Adams to approve the change.", action_url: "/app/employee-hub/shift-hub", source_type: "shift_exchange_case" }),
      cooler(false),
      holiday(false),
      notice(publishedMinutes, { category: "schedule", type_key: "schedule.published", severity: "info", title: "Your schedule is ready", body: `Week of ${shortDate(thisWeek)}: 4 shifts at Harbor & Vine Downtown.`, action_url: "/app/employee-hub", source_type: "schedule_publication", read: true }),
      announcement(POST.deepClean, 6 * DAY, `Harbor & Vine Downtown is closed on ${dayLine(addDays(thisWeek, 8))}`, "Kitchen deep clean & hood service", true),
      pos(true),
      notice(minutesSince(addDays(thisWeek, -2), "10:31"), { category: "requests", type_key: "requests.time_off.status_changed", severity: "success", title: "Time off approved: Cousin's wedding in San Diego", body: `${shortDate(addDays(nextWeek, 9))} – ${shortDate(addDays(nextWeek, 10))}. Rachel Adams: "Have a great time!"`, action_url: "/app/employee-hub/my-availability", source_type: "time_off_request", read: true }),
      notice(minutesSince(addDays(thisWeek, -14), "09:40"), { category: "requests", type_key: "requests.time_off.status_changed", severity: "success", title: "Time off approved: Family trip", body: `${shortDate(addDays(thisWeek, 2))} – ${shortDate(addDays(thisWeek, 3))}. Rachel Adams approved your request.`, action_url: "/app/employee-hub/my-availability", source_type: "time_off_request", read: true }),
      security(1 * DAY, "New sign-in to your account", "Safari on iPhone · Brooklyn, NY. If this wasn't you, change your password."),
    ],
  };
}

function seed() {
  return { notices: seedNotices(), replays: [] as { key: string; at: number; result: unknown }[] };
}

const store = domainStore("notices", seed);

/**
 * PAGES: the desktop and phone frames both run a scenario's clicks, so the
 * same write can arrive twice within moments (the other frame's result is
 * already in the shared store). The second gets the first one's answer.
 */
export function replayed<T>(what: unknown, run: () => T): T {
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

/** An announcement's notice for each atlas person in `userIds` (the people it is out to). */
export function notifyUsers(userIds: readonly string[], input: { title: string; body: string; action_url: string; subject_id: string }): void {
  for (const role of ["owner", "manager", "employee"] as const) {
    if (!userIds.includes(viewers[role].userId) || viewers[role].userId === viewer.userId) continue;
    const list = store.data.notices[role];
    // A newer notice about the same post replaces the old one (superseded).
    for (const item of list) {
      if (item.source_id === input.subject_id && item.type_key === "communications.announcement.available") item.dismissed = true;
    }
    list.unshift({
      id: uuid(), scope: "workspace", category: "communications", type_key: "communications.announcement.available",
      severity: "info", title: input.title, body: input.body, action_url: input.action_url,
      source_type: "announcement", source_id: input.subject_id, created_at: nowIso(), seen_at: null, read_at: null, dismissed: false,
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
  store.save();
  return { status: "saved" as const, affected: 1 };
}

// ---------- routes ----------

export function communicationsRoutes(route: Route): void {
  const base = "/v1/workspaces/:workspaceId/communications";

  route("GET", `${base}/notifications`, ({ query }) => inbox(query, false));
  route("POST", `${base}/notifications/action`, ({ body }) => replayed(["notice", body], () => act(body, false)));
  route("GET", "/v1/account/notifications", ({ query }) => inbox(query, true));
  route("POST", "/v1/account/notifications/action", ({ body }) => act(body, true));
}
