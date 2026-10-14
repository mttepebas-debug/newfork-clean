// PAGES: named demo-data changes for the Schedule, export, templates and
// Requests scenarios (tools/sc/30-schedule.py). Each runs on fresh data,
// before the app starts.
import { LOC, MANAGER_USER_ID, TYPE, ZONE, persist, world, type World } from "./world";
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { records, saveRequests } from "./requests-time-off";
import { locationVoters } from "./requests-people";
import { hubData, saveHub } from "./hub-exchanges";

const thisWeek = () => mondayOf(todayIn(ZONE));
const NEXT_PLAN = "00000801-0000-4000-8000-000000000801";
const person = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
/** This week's live shift of a person on a weekday (0 = Monday). */
const liveShift = (employee: number, day: number) => world.publications
  .filter((item) => item.week_start === thisWeek()).flatMap((item) => item.shifts)
  .find((shift) => shift.employee_id === person(employee) && shift.scheduled_date === addDays(thisWeek(), day))!;
import { scheduleKnobs } from "./schedule-service";

/** One-shot refusal of a schedule route with the API's own answer. */
const refuse = (method: string, path: string, status: number, body: Record<string, unknown>) => () => {
  scheduleKnobs.errors.push({ method, path, status, body });
};

/**
 * The edit's 15-minute idle warning after `warnAt` ms instead, the clock
 * moved on to match; the timeout after `endAt` ms.
 */
function fastIdle(warnAt: number, endAt: number): void {
  const realTimeout = window.setTimeout.bind(window);
  const realNow = Date.now.bind(Date);
  let skew = 0;
  Date.now = () => realNow() + skew;
  (window as unknown as { setTimeout: unknown }).setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    if (ms === 15 * 60 * 1000) return realTimeout(() => { skew = 15 * 60 * 1000 - warnAt; fn(...rest); }, warnAt);
    if (ms === 15 * 60 * 1000 + 15 * 1000) return realTimeout(fn, endAt, ...rest);
    return realTimeout(fn, ms, ...rest);
  }) as typeof window.setTimeout;
}

/** Another person on the week's presence channels. */
function presence(mode: "preview" | "edit"): void {
  (window as unknown as { __pagesPresence: Record<string, unknown[]> }).__pagesPresence = {
    "schedule:presence:": [{ user_id: MANAGER_USER_ID, mode, online_at: new Date().toISOString() }],
  };
}

type Finding = Record<string, unknown>;
/** A pre-flight finding on the draft's Downtown shift of a person (by employee number). */
function findingOn(shifts: readonly { id: string; employee_id: string | null; scheduled_date: string }[], employee: number, extra: Finding): Finding[] {
  const shift = shifts.find((item) => item.employee_id === person(employee));
  if (!shift) return [];
  const name = world.employees.find((item) => item.id === shift.employee_id)?.display_name ?? null;
  return [{ id: `${String(extra.code)}-${shift.id}`.slice(0, 64), severity: "soft", overrideable: true, location_id: LOC.downtown,
    location_name: "Harbor & Vine Downtown", employee_id: shift.employee_id, employee_name: name, scheduled_date: shift.scheduled_date, shift_ids: [shift.id], ...extra }];
}
/** Publish pre-flight findings for Downtown only. */
const findings = (make: (shifts: Parameters<typeof findingOn>[0]) => Finding[]) => () => {
  scheduleKnobs.findings = (shifts, locationId) => locationId === LOC.downtown ? make(shifts) : [];
};
const availabilityFindings = (shifts: Parameters<typeof findingOn>[0]) => [
  ...findingOn(shifts, 0x603, { code: "availability", availability_state: "new", warning_policy: "warn", conflict_severity: "warn", tier: "risk",
    message: "Priya Patel marked this time unavailable after the last publish." }),
  ...findingOn(shifts, 0x608, { code: "availability", availability_state: "accepted", warning_policy: "warn", conflict_severity: "warn", tier: "risk",
    message: "Aisha Johnson is unavailable Friday evenings; accepted at the last publish." }),
  ...findingOn(shifts, 0x605, { code: "availability", tier: "note", message: "Sophie Martin is scheduled while unavailable." }),
];
/** A draft for next week's Downtown made of `shifts`. */
function nextDraft(name: string, shifts: World["drafts"][number]["shifts"], locationIds: string[] = [LOC.downtown]): void {
  world.drafts.push({ id: uuid(), week_start: addDays(thisWeek(), 7), name, revision: 1, location_ids: locationIds, shifts,
    created_at: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date(Date.now() - 3_600_000).toISOString() });
}
const nextLive = (locationId: string) => world.publications.find((item) => item.location_id === locationId && item.week_start === addDays(thisWeek(), 7))!.shifts;

/** A refusal for API calls the route path alone cannot single out (a query parameter). */
function failFetch(test: (url: URL, method: string) => boolean, status: number, body: Record<string, unknown>): void {
  const before = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    if (test(url, (init.method ?? "GET").toUpperCase())) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }
    return before(input, init);
  };
}

const named: Record<string, () => void> = {
  // The week after next (nothing published) has a saved draft.
  "schedule-draft-two-weeks": () => {
    const week = addDays(thisWeek(), 14);
    const source = world.drafts.find((draft) => draft.id === NEXT_PLAN)!;
    world.drafts.push({ ...structuredClone(source), id: uuid(), week_start: week, name: "Holiday prep", revision: 1,
      shifts: source.shifts.map((shift) => ({ ...structuredClone(shift), id: uuid(), scheduled_date: addDays(shift.scheduled_date, 7) })) });
  },
  // Next week's Downtown schedule went live from "Next week plan".
  "schedule-next-plan-live": () => {
    const draft = world.drafts.find((item) => item.id === NEXT_PLAN)!;
    const live = world.publications.find((item) => item.location_id === LOC.downtown && item.week_start === draft.week_start)!;
    live.source_draft_id = draft.id;
    live.source_draft_name = draft.name;
    live.version = 2;
    live.shifts = structuredClone(draft.shifts);
  },
  // An earlier edit of this week (from a blank draft) lapsed with a change in it.
  "schedule-lapsed-edit": () => {
    const live = world.publications.find((item) => item.location_id === LOC.downtown && item.week_start === thisWeek())!;
    const shift = { ...structuredClone(live.shifts[0]!), id: uuid(), source_published_shift_id: null, pending_op_type: null, locked: false };
    world.sessions.push({ id: uuid(), week_start: thisWeek(), source_kind: "blank", source_draft_id: null, source_revision: 0, revision: 3, dirty: true,
      last_heartbeat: new Date(Date.now() - 40 * 60_000).toISOString(), expires_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      location_ids: [LOC.downtown, LOC.uptown], shifts: [shift], undo: [], status: "active" });
  },
  // No templates at all (3.2 empty list).
  "schedule-no-templates": () => { world.templates = []; },
  // A workspace with no live location / no people on the Schedule.
  "schedule-no-locations": () => { world.locations = []; },
  "schedule-no-employees": () => {
    // Nobody works at either location yet (the people stay in the workspace,
    // so the rest of the demo, Shift Hub included, still finds them).
    for (const employee of world.employees) employee.location_ids = [];
    for (const publication of world.publications) publication.shifts = publication.shifts.filter((shift) => !shift.employee_id);
    for (const draft of world.drafts) draft.shifts = draft.shifts.filter((shift) => !shift.employee_id);
  },
  // This week is not published yet (the deadline cue on the location header).
  "schedule-this-week-unpublished": () => { world.publications = world.publications.filter((item) => item.week_start !== thisWeek()); },
  // Card variants: Sophie's Wednesday close runs past midnight, Daniel's
  // Tuesday dinner hides its hours, Carlos's Monday lunch has a manager note.
  "schedule-card-variants": () => {
    Object.assign(liveShift(0x605, 2), { end_time: "01:00", crosses_midnight: true, time_basis: "explicit" });
    Object.assign(liveShift(0x606, 1), { hide_time_on_badge: true });
    Object.assign(liveShift(0x607, 0), { note: "Bring the knife kit; walk-in delivery at 11." });
  },
  // Priya marked Tuesday evenings unavailable after the week went out.
  "schedule-changed-after-publish": () => {
    world.employees.find((item) => item.id === person(0x603))!.unavailable.push({ weekday: 2, from: "15:00", to: "24:00" });
    scheduleKnobs.changedAfterPublish.push(liveShift(0x603, 1).id);
  },
  "schedule-undo-refused": () => { scheduleKnobs.undoRefused = true; },
  "schedule-24h": () => { scheduleKnobs.timeFormat = "24h"; },
  "schedule-patch-stale": refuse("PATCH", "/shifts/:shiftId", 409, { error: "shift revision stale", code: "edit_session_stale" }),
  // Rachel Adams holds the edit lock.
  "schedule-locked": () => { scheduleKnobs.lockHolder = "Rachel Adams"; },
  "schedule-idle-warning": () => fastIdle(1500, 10 * 60 * 1000),
  "schedule-idle-expire": () => fastIdle(5000, 7000),
  "schedule-other-viewer": () => presence("preview"),
  "schedule-other-editor": () => presence("edit"),
  // Saving: the name belongs to another manager's draft (Next week plan).
  "schedule-save-owned": refuse("POST", "/schedule/drafts/save", 409, {
    error: "A draft with this name belongs to another manager.", status: "name_owned_by_other",
    draft_id: "00000801-0000-4000-8000-000000000801", owner_name: "Rachel Adams",
  }),
  "schedule-save-past-confirm": refuse("POST", "/schedule/drafts/save", 409, {
    error: "Some changes touch shifts that already started.", status: "past_shift_edit_requires_ack",
    past_edits: [{ op_type: "update", shift_id: null, scheduled_date: "2026-01-01", location_name: "Harbor & Vine Downtown", employee_name: "Tom Becker", reason: "shift_started", severity: "warning" }],
    past_edit_messages: ["Tom Becker's Breakfast shift already started."],
  }),
  "schedule-save-past-blocked": refuse("POST", "/schedule/drafts/save", 409, {
    error: "Past schedule weeks are read-only.", status: "past_edit_blocked",
    past_edits: [{ op_type: "update", shift_id: null, scheduled_date: "2026-01-01", location_name: "Harbor & Vine Downtown", employee_name: "Maria Lopez", reason: "past_week", severity: "blocked" }],
    past_edit_messages: ["Past schedule weeks are read-only."],
  }),
  "schedule-save-fails": refuse("POST", "/schedule/drafts/save", 500, { error: "Internal server error" }),
  "schedule-save-closed": refuse("POST", "/schedule/drafts/save", 409, { error: "edit session closed", code: "edit_session_closed" }),
  "schedule-save-stale": refuse("POST", "/schedule/drafts/save", 409, { error: "Someone saved this draft in the meantime. Reload it, then save again.", reason: "schedule.draft_stale" }),
  "schedule-shift-stale": refuse("POST", "/shifts", 409, { error: "session revision stale", code: "edit_session_stale" }),
  "schedule-shift-refused": refuse("POST", "/shifts", 400, { error: "Request could not be completed" }),
  "schedule-undo-stale": refuse("POST", "/schedule/edit-sessions/:sessionId/undo", 409, { error: "session revision stale", code: "edit_session_stale" }),
  // Saving fails, and Shift Hub has an approved swap on one of the edit's shifts.
  "schedule-save-exchange": () => {
    scheduleKnobs.errors.push({ method: "POST", path: "/schedule/drafts/save", status: 409, body: { error: "An approved shift change conflicts with this draft." } });
    scheduleKnobs.exchangeRecovery = true;
  },
  // Publish pre-flight: one finding of each tier.
  "schedule-publish-blocker": findings((shifts) => findingOn(shifts, 0x606, { code: "time_off", severity: "hard", overrideable: false, tier: "blocker",
    message: "Daniel Kim has approved time off during this shift.", fix_hint: "Move the shift to someone else or leave it open." })),
  "schedule-publish-warning": findings((shifts) => findingOn(shifts, 0x606, { code: "clopening", tier: "blocker", introduced: true,
    message: "Daniel Kim closes and opens the next morning with 8 hours between shifts.", fix_hint: "Publishing records your override." })),
  "schedule-publish-risk": findings((shifts) => findingOn(shifts, 0x607, { code: "advance_notice", tier: "risk", introduced: true,
    message: "Carlos Rivera's shift changes with less than 14 days' notice." })),
  "schedule-publish-availability": findings(availabilityFindings),
  "schedule-publish-notes": findings((shifts) => [
    ...findingOn(shifts, 0x604, { code: "time_off_pending", tier: "note", message: "Ethan Brooks has a time-off request waiting for a decision." }),
    ...findingOn(shifts, 0x608, { code: "solo_opener", tier: "note", projected: true, introduced: false, message: "Aisha Johnson opens alone; this was already live." }),
  ]),
  "schedule-publish-changed": () => {
    scheduleKnobs.changedSinceStart = { kind: "published", by_name: "Rachel Adams", at: new Date(Date.now() - 2 * 3_600_000).toISOString() };
  },
  "schedule-publish-notified": () => { scheduleKnobs.notificationCount = 6; },
  "schedule-publish-notify-warning": () => {
    scheduleKnobs.notificationWarning = "Employees could not be notified right now. Tell them the schedule changed.";
  },
  "schedule-publish-stale": refuse("POST", "/schedule/publish", 409, { status: "stale_baseline", fingerprint: "0".repeat(64) }),
  "schedule-publish-refreshed": () => { scheduleKnobs.publishStaleFingerprint = "review"; },
  "schedule-publish-continued": () => {
    findings(availabilityFindings)();
    scheduleKnobs.publishStaleFingerprint = "continue";
  },
  // The database stops the publish: a food handler card expires before a shift, and two shifts overlap.
  "schedule-publish-conflicts": () => {
    const shift = nextLive(LOC.downtown).find((item) => item.employee_id === person(0x607))!;
    const other = nextLive(LOC.downtown).find((item) => item.employee_id === person(0x606))!;
    refuse("POST", "/schedule/publish", 409, { status: "schedule_conflicts", schedule_conflicts: [
      { kind: "document_expiry", employee_id: person(0x607), employee_name: "Carlos Rivera", shift_id: shift.id, location_id: LOC.downtown,
        location_name: "Harbor & Vine Downtown", date: shift.scheduled_date, start_time: shift.start_time, end_time: shift.end_time,
        document_type_id: uuid(), requirement_id: uuid(), document_id: uuid(), document_title: "Food Handler Card", expiry_date: addDays(shift.scheduled_date, -1),
        expiry_policy_version: 1, pending_document_id: uuid(), review_action: "review_document", severity: "hard", overrideable: false,
        warning_text: "Food Handler Card expires before this shift." },
      { employee_id: person(0x606), employee_name: "Daniel Kim", date: other.scheduled_date,
        first: { shift_id: other.id, time_range: "4:00 PM – 10:00 PM" }, second: { shift_id: uuid(), time_range: "6:00 PM – 11:30 PM" } },
    ] })();
  },
  // Drafts for next week: one that removes every live Downtown shift, one
  // that only adds an open shift, one that changes every person's week.
  "schedule-empty-draft": () => nextDraft("Closed for renovation", []),
  "schedule-open-only-draft": () => {
    const live = structuredClone(nextLive(LOC.downtown));
    nextDraft("Extra open shift", [...live, { ...structuredClone(live[0]!), id: uuid(), employee_id: null, scheduled_date: addDays(thisWeek(), 12), note: "" }]);
  },
  "schedule-all-change-draft": () => {
    // Every assigned shift gets a new note, so everyone with a shift is affected.
    const all = [...nextLive(LOC.downtown), ...nextLive(LOC.uptown)]
      .map((shift) => ({ ...structuredClone(shift), id: uuid(), note: shift.employee_id ? "Station moved for the remodel." : shift.note }));
    nextDraft("Full reshuffle", all, [LOC.downtown, LOC.uptown]);
  },
  // Templates: one of "Downtown open shifts" carries a label archived since.
  "schedule-template-archived-label": () => {
    const template = world.templates.find((item) => item.name === "Downtown open shifts")!;
    template.shifts[0]!.label_ids = [...template.shifts[0]!.label_ids, uuid()];
    template.shifts[0]!.label_names = [...template.shifts[0]!.label_names, "Holiday crew"];
  },
  "schedule-autofill-rejects": () => { scheduleKnobs.autoFillRejects = true; },
  "schedule-assess-warning": () => { scheduleKnobs.assessWarning = "Less than 10 hours of rest after the previous shift."; },
  // Rachel's note on Daniel Kim's Wednesday evening (Availability).
  "schedule-manager-note": () => {
    scheduleKnobs.managerNotes.push({ employee_id: person(0x606), date: addDays(thisWeek(), 2), from: "16:00", to: "23:00", text: "Daniel leaves by 9 PM on Wednesdays for class." });
  },
  // Noah Garcia's Thursday close is name-only (default hours) and meets his time off.
  "schedule-default-hours-blocked": () => {
    const live = world.publications.find((item) => item.location_id === LOC.uptown && item.week_start === thisWeek())!;
    const source = live.shifts.find((item) => item.employee_id === person(0x60c))!;
    live.shifts.push({ ...structuredClone(source), id: uuid(), scheduled_date: addDays(thisWeek(), 3), shift_type_id: TYPE.close,
      start_time: "18:00", end_time: "23:30", time_basis: "type_default", note: "" });
  },
  // The browser cannot read the chosen file into storage: the logo save fails.
  "schedule-logo-save-fails": () => {
    FileReader.prototype.readAsDataURL = function (this: FileReader) {
      setTimeout(() => this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>), 50);
    };
  },
  // Export: Downtown has no short name yet; the browser blocks pop-ups; it cannot keep settings.
  // The database requires a short name; the schedule read can still come
  // without one (the field is optional there), which is what Export guards.
  "schedule-short-name-missing": () => { delete (world.locations.find((item) => item.id === LOC.downtown) as { short_name?: string }).short_name; },
  // "Next week plan" moved to this week, so Export opens it by ?draft= alone
  // (no date in the address, which would go stale).
  "schedule-draft-this-week": () => {
    const draft = world.drafts.find((item) => item.name === "Next week plan")!;
    draft.week_start = thisWeek();
    draft.shifts = draft.shifts.map((shift) => ({ ...shift, scheduled_date: addDays(shift.scheduled_date, -7) }));
  },
  // Access is checked again when a generated file is saved a second time;
  // only that check fails (the list of generated files is already on screen).
  "schedule-export-recheck-fails": () => failFetch((url, method) => method === "POST" && url.pathname.endsWith("/export-v2/authorize")
    && Boolean(document.querySelector(".export-v2-downloads")), 403, { error: "Not allowed", reason: "authz.missing_permission" }),
  // Jake and Sophie's cross-location swap before Uptown voted: Downtown's
  // manager approves first, and the other manager still has to.
  "requests-swap-unvoted": () => {
    const swaps = new Set(hubData().cases.filter((item) => item.kind === "swap").map((item) => item.id));
    hubData().votes = hubData().votes.filter((vote) => !swaps.has(vote.case_id));
    saveHub();
  },
  "schedule-popup-blocked": () => { window.open = () => null; },
  "schedule-export-prefs-blocked": () => {
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key.startsWith("newfork:export-v2:")) throw new DOMException("Storage is full", "QuotaExceededError");
      return realSet.call(this, key, value);
    };
  },
  // Templates page: someone renamed "Standard week" in another tab.
  "schedule-template-changed": refuse("PATCH", "/schedule/templates/:templateId", 409, { error: "schedule template revision stale", reason: "schedule.template_changed" }),
  // Requests: 30 more closed time off requests (the list pages at 25).
  "requests-many": () => {
    const source = records().find((record) => record.status === "denied")!;
    for (let n = 0; n < 30; n += 1) {
      const copy = structuredClone(source);
      copy.id = uuid();
      copy.created_at = new Date(Date.parse(source.created_at) - (n + 1) * 86_400_000).toISOString();
      copy.segments = copy.segments.map((segment) => ({ ...segment, id: uuid() }));
      records().push(copy);
    }
    saveRequests();
  },
  // Sophie Martin has approved time off on the Sunday Jake's swap gives her.
  "requests-swap-time-off": () => {
    const source = records().find((record) => record.status === "approved" && record.request_type === "time_off")!;
    const sunday = addDays(thisWeek(), 6);
    const copy = structuredClone(source);
    copy.id = uuid();
    copy.employee_id = person(0x605);
    copy.reason = "Family visit";
    copy.locations = [...world.employees.find((item) => item.id === person(0x605))!.location_ids];
    copy.segments = [{ id: uuid(), segment_date: sunday, start_time: null, end_time: null, ends_next_day: false,
      starts_at: iso(localInstant(sunday, "00:00", ZONE)), ends_at: iso(localInstant(addDays(sunday, 1), "00:00", ZONE)), status: "approved" }];
    records().push(copy);
    saveRequests();
  },
  // Uptown has no manager who votes on time off (an admin or the owner decides).
  "requests-no-uptown-manager": () => { locationVoters[LOC.uptown] = []; },
  // The eligibility check of a cover, open shift or swap fails.
  "requests-preview-fails": () => failFetch((url) => url.pathname.endsWith("/shift-exchanges") && url.searchParams.has("application_id"), 500, { error: "Internal server error" }),
  "schedule-heartbeat-closed": refuse("PATCH", "/schedule/edit-lock/heartbeat", 409, { error: "edit session closed", code: "edit_session_closed" }),
};

/**
 * Each setup ends by saving the world: the other frame's fresh world reaches
 * this one after its own reset, and only the last saved copy stays.
 */
export const scheduleSetups: Record<string, () => void> = Object.fromEntries(
  Object.entries(named).map(([name, run]) => [name, () => { run(); persist(); }]),
);
