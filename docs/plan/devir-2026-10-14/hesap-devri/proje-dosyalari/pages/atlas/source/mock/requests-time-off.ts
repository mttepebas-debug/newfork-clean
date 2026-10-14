// Time off of the demo: requests, their periods, the managers' votes, and the
// decisions that release published shifts. Mirrors the FB-6.3 time-off core in
// supabase/schema.sql (submit / decide / revoke / shorten / cancellation, the
// sweep, time_off_progress, time_off_impact, time_off_request_item).
// The requests live in this area's store; Schedule's leave (world.time_off)
// is the approved hours that remain, written back after every change.
import { domainStore } from "./store";
import { addDays, fingerprint, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { OWNER_USER_ID, MANAGER_USER_ID, WORKSPACE_ID, persist, world, type Shift, type TimeOff } from "./world";
import {
  ZONE, UPTOWN_MANAGER, actorUserId, conflict, employee, employeeName, invalid, isManager, isOwner, locationName,
  locationVoters, managedLocations, notFound, reachesPerson, refuse, userIdOf, userName, viewerEmployeeId,
} from "./requests-people";
import {
  impactShift, merge, overlapsSpan, periodSpan, publishedShifts, spanOf, subtract, toInterval, wallOf, type Span,
} from "./hub-shifts";

export interface Segment {
  id: string;
  segment_date: string;
  start_time: string | null;
  end_time: string | null;
  ends_next_day: boolean;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "denied";
  /** A cancellation's period: the approved period it gives back. */
  parent_segment_id?: string;
}

export interface Released {
  id: string;
  location_id: string;
  location_name: string;
  job_name: string;
  scheduled_date: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
}

export interface TimeOffEvent {
  id: string;
  action: string;
  actor_user_id: string | null;
  note: string;
  created_at: string;
  revision: number | null;
  released?: Released[];
  taken_until?: string;
  shortened?: boolean;
}

export interface Vote {
  voter: string;
  verdict: "approve" | "deny";
  note: string;
  at: string;
  /** The fingerprint of each location's opened shifts the voter saw. */
  impact: Record<string, string>;
}

export interface TimeOffRecord {
  id: string;
  employee_id: string;
  request_type: "time_off" | "time_off_cancellation";
  reason: string;
  status: "pending" | "approved" | "denied" | "revoked";
  revision: number;
  created_at: string;
  created_by: string;
  decide_by: string | null;
  /** time_off_required_locations: where the person worked when asking. */
  locations: string[];
  segments: Segment[];
  votes: Vote[];
  events: TimeOffEvent[];
  parent_id: string | null;
  parent_revision: number | null;
}

interface RequestsData {
  records: TimeOffRecord[];
  /** Operation ids already answered (time_off_commands). */
  commands: Record<string, { input: string; result: unknown }>;
}

const LEAD_HOURS = 24;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const nowIso = () => new Date().toISOString();
// fingerprint("") is not hex (its hash never runs), so every text gets a prefix.
const shortFp = (text: string) => fingerprint(`time-off:${text}`).slice(0, 32);
const EMPTY = shortFp("");
const segmentSpan = (segment: Segment): Span => ({ start: Date.parse(segment.starts_at), end: Date.parse(segment.ends_at) });
const shiftsFingerprint = (shifts: { location_id: string; job_id: string; scheduled_date: string; start_time: string | null; end_time: string | null }[]) =>
  shortFp(shifts.map((shift) => [shift.location_id, shift.job_id, shift.scheduled_date, shift.start_time, shift.end_time].join("|")).sort().join(","));
const fixedId = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

// ---------- seed ----------

const E = (first: string) => world.employees.find((item) => item.display_name.split(" ")[0]!.toLowerCase() === first)!.id;

function seed(): RequestsData {
  const now = Date.now();
  const today = todayIn(ZONE);
  const thisWeek = mondayOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const nextWeek = addDays(thisWeek, 7);
  const at = (date: string, clock: string) => iso(localInstant(date, clock, ZONE));
  const ago = (hours: number) => iso(now - hours * HOUR);
  const records: TimeOffRecord[] = [];

  type Day = [date: string, start?: string, end?: string];
  const segments = (days: Day[], status: Segment["status"]): Segment[] => days.map(([date, start, end]) => {
    const span = periodSpan(date, start ?? null, end ?? null);
    return {
      id: uuid(), segment_date: date, start_time: start ? `${start}:00` : null, end_time: end ? `${end}:00` : null,
      ends_next_day: Boolean(start && end && end <= start), starts_at: iso(span.start), ends_at: iso(span.end), status,
    };
  });
  const range = (from: string, days: number, start?: string, end?: string): Day[] =>
    Array.from({ length: days }, (_, index) => [addDays(from, index), start, end]);
  const decideBy = (days: Day[], created: string) => {
    const starts = periodSpan(days[0]![0], days[0]![1] ?? null, days[0]![2] ?? null).start;
    return iso(starts - LEAD_HOURS * HOUR > Math.max(Date.parse(created), now + HOUR) ? starts - LEAD_HOURS * HOUR : starts);
  };

  function add(options: {
    n: number; who: string; days: Day[]; reason: string; created: string;
    status?: TimeOffRecord["status"];
    votes?: { by: { userId: string }; at: string; verdict?: "approve" | "deny"; note?: string; place: string }[];
    decided?: { by: string | null; at: string; note?: string; action?: string; alone?: boolean };
  }): TimeOffRecord {
    const person = options.who;
    const status = options.status ?? "pending";
    const segmentStatus: Segment["status"] = status === "approved" ? "approved" : status === "denied" ? "denied" : "pending";
    const record: TimeOffRecord = {
      id: fixedId(options.n), employee_id: person, request_type: "time_off", reason: options.reason, status,
      revision: 1, created_at: options.created, created_by: userIdOf(person),
      decide_by: decideBy(options.days, options.created), locations: [...employee(person)!.location_ids],
      segments: segments(options.days, status === "revoked" ? "pending" : segmentStatus), votes: [], events: [],
      parent_id: null, parent_revision: null,
    };
    record.events.push({ id: uuid(), action: "submitted", actor_user_id: userIdOf(person), note: "", created_at: options.created, revision: 1 });
    for (const vote of options.votes ?? []) {
      record.votes.push({ voter: vote.by.userId, verdict: vote.verdict ?? "approve", note: vote.note ?? "", at: vote.at, impact: {} });
      record.revision += 1;
    }
    if (options.decided) {
      record.revision += 1;
      record.events.push({
        id: uuid(), action: options.decided.action ?? status, actor_user_id: options.decided.by, note: options.decided.note ?? "",
        created_at: options.decided.at, revision: record.revision,
      });
    }
    records.push(record);
    return record;
  }

  const rachel = { userId: MANAGER_USER_ID };
  const david = { userId: UPTOWN_MANAGER.userId };
  const DT = world.locations[0]!.id;
  const UP = world.locations[1]!.id;

  // Approved leave Schedule already shows.
  add({ n: 0x701, who: E("maria"), days: range(addDays(thisWeek, 2), 2), reason: "Family trip", created: at(addDays(thisWeek, -12), "10:14"),
    status: "approved", votes: [{ by: rachel, at: at(addDays(thisWeek, -11), "09:02"), place: DT }],
    decided: { by: MANAGER_USER_ID, at: at(addDays(thisWeek, -11), "09:02") } });
  add({ n: 0x702, who: E("jake"), days: range(nextWeek, 2), reason: "Moving day", created: at(addDays(thisWeek, -6), "21:40"),
    status: "approved", votes: [{ by: rachel, at: at(addDays(thisWeek, -5), "11:20"), place: DT }, { by: david, at: at(addDays(thisWeek, -4), "08:45"), place: UP }],
    decided: { by: UPTOWN_MANAGER.userId, at: at(addDays(thisWeek, -4), "08:45") } });
  add({ n: 0x703, who: E("noah"), days: [[addDays(thisWeek, 3), "15:00", "23:00"]], reason: "Evening class — midterm exam", created: at(addDays(thisWeek, -9), "13:05"),
    status: "approved", votes: [{ by: david, at: at(addDays(thisWeek, -8), "17:30"), place: UP }],
    decided: { by: UPTOWN_MANAGER.userId, at: at(addDays(thisWeek, -8), "17:30") } });
  add({ n: 0x704, who: E("olivia"), days: range(addDays(nextWeek, 4), 2), reason: "My sister's wedding in Boston", created: at(addDays(thisWeek, -15), "19:12"),
    status: "approved", decided: { by: OWNER_USER_ID, at: at(addDays(thisWeek, -14), "10:00"), note: "Congratulations to your sister!" } });
  add({ n: 0x70e, who: E("maria"), days: range(addDays(nextWeek, 9), 2), reason: "Cousin's wedding in San Diego", created: at(addDays(thisWeek, -3), "16:48"),
    status: "approved", votes: [{ by: rachel, at: at(addDays(thisWeek, -2), "10:31"), place: DT }],
    decided: { by: MANAGER_USER_ID, at: at(addDays(thisWeek, -2), "10:31"), note: "Have a great time!" } });

  // Waiting for a decision.
  add({ n: 0x705, who: E("maria"), days: [[addDays(nextWeek, 3), "09:00", "13:00"]], reason: "Dentist appointment", created: ago(20) });
  // Days left in this week with published shifts: the approval opens them.
  const ahead = (from: number, count: number) => {
    const days: Day[] = [];
    for (let offset = from; days.length < count && offset < 7; offset += 1) {
      const date = addDays(today, offset);
      if (date > addDays(thisWeek, 6)) break;
      days.push([date]);
    }
    return days.length ? days : range(addDays(nextWeek, 1), count);
  };
  const ethanDays = ahead(1, 2);
  add({ n: 0x711, who: E("ethan"), days: ethanDays, reason: "Family emergency — flying to Atlanta for my grandmother's funeral.", created: ago(5) });
  const jakeDays = ahead(1, 3);
  const jake = add({ n: 0x706, who: E("jake"), days: jakeDays, reason: "Visiting my parents in Vermont", created: ago(30),
    votes: [{ by: david, at: ago(8), place: UP }] });
  add({ n: 0x707, who: E("emma"), days: [[addDays(nextWeek, 1), "10:00", "14:00"]], reason: "Doctor appointment", created: ago(26) });
  add({ n: 0x708, who: E("sophie"), days: range(addDays(nextWeek, 7), 3), reason: "Visiting family in Chicago", created: ago(50) });
  add({ n: 0x709, who: E("tom"), days: [[addDays(nextWeek, 2)]], reason: "Jury duty summons", created: ago(3) });

  // Closed.
  add({ n: 0x70a, who: E("priya"), days: [[addDays(lastWeek, 4)]], reason: "Concert in Philly", created: at(addDays(lastWeek, -6), "22:10"),
    status: "denied", votes: [{ by: rachel, at: at(addDays(lastWeek, -4), "12:15"), verdict: "deny", place: DT, note: "We're short on hosts Friday night. Could you ask Olivia to cover instead?" }],
    decided: { by: MANAGER_USER_ID, at: at(addDays(lastWeek, -4), "12:15"), note: "We're short on hosts Friday night. Could you ask Olivia to cover instead?" } });
  const ethanWedding = add({ n: 0x70b, who: E("ethan"), days: [[addDays(lastWeek, 5)]], reason: "Brother's wedding", created: at(addDays(lastWeek, -3), "08:55"),
    status: "approved", votes: [{ by: rachel, at: at(addDays(lastWeek, -1), "14:02"), place: DT }],
    decided: { by: MANAGER_USER_ID, at: at(addDays(lastWeek, -1), "14:02") } });
  add({ n: 0x70c, who: E("luis"), days: [[addDays(lastWeek, 2)]], reason: "Car repair", created: at(addDays(lastWeek, 1), "07:30"),
    status: "denied", decided: { by: null, at: at(addDays(lastWeek, 2), "00:00"), note: "Not decided in time", action: "expired" } });
  add({ n: 0x70d, who: E("marcus"), days: range(addDays(nextWeek, 3), 2), reason: "Road trip with friends", created: at(addDays(thisWeek, -5), "18:00"),
    status: "revoked", decided: { by: userIdOf(E("marcus")), at: at(addDays(thisWeek, -3), "09:12"), note: "Cancelled by employee", action: "revoked" } });
  add({ n: 0x70f, who: E("grace"), days: [[addDays(nextWeek, 5)]], reason: "Halloween party", created: at(addDays(thisWeek, -4), "15:20"),
    status: "denied", votes: [{ by: david, at: at(addDays(thisWeek, -3), "10:05"), verdict: "deny", place: UP, note: "Halloween weekend — we need every bartender." }],
    decided: { by: UPTOWN_MANAGER.userId, at: at(addDays(thisWeek, -3), "10:05"), note: "Halloween weekend — we need every bartender." } });

  // Jake asks to give back Tuesday of his approved moving days.
  const moving = records.find((item) => item.id === fixedId(0x702))!;
  const tuesday = moving.segments[1]!;
  records.push({
    id: fixedId(0x710), employee_id: E("jake"), request_type: "time_off_cancellation", reason: "The movers came a day early — I can work Tuesday.",
    status: "pending", revision: 1, created_at: ago(14), created_by: userIdOf(E("jake")),
    decide_by: iso(Date.parse(tuesday.starts_at) - LEAD_HOURS * HOUR > now + HOUR ? Date.parse(tuesday.starts_at) - LEAD_HOURS * HOUR : Date.parse(tuesday.starts_at)),
    locations: [...employee(E("jake"))!.location_ids],
    segments: [{ ...tuesday, id: uuid(), status: "pending", parent_segment_id: tuesday.id }], votes: [], events: [
      { id: uuid(), action: "submitted", actor_user_id: userIdOf(E("jake")), note: "The movers came a day early — I can work Tuesday.", created_at: ago(14), revision: 1 },
    ], parent_id: moving.id, parent_revision: moving.revision,
  });

  const data: RequestsData = { records, commands: {} };
  // A vote counts for the shifts its voter saw.
  for (const record of records) {
    const pictured = impact(record);
    for (const vote of record.votes) {
      const places = liveLocations(record).filter((place) => locationVoters[place]!.some((voter) => voter.userId === vote.voter));
      vote.impact = Object.fromEntries(places.map((place) => [place, pictured.locations[place]?.fingerprint ?? EMPTY]));
    }
  }
  void jake;
  // Ethan's wedding left his Saturday dinner open last week.
  const released = releaseShifts(ethanWedding, true, Date.parse(ethanWedding.created_at));
  ethanWedding.events.at(-1)!.released = released;
  return data;
}

// ---------- the store ----------

const store = domainStore<RequestsData>("requests", seed);
export const records = () => store.data.records;

export function saveRequests(): void {
  syncLeave();
  store.save();
  persist();
}

// ---------- ranges ----------

function byId(id: string | null | undefined) {
  return records().find((record) => record.id === id);
}

/** time_off_cancelled_ranges: hours of a period given back by approved cancellations. */
function cancelledRanges(segment: Segment): Span[] {
  return merge(records()
    .filter((record) => record.request_type === "time_off_cancellation" && record.status === "approved")
    .flatMap((record) => record.segments.filter((item) => item.parent_segment_id === segment.id).map(segmentSpan)));
}

/** time_off_effective_ranges: the hours of a period that are leave now. */
export function effectiveRanges(record: TimeOffRecord, segment: Segment): Span[] {
  if (record.request_type !== "time_off") return [];
  const decided = record.status === "pending" ? [segmentSpan(segment)]
    : record.status !== "approved" || segment.status !== "approved" ? [] : [segmentSpan(segment)];
  return subtract(decided, cancelledRanges(segment));
}

function recordRanges(record: TimeOffRecord): Span[] {
  return merge(record.segments.flatMap((segment) => effectiveRanges(record, segment)));
}

/** Schedule's leave: every approved hour that remains, as world.time_off rows. */
function syncLeave(): void {
  const rows: TimeOff[] = [];
  for (const record of records()) {
    if (record.request_type !== "time_off" || record.status !== "approved") continue;
    recordRanges(record).forEach((span, index) => {
      const from = wallOf(span.start);
      const to = wallOf(span.end);
      const endsAtMidnight = to.clock === "00:00:00";
      rows.push({
        id: index ? `${record.id.slice(0, 24)}${(0xf00 + index).toString(16).padStart(12, "0")}` : record.id,
        employee_id: record.employee_id,
        start_date: from.date,
        end_date: endsAtMidnight ? addDays(to.date, -1) : to.date,
        from: from.clock === "00:00:00" ? null : from.clock.slice(0, 5),
        to: endsAtMidnight ? null : to.clock.slice(0, 5),
        status: "approved",
        reason: record.reason,
      });
    });
  }
  world.time_off = rows;
}

// ---------- who decides ----------

/** time_off_live_locations: asked locations the person still works at, where somebody votes. */
function liveLocations(record: TimeOffRecord): string[] {
  const person = employee(record.employee_id);
  return record.locations
    .filter((place) => person?.location_ids.includes(place) && (locationVoters[place]?.length ?? 0) > 0)
    .sort();
}

interface Impact {
  fingerprint: string;
  shifts: ReturnType<typeof impactShift>[];
  locations: Record<string, { fingerprint: string; shifts: ReturnType<typeof impactShift>[] }>;
}

/** The person's published, not yet started shifts that the asked hours overlap. */
function affectedShifts(record: TimeOffRecord, ranges: Span[], now = Date.now()): Shift[] {
  return publishedShifts()
    .filter((shift) => shift.employee_id === record.employee_id)
    .filter((shift) => {
      const span = spanOf(shift);
      return span !== null && span.start > now && ranges.some((range) => overlapsSpan(range, span));
    })
    .sort((a, b) => (spanOf(a)!.start - spanOf(b)!.start) || a.id.localeCompare(b.id));
}

/** time_off_impact: the shifts approval would open, per location. */
function impact(record: TimeOffRecord): Impact {
  const shifts = record.request_type === "time_off" ? affectedShifts(record, record.segments.map(segmentSpan)).map(impactShift) : [];
  const places = [...new Set([...shifts.map((shift) => shift.location_id), ...liveLocations(record)])];
  return {
    fingerprint: shiftsFingerprint(shifts),
    shifts,
    locations: Object.fromEntries(places.map((place) => {
      const here = shifts.filter((shift) => shift.location_id === place);
      return [place, { fingerprint: shiftsFingerprint(here), shifts: here }];
    })),
  };
}

/** time_off_state: the votes that still count, per location. */
function state(record: TimeOffRecord) {
  const pictured = impact(record);
  const live = liveLocations(record);
  const votes = record.votes.map((vote) => ({
    ...vote,
    stale: Object.entries(vote.impact).some(([place, seen]) => seen !== (pictured.locations[place]?.fingerprint ?? EMPTY)),
  }));
  const places = live.map((place) => {
    const counted = votes
      .filter((vote) => vote.verdict === "approve" && !vote.stale && place in vote.impact)
      .filter((vote) => locationVoters[place]!.some((voter) => voter.userId === vote.voter))
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    return { id: place, approved_by: counted?.voter ?? null, approved_at: counted?.at ?? null };
  });
  return { pictured, live, votes, places, remaining: places.filter((place) => !place.approved_by).length, fallback: live.length === 0 };
}

/** schedule.read at a location, for the viewer. */
function readsScheduleAt(place: string) {
  return managedLocations().includes(place);
}

/** time_off_progress: where a pending request stands, as the viewer may see it. */
function progress(record: TimeOffRecord) {
  const st = state(record);
  const alone = record.status === "pending" && isOwner();
  const mine = record.status === "pending" && !alone && isManager() && reachesPerson(record.employee_id)
    ? st.places.map((place) => place.id).filter((place) => managedLocations().includes(place)) : [];
  const open = st.places.filter((place) => !place.approved_by).map((place) => place.id);
  const myVote = st.votes.find((vote) => vote.voter === actorUserId() && !vote.stale)?.verdict ?? null;
  const seen = alone || mine.length ? {
    fingerprint: st.pictured.fingerprint,
    locations: Object.fromEntries(Object.entries(st.pictured.locations).filter(([place]) => readsScheduleAt(place))),
    hidden_shift_count: Object.entries(st.pictured.locations).filter(([place]) => !readsScheduleAt(place))
      .reduce((total, [, place]) => total + place.shifts.length, 0),
  } : null;
  return {
    remaining: st.remaining,
    fallback: st.fallback,
    decide_by: record.decide_by,
    can_vote: mine.length > 0,
    can_decide_alone: alone,
    my_vote: myVote,
    my_approval_finalizes: alone || (mine.length > 0 && open.length > 0 && open.every((place) => mine.includes(place))),
    locations: st.places
      .map((place) => ({ ...place, name: locationName(place.id), approved_by_name: place.approved_by ? userName(place.approved_by) : null }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name, approved_by, approved_by_name, approved_at }) => ({ id, name, approved_by, approved_by_name, approved_at })),
    impact: seen,
  };
}

// ---------- shapes ----------

/** time_off_cancellation_context. */
export function cancellationContext(record: TimeOffRecord) {
  const children = records().filter((item) => item.parent_id === record.id);
  return {
    parent_request_id: record.parent_id,
    parent_revision: record.parent_revision,
    pending_request_id: children.find((item) => item.status === "pending")?.id ?? null,
    has_completed_cancellation: children.some((item) => item.status === "approved"),
    can_request: record.request_type === "time_off" && record.status === "approved"
      && !children.some((item) => item.status === "pending")
      && recordRanges(record).some((span) => span.end > Date.now()),
  };
}

/** time_off_request_periods. */
export function periodsJson(record: TimeOffRecord) {
  return [...record.segments]
    .sort((a, b) => a.segment_date.localeCompare(b.segment_date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""))
    .map((segment) => ({
      id: segment.id,
      segment_date: segment.segment_date,
      start_time: segment.start_time,
      end_time: segment.end_time,
      status: segment.status,
      effective_intervals: record.status === "approved" ? effectiveRanges(record, segment).map(toInterval) : [],
      cancelled_intervals: record.request_type === "time_off" ? cancelledRanges(segment).map(toInterval) : [],
      ends_next_day: segment.ends_next_day,
      time_timezone: ZONE,
      starts_at: segment.starts_at,
      ends_at: segment.ends_at,
    }));
}

/** time_off_event_released_assignments: what the reader may see of the opened shifts. */
export function releasedFor(record: TimeOffRecord, event: TimeOffEvent) {
  const self = record.employee_id === viewerEmployeeId();
  return (event.released ?? [])
    .filter((item) => self || readsScheduleAt(item.location_id))
    .map(({ id, location_name, job_name, scheduled_date, timezone, starts_at, ends_at }) => ({ id, location_name, job_name, scheduled_date, timezone, starts_at, ends_at }));
}

/** time_off_display_status: the words the employee reads. */
export function displayStatus(record: TimeOffRecord): string {
  if (record.status === "pending") return "Pending";
  if (record.status === "denied") return record.events.some((event) => event.action === "expired") ? "Not decided in time" : "Denied";
  const revoked = [...record.events].reverse().find((event) => event.action === "revoked");
  if (record.status === "revoked") return revoked?.actor_user_id === userIdOf(record.employee_id) ? "Withdrawn" : "Revoked";
  if (revoked?.taken_until) {
    return `Revoked · taken until ${new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(revoked.taken_until))}`;
  }
  return "Approved";
}

/** time_off_request_assignment_count: published shifts inside the leave's hours. */
function conflictCount(record: TimeOffRecord): number {
  if (record.request_type !== "time_off") return 0;
  const ranges = recordRanges(record);
  return publishedShifts().filter((shift) => {
    const span = spanOf(shift);
    return shift.employee_id === record.employee_id && span !== null && ranges.some((range) => overlapsSpan(range, span));
  }).length;
}

/** time_off_request_item: one request as the Requests lists draw it. */
export function requestItem(record: TimeOffRecord) {
  const dates = record.segments.map((segment) => segment.segment_date).sort();
  return {
    id: record.id,
    employee_id: record.employee_id,
    employee_name: employeeName(record.employee_id),
    request_type: record.request_type,
    cancellation: cancellationContext(record),
    reason: record.reason,
    status: record.status,
    start_date: dates[0]!,
    end_date: dates.at(-1)!,
    revision: record.revision,
    created_at: record.created_at,
    decide_by: record.decide_by,
    withdrawn: displayStatus(record) === "Withdrawn",
    conflict_count: conflictCount(record),
    segments: periodsJson(record),
    progress: record.status === "pending" ? progress(record) : null,
    events: [...record.events].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((event) => ({
      id: event.id,
      action: event.action,
      actor_name: userName(event.actor_user_id),
      note: event.note,
      created_at: event.created_at,
      released_assignments: releasedFor(record, event),
    })),
  };
}

// ---------- the sweep ----------

/** time_off_sweep: a request not decided in time is declined by the system. */
export function sweep(): void {
  let changed = false;
  for (const record of records()) {
    if (record.status === "pending" && record.decide_by && Date.parse(record.decide_by) <= Date.now()) {
      finalize(record, "deny", null, "Not decided in time", false, true);
      changed = true;
    }
  }
  if (changed) saveRequests();
}

// ---------- decisions ----------

/** Listeners told when approved leave opens published shifts (Shift Hub closes the offers on them). */
export const releaseListeners: ((shiftIds: string[], actor: string | null) => void)[] = [];

/** time_off_release_shifts: the leave's published, not yet started shifts become open. */
function releaseShifts(record: TimeOffRecord, quiet = false, since = Date.now()): Released[] {
  const shifts = affectedShifts(record, record.segments.map(segmentSpan), since);
  const released = shifts.map((shift) => {
    const row = impactShift(shift);
    return {
      id: row.id, location_id: row.location_id, location_name: row.location_name, job_name: row.job_name,
      scheduled_date: row.scheduled_date, timezone: row.timezone, starts_at: row.starts_at, ends_at: row.ends_at,
    };
  });
  for (const shift of shifts) shift.employee_id = null;
  if (!quiet && shifts.length) releaseListeners.forEach((listener) => listener(shifts.map((shift) => shift.id), actorUserId()));
  return released;
}

/** time_off_finalize. */
function finalize(record: TimeOffRecord, verdict: "approve" | "deny", actor: string | null, note: string, alone: boolean, expired = false): void {
  if (record.status !== "pending") conflict("This request is already closed");
  const parent = record.request_type === "time_off_cancellation" ? byId(record.parent_id) : undefined;
  if (verdict === "approve" && parent && parent.status !== "approved") conflict("The time off this cancellation is about has changed; refresh");
  const decided = verdict === "approve" ? "approved" : "denied";
  record.segments.forEach((segment) => { segment.status = decided; });
  record.status = decided;
  record.revision += 1;
  const released = verdict === "approve" && record.request_type === "time_off" ? releaseShifts(record) : [];
  record.events.push({
    id: uuid(), action: expired ? "expired" : decided, actor_user_id: actor, note, created_at: nowIso(), revision: record.revision, released,
  });
  void alone;
  if (verdict === "approve" && parent) {
    parent.revision += 1;
    if (!recordRanges(parent).length) parent.status = "revoked";
    parent.events.push({
      id: uuid(), action: parent.status, actor_user_id: actor, note: "Cancellation approved. Shifts opened earlier stay open.",
      created_at: nowIso(), revision: parent.revision,
    });
  }
}

export function decideTimeOff(requestId: string, body: { verdict: "approve" | "deny"; note?: string; expected_impact: string }) {
  sweep();
  if (!isOwner() && !isManager()) refuse("authz.permission");
  const record = byId(requestId);
  if (!record || !reachesPerson(record.employee_id)) refuse("authz.out_of_scope");
  const note = (body.note ?? "").trim();
  if (note.length > 1000) invalid("The note can be at most 1000 characters");
  const alone = isOwner();
  const st = state(record);
  const mine = alone ? [] : st.live.filter((place) => managedLocations().includes(place));
  if (!alone && !mine.length) refuse("authz.rank");
  if (record.status !== "pending") conflict("This request is already closed");
  if (record.decide_by && Date.parse(record.decide_by) <= Date.now()) conflict("This request was not decided in time");
  if (body.expected_impact !== st.pictured.fingerprint) conflict("The shifts this time off affects have changed. Review them again");
  const actor = actorUserId();
  let result: { status: string; final: boolean; alone: boolean; remaining: number; revision: number; request_id: string };
  if (alone) {
    finalize(record, body.verdict, actor, note, true);
    result = { status: record.status, final: true, alone: true, remaining: 0, revision: record.revision, request_id: record.id };
  } else {
    record.votes = record.votes.filter((vote) => vote.voter !== actor);
    record.votes.push({
      voter: actor, verdict: body.verdict, note, at: nowIso(),
      impact: Object.fromEntries(mine.map((place) => [place, st.pictured.locations[place]?.fingerprint ?? EMPTY])),
    });
    const after = state(record);
    if (body.verdict === "deny" || (after.remaining === 0 && !after.fallback)) {
      finalize(record, body.verdict, actor, note, false);
      result = { status: record.status, final: true, alone: false, remaining: 0, revision: record.revision, request_id: record.id };
    } else {
      record.revision += 1;
      result = { status: record.status, final: false, alone: false, remaining: after.remaining, revision: record.revision, request_id: record.id };
    }
  }
  saveRequests();
  return result;
}

/** A new approved cancellation for hours of a leave, settled at once (revoke, shorten). */
function giveBack(parent: TimeOffRecord, cut: Span[], actor: string, note: string): Span[] {
  const pieces = parent.segments.flatMap((segment) => effectiveRanges(parent, segment)
    .flatMap((range) => cut.flatMap((part) => (overlapsSpan(range, part) ? [{ start: Math.max(range.start, part.start), end: Math.min(range.end, part.end) }] : [])))
    .map((span) => ({ segment, span })));
  if (!pieces.length) return [];
  const created = nowIso();
  const cancellation: TimeOffRecord = {
    id: uuid(), employee_id: parent.employee_id, request_type: "time_off_cancellation", reason: note, status: "approved", revision: 2,
    created_at: created, created_by: actor, decide_by: null, locations: [...parent.locations],
    segments: pieces.map(({ segment, span }) => {
      const from = wallOf(span.start);
      const to = wallOf(span.end);
      return {
        id: uuid(), segment_date: from.date, start_time: from.clock, end_time: to.clock, ends_next_day: to.date > from.date,
        starts_at: iso(span.start), ends_at: iso(span.end), status: "approved" as const, parent_segment_id: segment.id,
      };
    }),
    votes: [],
    events: [
      { id: uuid(), action: "submitted", actor_user_id: actor, note, created_at: created, revision: 1, shortened: true },
      { id: uuid(), action: "approved", actor_user_id: actor, note, created_at: created, revision: 2, shortened: true },
    ],
    parent_id: parent.id, parent_revision: parent.revision,
  };
  records().push(cancellation);
  return pieces.map((piece) => piece.span);
}

/** app_private.shorten_time_off: give back approved hours of a person's leave (managers; Shift Hub for BL-182). */
export function shortenLeave(employeeId: string, cut: Span[], note: string, actor = actorUserId()): void {
  const said = note.slice(0, 1000);
  for (const parent of records().filter((item) => item.employee_id === employeeId && item.request_type === "time_off" && item.status === "approved")) {
    if (!recordRanges(parent).some((range) => cut.some((part) => overlapsSpan(range, part)))) continue;
    const given = giveBack(parent, cut, actor, said);
    if (!given.length) continue;
    parent.revision += 1;
    if (!recordRanges(parent).length) {
      parent.status = "revoked";
      for (const waiting of records().filter((item) => item.parent_id === parent.id && item.status === "pending")) {
        waiting.status = "revoked";
        waiting.revision += 1;
        waiting.events.push({ id: uuid(), action: "revoked", actor_user_id: actor, note: "Closed because the time off was given back in full.", created_at: nowIso(), revision: waiting.revision });
      }
    }
    parent.events.push({ id: uuid(), action: parent.status, actor_user_id: actor, note: said, created_at: nowIso(), revision: parent.revision, shortened: true });
  }
}

/** Approved leave of a person (for Shift Hub's eligibility), as instants. */
export function approvedLeave(employeeId: string): Span[] {
  return merge(records().filter((item) => item.employee_id === employeeId && item.request_type === "time_off" && item.status === "approved").flatMap(recordRanges));
}

type CancellationPeriod = { segment_id: string; starts_at: string; ends_at: string };

function checkPeriods(parent: TimeOffRecord, periods: CancellationPeriod[], wrong: string, past: string): Span[] {
  const cut: Span[] = [];
  for (const period of periods) {
    const span = { start: Date.parse(period.starts_at), end: Date.parse(period.ends_at) };
    if (!Number.isFinite(span.start) || !Number.isFinite(span.end) || span.start >= span.end || span.start <= Date.now()) invalid(past);
    const segment = parent.segments.find((item) => item.id === period.segment_id);
    if (!segment || cut.some((item) => overlapsSpan(item, span))
      || !effectiveRanges(parent, segment).some((range) => range.start <= span.start && span.end <= range.end)) invalid(wrong);
    cut.push(span);
  }
  return cut;
}

export function shortenTimeOff(requestId: string, body: { expected_revision: number; periods: CancellationPeriod[]; note?: string; operation_id: string }) {
  if (!isOwner() && !isManager()) refuse("authz.permission");
  const parent = byId(requestId);
  if (!parent || parent.request_type !== "time_off" || !reachesPerson(parent.employee_id)) refuse("authz.out_of_scope");
  const input = JSON.stringify(["shorten", requestId, body.expected_revision, body.periods, body.note ?? ""]);
  const prior = store.data.commands[body.operation_id];
  if (prior) {
    if (prior.input !== input) conflict("This request key was used for a different change");
    return prior.result;
  }
  if (parent.revision !== body.expected_revision || parent.status !== "approved") conflict("stale approved leave; refresh before shortening it");
  const note = (body.note ?? "").trim();
  if (note.length > 1000) invalid("The note can be at most 1000 characters");
  const cut = checkPeriods(parent, body.periods, "Choose approved hours of this time off, without overlap", "Only future approved hours can be given back");
  shortenLeave(parent.employee_id, cut, note || "Shortened by a manager.");
  const result = { status: parent.status, request_id: parent.id, revision: parent.revision };
  store.data.commands[body.operation_id] = { input, result };
  saveRequests();
  return result;
}

export function revokeTimeOff(requestId: string, body: { expected_revision: number; reason: string }) {
  if (!isOwner() && !isManager()) refuse("authz.permission");
  const record = byId(requestId);
  if (!record || record.request_type !== "time_off" || !reachesPerson(record.employee_id)) refuse("authz.out_of_scope");
  const said = (body.reason ?? "").trim();
  if (!said || said.length > 1000) invalid("Say why the time off is revoked (at most 1000 characters)");
  if (record.revision !== body.expected_revision || record.status !== "approved") conflict("This time off changed; refresh before revoking it");
  const now = Date.now();
  const ranges = recordRanges(record);
  const taken = ranges.filter((span) => span.start < now);
  const ahead = ranges.map((span) => ({ start: Math.max(span.start, now), end: span.end })).filter((span) => span.start < span.end);
  if (!ahead.length) invalid("Nothing of this time off is left to revoke");
  const actor = actorUserId();
  if (taken.length) giveBack(record, ahead, actor, said);
  else record.status = "revoked";
  record.revision += 1;
  record.events.push({
    id: uuid(), action: "revoked", actor_user_id: actor, note: said, created_at: nowIso(), revision: record.revision,
    ...(taken.length ? { taken_until: iso(now) } : {}),
  });
  for (const waiting of records().filter((item) => item.parent_id === record.id && item.status === "pending")) {
    waiting.status = "revoked";
    waiting.revision += 1;
    waiting.events.push({ id: uuid(), action: "revoked", actor_user_id: actor, note: "Closed because the time off was revoked.", created_at: nowIso(), revision: waiting.revision });
  }
  saveRequests();
  return { status: record.status, request_id: record.id, revision: record.revision };
}

// ---------- the employee's own requests ----------

type PeriodInput = { segment_date: string; start_time: string | null; end_time: string | null; ends_next_day?: boolean };

function ownProfile(): string {
  const own = viewerEmployeeId();
  if (!own) refuse("authz.out_of_scope");
  return own;
}

function decideByFor(starts: number): string {
  return iso(starts - LEAD_HOURS * HOUR > Date.now() ? starts - LEAD_HOURS * HOUR : starts);
}

/** submit_time_off_service. */
export function submitTimeOff(body: { periods: PeriodInput[]; reason?: string; expected_timezone: string; operation_id: string }) {
  sweep();
  const person = ownProfile();
  const reason = (body.reason ?? "").trim();
  const input = JSON.stringify(["request", body.periods, reason, body.expected_timezone]);
  const prior = store.data.commands[body.operation_id];
  if (prior) {
    if (prior.input !== input) conflict("This request key was used for different time-off hours");
    return prior.result;
  }
  if (!Array.isArray(body.periods) || body.periods.length < 1 || body.periods.length > 31 || reason.length > 1000) {
    invalid("Enter between 1 and 31 days and a note of at most 1000 characters");
  }
  if (body.expected_timezone !== ZONE) conflict("The time zone of your location changed. Review the hours in the current time zone before sending");
  const asked = body.periods.map((period) => ({ period, span: periodSpan(period.segment_date, period.start_time, period.end_time, period.ends_next_day) }));
  asked.forEach((item, index) => {
    if (asked.slice(0, index).some((other) => overlapsSpan(other.span, item.span))) invalid("Requested time-off periods must not overlap or repeat");
  });
  const first = Math.min(...asked.map((item) => item.span.start));
  if (first <= Date.now()) invalid("Time off that has already started cannot be asked for here. Talk to your manager directly");
  const days = [...new Set(body.periods.map((period) => period.segment_date))].sort();
  if ((Date.parse(days.at(-1)!) - Date.parse(days[0]!)) / DAY + 1 !== days.length) invalid("A request is one run of days in a row");
  const mine = records().filter((item) => item.employee_id === person && item.request_type === "time_off" && ["pending", "approved"].includes(item.status));
  if (mine.some((item) => item.segments.some((segment) => effectiveRanges(item, segment).some((range) => asked.some((one) => overlapsSpan(range, one.span)))))) {
    conflict("overlapping time off request exists");
  }
  const created = nowIso();
  const record: TimeOffRecord = {
    id: uuid(), employee_id: person, request_type: "time_off", reason, status: "pending", revision: 1, created_at: created,
    created_by: actorUserId(), decide_by: decideByFor(first), locations: [...(employee(person)?.location_ids ?? [])],
    segments: asked.sort((a, b) => a.span.start - b.span.start).map(({ period, span }) => ({
      id: uuid(), segment_date: period.segment_date,
      start_time: period.start_time ? `${period.start_time.slice(0, 5)}:00` : null,
      end_time: period.end_time ? `${period.end_time.slice(0, 5)}:00` : null,
      ends_next_day: Boolean(period.ends_next_day), starts_at: iso(span.start), ends_at: iso(span.end), status: "pending" as const,
    })),
    votes: [], events: [{ id: uuid(), action: "submitted", actor_user_id: actorUserId(), note: "", created_at: created, revision: 1 }],
    parent_id: null, parent_revision: null,
  };
  records().push(record);
  const result = { status: record.status, request_id: record.id, revision: record.revision, decide_by: record.decide_by };
  store.data.commands[body.operation_id] = { input, result };
  saveRequests();
  return result;
}

/** request_time_off_cancellation_service. */
export function requestCancellation(requestId: string, body: { expected_revision: number; periods: CancellationPeriod[]; reason?: string; operation_id: string }) {
  sweep();
  const person = ownProfile();
  const parent = byId(requestId);
  if (!parent || parent.employee_id !== person) refuse("authz.out_of_scope");
  const reason = (body.reason ?? "").trim();
  const input = JSON.stringify(["cancellation", requestId, body.expected_revision, reason, body.periods]);
  const prior = store.data.commands[body.operation_id];
  if (prior) {
    if (prior.input !== input) conflict("This request key was used for a different cancellation");
    return prior.result;
  }
  if (parent.revision !== body.expected_revision || parent.request_type !== "time_off" || parent.status !== "approved") {
    conflict("stale approved leave; refresh before requesting cancellation");
  }
  if (records().some((item) => item.parent_id === parent.id && item.status === "pending")) conflict("A cancellation request is already pending for this leave");
  if (!Array.isArray(body.periods) || body.periods.length < 1 || body.periods.length > 124 || reason.length > 1000) {
    invalid("Choose up to 124 periods and a note of at most 1000 characters");
  }
  const cut = checkPeriods(parent, body.periods, "Cancellation must select approved hours without overlap", "Only future approved hours can be cancelled");
  const created = nowIso();
  const record: TimeOffRecord = {
    id: uuid(), employee_id: person, request_type: "time_off_cancellation", reason, status: "pending", revision: 1, created_at: created,
    created_by: actorUserId(), decide_by: decideByFor(Math.min(...cut.map((span) => span.start))), locations: [...(employee(person)?.location_ids ?? [])],
    segments: body.periods.map((period) => {
      const from = wallOf(Date.parse(period.starts_at));
      const to = wallOf(Date.parse(period.ends_at));
      return {
        id: uuid(), segment_date: from.date, start_time: from.clock, end_time: to.clock, ends_next_day: to.date > from.date,
        starts_at: iso(Date.parse(period.starts_at)), ends_at: iso(Date.parse(period.ends_at)), status: "pending" as const, parent_segment_id: period.segment_id,
      };
    }),
    votes: [], events: [{ id: uuid(), action: "submitted", actor_user_id: actorUserId(), note: reason, created_at: created, revision: 1 }],
    parent_id: parent.id, parent_revision: parent.revision,
  };
  records().push(record);
  const result = { status: record.status, request_id: record.id, revision: record.revision, decide_by: record.decide_by };
  store.data.commands[body.operation_id] = { input, result };
  saveRequests();
  return result;
}

/** employee_request_action_service: the employee withdraws a request still waiting. */
export function withdrawOwn(requestId: string, expectedRevision: number) {
  const person = ownProfile();
  const record = byId(requestId);
  if (!record || record.employee_id !== person) notFound("time off request not found");
  if (record.revision !== expectedRevision || record.status !== "pending") conflict("stale time off request");
  record.status = "revoked";
  record.revision += 1;
  record.events.push({ id: uuid(), action: "revoked", actor_user_id: actorUserId(), note: "Cancelled by employee", created_at: nowIso(), revision: record.revision });
  saveRequests();
  return { status: "cancelled", request_id: record.id, revision: record.revision };
}

// ---------- the Requests read ----------

export function requestsReadModel(query: URLSearchParams) {
  sweep();
  if (!isOwner() && !isManager()) refuse("authz.permission", 403, "Schedule request read access required");
  const queue = query.get("time_off_queue") ?? "needs_review";
  const locationId = query.get("location_id");
  const search = (query.get("search") ?? "").trim().toLowerCase();
  const cursor = query.get("time_off_cursor");
  const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 50) || 50));
  if (locationId && !managedLocations().includes(locationId)) refuse("authz.out_of_scope");
  const reached = records().filter((record) => reachesPerson(record.employee_id));
  const filtered = reached
    .filter((record) => !locationId || record.locations.includes(locationId))
    .filter((record) => (queue === "closed" ? record.status !== "pending" : record.status === "pending"))
    .filter((record) => !cursor || record.created_at < cursor)
    .filter((record) => !search || `${employeeName(record.employee_id)} ${record.reason}`.toLowerCase().includes(search))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  const page = filtered.slice(0, limit);
  const edge = page.length === limit ? page.at(-1)!.created_at : null;
  return {
    workspace_id: WORKSPACE_ID,
    time_format: "12h" as const,
    locations: world.locations.filter((location) => managedLocations().includes(location.id))
      .map((location) => ({ id: location.id, name: location.name })).sort((a, b) => a.name.localeCompare(b.name)),
    time_off_pending_count: reached.filter((record) => record.status === "pending").length,
    time_off_next_cursor: edge && filtered.some((record) => record.created_at < edge) ? edge : null,
    time_off_requests: page.map(requestItem),
  };
}

// The store may have been kept while the world was reseeded: Schedule's leave follows the requests.
syncLeave();
persist();
