// Demo backend for Important Dates (Settings > Important Dates, and the dates
// the Schedule shows). Mirrors read_settings_important_dates_service,
// save_important_date_service and friends in supabase/schema.sql: who may
// write (K1-K3), past dates read-only (K11), closed days over published shifts
// (K13), unpublish / republish / archive / restore, and the change history.
// The full records live here; world.important_dates and world.closures keep
// the published part in step for the Schedule.
import { ApiError, type Handler } from "./api";
import { domainStore } from "./store";
import { addDays, fingerprint, iso, mondayOf, todayIn, uuid } from "./time";
import { viewerRole } from "./viewer";
import {
  LOC, MANAGER_NAME, MANAGER_USER_ID, OWNER_NAME, OWNER_USER_ID, WORKSPACE_ID, ZONE,
  persist, viewer, world,
} from "./world";
import { locationRecord, notifyPeople } from "./communications-service";

type Route = (method: string, path: string, handler: Handler) => void;
type DateType = "holiday" | "event" | "blackout" | "closed_day";

interface Change {
  id: string;
  action: "created" | "updated" | "unpublished" | "republished" | "archived" | "restored";
  changed_at: string;
  actor_user_id: string;
  actor_name: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface DateRecord {
  id: string;
  location_ids: string[];
  title: string;
  type: DateType;
  starts_on: string;
  ends_on: string;
  recurrence: "none" | "annual";
  note: string;
  affects_scheduling: boolean;
  status: "published" | "unpublished";
  archived_at: string | null;
  revision: number;
  created_by: string;
  author_name: string;
  updated_at: string;
  delivered_to: number;
  changes: Change[];
}

const line = () => mondayOf(todayIn(ZONE));
const nowIso = () => new Date().toISOString();
const daysAgo = (days: number, clock = 14) => iso(Date.now() - days * 86_400_000 - clock * 60_000);

function fail(status: number, error: string, reason?: string): never {
  throw new ApiError(status, reason ? { error, reason } : { error });
}

// What each seeded date says, and who wrote it.
const seedNotes: Record<string, { note: string; affects: boolean; by: "owner" | "manager"; age: number }> = {
  Halloween: { note: "Costume contest at the bar from 8 PM. Expect walk-ins after 9.", affects: true, by: "owner", age: 34 },
  Thanksgiving: { note: "Prix fixe menu only, seatings 12-7 PM. Plan one extra line cook.", affects: true, by: "owner", age: 30 },
  "Kitchen deep clean & hood service": { note: "Hood vendor on site 6 AM-2 PM. Downtown is closed all day.", affects: true, by: "manager", age: 6 },
  "Hartwell private buyout": { note: "Full buyout of Uptown, 120 guests, 6-11 PM. Bar opens at 5:30 PM.", affects: true, by: "owner", age: 9 },
  "Downtown Restaurant Week": { note: "Three-course menu at $45. Add a server and a busser to every dinner.", affects: true, by: "manager", age: 4 },
  "Christmas Eve": { note: "Close at 9 PM; last seating at 8 PM.", affects: true, by: "owner", age: 40 },
  "Christmas Day": { note: "Both locations closed.", affects: true, by: "owner", age: 40 },
  "New Year's Eve": { note: "No time off this night: all hands for the countdown service.", affects: true, by: "owner", age: 40 },
  "Labor Day": { note: "Brunch menu until 3 PM.", affects: false, by: "owner", age: 60 },
  "Fall menu launch": { note: "New fall menu goes live. Pre-shift tasting at 3:30 PM.", affects: true, by: "manager", age: 21 },
};

function author(by: "owner" | "manager") {
  return by === "owner" ? { id: OWNER_USER_ID, name: OWNER_NAME } : { id: MANAGER_USER_ID, name: MANAGER_NAME };
}

function snapshot(record: Omit<DateRecord, "changes">): Record<string, unknown> {
  return {
    title: record.title, type: record.type, starts_on: record.starts_on, ends_on: record.ends_on,
    recurrence: record.recurrence, note: record.note, affects_scheduling: record.affects_scheduling,
    location_ids: record.location_ids, status: record.status, archived_at: record.archived_at,
  };
}

function seedRecord(
  input: Pick<DateRecord, "id" | "location_ids" | "title" | "type" | "starts_on" | "ends_on" | "recurrence">,
  extra: { note: string; affects: boolean; by: "owner" | "manager"; age: number; status?: "published" | "unpublished"; archivedAge?: number },
): DateRecord {
  const who = author(extra.by);
  const created = daysAgo(extra.age);
  const record: Omit<DateRecord, "changes"> = {
    ...input,
    note: extra.note,
    affects_scheduling: input.type === "closed_day" ? true : extra.affects,
    status: extra.status ?? "published",
    archived_at: extra.archivedAge !== undefined ? daysAgo(extra.archivedAge) : null,
    revision: extra.archivedAge !== undefined ? 2 : 1,
    created_by: who.id,
    author_name: who.name,
    updated_at: extra.archivedAge !== undefined ? daysAgo(extra.archivedAge) : created,
    delivered_to: extra.status === "unpublished" ? 0 : input.location_ids.length === 1 ? 10 : 16,
  };
  const changes: Change[] = [{
    id: uuid(), action: "created", changed_at: created, actor_user_id: who.id, actor_name: who.name,
    before: null, after: snapshot({ ...record, archived_at: null }),
  }];
  if (record.archived_at) {
    changes.push({
      id: uuid(), action: "archived", changed_at: record.archived_at, actor_user_id: who.id, actor_name: who.name,
      before: snapshot({ ...record, archived_at: null }), after: snapshot(record),
    });
  }
  return { ...record, changes };
}

function seed(): { dates: DateRecord[] } {
  const thisWeek = line();
  const dates = world.important_dates.map((item) => seedRecord(
    {
      id: item.id,
      location_ids: item.location_ids ?? (item.location_id ? [item.location_id] : []),
      title: item.title, type: item.type, starts_on: item.starts_on, ends_on: item.ends_on, recurrence: item.recurrence,
    },
    seedNotes[item.title] ?? { note: "", affects: true, by: "owner", age: 10 },
  ));
  // Two the Schedule does not show: a draft kept unpublished and an archived one.
  dates.push(seedRecord(
    { id: "00000a0b-0000-4000-8000-000000000a0b", location_ids: [LOC.downtown], title: "Staff holiday party", type: "event",
      starts_on: addDays(thisWeek, 66), ends_on: addDays(thisWeek, 66), recurrence: "none" },
    { note: "After close at Downtown. Not confirmed with the venue yet.", affects: false, by: "manager", age: 2, status: "unpublished" },
  ));
  dates.push(seedRecord(
    { id: "00000a0c-0000-4000-8000-000000000a0c", location_ids: [LOC.uptown], title: "Patio season closing", type: "event",
      starts_on: addDays(thisWeek, 19), ends_on: addDays(thisWeek, 19), recurrence: "none" },
    { note: "Last day for the patio; staff help stack furniture after lunch.", affects: false, by: "owner", age: 25, archivedAge: 3 },
  ));
  return { dates };
}

const store = domainStore("dates", seed);
const records = () => store.data.dates;

// ---------- who may do what ----------

function liveLocations(ids: readonly string[]): string[] {
  const live = world.locations.map((location) => location.id);
  return ids.length ? ids.filter((id) => live.includes(id)) : live;
}

/** communication_reason: may this person change this date (K1-K3)? */
function controls(record: Pick<DateRecord, "location_ids" | "created_by">): boolean {
  if (viewerRole === "owner") return true;
  if (viewerRole !== "manager") return false;
  // A manager writes for their one location, and never over the owner's record (rank).
  return record.location_ids.length === 1 && record.location_ids[0] === LOC.downtown && record.created_by !== OWNER_USER_ID;
}

/** important_date_out_to: a published date that reaches this reader. */
function reaches(record: DateRecord): boolean {
  if (record.status !== "published" || record.archived_at) return false;
  if (viewerRole === "owner") return true;
  return record.location_ids.length === 0 || record.location_ids.includes(LOC.downtown);
}

const visible = (record: DateRecord) => controls(record) || reaches(record);
const isPast = (record: Pick<DateRecord, "recurrence" | "ends_on">) => record.recurrence === "none" && record.ends_on < line();

function writableLocations(): string[] {
  if (viewerRole === "owner") return world.locations.map((location) => location.id);
  if (viewerRole === "manager") return [LOC.downtown];
  return [];
}

function requireReader(): void {
  if (viewerRole === "employee") fail(403, "Not allowed", "authz.missing_permission");
}

function readDate(record: DateRecord) {
  const allowed = controls(record);
  const past = isPast(record);
  const live = !past && !record.archived_at;
  const names = record.location_ids.map((id) => world.locations.find((location) => location.id === id)?.name ?? "Archived location");
  return {
    id: record.id,
    workspace_id: WORKSPACE_ID,
    location_id: record.location_ids.length === 1 ? record.location_ids[0]! : null,
    location_ids: record.location_ids,
    location_names: names,
    location_name: record.location_ids.length === 1 ? names[0]! : null,
    title: record.title,
    type: record.type,
    starts_on: record.starts_on,
    ends_on: record.ends_on,
    recurrence: record.recurrence,
    note: record.note,
    affects_scheduling: record.affects_scheduling,
    archived_at: record.archived_at,
    status: record.status,
    revision: record.revision,
    created_by: record.created_by,
    author_name: record.author_name,
    updated_at: record.updated_at,
    is_past: past,
    can_edit: allowed && live,
    can_unpublish: allowed && live && record.status === "published",
    can_republish: allowed && live && record.status === "unpublished",
    can_archive: allowed && live,
    can_restore: allowed && !past && Boolean(record.archived_at),
  };
}

// ---------- the Schedule's view of the dates ----------

/** closure_days: each location and day a closed-day date closes (yearly: this year and the next two). */
function closureDays(record: Pick<DateRecord, "type" | "starts_on" | "ends_on" | "recurrence" | "location_ids">) {
  if (record.type !== "closed_day") return [];
  const years = record.recurrence === "annual"
    ? Math.max(Number(todayIn(ZONE).slice(0, 4)) + 2 - Number(record.starts_on.slice(0, 4)), 0)
    : 0;
  const out: { location_id: string; closed_date: string }[] = [];
  for (const locationId of liveLocations(record.location_ids)) {
    for (let year = 0; year <= years; year += 1) {
      const shift = (date: string) => `${Number(date.slice(0, 4)) + year}${date.slice(4)}`;
      for (let day = shift(record.starts_on); day <= shift(record.ends_on); day = addDays(day, 1)) {
        out.push({ location_id: locationId, closed_date: day });
      }
    }
  }
  return out;
}

function closureId(dateId: string, locationId: string, day: string): string {
  return `${day.replaceAll("-", "")}-0000-4000-8${locationId.slice(-3)}-${dateId.slice(-12)}`;
}

/** Keeps world.important_dates and world.closures equal to the published dates. */
function syncWorld(): void {
  const live = records().filter((record) => record.status === "published" && !record.archived_at);
  world.important_dates = live.map((record) => ({
    id: record.id,
    location_id: record.location_ids.length === 1 ? record.location_ids[0]! : null,
    location_ids: record.location_ids,
    title: record.title,
    type: record.type,
    starts_on: record.starts_on,
    ends_on: record.ends_on,
    recurrence: record.recurrence,
  }));
  world.closures = live.flatMap((record) => closureDays(record).map((day) => ({
    id: closureId(record.id, day.location_id, day.closed_date),
    location_id: day.location_id,
    closed_date: day.closed_date,
    end_date: null,
    title: record.title,
    is_all_day: true,
    shift_type_ids: [],
    important_date_id: record.id,
  })));
  persist();
}

// ---------- K13: closed days over published shifts ----------

function closureImpact(input: Pick<DateRecord, "type" | "starts_on" | "ends_on" | "recurrence" | "location_ids">, stored: DateRecord | null) {
  // Only the days this change newly closes count.
  const already = new Set(stored && stored.status === "published" && !stored.archived_at
    ? closureDays(stored).map((day) => `${day.location_id}:${day.closed_date}`)
    : []);
  const days = closureDays(input).filter((day) => !already.has(`${day.location_id}:${day.closed_date}`));
  const keys = new Set(days.map((day) => `${day.location_id}:${day.closed_date}`));
  const readable = writableLocations();
  const shifts = world.publications
    .flatMap((publication) => publication.shifts)
    .filter((shift) => shift.employee_id && keys.has(`${shift.location_id}:${shift.scheduled_date}`));
  const draftShifts = world.drafts.flatMap((draft) => draft.shifts)
    .filter((shift) => keys.has(`${shift.location_id}:${shift.scheduled_date}`));
  const listed = shifts.filter((shift) => readable.includes(shift.location_id));
  return {
    fingerprint: fingerprint(JSON.stringify(shifts.map((shift) => [shift.id, shift.revision]))),
    shifts: listed.map((shift) => {
      const location = world.locations.find((item) => item.id === shift.location_id)!;
      const employee = world.employees.find((item) => item.id === shift.employee_id);
      return {
        id: shift.id,
        source_id: shift.id,
        employee_id: shift.employee_id!,
        employee_name: employee?.display_name ?? null,
        location_id: shift.location_id,
        location_name: location.name,
        job_name: world.jobs.find((job) => job.id === shift.job_id)?.name ?? "Job",
        scheduled_date: shift.scheduled_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        starts_at: `${shift.scheduled_date}T${shift.start_time}:00`,
        ends_at: `${shift.scheduled_date}T${shift.end_time}:00`,
      };
    }),
    hidden_shift_count: shifts.length - listed.length,
    draft_shift_count: draftShifts.length,
    all: shifts,
    drafts: draftShifts,
  };
}

/** important_date_close_shifts: the listed shifts drop to open, but the kept ones. */
function closeShifts(impact: ReturnType<typeof closureImpact>, keep: readonly string[]): { opened: number; drafts: number } {
  let opened = 0;
  for (const shift of impact.all) {
    if (keep.includes(shift.id)) continue;
    shift.employee_id = null;
    shift.revision += 1;
    opened += 1;
  }
  for (const shift of impact.drafts) shift.employee_id = null;
  return { opened, drafts: impact.drafts.length };
}

// ---------- validation ----------

interface DateInput {
  title: string;
  type: DateType;
  starts_on: string;
  ends_on: string;
  recurrence: "none" | "annual";
  note: string;
  affects_scheduling: boolean;
  location_ids: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseInput(body: any): DateInput {
  const types: DateType[] = ["holiday", "event", "blackout", "closed_day"];
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const ids: string[] = Array.isArray(body?.location_ids)
    ? body.location_ids
    : body?.location_id ? [body.location_id] : [];
  const valid = title.length >= 1 && title.length <= 120
    && types.includes(body?.type)
    && DATE.test(body?.starts_on ?? "") && DATE.test(body?.ends_on ?? "") && body.ends_on >= body.starts_on
    && ["none", "annual"].includes(body?.recurrence)
    && (body?.note ?? "").length <= 500
    && !(body?.type === "closed_day" && body?.affects_scheduling === false);
  if (!valid) fail(400, "Valid important date required");
  return {
    title,
    type: body.type,
    starts_on: body.starts_on,
    ends_on: body.ends_on,
    recurrence: body.recurrence,
    note: body.note ?? "",
    affects_scheduling: body.type === "closed_day" ? true : body.affects_scheduling !== false,
    location_ids: [...new Set(ids)].sort(),
  };
}

function find(id: string): DateRecord {
  const record = records().find((item) => item.id === id);
  if (!record || !visible(record)) fail(403, "Not allowed", "authz.out_of_scope");
  return record;
}

function requireControl(record: Pick<DateRecord, "location_ids" | "created_by">): void {
  if (!controls(record)) fail(403, "Not allowed", "authz.out_of_scope");
}

function audience(record: DateRecord): number {
  const live = liveLocations(record.location_ids);
  return world.employees.filter((employee) => employee.location_ids.some((id) => live.includes(id))).length + (live.length > 1 ? 1 : 2);
}

function record(record: DateRecord, action: Change["action"], before: Record<string, unknown> | null): void {
  record.changes.push({
    id: uuid(), action, changed_at: nowIso(), actor_user_id: viewer.userId, actor_name: viewer.name,
    before, after: snapshot(record),
  });
}

/** important_date_deliver: the people it reaches hear about it. */
function deliver(item: DateRecord): void {
  if (item.status !== "published" || item.archived_at) return;
  item.delivered_to = audience(item);
  const when = item.starts_on === item.ends_on ? item.starts_on : `${item.starts_on} to ${item.ends_on}`;
  notifyPeople({
    locationIds: item.location_ids,
    exceptUserId: viewer.userId,
    category: "schedule",
    type_key: "schedule.important_date.available",
    title: item.type === "closed_day" ? `Closed: ${item.title}` : `Important date: ${item.title}`,
    body: `${when}${item.note ? ` · ${item.note}` : ""}`,
    action_url: "/app/employee-hub/schedule",
    subject_type: "important_date",
    subject_id: item.id,
  });
}

// ---------- routes ----------

export function datesRoutes(route: Route): void {
  syncWorld();
  const base = "/v1/workspaces/:workspaceId/settings/important-dates";

  route("GET", base, () => {
    requireReader();
    const writable = writableLocations();
    return {
      can_manage: viewerRole === "owner" || writable.length > 0,
      can_target_workspace: viewerRole === "owner",
      locked_before: line(),
      dates: records()
        .filter(visible)
        .sort((left, right) => left.starts_on.localeCompare(right.starts_on) || left.title.localeCompare(right.title))
        .map(readDate),
      locations: world.locations.filter((location) => writable.includes(location.id)).map(locationRecord),
    };
  });

  route("POST", `${base}/closure-preview`, ({ body }) => {
    requireReader();
    const stored = body?.important_date_id ? find(body.important_date_id) : null;
    const impact = closureImpact({ ...body, location_ids: body?.location_ids ?? [] }, stored);
    return { fingerprint: impact.fingerprint, shifts: impact.shifts, hidden_shift_count: impact.hidden_shift_count, draft_shift_count: impact.draft_shift_count };
  });

  const save = (id: string | null, body: any) => {
    requireReader();
    const input = parseInput(body);
    const before = id ? find(id) : null;
    if (before) {
      requireControl(before);
      requireControl({ location_ids: input.location_ids, created_by: before.created_by });
      if (before.archived_at) fail(409, "Restore this date before you edit it");
      if (before.revision !== body?.expected_revision) fail(409, "This date changed. Reload and try again.");
    } else {
      if (viewerRole === "manager" && !(input.location_ids.length === 1 && input.location_ids[0] === LOC.downtown)) {
        fail(403, "Not allowed", "authz.out_of_scope");
      }
      requireControl({ location_ids: input.location_ids, created_by: viewer.userId });
    }
    const untouched = before !== null
      && JSON.stringify([before.title, before.type, before.starts_on, before.ends_on, before.recurrence, before.note, before.affects_scheduling, before.location_ids])
        === JSON.stringify([input.title, input.type, input.starts_on, input.ends_on, input.recurrence, input.note, input.affects_scheduling, input.location_ids]);
    if (before && !untouched && isPast(before)) fail(400, "Past important dates are read-only.", "important_date.past");
    if (!untouched) {
      if (input.recurrence === "annual" && input.starts_on < line()) {
        // A yearly date given a past year starts with its next day from the line on.
        let years = 1;
        while (`${Number(input.starts_on.slice(0, 4)) + years}${input.starts_on.slice(4)}` < line()) years += 1;
        const move = (date: string) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
        input.starts_on = move(input.starts_on);
        input.ends_on = move(input.ends_on);
      } else if (input.starts_on < line()) {
        if (!before || before.recurrence !== "none" || input.starts_on !== before.starts_on || input.ends_on < line()) {
          fail(400, "Past important dates are read-only.", "important_date.past");
        }
      }
    }
    // K13: a published closed day newly landing on published shifts needs the list it was shown.
    const impact = !before || before.status === "published" ? closureImpact(input, before) : null;
    if (impact && impact.all.length > 0 && body?.expected_fingerprint !== impact.fingerprint) {
      fail(409, "Review the shifts on this closed day again.", "important_date.closure_changed");
    }
    let item: DateRecord;
    const was = before ? snapshot(before) : null;
    if (before) {
      Object.assign(before, input, { revision: before.revision + 1, updated_at: nowIso() });
      item = before;
    } else {
      item = {
        id: uuid(), ...input, status: "published", archived_at: null, revision: 1,
        created_by: viewer.userId, author_name: viewer.name, updated_at: nowIso(), delivered_to: 0, changes: [],
      };
      records().push(item);
    }
    const opened = impact ? closeShifts(impact, body?.keep_shift_ids ?? []) : { opened: 0, drafts: 0 };
    if (!untouched) deliver(item);
    record(item, before ? "updated" : "created", was);
    store.save();
    syncWorld();
    return {
      important_date_id: item.id,
      status: item.status,
      revision: item.revision,
      recipient_count: item.delivered_to,
      shifts_opened: opened.opened,
      draft_shifts_opened: opened.drafts,
      shifts_stay_open: 0,
    };
  };

  route("POST", base, ({ body }) => save(null, body));
  route("PUT", `${base}/:importantDateId`, ({ params, body }) => save(params.importantDateId, body));

  route("GET", `${base}/:importantDateId/history`, ({ params }) => {
    requireReader();
    const item = find(params.importantDateId);
    const mine = controls(item);
    return {
      important_date_id: item.id,
      author_user_id: item.created_by,
      author_name: item.author_name,
      changes: [...item.changes].reverse().map((change) => ({
        ...change,
        // K6: a reader who does not control the date sees what changed, not who or when.
        changed_at: mine ? change.changed_at : null,
        actor_user_id: mine ? change.actor_user_id : null,
        actor_name: mine ? change.actor_name : null,
      })),
    };
  });

  route("POST", `${base}/:importantDateId/:action`, ({ params, body }) => {
    requireReader();
    const action = params.action as "unpublish" | "republish" | "archive" | "restore";
    if (!["unpublish", "republish", "archive", "restore"].includes(action)) fail(400, "Valid important date action required");
    const item = find(params.importantDateId);
    requireControl(item);
    if (isPast(item)) fail(400, "Past important dates are read-only.", "important_date.past");
    const was = snapshot(item);
    let opened = { opened: 0, drafts: 0 };
    if (action === "archive") {
      if (item.archived_at) fail(409, "This date is already archived.");
      item.archived_at = nowIso();
    } else if (action === "restore") {
      if (!item.archived_at) fail(409, "This date is not archived.");
      item.archived_at = null;
    } else if (action === "unpublish") {
      if (item.archived_at) fail(409, "Restore this date before you edit it");
      if (item.status === "unpublished") fail(409, "This date is already unpublished.");
      item.status = "unpublished";
    } else {
      if (item.archived_at) fail(409, "Restore this date before you edit it");
      if (item.status === "published") fail(409, "This date is already published.");
      const impact = closureImpact(item, null);
      if (impact.all.length > 0 && body?.expected_fingerprint !== impact.fingerprint) {
        fail(409, "Review the shifts on this closed day again.", "important_date.closure_changed");
      }
      opened = closeShifts(impact, body?.keep_shift_ids ?? []);
      item.status = "published";
      deliver(item);
    }
    item.revision += 1;
    item.updated_at = nowIso();
    record(item, action === "archive" ? "archived" : action === "restore" ? "restored" : action === "unpublish" ? "unpublished" : "republished", was);
    store.save();
    syncWorld();
    return {
      important_date_id: item.id,
      status: item.status,
      archived_at: item.archived_at,
      recipient_count: item.delivered_to,
      shifts_opened: opened.opened,
      draft_shifts_opened: opened.drafts,
      shifts_stay_open: 0,
    };
  });
}
