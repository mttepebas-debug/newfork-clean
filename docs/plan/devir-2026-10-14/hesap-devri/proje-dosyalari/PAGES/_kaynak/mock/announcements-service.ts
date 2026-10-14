// Demo backend for the one announcement record (EKRAN-08): Announcements,
// Important Dates under it, each location's day (Open, Closed, Short hours),
// the shifts a closed or short day reaches, acknowledgements and History.
// Mirrors get_announcements_service, get_announcement_service,
// preview_announcement_service, save_announcement_service,
// set_announcement_state_service, acknowledge_announcement_service and
// get_important_dates_service at the level the screens show; keeps the
// Schedule's closures and posts (world.closures, world.important_dates) equal
// to the records.
import * as shared from "@newfork/shared";
import { ApiError, type Handler } from "./api";
import { notifyUsers, replayed, withdrawNotices } from "./communications-service";
import { viewerPermissions } from "./access";
import { currentScenario } from "../pages";
import { UPTOWN_MANAGER, userIdOf } from "./requests-people";
import { domainStore } from "./store";
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { viewerIdentity, viewerRole } from "./viewer";
import {
  ADMIN_NAME, ADMIN_USER_ID, LOC, MANAGER_NAME, MANAGER_USER_ID, OWNER_NAME, OWNER_USER_ID, POST, WORKSPACE_ID, ZONE, persist, viewer, viewers, world,
  type Shift,
} from "./world";

type Route = (method: string, path: string, handler: Handler) => void;
type Day = "open" | "closed" | "short";
type Choice = { choice: "keep" | "remove" | "open" } | { choice: "edit"; from: string; until: string };
type Status = "draft" | "scheduled" | "published" | "unpublished";
type Display = Status | "publish_failed" | "past" | "archived";
type Category = "general" | "holiday" | "event" | "busy_day" | "celebration" | "inspection" | "staff_meeting" | "other";

interface Row { location_id: string; day: Day; opens: string | null; closes: string | null }
interface Change {
  id: string; source_id: string; outcome: "removed" | "opened" | "edited"; silent: boolean;
  location_id: string; scheduled_date: string; employee_id: string | null; job_id: string;
  start_time: string; end_time: string; after_start: string | null; after_end: string | null;
  changed_at: string; brought_back_at: string | null;
  /** The shift as it was, to bring it back. */
  before: Shift; week_start: string;
}
interface HistoryEntry { id: string; action: string; detail: Record<string, unknown>; changed_at: string; actor_user_id: string | null }
interface Post {
  id: string; title: string; body: string; category: Category; category_other: string | null;
  status: Status; publish_error_code: "not_allowed" | "too_late" | "failed" | null;
  starts_on: string | null; ends_on: string | null; event_from: string | null; event_until: string | null;
  recurrence: "none" | "date" | "nth" | "last";
  on_important_dates: boolean; on_calendar: boolean; on_schedule: boolean; ask_ack: boolean;
  publish_at: string | null; published_at: string | null; unpublished_at: string | null; archived_at: string | null;
  locations: Row[]; people: string[];
  author_user_id: string; revision: number; content_revision: number; created_at: string; updated_at: string;
  repeats_from: string | null;
  delivered_to: string[]; acks: Record<string, string>;
  choices: Record<string, Choice>; changes: Change[]; history: HistoryEntry[];
}

const nowIso = () => new Date().toISOString();
const ago = (minutes: number) => iso(Date.now() - minutes * 60_000);
const HOUR = 60;
const DAY = 24 * 60;

function fail(status: number, error: string, reason?: string, detail?: string): never {
  throw new ApiError(status, { error, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) });
}

// ---------- people ----------

type Rank = 0 | 1 | 2 | 3;
interface Member { user_id: string; employee_id: string | null; name: string; rank: Rank; location_ids: string[]; job_ids: string[] }

/** Carlos Rivera holds Downtown's Shift Lead role: a custom manager-class role (rank 1). */
const SHIFT_LEAD_EMPLOYEE = viewers.custom.employeeId;

/** Everyone in the workspace: the owner, the admin, the two location managers, the sixteen on the floor. */
function members(): Member[] {
  return [
    { user_id: OWNER_USER_ID, employee_id: null, name: OWNER_NAME, rank: 3, location_ids: [], job_ids: [] },
    { user_id: ADMIN_USER_ID, employee_id: null, name: ADMIN_NAME, rank: 2, location_ids: [], job_ids: [] },
    { user_id: MANAGER_USER_ID, employee_id: null, name: MANAGER_NAME, rank: 1, location_ids: [LOC.downtown], job_ids: [] },
    { user_id: UPTOWN_MANAGER.userId, employee_id: null, name: UPTOWN_MANAGER.name, rank: 1, location_ids: [LOC.uptown], job_ids: [] },
    ...world.employees.map((employee) => ({
      user_id: userIdOf(employee.id), employee_id: employee.id, name: employee.display_name, rank: (employee.id === SHIFT_LEAD_EMPLOYEE ? 1 : 0) as Rank,
      location_ids: employee.location_ids, job_ids: [employee.primary_job_id, ...employee.job_ids.filter((id) => id !== employee.primary_job_id)],
    })),
  ];
}
const member = (userId: string) => members().find((one) => one.user_id === userId);
const nameOf = (userId: string | null) => (userId && member(userId)?.name) || "Workspace member";
const myRank: Rank = ({ owner: 3, admin: 2, manager: 1, custom: 1, employee: 0 } as const)[viewerIdentity];
/** The role's permission keys, the Shift Lead's custom set, or a scenario's narrower set (access.ts). */
const permissions = viewerPermissions();
const manages = permissions.includes("announcements.manage");
const writesDates = manages && permissions.includes("important_dates.manage");
/** PAGES: a scenario's named data change (tools/screens.py, setup=). */
const setup = () => currentScenario()?.setup ?? "";
/** Where the signed-in person may write (K1): the owner and the admin everywhere, Rachel at Downtown. */
const writable = (): string[] => !manages ? []
  : viewerRole === "owner" ? world.locations.map((location) => location.id)
  // posts-manager-two-locations: a manager of Downtown and Uptown.
  : setup() === "posts-manager-two-locations" ? [LOC.downtown, LOC.uptown]
  : [LOC.downtown];
const wide = manages && viewerRole === "owner";

function person(entry: Member) {
  const job = world.jobs.find((one) => one.id === entry.job_ids[0]);
  const departments = [...new Set(entry.job_ids.map((id) => world.jobs.find((one) => one.id === id)?.department_id).filter(Boolean) as string[])];
  return {
    user_id: entry.user_id,
    employee_id: entry.employee_id,
    name: entry.name,
    job_name: entry.rank === 3 ? "Owner" : entry.rank === 2 ? "Admin" : !entry.employee_id ? "Manager" : job?.name ?? null,
    job_ids: entry.job_ids,
    department_ids: departments,
    location_ids: entry.location_ids,
    location_name: world.locations.find((one) => one.id === entry.location_ids[0])?.name ?? null,
  };
}

// ---------- the record's moments ----------

const liveRows = (post: Pick<Post, "locations">) =>
  post.locations.filter((row) => world.locations.some((location) => location.id === row.location_id));

function moments(post: Pick<Post, "starts_on" | "ends_on" | "event_from" | "event_until">) {
  if (!post.starts_on) return { starts_at: null, ends_at: null };
  const last = post.ends_on ?? post.starts_on;
  const start = localInstant(post.starts_on, post.event_from ?? "00:00", ZONE);
  const end = post.event_until ? localInstant(last, post.event_until, ZONE) : localInstant(addDays(last, 1), "00:00", ZONE);
  return { starts_at: iso(start), ends_at: iso(end) };
}

function display(post: Post): Display {
  if (post.archived_at) return "archived";
  if (post.status === "scheduled" && post.publish_error_code) return "publish_failed";
  if (post.status === "published") {
    const { ends_at } = moments(post);
    if (ends_at && Date.parse(ends_at) <= Date.now()) return "past";
  }
  return post.status;
}
const started = (post: Post) => {
  const { starts_at } = moments(post);
  return post.status === "published" && Boolean(starts_at && Date.parse(starts_at) <= Date.now());
};

// ---------- who it reaches, who may change it ----------

/** The places a record is about (K1): its checked locations and where each person added by hand works first. */
function places(post: Pick<Post, "locations" | "people">): string[] {
  return [...new Set([...liveRows(post).map((row) => row.location_id),
    ...post.people.flatMap((id) => member(id)?.location_ids.slice(0, 1) ?? [])])];
}

/** K24: whoever works at a checked location, whoever was added, whoever's shift it changed; never the author. */
function audience(post: Pick<Post, "locations" | "people" | "author_user_id" | "changes">): string[] {
  const rows = liveRows(post).map((row) => row.location_id);
  const changed = post.changes.filter((change) => !change.silent && !change.brought_back_at && change.employee_id)
    .map((change) => userIdOf(change.employee_id!));
  return [...new Set([
    ...post.people,
    ...members().filter((one) => one.location_ids.some((id) => rows.includes(id))).map((one) => one.user_id),
    ...changed,
  ])].filter((id) => id !== post.author_user_id && member(id));
}

/** K22: who is asked to acknowledge: the people it is out to who rank below its author. */
function respondents(post: Post): string[] {
  const authorRank = member(post.author_user_id)?.rank ?? 3;
  return post.delivered_to.filter((id) => (member(id)?.rank ?? 0) < authorRank);
}

/** announcement_reason: K1 (my locations), K2 (rank), K3; a record about no place is its author's or the owner's. */
function mayChange(post: Pick<Post, "locations" | "people" | "author_user_id">): boolean {
  if (!manages) return false;
  if (post.author_user_id !== viewer.userId && (member(post.author_user_id)?.rank ?? 3) > myRank) return false;
  if (wide) return true;
  const where = places(post);
  if (where.length === 0) return post.author_user_id === viewer.userId;
  return where.length === 1 && writable().includes(where[0]!);
}
const reachesMe = (post: Post) => post.status === "published" && !post.archived_at && post.delivered_to.includes(viewer.userId);
const visible = (post: Post) => (post.status === "draft" ? post.author_user_id === viewer.userId : mayChange(post) || reachesMe(post));

// ---------- the demo records ----------

function seed(): { posts: Post[] } {
  const today = todayIn(ZONE);
  const thisWeek = mondayOf(today);
  const year = Number(today.slice(0, 4));
  const next = (monthDay: string) => (`${year}-${monthDay}` >= today ? `${year}-${monthDay}` : `${year + 1}-${monthDay}`);
  const nthWeekday = (y: number, month: number, weekday: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return iso(Date.UTC(y, month, 1 + ((weekday - first + 7) % 7) + 7 * (n - 1))).slice(0, 10);
  };
  const thanksgiving = nthWeekday(year, 10, 4, 4) >= today ? nthWeekday(year, 10, 4, 4) : nthWeekday(year + 1, 10, 4, 4);
  const laborDay = nthWeekday(year, 8, 1, 1) < today ? nthWeekday(year, 8, 1, 1) : nthWeekday(year - 1, 8, 1, 1);
  const both = (day: Day = "open", opens: string | null = null, closes: string | null = null): Row[] =>
    world.locations.map((location) => ({ location_id: location.id, day, opens, closes }));
  const at = (locationId: string, day: Day = "open", opens: string | null = null, closes: string | null = null): Row[] =>
    [{ location_id: locationId, day, opens, closes }];
  const make = (id: string, fields: Partial<Post> & Pick<Post, "title" | "body" | "status">, minutesAgo: number, by: "owner" | "manager"): Post => {
    const created = ago(minutesAgo);
    const out = fields.status === "published" || fields.status === "unpublished";
    const author = by === "owner" ? OWNER_USER_ID : MANAGER_USER_ID;
    return {
      id, category: "general", category_other: null, publish_error_code: null,
      starts_on: null, ends_on: null, event_from: null, event_until: null, recurrence: "none",
      on_important_dates: false, on_calendar: false, on_schedule: false, ask_ack: false,
      publish_at: null, published_at: out ? created : null, unpublished_at: null, archived_at: null,
      locations: [], people: [], author_user_id: author, revision: 1, content_revision: 1,
      created_at: created, updated_at: created, repeats_from: null, delivered_to: [], acks: {}, choices: {}, changes: [],
      history: [
        { id: uuid(), action: "created", detail: {}, changed_at: created, actor_user_id: author },
        ...(out ? [{ id: uuid(), action: "published", detail: { told: 0 }, changed_at: created, actor_user_id: author }] : []),
      ],
      ...fields,
    };
  };
  const dates = <T extends Partial<Post>>(fields: T) => ({ on_important_dates: true, on_calendar: true, on_schedule: true, ...fields });
  const posts: Post[] = [
    make(POST.holiday, {
      title: "Holiday time-off requests are open", status: "published", ask_ack: true, locations: both(),
      body: "Send your time-off requests for Thanksgiving through New Year's by the end of the month. We'll confirm every request within a week.",
    }, 3 * DAY, "owner"),
    make(POST.pos, {
      title: "New POS terminals: training this week", status: "published", ask_ack: true, category: "staff_meeting", locations: both(),
      body: "The new handheld terminals arrive Wednesday. Every server and bartender does a 20-minute training before their shift; managers sign you off.",
    }, 6 * DAY, "owner"),
    make(POST.cooler, {
      title: "Walk-in cooler repair on Tuesday", status: "published", ask_ack: true, category: "inspection", locations: at(LOC.downtown),
      body: "The technician arrives at 7 AM. Keep the walk-in door closed; prep moves proteins to the reach-ins by 6:30.",
    }, 1 * DAY + 5 * HOUR, "manager"),
    make(POST.hartwell, dates({
      title: "Hartwell private buyout", status: "published", category: "event", starts_on: addDays(thisWeek, 12), ends_on: addDays(thisWeek, 12),
      locations: at(LOC.uptown, "short", "17:00", "23:00"), ask_ack: true,
      body: "Uptown is closed to the public for a 120-guest private event. Doors open to guests at 5:30 PM.",
    }), 2 * DAY, "owner"),
    make(POST.deepClean, dates({
      title: "Kitchen deep clean & hood service", status: "published", category: "inspection",
      starts_on: addDays(thisWeek, 8), ends_on: addDays(thisWeek, 8), locations: at(LOC.downtown, "closed"),
      body: "Downtown is closed all day while the hood crew works. No shifts that day.",
    }), 6 * DAY, "owner"),
    make(POST.thanksgiving, dates({
      title: "Thanksgiving", status: "published", category: "holiday", starts_on: thanksgiving, ends_on: thanksgiving,
      locations: at(LOC.downtown, "closed"), body: "Downtown is closed for Thanksgiving. Uptown serves the prix fixe menu.",
    }), 8 * DAY, "owner"),
    make(POST.prixFixe, dates({
      title: "Thanksgiving prix fixe menu", status: "scheduled", category: "event", starts_on: thanksgiving, ends_on: thanksgiving,
      locations: at(LOC.uptown, "short", "12:00", "19:00"), publish_at: iso(localInstant(addDays(thisWeek, 11), "10:00", ZONE)),
      body: "Thanksgiving is prix fixe only: three courses at $65, seatings from noon to 7 PM.",
    }), 1 * DAY, "owner"),
    make(POST.christmas, dates({
      title: "Christmas Day", status: "published", category: "holiday", recurrence: "date", starts_on: next("12-25"), ends_on: next("12-25"),
      locations: both("closed"), body: "Both restaurants are closed on Christmas Day.",
    }), 20 * DAY, "owner"),
    make(POST.halloween, {
      title: "Halloween", status: "published", category: "celebration", recurrence: "date", starts_on: next("10-31"), ends_on: next("10-31"),
      on_important_dates: true, on_calendar: true, locations: both(), body: "Costumes welcome on the floor. The bar runs a pumpkin spritz special.",
    }, 12 * DAY, "owner"),
    make(POST.restaurantWeek, dates({
      title: "Downtown Restaurant Week", status: "published", category: "busy_day", starts_on: addDays(thisWeek, 28), ends_on: addDays(thisWeek, 34),
      locations: at(LOC.downtown), body: "Expect full books every night. Pick up an extra shift in Shift Hub if you can.",
    }), 4 * DAY, "manager"),
    make(POST.newYearsEve, dates({
      title: "New Year's Eve", status: "published", category: "busy_day", recurrence: "date", starts_on: next("12-31"), ends_on: next("12-31"),
      locations: both(), body: "Our busiest night. No time off that night.",
    }), 15 * DAY, "owner"),
    make(POST.laborDay, dates({
      title: "Labor Day brunch hours", status: "published", category: "holiday", starts_on: laborDay, ends_on: laborDay,
      locations: both("short", "10:00", "15:00"), body: "Brunch runs until 3 PM on Labor Day.",
    }), 40 * DAY, "owner"),
    make(POST.fallMenu, dates({
      title: "Fall menu launch", status: "published", category: "event", starts_on: addDays(thisWeek, -10), ends_on: addDays(thisWeek, -10),
      locations: at(LOC.downtown), body: "The fall menu goes live tonight. Tasting at 3 PM for everyone on shift.",
    }), 14 * DAY, "manager"),
    make(POST.tasting, {
      title: "Fall menu tasting notes", status: "published", ask_ack: true, locations: at(LOC.downtown),
      body: "Key talking points: the braised short rib is gluten free, the squash risotto can be made vegan.",
    }, 10 * DAY, "manager"),
    make(POST.uniform, {
      title: "Winter uniform update", status: "draft", body: "Starting in November, front of house wears the new charcoal aprons.",
    }, 4 * HOUR, "owner"),
    make(POST.rotation, {
      title: "Server section rotation", status: "draft", locations: at(LOC.downtown),
      body: "Sections rotate every Monday from next week. Check the host stand chart before your first table.",
    }, 2 * HOUR, "manager"),
    make(POST.heaters, {
      title: "Patio heaters install", status: "scheduled", publish_error_code: "too_late", category: "inspection", locations: at(LOC.downtown),
      starts_on: addDays(today, -1), ends_on: addDays(today, -1), publish_at: ago(2 * DAY),
      body: "The patio is closed in the afternoon while the heaters go in.",
    }, 3 * DAY, "manager"),
    make(POST.brunch, {
      title: "Sunday brunch tasting", status: "unpublished", unpublished_at: ago(DAY), locations: at(LOC.downtown),
      body: "Brunch tasting moved; a new date is coming.",
    }, 5 * DAY, "manager"),
    make(POST.patio, {
      title: "Summer patio hours", status: "published", archived_at: ago(20 * DAY), locations: both(),
      body: "The patio opens at 4 PM on weekdays and noon on weekends through Labor Day.",
    }, 80 * DAY, "owner"),
  ];
  for (const post of posts) {
    if (post.status === "published" && !post.archived_at) post.delivered_to = audience(post);
    const told = post.history.find((entry) => entry.action === "published");
    if (told) told.detail = { told: post.delivered_to.length };
    if (post.status === "scheduled") {
      post.history.push({ id: uuid(), action: "scheduled", detail: { publish_at: post.publish_at }, changed_at: post.created_at, actor_user_id: post.author_user_id });
      if (post.publish_error_code)
        post.history.push({ id: uuid(), action: "publish_failed", detail: { code: post.publish_error_code }, changed_at: post.publish_at!, actor_user_id: post.author_user_id });
    }
    if (post.unpublished_at) post.history.push({ id: uuid(), action: "unpublished", detail: { told: 0 }, changed_at: post.unpublished_at, actor_user_id: post.author_user_id });
    if (post.archived_at) post.history.push({ id: uuid(), action: "archived", detail: {}, changed_at: post.archived_at, actor_user_id: post.author_user_id });
  }
  // The deep clean closed next Tuesday at Downtown when it went out: its shifts
  // there were removed and the people on them told (the Shifts tab, the Schedule).
  const deepClean = posts.find((post) => post.id === POST.deepClean)!;
  const removed = applyShifts(deepClean, impactOf(deepClean, {}).shifts);
  const sent = deepClean.history.find((entry) => entry.action === "published")!;
  sent.detail = { ...sent.detail, shift_changes: removed };
  for (const change of deepClean.changes) change.changed_at = sent.changed_at;
  persist();
  // Who already acknowledged (the employee viewer Maria among them on the POS and tasting posts).
  const ack = (post: Post, share: number, minutesAgo: number) => {
    for (const [index, id] of respondents(post).entries()) {
      if (index % share === 0 || id === viewers.employee.userId) post.acks[id] = ago(minutesAgo - index);
    }
  };
  ack(posts.find((post) => post.id === POST.pos)!, 1, 5 * DAY);
  ack(posts.find((post) => post.id === POST.tasting)!, 2, 9 * DAY);
  const holiday = posts.find((post) => post.id === POST.holiday)!;
  for (const [index, id] of respondents(holiday).entries()) if (index % 3 === 1) holiday.acks[id] = ago(2 * DAY - index * 7);
  const cooler = posts.find((post) => post.id === POST.cooler)!;
  for (const [index, id] of respondents(cooler).entries()) if (index % 4 === 0 && id !== viewers.employee.userId) cooler.acks[id] = ago(20 * HOUR - index);
  // The workspace's clock (Settings → Schedule); a PAGES setup turns it to 24h.
  return { posts, time_format: "12h" as "12h" | "24h" };
}

const store = domainStore("announcements", seed);
const posts = () => store.data.posts;

/** PAGES setups (hub-setups.ts): the records and their save. */
export const announcementData = () => store.data;
export function saveAnnouncements(): void {
  store.save();
  syncSchedule();
}

// ---------- the Schedule's view of the records ----------

/** Keeps world.closures and world.important_dates equal to the records (public.schedule_closures and the read model). */
export function syncSchedule(): void {
  const live = posts().filter((post) => !post.archived_at && post.starts_on);
  world.closures = live.flatMap((post) => {
    if (!["published", "scheduled", "unpublished"].includes(post.status)) return [];
    const last = post.ends_on ?? post.starts_on!;
    return liveRows(post).filter((row) => row.day !== "open").flatMap((row) => {
      const out: (typeof world.closures)[number][] = [];
      for (let day = post.starts_on!; day <= last; day = addDays(day, 1)) {
        if (post.status === "unpublished" && (!post.unpublished_at || day >= post.unpublished_at.slice(0, 10))) continue;
        out.push({
          id: `${day.replaceAll("-", "")}-0000-4000-8${row.location_id.slice(-3)}-${post.id.slice(-12)}`,
          location_id: row.location_id, closed_date: day, title: post.title, is_all_day: row.day === "closed",
          kind: row.day as "closed" | "short", opens: row.opens, closes: row.closes,
          status: post.status as "published" | "scheduled" | "unpublished", publish_at: post.publish_at, on_schedule: post.on_schedule,
          announcement_id: post.id,
        });
      }
      return out;
    });
  });
  world.important_dates = live
    .filter((post) => (post.status === "published" || post.status === "scheduled") && post.on_schedule)
    .flatMap((post) => {
      const rows = liveRows(post);
      const at = rows.length ? rows : (visible(post) ? [{ location_id: null, day: "open" as Day, opens: null, closes: null }] : []);
      return at.map((row) => ({
        id: post.id, location_id: row.location_id, title: post.title, category: post.category, category_other: post.category_other,
        starts_on: post.starts_on!, ends_on: post.ends_on ?? post.starts_on!, status: post.status as "published" | "scheduled",
        publish_at: post.publish_at, day: row.day, opens: row.opens, closes: row.closes,
        event_from: post.event_from, event_until: post.event_until,
      }));
    });
}

/** The employee's board: what is out to them, nothing scheduled. */
export function boardDates(allowed: ReadonlySet<string>) {
  return world.important_dates.filter((row) => {
    const post = posts().find((one) => one.id === row.id);
    return post && post.status === "published" && post.delivered_to.includes(viewer.userId)
      && (row.location_id === null || allowed.has(row.location_id));
  });
}

// ---------- shapes ----------

const changeOf = (change: Change) => ({
  id: change.id, source_id: change.source_id, outcome: change.outcome, silent: change.silent,
  location_id: change.location_id, location_name: world.locations.find((one) => one.id === change.location_id)?.name ?? "Location",
  scheduled_date: change.scheduled_date, employee_id: change.employee_id,
  employee_user_id: change.employee_id ? userIdOf(change.employee_id) : null,
  employee_name: change.employee_id ? world.employees.find((one) => one.id === change.employee_id)?.display_name ?? null : null,
  job_name: world.jobs.find((one) => one.id === change.job_id)?.name ?? "Shift",
  start_time: change.start_time, end_time: change.end_time, after_start: change.after_start, after_end: change.after_end,
  changed_at: change.changed_at, brought_back_at: change.brought_back_at, lock: null,
});

function record(post: Post) {
  const shown = display(post);
  const allowed = mayChange(post);
  const asked = post.ask_ack && post.status === "published" ? respondents(post) : [];
  const { starts_at, ends_at } = moments(post);
  const me = viewer.employeeId;
  return {
    id: post.id, title: post.title, body: post.body, category: post.category, category_other: post.category_other,
    status: post.status, display_status: shown, publish_error_code: post.publish_error_code,
    starts_on: post.starts_on, ends_on: post.ends_on, event_from: post.event_from, event_until: post.event_until,
    recurrence: post.recurrence, on_important_dates: post.on_important_dates, on_calendar: post.on_calendar,
    on_schedule: post.on_schedule, ask_ack: post.ask_ack, time_zone: ZONE,
    publish_at: post.publish_at, published_at: post.published_at, unpublished_at: post.unpublished_at, archived_at: post.archived_at,
    starts_at, ends_at,
    locations: post.locations.flatMap((row) => {
      const location = world.locations.find((one) => one.id === row.location_id);
      return location ? [{ ...row, name: location.name, short_name: location.short_name, timezone: location.timezone, archived: false }] : [];
    }),
    author_user_id: post.author_user_id, author_name: nameOf(post.author_user_id),
    revision: post.revision, content_revision: post.content_revision, created_at: post.created_at, updated_at: post.updated_at,
    repeats_from: post.repeats_from,
    can_edit: allowed && !post.archived_at && shown !== "past",
    can_unschedule: allowed && (shown === "scheduled" || shown === "publish_failed"),
    can_unpublish: allowed && shown === "published",
    can_archive: allowed && (shown === "draft" || shown === "unpublished" || shown === "past"),
    asked_to_acknowledge: shown === "published" && asked.includes(viewer.userId),
    acknowledged_at: post.acks[viewer.userId] ?? null,
    content_changed_since_acknowledged: false,
    respondent_count: allowed && post.ask_ack && post.status === "published" ? asked.length : null,
    acknowledged_count: allowed && post.ask_ack && post.status === "published" ? asked.filter((id) => post.acks[id]).length : null,
    recipient_count: allowed && shown === "published" ? post.delivered_to.length : null,
    shift_change_count: allowed ? post.changes.filter((change) => !change.silent && !change.brought_back_at).length : null,
    my_changes: me && post.status === "published"
      ? post.changes.filter((change) => change.employee_id === me && !change.silent && !change.brought_back_at).map(changeOf) : [],
  };
}

function detail(post: Post) {
  const base = record(post);
  if (!mayChange(post)) return base;
  const asked = post.ask_ack && post.status === "published" ? respondents(post) : [];
  return {
    ...base,
    people: post.people.flatMap((id) => { const one = member(id); return one ? [person(one)] : []; }),
    shift_choices: post.choices,
    choices_saved_at: post.updated_at,
    changes: post.changes.map(changeOf),
    hidden_change_count: 0,
    acknowledgements: asked.flatMap((id) => { const one = member(id); return one ? [{ ...person(one), acknowledged_at: post.acks[id] ?? null }] : []; }),
    history: [...post.history]
      .sort((left, right) => right.changed_at.localeCompare(left.changed_at))
      .map((entry) => ({ ...entry, actor_name: entry.actor_user_id ? nameOf(entry.actor_user_id) : null })),
  };
}

function find(id: string): Post {
  const post = posts().find((one) => one.id === id);
  if (!post || !visible(post)) fail(403, "Not allowed", "authz.out_of_scope");
  return post;
}

/** Due scheduled records go out when anyone reads (the release cron in the real app). */
function release(): void {
  let changed = false;
  for (const post of posts()) {
    if (post.status !== "scheduled" || post.publish_error_code || !post.publish_at || Date.parse(post.publish_at) > Date.now()) continue;
    publish(post, impactOf(post, post.choices).shifts, true);
    changed = true;
  }
  if (changed) { store.save(); syncSchedule(); }
}

// ---------- the Shifts tab ----------

const minutes = (clock: string) => { const [h = 0, m = 0] = clock.slice(0, 5).split(":").map(Number); return h * 60 + m; };

function reason(row: Row, shift: Shift): "closed" | "prep" | "after_close" | "over" | null {
  if (row.day === "closed") return "closed";
  if (row.day !== "short" || !row.opens || !row.closes) return null;
  if (!shared.scheduleClosureCoversShift({ kind: "short", opens: row.opens, closes: row.closes }, shift.start_time, shift.end_time)) return null;
  const s = minutes(shift.start_time);
  let e = minutes(shift.end_time); if (e <= s) e += 1440;
  const o = minutes(row.opens);
  let c = minutes(row.closes); if (c <= o) c += 1440;
  if (e <= o) return "prep";
  if (s >= c) return "after_close";
  return "over";
}

/** The current published shifts the days reach, each with its default and the choice made. */
function impactOf(post: Pick<Post, "starts_on" | "ends_on" | "locations" | "changes" | "id">, choices: Record<string, Choice>) {
  const today = todayIn(ZONE);
  const shifts: ReturnType<typeof impactShift>[] = [];
  if (!post.starts_on) return { shifts, quiet: 0 };
  const last = post.ends_on ?? post.starts_on;
  for (const row of liveRows(post)) {
    if (row.day === "open") continue;
    for (const publication of world.publications) {
      if (publication.location_id !== row.location_id) continue;
      for (const shift of publication.shifts) {
        if (shift.scheduled_date < post.starts_on || shift.scheduled_date > last || shift.scheduled_date < today) continue;
        if (post.changes.some((change) => change.source_id === shift.id && !change.brought_back_at)) continue;
        const why = reason(row, shift);
        if (why) shifts.push(impactShift(row, shift, why, choices));
      }
    }
  }
  return { shifts: shifts.sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date) || left.start_time.localeCompare(right.start_time)), quiet: 0 };
}

function impactShift(row: Row, shift: Shift, why: "closed" | "prep" | "after_close" | "over", choices: Record<string, Choice>) {
  const today = todayIn(ZONE);
  const isStarted = shift.scheduled_date === today && localInstant(shift.scheduled_date, shift.start_time, ZONE) <= Date.now();
  const fallback = isStarted || why === "prep" || why === "over" ? "keep" : "remove";
  const picked = choices[shift.id];
  let choice: "keep" | "remove" | "open" | "edit" = fallback;
  let from: string | null = null;
  let until: string | null = null;
  if (isStarted) choice = "keep";
  else if (picked?.choice === "open" && !shift.employee_id) choice = fallback;
  else if (picked?.choice === "edit") {
    if (row.day === "short" && picked.from !== picked.until) { choice = "edit"; from = picked.from; until = picked.until; }
  } else if (picked) choice = picked.choice;
  const outcome = choice === "remove" ? "removed" : choice === "open" ? "opened"
    : choice === "edit" && (from !== shift.start_time || until !== shift.end_time) ? "edited" : "kept";
  const employee = shift.employee_id ? world.employees.find((one) => one.id === shift.employee_id) : undefined;
  return {
    id: shift.id, source_id: shift.id, location_id: shift.location_id,
    location_name: world.locations.find((one) => one.id === shift.location_id)?.name ?? "Location",
    scheduled_date: shift.scheduled_date, employee_id: shift.employee_id,
    employee_user_id: shift.employee_id ? userIdOf(shift.employee_id) : null, employee_name: employee?.display_name ?? null,
    job_id: shift.job_id, job_name: world.jobs.find((one) => one.id === shift.job_id)?.name ?? "Shift",
    start_time: shift.start_time.slice(0, 5), end_time: shift.end_time.slice(0, 5),
    day: row.day as "closed" | "short", opens: row.opens, closes: row.closes, reason: why,
    started: isStarted, tied: false, changed_in_schedule: false, default: fallback as "keep" | "remove", choice, from, until,
    outcome: outcome as "removed" | "opened" | "edited" | "kept",
  };
}

const fingerprint = (shifts: { id: string; outcome: string }[]) =>
  shifts.length ? shifts.map((shift) => `${shift.id.slice(-6)}${shift.outcome[0]}`).join("").slice(0, 64) : null;

/** Applies the shifts' outcomes to the published week and records each change. */
function applyShifts(post: Post, shifts: ReturnType<typeof impactShift>[]): number {
  let count = 0;
  for (const item of shifts) {
    if (item.outcome === "kept") continue;
    for (const publication of world.publications) {
      const index = publication.shifts.findIndex((shift) => shift.id === item.id);
      if (index < 0) continue;
      const shift = publication.shifts[index]!;
      post.changes.push({
        id: uuid(), source_id: shift.id, outcome: item.outcome, silent: false, location_id: shift.location_id,
        scheduled_date: shift.scheduled_date, employee_id: shift.employee_id, job_id: shift.job_id,
        start_time: shift.start_time.slice(0, 5), end_time: shift.end_time.slice(0, 5),
        after_start: item.outcome === "edited" ? item.from : null, after_end: item.outcome === "edited" ? item.until : null,
        changed_at: nowIso(), brought_back_at: null, before: structuredClone(shift), week_start: publication.week_start,
      });
      if (item.outcome === "removed") publication.shifts.splice(index, 1);
      else if (item.outcome === "opened") shift.employee_id = null;
      else { shift.start_time = item.from!; shift.end_time = item.until!; }
      count += 1;
    }
  }
  return count;
}

function bringBack(post: Post, ids: string[]): number {
  let count = 0;
  for (const change of post.changes) {
    if (!ids.includes(change.id) || change.brought_back_at) continue;
    const publication = world.publications.find((one) => one.location_id === change.location_id && one.week_start === change.week_start);
    if (!publication) continue;
    const index = publication.shifts.findIndex((shift) => shift.id === change.source_id);
    if (index >= 0) publication.shifts[index] = structuredClone(change.before);
    else publication.shifts.push(structuredClone(change.before));
    change.brought_back_at = nowIso();
    count += 1;
  }
  return count;
}

// ---------- preview, save ----------

const dayText = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

interface Draft {
  title: string; body: string; category: Category; category_other: string | null;
  starts_on: string | null; ends_on: string | null; event_from: string | null; event_until: string | null;
  recurrence: Post["recurrence"]; on_important_dates: boolean; on_calendar: boolean; on_schedule: boolean; ask_ack: boolean;
  publish_at: string | null; locations: Row[]; people: string[]; choices: Record<string, Choice>; fingerprint?: string | null; bring_back?: string[];
}

function parseDraft(input: unknown): Draft {
  const parsed = shared.announcementDraftSchema.safeParse(input);
  if (!parsed.success) fail(400, "This post can't be saved as sent.", "announcement.invalid");
  const value = parsed.data;
  return {
    ...value,
    title: value.title.trim(), body: value.body.trim(),
    category_other: value.category === "other" ? value.category_other?.trim() || null : null,
    locations: value.locations.map((row) => row.day === "short" ? row : { ...row, opens: null, closes: null }),
    choices: value.choices as Record<string, Choice>,
  };
}

function problems(stored: Post | null, draft: Draft, intent: string) {
  const found: { tab: "details" | "where" | "aud"; field: string; code: string; message: string; required: boolean }[] = [];
  const today = todayIn(ZONE);
  if (!draft.title) found.push({ tab: "details", field: "title", code: "title_required", message: "Add a title.", required: true });
  if (intent === "draft") return found;
  if (draft.category === "other" && !draft.category_other)
    found.push({ tab: "details", field: "category_other", code: "category_name_required", message: "Name the category.", required: true });
  const hours = draft.locations.some((row) => row.day !== "open");
  const needsDay = draft.on_important_dates || draft.on_calendar || draft.on_schedule || hours;
  const isStarted = stored ? started(stored) : false;
  if (!draft.starts_on) {
    if (needsDay || draft.ends_on || draft.event_from)
      found.push({ tab: "details", field: "starts_on", code: "start_required", message: "Choose the day it starts.", required: true });
  } else {
    if (!isStarted && draft.starts_on < today)
      found.push({ tab: "details", field: "starts_on", code: "start_past", message: `It can't start before today (${dayText(today)}).`, required: false });
    if (draft.ends_on && draft.ends_on < draft.starts_on)
      found.push({ tab: "details", field: "ends_on", code: "ends_before_starts", message: "Ends can't be before Starts.", required: false });
    if (isStarted && (draft.ends_on ?? draft.starts_on) < today)
      found.push({ tab: "details", field: "ends_on", code: "ends_past", message: "Ends can't be before today.", required: false });
  }
  if (draft.event_from && draft.event_until && (draft.ends_on ?? draft.starts_on) === draft.starts_on && draft.event_until <= draft.event_from)
    found.push({ tab: "details", field: "event_until", code: "event_time_order", message: "The end time must be after the start time.", required: false });
  for (const row of draft.locations) {
    if (row.day !== "short") continue;
    if (!row.opens || !row.closes || !(row.closes > row.opens || row.closes <= "06:00"))
      found.push({ tab: "where", field: `location:${row.location_id}`, code: "hours_invalid", message: "Closing must be after opening, at most 6:00 AM the next day.", required: false });
  }
  if (intent === "schedule") {
    const start = moments(draft).starts_at;
    if (!draft.publish_at) found.push({ tab: "where", field: "publish_at", code: "publish_time_required", message: "Pick when it publishes.", required: true });
    else if (Date.parse(draft.publish_at) <= Date.now())
      found.push({ tab: "where", field: "publish_at", code: "publish_time_past", message: "Pick a time after now.", required: false });
    else if (start && Date.parse(draft.publish_at) >= Date.parse(start))
      found.push({ tab: "where", field: "publish_at", code: "publish_after_start", message: `Publish it before it starts (${dayText(draft.starts_on!)}).`, required: false });
  }
  if (liveRows(draft).length === 0 && draft.people.length === 0)
    found.push({ tab: "aud", field: "people", code: "nobody", message: "Nobody gets it yet. Check a location on Locations & publishing, or add people here.", required: true });
  return found;
}

function authorize(stored: Post | null, draft: Draft) {
  const author = stored?.author_user_id ?? viewer.userId;
  if (!mayChange({ locations: draft.locations, people: draft.people, author_user_id: author })) fail(403, "Not allowed", "authz.out_of_scope");
  const dates = draft.on_important_dates || draft.locations.some((row) => row.day !== "open");
  if (dates && !writesDates) fail(403, "Not allowed", "authz.missing_permission");
}

function preview(body: any) {
  release();
  const stored = body?.announcement_id ? find(body.announcement_id) : null;
  const draft = parseDraft(body?.announcement);
  const intent = String(body?.intent ?? "publish");
  authorize(stored, draft);
  const probe = { id: stored?.id ?? "", starts_on: draft.starts_on, ends_on: draft.ends_on, locations: draft.locations, changes: stored?.changes ?? [] };
  const { shifts } = impactOf(probe, draft.choices);
  const counts = { removed: 0, edited: 0, opened: 0, kept: 0, quiet: 0 };
  for (const shift of shifts) counts[shift.outcome] += 1;
  const changes = stored?.changes ?? [];
  const reached = audience({ locations: draft.locations, people: draft.people, author_user_id: stored?.author_user_id ?? viewer.userId,
    changes: [...changes, ...shifts.filter((shift) => shift.outcome !== "kept").map((shift) => ({ employee_id: shift.employee_id, silent: false, brought_back_at: null } as Change))] });
  const { starts_at, ends_at } = moments(draft);
  return {
    problems: problems(stored, draft, intent),
    fingerprint: fingerprint(shifts),
    shifts,
    hidden_count: 0,
    quiet_count: 0,
    counts,
    bring_back: stored && stored.status === "unpublished" ? changes.filter((change) => !change.brought_back_at).map(changeOf) : [],
    time_zone: ZONE,
    starts_at,
    ends_at,
    recipient_count: reached.length,
  };
}

function history(post: Post, action: string, detail: Record<string, unknown> = {}) {
  post.history.push({ id: uuid(), action, detail, changed_at: nowIso(), actor_user_id: viewer.userId });
}

function publish(post: Post, shifts: ReturnType<typeof impactShift>[], auto = false): number {
  const changed = applyShifts(post, shifts);
  post.status = "published";
  post.published_at = nowIso();
  post.publish_error_code = null;
  post.delivered_to = audience(post);
  post.history.push({ id: uuid(), action: "published", detail: { told: post.delivered_to.length, shift_changes: changed, ...(auto ? { auto: true } : {}) },
    changed_at: nowIso(), actor_user_id: auto ? post.author_user_id : viewer.userId });
  notifyUsers(post.delivered_to, {
    title: post.title, body: post.body.slice(0, 140) || "Open Announcements to read it.",
    action_url: `/app/announcements/${post.id}`, subject_id: post.id,
  });
  return changed;
}

function save(body: any) {
  release();
  const stored = body?.announcement_id ? find(body.announcement_id) : null;
  const intent = String(body?.intent ?? "");
  if (!["draft", "schedule", "publish", "save"].includes(intent)) fail(400, "valid announcement intent required", "announcement.invalid");
  const draft = parseDraft(body?.announcement);
  if (stored) {
    if (body?.expected_revision !== stored.revision) fail(409, "This post changed since you opened it.", "announcement.changed");
    const shown = display(stored);
    if (shown === "past" || shown === "archived") fail(409, "This post can't change anymore.", "announcement.read_only");
  }
  authorize(stored, draft);
  const found = problems(stored, draft, intent);
  if (found.length) fail(400, found[0]!.message, "announcement.invalid", found[0]!.field);
  const post: Post = stored ?? {
    id: uuid(), title: "", body: "", category: "general", category_other: null, status: "draft", publish_error_code: null,
    starts_on: null, ends_on: null, event_from: null, event_until: null, recurrence: "none",
    on_important_dates: false, on_calendar: false, on_schedule: false, ask_ack: false,
    publish_at: null, published_at: null, unpublished_at: null, archived_at: null, locations: [], people: [],
    author_user_id: viewer.userId, revision: 0, content_revision: 1, created_at: nowIso(), updated_at: nowIso(),
    repeats_from: null, delivered_to: [], acks: {}, choices: {}, changes: [], history: [],
  };
  if (!stored) history(post, "created");
  const before = JSON.stringify([post.title, post.body, post.starts_on, post.ends_on, post.locations]);
  Object.assign(post, {
    title: draft.title, body: draft.body, category: draft.category, category_other: draft.category_other,
    starts_on: draft.starts_on, ends_on: draft.ends_on, event_from: draft.event_from, event_until: draft.event_until,
    recurrence: draft.recurrence, on_important_dates: draft.on_important_dates, on_calendar: draft.on_calendar,
    on_schedule: draft.on_schedule, ask_ack: draft.ask_ack, locations: draft.locations, people: draft.people, choices: draft.choices,
  });
  if (JSON.stringify([post.title, post.body, post.starts_on, post.ends_on, post.locations]) !== before) post.content_revision += stored ? 1 : 0;
  post.revision += 1;
  post.updated_at = nowIso();
  let shiftChanges = 0;
  let broughtBack = 0;
  if (intent === "draft") {
    const wasScheduled = post.status === "scheduled";
    post.status = "draft";
    post.publish_at = null;
    post.publish_error_code = null;
    history(post, wasScheduled ? "unscheduled" : "saved");
  } else if (intent === "schedule") {
    const again = post.status === "scheduled";
    post.status = "scheduled";
    post.publish_at = draft.publish_at;
    post.publish_error_code = null;
    history(post, "scheduled", { publish_at: post.publish_at, ...(again ? { rescheduled: true } : {}) });
  } else if (intent === "publish") {
    post.publish_at = null;
    shiftChanges = publish(post, impactOf(post, post.choices).shifts);
  } else {
    broughtBack = bringBack(post, draft.bring_back ?? []);
    shiftChanges = applyShifts(post, impactOf(post, post.choices).shifts);
    post.delivered_to = [...new Set([...post.delivered_to, ...audience(post)])];
    history(post, "updated", { told: post.delivered_to.length, shift_changes: shiftChanges, brought_back: broughtBack });
    notifyUsers(post.delivered_to, { title: `Updated: ${post.title}`, body: post.body.slice(0, 140), action_url: `/app/announcements/${post.id}`, subject_id: post.id });
  }
  if (!stored) posts().unshift(post);
  store.save();
  syncSchedule();
  return {
    status: post.status, display_status: display(post), announcement_id: post.id, revision: post.revision,
    recipient_count: post.status === "published" ? post.delivered_to.length : 0, shift_changes: shiftChanges, brought_back: broughtBack,
  };
}

function setState(id: string, action: string, body: any) {
  release();
  const post = find(id);
  if (!mayChange(post)) fail(403, "Not allowed", "authz.out_of_scope");
  if (body?.expected_revision !== post.revision) fail(409, "This post changed since you opened it.", "announcement.changed");
  const shown = display(post);
  let told = 0;
  if (action === "unschedule" && (shown === "scheduled" || shown === "publish_failed")) {
    post.status = "draft"; post.publish_at = null; post.publish_error_code = null;
    history(post, "unscheduled");
  } else if (action === "unpublish" && shown === "published") {
    told = post.delivered_to.length;
    post.status = "unpublished"; post.unpublished_at = nowIso(); post.delivered_to = [];
    withdrawNotices(post.id);
    history(post, "unpublished", { told });
  } else if (action === "archive" && (shown === "draft" || shown === "unpublished" || shown === "past")) {
    post.archived_at = nowIso(); post.delivered_to = [];
    withdrawNotices(post.id);
    history(post, "archived");
  } else if (action === "bring-back" && post.status === "unpublished") {
    const back = bringBack(post, Array.isArray(body?.bring_back) ? body.bring_back : []);
    told = back;
    history(post, "brought_back", { brought_back: back });
  } else if (action === "remind" && shown === "published" && post.ask_ack) {
    const waiting = respondents(post).filter((who) => !post.acks[who]);
    told = waiting.length;
    notifyUsers(waiting, { title: `Reminder: ${post.title}`, body: "Please acknowledge it.", action_url: `/app/announcements/${post.id}`, subject_id: post.id });
    history(post, "reminded", { told });
  } else {
    fail(409, "This post can't change anymore.", "announcement.read_only");
  }
  post.revision += 1;
  post.updated_at = nowIso();
  store.save();
  syncSchedule();
  return { status: post.status, display_status: display(post), announcement_id: post.id, revision: post.revision, archived_at: post.archived_at, told };
}

// ---------- reads other areas use ----------

/** The dashboard's newest published posts out to or managed by the reader (at most five). */
export function activeAnnouncements(limit = 5) {
  release();
  return posts()
    .filter((post) => visible(post) && display(post) === "published")
    .sort((left, right) => (right.published_at ?? "").localeCompare(left.published_at ?? ""))
    .slice(0, limit)
    .map(record);
}

// ---------- routes ----------

export function announcementsRoutes(route: Route): void {
  const base = "/v1/workspaces/:workspaceId/communications";

  route("GET", `${base}/announcements`, () => {
    release();
    return {
      workspace_id: WORKSPACE_ID,
      can_manage: manages,
      can_write_dates: manages && writesDates,
      can_read_dates: permissions.includes("important_dates.read"),
      time_format: store.data.time_format ?? "12h",
      locations: manages
        ? world.locations.filter((location) => writable().includes(location.id)).map((location) => ({
            id: location.id, name: location.name, short_name: location.short_name, timezone: location.timezone,
            can_change_hours: writesDates,
            people_count: members().filter((one) => one.location_ids.includes(location.id) && one.user_id !== viewer.userId).length,
          }))
        : [],
      people: manages
        ? members().filter((one) => one.user_id !== viewer.userId && (wide || (one.location_ids.length > 0 && writable().includes(one.location_ids[0]!))))
            .sort((left, right) => left.name.localeCompare(right.name)).map(person)
        : [],
      departments: manages ? world.departments.filter((one) => !one.system_key).map((one) => ({ id: one.id, name: one.name })) : [],
      jobs: manages ? world.jobs.filter((one) => !one.system_key).map((one) => ({ id: one.id, name: one.name, department_id: one.department_id })) : [],
      announcements: posts().filter(visible).map(record),
    };
  });

  route("GET", `${base}/important-dates`, () => {
    release();
    if (!permissions.includes("important_dates.read")) fail(403, "Not allowed", "authz.missing_permission");
    return {
      workspace_id: WORKSPACE_ID,
      time_format: store.data.time_format ?? "12h",
      can_write: writesDates,
      dates: posts().filter((post) => post.on_important_dates && visible(post) && ["published", "past"].includes(display(post))).map(record),
    };
  });

  route("POST", `${base}/announcements/preview`, ({ body }) => preview(body));
  // PAGES: both frames run a scenario's clicks; the second write gets the first one's answer.
  route("POST", `${base}/announcements`, ({ body }) => replayed(["post", body], () => save(body)));

  route("GET", `${base}/announcements/:announcementId`, ({ params }) => {
    release();
    return detail(find(params.announcementId));
  });

  for (const action of ["unschedule", "unpublish", "archive", "bring-back", "remind"]) {
    route("POST", `${base}/announcements/:announcementId/${action}`, ({ params, body }) =>
      replayed(["post", action, params.announcementId, body], () => setState(params.announcementId, action, body)));
  }

  route("POST", `${base}/announcements/:announcementId/acknowledge`, ({ params }) => replayed(["post", "ack", params.announcementId], () => {
    const post = find(params.announcementId);
    if (!reachesMe(post) || !respondents(post).includes(viewer.userId)) fail(403, "Not allowed", "authz.out_of_scope");
    post.acks[viewer.userId] ??= nowIso();
    store.save();
    return { status: "saved", affected: 1 };
  }));
}

syncSchedule();
