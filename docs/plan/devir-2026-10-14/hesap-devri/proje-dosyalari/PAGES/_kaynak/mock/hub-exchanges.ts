// Shift changes of the demo: cover requests, open shift pickups and swaps on
// the world's published shifts, the teammates who apply or are asked, and the
// manager's final approval that moves the assignment in Schedule. Mirrors
// shift_exchanges_read_service, _candidates_service, shift_exchange_preview and
// shift_exchanges_command_service in supabase/schema.sql.
import { domainStore } from "./store";
import { fixedId } from "./people";
import { addDays, fingerprint, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { MANAGER_USER_ID, persist, world, type Shift } from "./world";
import {
  ZONE, UPTOWN_MANAGER, actorUserId, conflict, employee, employeeName, invalid, isManager, isOwner, jobName, locationName,
  managedLocations, notFound, refuse, userIdOf, userName, viewerEmployeeId,
} from "./requests-people";
import {
  exchangeShift, findPublished, overlapsSpan, publishedShifts, sourceId, spanOf, type ExchangeShiftJson, type Span,
} from "./hub-shifts";
import { approvedLeave, releaseListeners, saveRequests } from "./requests-time-off";
import { linkShiftCases } from "./communications-service";

type CaseStatus = "open" | "completed" | "cancelled" | "expired" | "invalidated";
type AppStatus = "invited" | "pending_manager" | "approved" | "rejected_by_manager" | "declined_by_employee" | "withdrawn"
  | "closed_other_selected" | "closed_case_cancelled" | "expired" | "invalidated";

export interface ExCase {
  id: string;
  kind: "cover" | "open_pickup" | "swap";
  audience: "eligible_pool" | "direct";
  status: CaseStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  owner_id: string | null;
  offered_source_id: string;
  requested_source_id: string | null;
  offered_snapshot: ExchangeShiftJson;
  requested_snapshot: ExchangeShiftJson | null;
  consent_fingerprint: string;
  private_note: string;
  owner_time_off_consent: boolean;
}

export interface ExApplication {
  id: string;
  case_id: string;
  employee_id: string;
  status: AppStatus;
  created_at: string;
  reason: string;
  consent_fingerprint: string;
  time_off_consent: boolean;
}

interface ExEvent {
  id: string;
  case_id: string;
  application_id: string | null;
  action: string;
  message: string;
  private_note: string;
  created_at: string;
  actor_user_id: string | null;
}

interface ExVote {
  case_id: string;
  application_id: string;
  location_id: string;
  actor_user_id: string;
  fingerprint: string;
}

export interface PersonalTask {
  id: string;
  title: string;
  completed: boolean;
  created_at: string;
}

interface HubData {
  cases: ExCase[];
  applications: ExApplication[];
  events: ExEvent[];
  votes: ExVote[];
  /** Personal reminders on the Employee Home, per user. */
  tasks: Record<string, PersonalTask[]>;
  /** PAGES: commands answered in the last seconds (both frames run a scenario's clicks). */
  replays?: { key: string; at: number; result: unknown }[];
}

/**
 * PAGES: the desktop and phone frames both run a scenario's clicks, so the
 * same command can arrive twice within moments (once from each frame, with the
 * other frame's result already in the shared store). The second gets the
 * first one's answer, as an idempotent retry would.
 */
function replayed<T>(command: unknown, run: () => T): T {
  const key = `${actorUserId()}:${JSON.stringify(command, (name, value) => (name === "operation_id" ? undefined : value))}`;
  const now = Date.now();
  const list = (data().replays ??= []).filter((one) => now - one.at < 4_000);
  data().replays = list;
  const hit = list.find((one) => one.key === key);
  if (hit) return hit.result as T;
  const result = run();
  list.push({ key, at: now, result });
  save();
  return result;
}

const HOUR = 3_600_000;
const nowIso = () => new Date().toISOString();
const ACTIVE: AppStatus[] = ["invited", "pending_manager"];

// ---------- shift terms ----------

/** shift_exchange_terms: what both people agreed to; any change ends the offer. */
function terms(shift: ExchangeShiftJson | null) {
  if (!shift) return null;
  return [shift.source_id, shift.employee_id, shift.location_id, shift.job_id, shift.shift_type_name, shift.scheduled_date,
    shift.start_time, shift.end_time, shift.unpaid_break_minutes ?? 0];
}
const termsFingerprint = (s: ExchangeShiftJson | null, t: ExchangeShiftJson | null) => fingerprint(JSON.stringify(["terms", terms(s), terms(t)]));

function current(source: string | null): ExchangeShiftJson | null {
  const shift = findPublished(source);
  return shift ? exchangeShift(shift) : null;
}

const spanJson = (shift: ExchangeShiftJson): Span | null =>
  shift.starts_at && shift.ends_at ? { start: Date.parse(shift.starts_at), end: Date.parse(shift.ends_at) } : null;

// ---------- eligibility ----------

/** Weekly marks of a person over a span (the "can't work" hours). */
function unavailableOver(employeeId: string, span: Span): Span[] {
  const person = employee(employeeId);
  if (!person) return [];
  const spans: Span[] = [];
  const first = new Date(span.start - 36 * HOUR).toISOString().slice(0, 10);
  for (let day = 0; day < 4; day += 1) {
    const date = addDays(first, day);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const mark of person.unavailable.filter((item) => item.weekday === weekday)) {
      const start = localInstant(date, mark.from, ZONE);
      const end = mark.to === "24:00" ? localInstant(addDays(date, 1), "00:00", ZONE) : localInstant(date, mark.to, ZONE);
      if (overlapsSpan({ start, end }, span)) spans.push({ start, end });
    }
  }
  return spans;
}

/** weekly_exchange_employee_warning: the person's own weekly marks over the shift (BL-995: leave is a blocker, never a warning). */
function availabilityWarning(employeeId: string, shift: ExchangeShiftJson) {
  const span = spanJson(shift);
  if (!span) return null;
  if (blockers(employeeId, shift, []).length) return null;
  if (approvedLeave(employeeId).some((item) => overlapsSpan(item, span))) return null;
  const marks = unavailableOver(employeeId, span);
  if (!marks.length) return null;
  return { fingerprint: fingerprint(JSON.stringify(["warning", employeeId, shift.source_id, shift.starts_at, marks])) };
}

/** What stops a person taking a shift, leave aside (app_private.eligibility). */
function blockers(employeeId: string, shift: ExchangeShiftJson, excluded: string[]): string[] {
  const person = employee(employeeId);
  if (!person) return ["This person is no longer an active employee"];
  const reasons: string[] = [];
  if (!person.location_ids.includes(shift.location_id)) reasons.push(`Not assigned to ${shift.location_name}`);
  if (shift.job_id && !person.job_ids.includes(shift.job_id)) reasons.push(`Not qualified as ${shift.job_name}`);
  const span = spanJson(shift);
  if (span && span.start <= Date.now()) reasons.push("This shift has already started");
  if (span) {
    const busy = publishedShifts().find((other) => other.employee_id === employeeId && !excluded.includes(other.id)
      && other.id !== shift.id && overlapsSpan(spanOf(other) ?? { start: 0, end: 0 }, span));
    if (busy) {
      const when = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${busy.scheduled_date}T12:00:00Z`));
      reasons.push(`Already scheduled ${when}, ${busy.start_time}–${busy.end_time} at ${locationName(busy.location_id)}`);
    }
  }
  return reasons;
}

const LEAVE = "Approved time off overlaps this shift";

// BL-995: approved time off blocks every overlapping shift; no consent sets it aside.
function eligibility(employeeId: string, shift: ExchangeShiftJson, options: { consent?: boolean; excluded?: string[] } = {}) {
  const reasons = blockers(employeeId, shift, options.excluded ?? []);
  const span = spanJson(shift);
  if (span !== null && approvedLeave(employeeId).some((item) => overlapsSpan(item, span))) reasons.push(LEAVE);
  return {
    status: reasons.length ? ("ineligible" as const) : ("eligible" as const),
    reasons,
    ...(reasons.length ? { blockers: reasons.map((message) => ({ code: message === LEAVE ? "approved_time_off" : "assignment", message })) } : {}),
  };
}

// ---------- seed ----------

const lastWeekStart = () => addDays(mondayOf(todayIn(ZONE)), -7);
const E = (first: string) => world.employees.find((item) => item.display_name.split(" ")[0]!.toLowerCase() === first)!.id;

function seed(): HubData {
  const data: HubData = { cases: [], applications: [], events: [], votes: [], tasks: {} };
  const now = Date.now();
  const ago = (hours: number) => iso(now - hours * HOUR);
  const used = new Set<string>();
  const startOf = (shift: Shift) => spanOf(shift)?.start ?? 0;
  const upcoming = (who: string | null, test: (shift: Shift) => boolean = () => true) => publishedShifts()
    .filter((shift) => shift.employee_id === who && startOf(shift) > now + 2 * HOUR && !used.has(shift.id) && test(shift))
    .sort((a, b) => startOf(a) - startOf(b));
  const fits = (who: string, shift: Shift, excluded: string[] = []) => eligibility(who, exchangeShift(shift), { consent: true, excluded }).status === "eligible";

  function open(kind: ExCase["kind"], offered: Shift, requested: Shift | null, hoursAgo: number, extra: Partial<ExCase> = {}): ExCase {
    used.add(offered.id);
    if (requested) used.add(requested.id);
    const s = exchangeShift(offered);
    const t = requested ? exchangeShift(requested) : null;
    const item: ExCase = {
      id: uuid(), kind, audience: "eligible_pool", status: "open", revision: 1, created_at: ago(hoursAgo), updated_at: ago(hoursAgo),
      expires_at: [s.starts_at!, ...(t ? [t.starts_at!] : [])].sort()[0]!, owner_id: kind === "open_pickup" ? null : offered.employee_id,
      offered_source_id: s.source_id, requested_source_id: t?.source_id ?? null, offered_snapshot: s, requested_snapshot: t,
      consent_fingerprint: termsFingerprint(s, t), private_note: "", owner_time_off_consent: false, ...extra,
    };
    data.cases.push(item);
    return item;
  }
  function apply(item: ExCase, who: string, status: AppStatus, hoursAgo: number, reason = ""): ExApplication {
    const application: ExApplication = {
      id: uuid(), case_id: item.id, employee_id: who, status, created_at: ago(hoursAgo), reason,
      consent_fingerprint: item.consent_fingerprint, time_off_consent: false,
    };
    data.applications.push(application);
    item.revision += 1;
    return application;
  }
  function emit(item: ExCase, application: ExApplication | null, action: string, message: string, hoursAgo: number, actor: string | null, note = "") {
    data.events.push({ id: uuid(), case_id: item.id, application_id: application?.id ?? null, action, message, private_note: note, created_at: ago(hoursAgo), actor_user_id: actor });
  }
  const opened = "Cover or swap requested. The current owner remains responsible until manager approval.";
  const asked = "A teammate requested this shift. The current owner remains responsible.";
  const maria = E("maria");
  const jake = E("jake");
  const DT = world.locations[0]!.id;

  // A: Jake looks for cover; a teammate who is free offered to take it.
  const others = (shift: Shift, not: string[]) => world.employees.map((person) => person.id).find((who) => !not.includes(who) && fits(who, shift));
  const jakeShifts = upcoming(jake, (shift) => shift.location_id === DT);
  const jakeShift = jakeShifts.find((shift) => others(shift, [jake, maria])) ?? jakeShifts[0];
  if (jakeShift) {
    const item = open("cover", jakeShift, null, 30, { private_note: "My car's in the shop until Monday — I can't get downtown that night." });
    emit(item, null, "cover_opened", opened, 30, userIdOf(jake));
    const helper = others(jakeShift, [jake, maria]);
    if (helper) emit(item, apply(item, helper, "pending_manager", 22), "application_submitted", asked, 22, userIdOf(helper));
  }
  // B: Priya asks Maria to swap her host shift for one of Maria's.
  const priya = E("priya");
  for (const offered of upcoming(priya)) {
    const wanted = upcoming(maria).find((shift) => fits(priya, shift, [offered.id, shift.id]) && fits(maria, offered, [offered.id, shift.id]));
    if (!wanted) continue;
    const item = open("swap", offered, wanted, 9, { id: fixedId(0x7c2), audience: "direct", private_note: "Maria and I already talked about this at Tuesday's lineup." });
    const invite = apply(item, maria, "invited", 9);
    emit(item, invite, "peer_invited", opened, 9, userIdOf(priya));
    break;
  }
  // C: Maria offers one of her own shifts; Jake applied.
  // The first of her shifts Jake could take, so the request reads the same at any hour.
  const mariaShift = upcoming(maria).find((shift) => fits(jake, shift)) ?? upcoming(maria)[0];
  if (mariaShift) {
    // A fixed id: the atlas opens this request by its address.
    const item = open("cover", mariaShift, null, 26, { id: fixedId(0x7c1), private_note: "My daughter's school recital is that evening." });
    emit(item, null, "cover_opened", opened, 26, userIdOf(maria));
    if (fits(jake, mariaShift)) emit(item, apply(item, jake, "pending_manager", 4), "application_submitted", asked, 4, userIdOf(jake));
  }
  // D and H: the open Downtown server shifts.
  const openServer = upcoming(null, (shift) => shift.location_id === DT && shift.job_id === world.jobs.find((job) => job.name === "Server")!.id);
  const pickup = openServer[0];
  if (pickup) {
    const item = open("open_pickup", pickup, null, 18);
    const taker = others(pickup, [maria]);
    if (taker) emit(item, apply(item, taker, "pending_manager", 18), "application_submitted", asked, 18, userIdOf(taker));
  }
  const picked = upcoming(null, (shift) => shift.location_id === DT && fits(maria, shift))[0];
  if (picked) {
    const item = open("open_pickup", picked, null, 52);
    const mine = apply(item, maria, "approved", 52);
    emit(item, mine, "application_submitted", asked, 52, userIdOf(maria));
    // Rachel approved: the shift is Maria's in Schedule.
    picked.employee_id = maria;
    item.status = "completed";
    item.revision += 2;
    item.updated_at = ago(40);
    emit(item, mine, "transfer_completed", "Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.", 40, MANAGER_USER_ID);
  }
  // E: Jake and Sophie swap a close across the two locations; Uptown already approved.
  const sophie = E("sophie");
  const jakeUptown = upcoming(jake, (shift) => shift.location_id !== DT)[0];
  const sophieClose = jakeUptown && upcoming(sophie).find((shift) => fits(jake, shift, [jakeUptown.id, shift.id]) && fits(sophie, jakeUptown, [jakeUptown.id, shift.id]));
  if (jakeUptown && sophieClose) {
    const item = open("swap", jakeUptown, sophieClose, 40, { audience: "direct" });
    const accepted = apply(item, sophie, "pending_manager", 40);
    emit(item, accepted, "peer_invited", opened, 40, userIdOf(jake));
    emit(item, accepted, "peer_accepted", "Accepted. Awaiting manager approval; the original owner remains responsible.", 31, userIdOf(sophie));
    data.votes.push({ case_id: item.id, application_id: accepted.id, location_id: jakeUptown.location_id, actor_user_id: UPTOWN_MANAGER.userId, fingerprint: item.consent_fingerprint });
    emit(item, accepted, "scope_approved", "One location approved. Awaiting the other manager; assignments are unchanged.", 12, UPTOWN_MANAGER.userId);
    item.revision += 2;
  }
  // F: Noah's Uptown shift, nobody has offered yet.
  const noahShift = upcoming(E("noah"))[0];
  if (noahShift) {
    const item = open("cover", noahShift, null, 6, { private_note: "Final exams week." });
    emit(item, null, "cover_opened", opened, 6, userIdOf(E("noah")));
    const emma = E("emma");
    if (fits(emma, noahShift)) emit(item, apply(item, emma, "pending_manager", 3), "application_submitted", asked, 3, userIdOf(emma));
  }
  // I: Maria closed an earlier search herself.
  const closedShift = upcoming(maria)[0];
  if (closedShift) {
    const item = open("cover", closedShift, null, 70);
    used.delete(closedShift.id);
    item.status = "cancelled";
    item.revision += 2;
    emit(item, null, "cover_opened", opened, 70, userIdOf(maria));
    emit(item, null, "case_closed", "My plans changed — I can work this shift after all.", 60, userIdOf(maria));
  }
  // J: Ethan's offer ended when Rachel moved his shift's hours.
  const ethanShift = upcoming(E("ethan"))[0];
  if (ethanShift) {
    const item = open("cover", ethanShift, null, 80);
    used.delete(ethanShift.id);
    item.offered_snapshot = { ...item.offered_snapshot, start_time: "17:00:00" };
    item.consent_fingerprint = termsFingerprint(item.offered_snapshot, null);
    item.status = "invalidated";
    item.revision += 2;
    emit(item, null, "cover_opened", opened, 80, userIdOf(E("ethan")));
    emit(item, null, "invalidated", "Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.", 50, MANAGER_USER_ID);
  }
  // G: last week, Maria covered one of Jake's Downtown shifts.
  const pastJake = publishedShifts().find((shift) => shift.employee_id === jake && shift.location_id === DT && shift.scheduled_date >= lastWeekStart()
    && startOf(shift) < now - 24 * HOUR && !publishedShifts().some((other) => other.employee_id === maria && other.scheduled_date === shift.scheduled_date));
  if (pastJake) {
    const s = exchangeShift(pastJake);
    const opened_at = startOf(pastJake) - 60 * HOUR;
    const item: ExCase = {
      id: uuid(), kind: "cover", audience: "eligible_pool", status: "completed", revision: 4, created_at: iso(opened_at),
      updated_at: iso(opened_at + 20 * HOUR), expires_at: s.starts_at!, owner_id: jake, offered_source_id: s.source_id, requested_source_id: null,
      offered_snapshot: s, requested_snapshot: null, consent_fingerprint: termsFingerprint(s, null), private_note: "Family visiting from out of town.", owner_time_off_consent: false,
    };
    data.cases.push(item);
    const mine: ExApplication = { id: uuid(), case_id: item.id, employee_id: maria, status: "approved", created_at: iso(opened_at + 3 * HOUR), reason: "", consent_fingerprint: item.consent_fingerprint, time_off_consent: false };
    data.applications.push(mine);
    const at = (hours: number) => iso(opened_at + hours * HOUR);
    data.events.push(
      { id: uuid(), case_id: item.id, application_id: null, action: "cover_opened", message: opened, private_note: "", created_at: at(0), actor_user_id: userIdOf(jake) },
      { id: uuid(), case_id: item.id, application_id: mine.id, action: "application_submitted", message: asked, private_note: "", created_at: at(3), actor_user_id: userIdOf(maria) },
      { id: uuid(), case_id: item.id, application_id: mine.id, action: "transfer_completed", message: "Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.", private_note: "", created_at: at(20), actor_user_id: MANAGER_USER_ID },
    );
    pastJake.employee_id = maria;
  }
  // K: last week, nobody picked Priya's shift up in time.
  const pastPriya = publishedShifts().find((shift) => shift.employee_id === priya && shift.scheduled_date >= lastWeekStart() && startOf(shift) < now - 24 * HOUR);
  if (pastPriya) {
    const s = exchangeShift(pastPriya);
    const item: ExCase = {
      id: uuid(), kind: "cover", audience: "eligible_pool", status: "expired", revision: 3, created_at: iso(startOf(pastPriya) - 50 * HOUR),
      updated_at: s.starts_at!, expires_at: s.starts_at!, owner_id: priya, offered_source_id: s.source_id, requested_source_id: null,
      offered_snapshot: s, requested_snapshot: null, consent_fingerprint: termsFingerprint(s, null), private_note: "", owner_time_off_consent: false,
    };
    data.cases.push(item);
    data.events.push({ id: uuid(), case_id: item.id, application_id: null, action: "cover_opened", message: opened, private_note: "", created_at: item.created_at, actor_user_id: userIdOf(priya) });
    data.events.push({ id: uuid(), case_id: item.id, application_id: null, action: "expired", message: "The shift has started. The current owner remains responsible.", private_note: "", created_at: s.starts_at!, actor_user_id: null });
  }

  data.tasks[userIdOf(maria)] = [
    { id: uuid(), title: "Bring my food handler card to Rachel", completed: false, created_at: ago(30) },
    { id: uuid(), title: "Pick up a new apron before Saturday", completed: false, created_at: ago(54) },
    { id: uuid(), title: "Learn the fall cocktail specials", completed: false, created_at: ago(76) },
    { id: uuid(), title: "Sign up for the wine tasting training", completed: true, created_at: ago(120) },
  ];
  persist();
  return data;
}

// ---------- the store ----------

const store = domainStore<HubData>("hub", seed);
const data = () => store.data;
// The shift change notices of Maria and Rachel are about Maria's own cover search.
linkShiftCases((role) => role === "owner" ? null
  : data().cases.find((item) => item.kind === "cover" && item.status === "open" && item.owner_id === E("maria"))?.id ?? null);

/** PAGES setups (hub-setups.ts): the hub's demo data and its save. */
export const hubData = () => store.data;
export const saveHub = () => save();

function save(): void {
  store.save();
  persist();
}

// A store kept from another world (its shifts are gone): start over from this one.
if (data().cases.some((item) => item.status === "open" && !findPublished(item.offered_source_id))) {
  Object.assign(store.data, seed());
  save();
}

/** Approved leave opened these shifts: the offers on them end (time_off_release_shifts). */
releaseListeners.push((shiftIds, actor) => {
  const sources = shiftIds.map((id) => sourceId(findPublished(id) ?? ({ id } as Shift)));
  for (const item of data().cases.filter((one) => one.status === "open" && (sources.includes(one.offered_source_id) || sources.includes(one.requested_source_id ?? "")))) {
    endCase(item, "invalidated", actor, "An involved assignment was released with approved time off. Review the current schedule.");
  }
  save();
});

// ---------- reading ----------

function liveStatus(item: ExCase): CaseStatus {
  if (item.status !== "open") return item.status;
  if (Date.parse(item.expires_at) <= Date.now()) return "expired";
  const s = current(item.offered_source_id);
  const t = item.requested_source_id ? current(item.requested_source_id) : null;
  if (!s || (item.kind === "swap" && !t) || termsFingerprint(s, t) !== item.consent_fingerprint) return "invalidated";
  return "open";
}

const caseLocations = (item: ExCase) => [item.offered_snapshot.location_id, ...(item.requested_snapshot ? [item.requested_snapshot.location_id] : [])];

/** exchange_decision_reason: may the viewer decide at a location (one rank up, nobody their own). */
function decidesAt(place: string): boolean {
  if (isOwner()) return true;
  return isManager() && managedLocations().includes(place);
}

function operation(item: ExCase) {
  return item.kind === "swap" || item.kind === "open_pickup" ? item.kind : item.audience === "direct" ? "cover_accept" : "release_pickup";
}

/** app_private.shift_exchange_case_item. */
function caseItem(item: ExCase, allowed: boolean, me: string | null) {
  const live = liveStatus(item);
  const s = current(item.offered_source_id);
  const t = item.requested_source_id ? current(item.requested_source_id) : null;
  const shift = s ?? item.offered_snapshot;
  const requested = t ?? item.requested_snapshot;
  const mine = item.owner_id !== null && item.owner_id === me;
  const decides = allowed && caseLocations(item).some(decidesAt);
  const excluded = [shift.id, ...(requested ? [requested.id] : [])];
  const apps = data().applications.filter((application) => application.case_id === item.id && (allowed || mine || application.employee_id === me))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((application) => {
      const own = application.employee_id === me;
      const check = (allowed || own) && live === "open"
        ? {
          ...eligibility(application.employee_id, shift, { consent: (own && application.status === "invited") || application.time_off_consent, excluded }),
          ...(own && application.status === "invited" ? { availability_warning: availabilityWarning(application.employee_id, shift) } : {}),
        }
        : null;
      return {
        id: application.id,
        employee_id: application.employee_id,
        employee_name: employeeName(application.employee_id),
        status: ["expired", "invalidated"].includes(live) && ACTIVE.includes(application.status) ? (live as AppStatus) : application.status,
        created_at: application.created_at,
        reason: allowed || own ? application.reason : "",
        eligibility: check,
      };
    });
  const history = data().events
    .filter((event) => event.case_id === item.id)
    .filter((event) => allowed || mine || event.application_id === null
      || data().applications.some((application) => application.id === event.application_id && application.employee_id === me))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((event) => ({
      id: event.id,
      action: event.action,
      created_at: event.created_at,
      message: event.action === "application_rejected" && !allowed
        && !data().applications.some((application) => application.id === event.application_id && application.employee_id === me)
        ? "A request for your shift was declined. You are still responsible for this shift." : event.message,
      private_note: decides && event.private_note ? event.private_note : null,
    }));
  const active = data().applications.filter((application) => application.case_id === item.id);
  const stage = live !== "open" ? "closed"
    : data().votes.some((vote) => vote.case_id === item.id) ? "awaiting_other_manager"
      : active.some((application) => application.status === "pending_manager") ? "ready_for_manager"
        : active.some((application) => application.status === "invited") ? "awaiting_peer" : "seeking_candidates";
  return {
    id: item.id,
    kind: item.kind,
    audience: item.audience,
    status: live,
    current_published: s !== null,
    requested_current_published: item.kind === "swap" ? t !== null : null,
    stage,
    revision: item.revision,
    created_at: item.created_at,
    expires_at: item.expires_at,
    owner_id: item.owner_id,
    owner_name: item.offered_snapshot.employee_name,
    shift,
    requested_shift: requested,
    applications: apps,
    candidate_count: live === "open" ? active.filter((application) => ACTIVE.includes(application.status)).length : 0,
    can_manage: decides,
    is_owner: mine,
    private_note: allowed || mine ? item.private_note : "",
    history,
  };
}

const inRange = (date: string | undefined, from: string, to: string) => Boolean(date && date >= from && date <= to);

/** shift_exchanges_read_service. */
export function readExchanges(query: URLSearchParams) {
  const manager = query.get("view") === "manager";
  const today = todayIn(ZONE);
  const from = query.get("from") ?? today;
  const to = query.get("to") ?? addDays(today, 42);
  const focused = query.get("case_id");
  if (to < from || Date.parse(to) - Date.parse(from) > 62 * 24 * HOUR) invalid("Choose a date range up to 62 days");
  const me = viewerEmployeeId();
  if (!manager && !me) refuse("authz.out_of_scope", 403, "Employee profile required");
  const scope = manager ? managedLocations() : [];
  if (manager && !scope.length) refuse("authz.permission", 403, "Not allowed");
  const cases = [];
  for (const item of [...data().cases].sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.created_at.localeCompare(b.created_at))) {
    const allowed = manager && caseLocations(item).some((place) => scope.includes(place));
    const mine = item.owner_id !== null && item.owner_id === me;
    if (!allowed && !mine && !data().applications.some((application) => application.case_id === item.id && application.employee_id === me)) continue;
    // A swap or a cover reaches a manager once both sides agreed (Mert, 2026-10-11),
    // read from the live applications while it is open (app_private.shift_exchange_reached_managers).
    const live = liveStatus(item);
    const reached = item.kind === "open_pickup" || (item.status === "open" && live === "open"
      ? data().applications.some((application) => application.case_id === item.id
        && (application.status === "pending_manager" || application.status === "rejected_by_manager"))
        || data().votes.some((vote) => vote.case_id === item.id)
      : data().events.some((event) => event.case_id === item.id && (event.action === "application_submitted" || event.action === "peer_accepted")));
    if (manager && !mine && !reached
      && !data().applications.some((application) => application.case_id === item.id && application.employee_id === me)) continue;
    const s = current(item.offered_source_id) ?? item.offered_snapshot;
    const t = item.requested_source_id ? current(item.requested_source_id) ?? item.requested_snapshot : null;
    if (item.id !== focused && item.status !== "open" && !inRange(s.scheduled_date, from, to) && !inRange(t?.scheduled_date, from, to)) continue;
    cases.push(caseItem(item, allowed, me));
  }
  const opportunities: unknown[] = [];
  const own: ExchangeShiftJson[] = [];
  if (!manager && me) {
    const now = Date.now();
    for (const shift of publishedShifts().filter((one) => inRange(one.scheduled_date, from, to)).sort((a, b) => (spanOf(a)?.start ?? 0) - (spanOf(b)?.start ?? 0))) {
      const s = exchangeShift(shift);
      if (!s.starts_at || Date.parse(s.starts_at) <= now) continue;
      if (shift.employee_id === me) { own.push(s); continue; }
      const offer = data().cases.find((item) => item.offered_source_id === s.source_id && item.status === "open"
        && Date.parse(item.expires_at) > now && item.audience === "eligible_pool" && item.kind !== "swap");
      if (shift.employee_id && !offer) continue;
      const check = { ...eligibility(me, s, { consent: true }), availability_warning: availabilityWarning(me, s) };
      // BL-995: a shift only approved time off keeps from them is listed as not open, with why.
      const onlyLeave = check.status === "ineligible" && check.reasons.every((reason) => reason === LEAVE);
      if ((check.status === "eligible" || onlyLeave) && (!offer || offer.consent_fingerprint === termsFingerprint(s, null))) {
        opportunities.push({ case_id: offer?.id ?? null, shift: s, eligibility: check });
      }
    }
  }
  return { employee_id: me, cases, opportunities, own_shifts: own };
}

/** shift_exchanges_candidates_service: who could take the viewer's shift, and which shifts they could swap for. */
export function exchangeCandidates(shiftId: string) {
  const me = viewerEmployeeId();
  const own = findPublished(shiftId);
  if (!me || !own || own.employee_id !== me) refuse("authz.out_of_scope", 403, "Only the owner can search for a replacement");
  const s = exchangeShift(own);
  const employees = world.employees.filter((person) => person.id !== me)
    .map((person) => ({ id: person.id, name: person.display_name, eligibility: eligibility(person.id, s) }))
    .filter((person) => person.eligibility.status === "eligible")
    .sort((a, b) => a.name.localeCompare(b.name));
  const today = todayIn(ZONE);
  const shifts = publishedShifts()
    .filter((shift) => shift.employee_id && shift.employee_id !== me && shift.scheduled_date >= addDays(today, -1) && shift.scheduled_date <= addDays(today, 62))
    .map(exchangeShift)
    .filter((t) => t.starts_at && Date.parse(t.starts_at) > Date.now())
    .filter((t) => eligibility(me, t, { consent: true, excluded: [s.id, t.id] }).status === "eligible"
      && eligibility(t.employee_id!, s, { excluded: [s.id, t.id] }).status === "eligible")
    .sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))
    .map((t) => ({ ...t, availability_warning: availabilityWarning(me, t) }));
  return { employees, shifts };
}

/** shift_exchange_preview: what approving this application would do. */
export function exchangePreview(caseId: string, applicationId: string) {
  const item = data().cases.find((one) => one.id === caseId);
  if (!item) notFound("Request not found");
  if (!caseLocations(item).some(decidesAt)) refuse(isManager() ? "authz.out_of_scope" : "authz.permission");
  const application = data().applications.find((one) => one.id === applicationId && one.case_id === caseId);
  if (!application) notFound("Application not found");
  const s = current(item.offered_source_id);
  const t = item.requested_source_id ? current(item.requested_source_id) : null;
  const problems: string[] = [];
  if (item.status !== "open" || application.status !== "pending_manager") problems.push("This request is no longer ready for approval");
  if (!s || (item.kind === "swap" && !t)) problems.push("The published shift changed or was unpublished");
  const print = termsFingerprint(s, t);
  if (print !== item.consent_fingerprint || print !== application.consent_fingerprint) problems.push("Shift conditions changed. New employee consent is required");
  const now = Date.now();
  if (Date.parse(item.expires_at) <= now || (s?.starts_at && Date.parse(s.starts_at) <= now) || (t?.starts_at && Date.parse(t.starts_at) <= now)) {
    problems.push("This shift has already started");
  }
  const excluded = [s?.id, t?.id].filter(Boolean) as string[];
  const receiver = s ? eligibility(application.employee_id, s, { consent: application.time_off_consent, excluded })
    : { status: "ineligible" as const, reasons: ["Published shift unavailable"] };
  if (receiver.status !== "eligible") problems.push("The receiving employee is not eligible for the full shift");
  const giver = item.kind === "swap" && t && item.owner_id ? eligibility(item.owner_id, t, { consent: item.owner_time_off_consent, excluded }) : null;
  if (giver && giver.status !== "eligible") problems.push("The other employee is not eligible for the exchanged shift");
  const missing = [s?.location_id, t?.location_id].filter((place, index, all): place is string => Boolean(place) && all.indexOf(place) === index)
    .some((place) => !decidesAt(place) && !data().votes.some((vote) => vote.case_id === caseId && vote.application_id === applicationId
      && vote.location_id === place && vote.fingerprint === print));
  return {
    allowed: problems.length === 0,
    fingerprint: print,
    reasons: problems,
    receiver,
    giver,
    requires_other_manager: missing,
    other_applications: data().applications.filter((one) => one.case_id === caseId && one.id !== applicationId && ACTIVE.includes(one.status)).length,
  };
}

// ---------- commands ----------

function emit(item: ExCase, applicationId: string | null, action: string, message: string, note = "") {
  data().events.push({ id: uuid(), case_id: item.id, application_id: applicationId, action, message, private_note: note, created_at: nowIso(), actor_user_id: actorUserId() });
}

function endCase(item: ExCase, status: CaseStatus, actor: string | null, message: string) {
  item.status = status;
  item.revision += 1;
  item.updated_at = nowIso();
  for (const application of data().applications.filter((one) => one.case_id === item.id && ACTIVE.includes(one.status))) application.status = status as AppStatus;
  data().votes = data().votes.filter((vote) => vote.case_id !== item.id);
  data().events.push({ id: uuid(), case_id: item.id, application_id: null, action: status, message, private_note: "", created_at: nowIso(), actor_user_id: actor });
}

function requireWarning(who: string, shift: ExchangeShiftJson, given: string | undefined) {
  const warning = availabilityWarning(who, shift);
  if (warning && given !== warning.fingerprint) conflict("Your availability conflicts with this shift. Refresh the request and choose to continue anyway.");
  return false;
}

type Command = {
  action: "create" | "apply" | "accept" | "decline" | "withdraw" | "close" | "reject" | "approve";
  shift_id?: string; kind?: "cover" | "swap"; requested_shift_id?: string; employee_id?: string; note?: string;
  case_id?: string; application_id?: string; expected_revision?: number; fingerprint?: string; reason?: string; private_note?: string;
  availability_fingerprint?: string;
};

/** shift_exchanges_command_service. */
export function exchangeCommand(command: Command) {
  return replayed(command, () => runCommand(command));
}

function runCommand(command: Command) {
  const me = viewerEmployeeId();
  const own = ["apply", "accept", "decline", "withdraw", "create"].includes(command.action);
  if (own && !me) refuse("authz.out_of_scope", 403, "Employee profile required");
  let item: ExCase;
  if (command.action === "create" || command.action === "apply") {
    const shift = findPublished(command.shift_id);
    const s = shift ? exchangeShift(shift) : null;
    if (!s || !s.starts_at || Date.parse(s.starts_at) <= Date.now()) conflict("Choose an upcoming published shift");
    if (command.action === "create") item = createCase(command, s, me!);
    else item = applyFor(command, s, me!);
  } else {
    const found = data().cases.find((one) => one.id === command.case_id);
    if (!found) notFound("Request not found");
    item = found;
    const owns = item.owner_id !== null && item.owner_id === me;
    const manages = caseLocations(item).some(decidesAt);
    if (!owns && !manages && !data().applications.some((application) => application.case_id === item.id && application.employee_id === me)) {
      refuse("authz.out_of_scope", 403, "Request access denied");
    }
    if (item.status !== "open" || item.revision !== command.expected_revision) conflict("This request changed. Review the latest details");
    const live = liveStatus(item);
    if (live === "expired") endCase(item, "expired", null, "The shift has started. The current owner remains responsible.");
    else if (live === "invalidated") endCase(item, "invalidated", actorUserId(), "Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.");
    else if (command.action === "close") {
      if (!owns && !manages) refuse("authz.out_of_scope", 403, "Only the owner or a manager can close this search");
      if (!command.reason?.trim()) invalid("Choose a reason for closing this search");
      item.status = "cancelled";
      for (const application of data().applications.filter((one) => one.case_id === item.id && ACTIVE.includes(one.status))) {
        application.status = "closed_case_cancelled";
        application.reason = command.reason!;
      }
      emit(item, null, "case_closed", command.reason!, command.private_note ?? "");
      item.revision += 1;
    } else respond(item, command, me);
    item.updated_at = nowIso();
  }
  save();
  return { case_id: item.id, status: item.status, revision: item.revision };
}

function createCase(command: Command, s: ExchangeShiftJson, me: string): ExCase {
  if (s.employee_id !== me) refuse("authz.out_of_scope", 403, "Only the current owner can offer this shift");
  if (command.kind !== "cover" && command.kind !== "swap") invalid("Invalid exchange kind");
  let t: ExchangeShiftJson | null = null;
  let candidate = command.employee_id ?? null;
  let consent = false;
  if (command.kind === "swap") {
    const target = findPublished(command.requested_shift_id);
    t = target ? exchangeShift(target) : null;
    if (!t || !t.employee_id || t.employee_id === me || !t.starts_at || Date.parse(t.starts_at) <= Date.now()) invalid("Choose an upcoming teammate shift");
    candidate = t.employee_id;
    consent = requireWarning(me, t, command.availability_fingerprint);
    if (eligibility(me, t, { consent, excluded: [s.id, t.id] }).status !== "eligible") invalid("You are not eligible for the teammate shift");
  }
  if (candidate === me) invalid("Choose a different teammate");
  if (candidate && eligibility(candidate, s, { excluded: [s.id, ...(t ? [t.id] : [])] }).status !== "eligible") invalid("This teammate is not eligible for the full shift");
  for (const other of data().cases.filter((one) => one.status === "open" && one.offered_source_id === s.source_id)) {
    const live = liveStatus(other);
    if (live !== "open") endCase(other, live, actorUserId(), "This offer ended because the shift changed or started. Review the current schedule before making a new request.");
    else conflict("This shift already has an active request");
  }
  const print = termsFingerprint(s, t);
  const created = nowIso();
  const item: ExCase = {
    id: uuid(), kind: command.kind!, audience: candidate ? "direct" : "eligible_pool", status: "open", revision: 1, created_at: created, updated_at: created,
    expires_at: [s.starts_at!, ...(t ? [t.starts_at!] : [])].sort()[0]!, owner_id: me, offered_source_id: s.source_id, requested_source_id: t?.source_id ?? null,
    offered_snapshot: s, requested_snapshot: t, consent_fingerprint: print, private_note: command.note ?? "", owner_time_off_consent: consent,
  };
  data().cases.push(item);
  let invite: ExApplication | null = null;
  if (candidate) {
    invite = { id: uuid(), case_id: item.id, employee_id: candidate, status: "invited", created_at: created, reason: "", consent_fingerprint: print, time_off_consent: false };
    data().applications.push(invite);
  }
  emit(item, invite?.id ?? null, candidate ? "peer_invited" : "cover_opened", "Cover or swap requested. The current owner remains responsible until manager approval.");
  return item;
}

function applyFor(command: Command, s: ExchangeShiftJson, me: string): ExCase {
  if (s.employee_id === me) invalid("You already own this shift");
  let item = data().cases.find((one) => one.status === "open" && one.offered_source_id === s.source_id);
  if (!item) {
    if (s.employee_id) invalid("This shift has not been offered for cover");
    const created = nowIso();
    item = {
      id: uuid(), kind: "open_pickup", audience: "eligible_pool", status: "open", revision: 1, created_at: created, updated_at: created,
      expires_at: s.starts_at!, owner_id: null, offered_source_id: s.source_id, requested_source_id: null, offered_snapshot: s, requested_snapshot: null,
      consent_fingerprint: termsFingerprint(s, null), private_note: "", owner_time_off_consent: false,
    };
    data().cases.push(item);
  }
  if (item.audience !== "eligible_pool" || item.kind === "swap" || (command.case_id && command.case_id !== item.id)) refuse("authz.out_of_scope", 403, "This offer is not available");
  if (termsFingerprint(s, null) !== item.consent_fingerprint) conflict("Shift conditions changed. The owner must renew this offer");
  const consent = requireWarning(me, s, command.availability_fingerprint);
  if (eligibility(me, s, { consent }).status !== "eligible") invalid("You are not eligible for the full shift");
  if (data().applications.some((one) => one.case_id === item!.id && one.employee_id === me && one.status === "pending_manager")) invalid("You already have an active application");
  const application: ExApplication = {
    id: uuid(), case_id: item.id, employee_id: me, status: "pending_manager", created_at: nowIso(), reason: "", consent_fingerprint: item.consent_fingerprint, time_off_consent: consent,
  };
  data().applications.push(application);
  item.revision += 1;
  emit(item, application.id, "application_submitted", "A teammate requested this shift. The current owner remains responsible.");
  return item;
}

function respond(item: ExCase, command: Command, me: string | null): void {
  const application = data().applications.find((one) => one.id === command.application_id && one.case_id === item.id);
  if (!application || !ACTIVE.includes(application.status)) conflict("This application is no longer active");
  const s = current(item.offered_source_id)!;
  const t = item.requested_source_id ? current(item.requested_source_id) : null;
  if (command.action === "accept" || command.action === "decline" || command.action === "withdraw") {
    if (application.employee_id !== me) refuse("authz.out_of_scope", 403, "Only the invited employee can respond");
    if (command.action !== "withdraw" && application.status !== "invited") invalid("This invitation already has a response");
    if (command.action === "accept") {
      if (termsFingerprint(s, t) !== item.consent_fingerprint) conflict("Shift conditions changed. Ask for a new offer");
      const consent = requireWarning(me!, s, command.availability_fingerprint);
      const excluded = [s.id, ...(t ? [t.id] : [])];
      if (eligibility(me!, s, { consent, excluded }).status !== "eligible"
        || (item.kind === "swap" && t && eligibility(item.owner_id!, t, { consent: item.owner_time_off_consent, excluded }).status !== "eligible")) {
        invalid("Both employees must be eligible for the full exchange");
      }
      application.time_off_consent = consent;
    }
    application.status = command.action === "accept" ? "pending_manager" : command.action === "decline" ? "declined_by_employee" : "withdrawn";
    data().votes = data().votes.filter((vote) => !(vote.case_id === item.id && vote.application_id === application.id));
    if (item.audience === "direct" && command.action !== "accept") item.status = "cancelled";
    emit(item, application.id, command.action === "accept" ? "peer_accepted" : command.action === "decline" ? "peer_declined" : "application_withdrawn",
      command.action === "accept" ? "Accepted. Awaiting manager approval; the original owner remains responsible."
        : command.action === "decline" ? "The teammate declined. No assignment changed."
          : item.audience === "direct" ? "The employee withdrew consent. This request ended without a transfer." : "The application was withdrawn. Other candidates remain available.");
    item.revision += 1;
    return;
  }
  // reject / approve: a manager, one rank up, where they decide.
  const decides = caseLocations(item).filter(decidesAt);
  if (!decides.length) refuse(isManager() ? "authz.out_of_scope" : "authz.permission");
  if (command.action === "reject") {
    if (!command.reason?.trim()) invalid("Provide a reason visible to this employee");
    application.status = "rejected_by_manager";
    application.reason = command.reason!;
    data().votes = data().votes.filter((vote) => !(vote.case_id === item.id && vote.application_id === application.id));
    if (item.audience === "direct") item.status = "cancelled";
    emit(item, application.id, "application_rejected", command.reason!, command.private_note ?? "");
    item.revision += 1;
    return;
  }
  const checked = exchangePreview(item.id, application.id);
  if (!checked.allowed) conflict(JSON.stringify(checked.reasons));
  if (command.fingerprint !== checked.fingerprint) conflict("This approval preview changed. Review the latest details");
  let fresh = false;
  for (const place of [...new Set([s.location_id, ...(t ? [t.location_id] : [])])].filter((one) => decides.includes(one))) {
    fresh ||= !data().votes.some((vote) => vote.case_id === item.id && vote.location_id === place && vote.application_id === application.id
      && vote.actor_user_id === actorUserId() && vote.fingerprint === checked.fingerprint);
    data().votes = data().votes.filter((vote) => !(vote.case_id === item.id && vote.location_id === place));
    data().votes.push({ case_id: item.id, application_id: application.id, location_id: place, actor_user_id: actorUserId(), fingerprint: checked.fingerprint });
  }
  if (checked.requires_other_manager) {
    if (fresh) emit(item, application.id, "scope_approved", "One location approved. Awaiting the other manager; assignments are unchanged.");
    item.revision += 1;
    return;
  }
  findPublished(s.id)!.employee_id = application.employee_id;
  if (item.kind === "swap" && t) findPublished(t.id)!.employee_id = item.owner_id;
  application.status = "approved";
  for (const other of data().applications.filter((one) => one.case_id === item.id && one.id !== application.id && ACTIVE.includes(one.status))) {
    other.status = "closed_other_selected";
    emit(item, other.id, "other_selected", "Another teammate was selected. Your schedule has not changed.");
  }
  item.status = "completed";
  emit(item, application.id, "transfer_completed", "Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.", command.private_note ?? "");
  const sources = [item.offered_source_id, item.requested_source_id].filter(Boolean);
  for (const other of data().cases.filter((one) => one.status === "open" && one.id !== item.id
    && (sources.includes(one.offered_source_id) || sources.includes(one.requested_source_id)))) {
    endCase(other, "invalidated", actorUserId(), "An involved shift changed owner. Start a new request using the current schedule.");
  }
  item.revision += 1;
  saveRequests();
}

// ---------- the Employee Home pieces ----------

/** employee_personal_tasks_service. */
export function personalTasks(task?: { action: string; id: string; title?: string }) {
  if (task) return replayed({ task: { ...task, id: task.action === "create" ? undefined : task.id } }, () => tasksNow(task));
  return tasksNow();
}

function tasksNow(task?: { action: string; id: string; title?: string }) {
  const me = viewerEmployeeId();
  if (!me) refuse("authz.out_of_scope", 403, "Employee profile required");
  const user = actorUserId();
  const list = (data().tasks[user] ??= []);
  if (task) {
    if (task.action === "create") {
      const title = (task.title ?? "").trim();
      if (!title || title.length > 160) invalid("Valid personal task required");
      if (!list.some((item) => item.id === task.id)) {
        if (list.length >= 100) invalid("Your list is full. Remove a completed reminder to add another.");
        list.push({ id: task.id, title, completed: false, created_at: nowIso() });
      }
    } else if (task.action === "complete" || task.action === "reopen") {
      const item = list.find((one) => one.id === task.id);
      if (!item) invalid("Task not found");
      item.completed = task.action === "complete";
    } else if (task.action === "delete") {
      data().tasks[user] = list.filter((item) => item.id !== task.id);
    } else invalid("Invalid personal task action");
    save();
  }
  return [...(data().tasks[user] ?? [])].sort((a, b) => Number(a.completed) - Number(b.completed) || b.created_at.localeCompare(a.created_at));
}

export { jobName, userName };
