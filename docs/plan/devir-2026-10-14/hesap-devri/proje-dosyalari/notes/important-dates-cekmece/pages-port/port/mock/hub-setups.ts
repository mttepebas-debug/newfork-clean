// PAGES setups of the hub area (7.x Employee Hub, 8.x Announcements and 6.0
// Important Dates, 9.0 Notifications, 0.x the shell): named demo-data changes a scenario makes on
// freshly seeded data before the screen opens (scenarios.ts runs them).
import { addDays, iso, localInstant, mondayOf, todayIn, uuid } from "./time";
import { JOB, LOC, MANAGER_USER_ID, TYPE, ZONE, viewer, viewers, world, type Shift } from "./world";
import { publishedShifts, spanOf, wallOf } from "./hub-shifts";
import { exchangeCommand, hubData, saveHub } from "./hub-exchanges";
import { commsData, demoNotice, saveComms } from "./communications-service";
import { announcementData, saveAnnouncements } from "./announcements-service";
import { records, saveRequests, type TimeOffRecord } from "./requests-time-off";
import { availabilityData, saveAvailability } from "./availability-service";
import { hubFlags } from "./hub-flags";
import { viewerRole } from "./viewer";

const MIN = 60_000;
const maria = () => viewers.employee.employeeId!;
const fixedId = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const save = () => { saveHub(); saveComms(); saveAnnouncements(); saveRequests(); saveAvailability(); };

/** A published shift of the demo world (explicit hours). */
function shift(fields: { employee: string | null; date: string; start: string; end: string; job?: string; location?: string; id?: string; note?: string }): Shift {
  return {
    id: fields.id ?? uuid(), location_id: fields.location ?? LOC.downtown, employee_id: fields.employee, job_id: fields.job ?? JOB.server,
    shift_type_id: TYPE.dinner, scheduled_date: fields.date, start_time: fields.start, end_time: fields.end,
    crosses_midnight: fields.end <= fields.start, time_basis: "explicit", time_snapshot: null, time_timezone: ZONE,
    unpaid_break_minutes: 30, hide_time_on_badge: false, label_ids: [], label_names: [], note: fields.note ?? "", revision: 1,
  };
}

/** Puts a shift into its week's publication at its location (a new publication when the week has none). */
function publish(one: Shift): void {
  const week = mondayOf(one.scheduled_date);
  let publication = world.publications.find((item) => item.week_start === week && item.location_id === one.location_id);
  if (!publication) {
    publication = {
      id: uuid(), location_id: one.location_id, week_start: week, version: 1, published_at: new Date().toISOString(),
      published_by_name: "Mert Tepebas", source_draft_id: null, source_draft_name: null, shifts: [],
    };
    world.publications.push(publication);
  }
  publication.shifts.push(one);
}

function unpublish(test: (one: Shift) => boolean): void {
  for (const publication of world.publications) publication.shifts = publication.shifts.filter((one) => !test(one));
}

/** A shift from an instant, `minutes` long (wall clock in the zone). */
function shiftAt(start: number, minutes: number, employee: string): Shift {
  const from = wallOf(start);
  const to = wallOf(start + minutes * MIN);
  return shift({ employee, date: from.date, start: from.clock.slice(0, 5), end: to.clock.slice(0, 5), job: JOB.server });
}

const nowDate = () => todayIn(ZONE);
/** Maria's shifts that have not ended yet, soonest first. */
const mariaUpcoming = () => publishedShifts()
  .filter((one) => one.employee_id === maria() && (spanOf(one)?.end ?? 0) > Date.now())
  .sort((a, b) => (spanOf(a)?.start ?? 0) - (spanOf(b)?.start ?? 0));

/** The record of one of Maria's time off requests (requests-time-off.ts seeds them by fixed id). */
const timeOff = (n: number) => records().find((item) => item.id === fixedId(n))!;

/** A refetch a little after the first answer (the screen's 60-second poll, sooner). */
function refetchSoon(): void {
  window.setTimeout(() => {
    void import("../../../src/App").then(({ appQueryClient }) => appQueryClient.refetchQueries({ type: "active" }));
  }, 2200);
}

/** The next clock change in the zone: the first Sunday of November or the second Sunday of March, 2 AM. */
function nextClockChange(): string {
  const today = nowDate();
  const sunday = (year: number, month: number, nth: number) => {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(1 + ((7 - first) % 7) + 7 * (nth - 1)).padStart(2, "0")}`;
  };
  const year = Number(today.slice(0, 4));
  return [sunday(year, 2, 2), sunday(year, 10, 1), sunday(year + 1, 2, 2), sunday(year + 1, 10, 1)].find((day) => day > today)!;
}

export const hubSetups: Record<string, () => void> = {
  // ---------- the network ----------
  "hub-offline": () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  },
  "hub-stale": () => { hubFlags.failAfterFirst.add("hub"); refetchSoon(); },
  "hub-exchanges-stale": () => { hubFlags.failAfterFirst.add("exchanges"); refetchSoon(); },
  // The eligibility check fails on the free shift of "hub-offer-shift".
  "hub-candidates-fail": () => { hubFlags.failCandidates = true; hubSetups["hub-offer-shift"]!(); },

  // ---------- Employee Home: Maria's shifts ----------
  "hub-shift-soon": () => {
    const next = shiftAt(Date.now() + 135 * MIN, 300, maria());
    unpublish((one) => one.employee_id === maria() && (one.scheduled_date === nowDate() || one.scheduled_date === next.scheduled_date));
    publish(next);
    save();
  },
  "hub-shift-now": () => {
    const now = shiftAt(Date.now() - 60 * MIN, 240, maria());
    unpublish((one) => one.employee_id === maria() && (one.scheduled_date === nowDate() || one.scheduled_date === now.scheduled_date));
    publish(now);
    save();
  },
  "hub-overnight": () => {
    const tomorrow = addDays(nowDate(), 1);
    unpublish((one) => one.employee_id === maria() && one.scheduled_date >= nowDate() && one.scheduled_date <= addDays(nowDate(), 2));
    publish({ ...shift({ employee: maria(), date: tomorrow, start: "20:00", end: "02:00", job: JOB.server }), shift_type_id: TYPE.close });
    save();
  },
  "hub-device-time": () => {
    world.locations.find((one) => one.id === LOC.downtown)!.timezone = "";
    save();
  },
  "hub-no-shifts": () => {
    unpublish((one) => one.employee_id === maria());
    save();
  },
  "hub-shift-note": () => {
    const next = mariaUpcoming()[0];
    if (next) next.note = "Training a new host tonight. Please arrive 15 minutes early and bring your wine key.";
    save();
  },
  "hub-alone": () => {
    world.employees.find((one) => one.id === maria())!.location_ids = [];
    save();
  },
  // Nobody is waiting on Maria: Priya's swap invitation is gone.
  "hub-caught-up": () => {
    const invited = hubData().applications.filter((one) => one.employee_id === maria() && one.status === "invited").map((one) => one.case_id);
    hubData().cases = hubData().cases.filter((one) => !invited.includes(one.id));
    hubData().applications = hubData().applications.filter((one) => !invited.includes(one.case_id));
    save();
  },
  "hub-many-reminders": () => {
    const list = (hubData().tasks[viewer.userId] ??= []);
    const at = (hours: number) => iso(Date.now() - hours * 3_600_000);
    list.push(
      { id: uuid(), title: "Swap my Sunday brunch with Jake", completed: false, created_at: at(2) },
      { id: uuid(), title: "Ask Rachel about the holiday party", completed: false, created_at: at(6) },
      { id: uuid(), title: "Polish the wine glasses for Friday's buyout", completed: false, created_at: at(10) },
    );
    save();
  },
  "hub-no-reminders": () => {
    hubData().tasks[viewer.userId] = [];
    save();
  },

  // ---------- Shift Hub ----------
  // Maria can't work weekend evenings: the open dinner shifts ask "Request anyway".
  "hub-evening-unavailable": () => {
    world.employees.find((one) => one.id === maria())!.unavailable.push({ weekday: 5, from: "16:00", to: "24:00" }, { weekday: 6, from: "16:00", to: "24:00" });
    save();
  },
  // The shift Priya offers Maria falls on hours Maria marked unavailable.
  "hub-invite-conflict": () => {
    const invite = hubData().applications.find((one) => one.employee_id === maria() && one.status === "invited");
    const item = invite && hubData().cases.find((one) => one.id === invite.case_id);
    if (item) {
      const weekday = new Date(`${item.offered_snapshot.scheduled_date}T12:00:00Z`).getUTCDay();
      world.employees.find((one) => one.id === maria())!.unavailable.push({ weekday, from: "06:00", to: "23:00" });
    }
    save();
  },
  // Rachel moved the hours of the shift Maria was offering: the offer ended.
  // Nobody has offered to take Maria's shift yet: her request reads "Finding cover".
  "hub-no-candidates": () => {
    const item = hubData().cases.find((one) => one.kind === "cover" && one.status === "open" && one.owner_id === maria());
    if (item) {
      const data = hubData();
      const gone = new Set(data.applications.filter((one) => one.case_id === item.id).map((one) => one.id));
      data.applications = data.applications.filter((one) => !gone.has(one.id));
      data.events = data.events.filter((one) => !one.application_id || !gone.has(one.application_id));
    }
    save();
  },
  "hub-invalidated": () => {
    const item = hubData().cases.find((one) => one.kind === "cover" && one.status === "open" && one.owner_id === maria());
    if (item) {
      item.status = "invalidated";
      item.revision += 1;
      item.updated_at = new Date().toISOString();
      for (const application of hubData().applications.filter((one) => one.case_id === item.id)) application.status = "invalidated";
      hubData().events.push({ id: uuid(), case_id: item.id, application_id: null, action: "invalidated", message: "Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.", private_note: "", created_at: new Date().toISOString(), actor_user_id: MANAGER_USER_ID });
    }
    save();
  },
  // Nobody took Maria's shift before it started.
  "hub-expired": () => {
    const item = hubData().cases.find((one) => one.kind === "cover" && one.status === "open" && one.owner_id === maria());
    if (item) {
      item.status = "expired";
      item.revision += 1;
      for (const application of hubData().applications.filter((one) => one.case_id === item.id)) application.status = "expired";
      hubData().events.push({ id: uuid(), case_id: item.id, application_id: null, action: "expired", message: "The shift has started. The current owner remains responsible.", private_note: "", created_at: new Date().toISOString(), actor_user_id: null });
    }
    save();
  },
  // The open shift Maria picked up was taken off the schedule afterwards.
  "hub-unpublished": () => {
    const item = hubData().cases.find((one) => one.kind === "open_pickup" && one.status === "completed"
      && hubData().applications.some((application) => application.case_id === one.id && application.employee_id === maria()));
    if (item) unpublish((one) => one.id === item.offered_source_id || one.source_published_shift_id === item.offered_source_id);
    save();
  },
  // Maria's Saturday close runs through the night the clocks change.
  // A free evening shift of Maria's with a fixed id, so "Find cover or swap" opens by address.
  "hub-offer-shift": () => {
    const today = nowDate();
    const busy = new Set(publishedShifts().filter((one) => one.employee_id === maria()).map((one) => one.scheduled_date));
    const days = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => addDays(today, n));
    const day = days.find((date) => !busy.has(date)) ?? addDays(today, 13);
    publish(shift({ employee: maria(), date: day, start: "17:00", end: "22:00", job: JOB.server, id: fixedId(0x7c3) }));
    // And a free evening of Priya's she could swap for (Swap shifts picks it by id).
    const priya = world.employees.find((one) => one.display_name.startsWith("Priya"))!.id;
    const taken = new Set(publishedShifts().filter((one) => one.employee_id === priya || one.employee_id === maria()).map((one) => one.scheduled_date));
    const other = days.find((date) => !taken.has(date) && date !== day) ?? addDays(today, 14);
    publish(shift({ employee: priya, date: other, start: "17:00", end: "22:00", job: JOB.server, id: fixedId(0x7c4) }));
    save();
  },
  // Maria already asked to cover Jake's shift: the card reads "Awaiting manager".
  "hub-applied": () => {
    const jake = world.employees.find((one) => one.display_name.startsWith("Jake"))!.id;
    const item = hubData().cases.find((one) => one.kind === "cover" && one.status === "open" && one.owner_id === jake);
    if (item) exchangeCommand({ action: "apply", shift_id: item.offered_source_id, case_id: item.id });
    save();
  },
  // A host shift of Maria's while Priya, the only other Downtown host, works: nobody can take it.
  "hub-offer-lonely": () => {
    const priya = world.employees.find((one) => one.display_name.startsWith("Priya"))!.id;
    const mine = new Set(publishedShifts().filter((one) => one.employee_id === maria()).map((one) => one.scheduled_date));
    const busy = publishedShifts()
      .filter((one) => one.employee_id === priya && one.scheduled_date > addDays(nowDate(), 1) && !mine.has(one.scheduled_date) && !one.crosses_midnight)
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
    if (busy) publish(shift({ employee: maria(), date: busy.scheduled_date, start: busy.start_time!.slice(0, 5), end: busy.end_time!.slice(0, 5), job: JOB.host, location: busy.location_id, id: fixedId(0x7c5) }));
    save();
  },
  // The free shift already has Maria's open cover request.
  "hub-offer-active": () => {
    hubSetups["hub-offer-shift"]!();
    exchangeCommand({ action: "create", shift_id: fixedId(0x7c3), kind: "cover" });
    save();
  },
  "hub-dst-shift": () => {
    const sunday = nextClockChange();
    publish({ ...shift({ employee: maria(), date: addDays(sunday, -1), start: "22:00", end: "04:00", job: JOB.server, id: "0000d570-0000-4000-8000-00000000d570" }), shift_type_id: TYPE.close });
    save();
  },

  // ---------- My availability ----------
  "hub-not-submitted": () => { delete availabilityData().employee[maria()]; save(); },
  "hub-denied": () => {
    const dentist = timeOff(0x705);
    dentist.status = "denied";
    for (const segment of dentist.segments) segment.status = "denied";
    dentist.revision += 1;
    dentist.events.push({ id: uuid(), action: "denied", actor_user_id: MANAGER_USER_ID, note: "We're fully booked that morning. Could you book it for the afternoon?", created_at: new Date().toISOString(), revision: dentist.revision });
    save();
  },
  "hub-revoked": () => {
    const wedding = timeOff(0x70e);
    wedding.status = "revoked";
    wedding.revision += 1;
    wedding.events.push({ id: uuid(), action: "revoked", actor_user_id: MANAGER_USER_ID, note: "Restaurant Week moved to these dates. Let's talk about other days.", created_at: new Date().toISOString(), revision: wedding.revision });
    save();
  },
  // The Family trip approval opened Maria's Wednesday lunch for the team.
  "hub-released": () => {
    const trip = timeOff(0x701);
    const date = trip.segments[0]!.segment_date;
    const approved = [...trip.events].reverse().find((event) => event.action === "approved");
    if (approved) approved.released = [{
      id: uuid(), location_id: LOC.downtown, location_name: "Harbor & Vine Downtown", job_name: "Server", scheduled_date: date, timezone: ZONE,
      starts_at: iso(localInstant(date, "11:00", ZONE)), ends_at: iso(localInstant(date, "16:00", ZONE)),
    }];
    save();
  },
  // Rachel gave back the first day of the Cousin's wedding leave (approved cancellation).
  "hub-partial-cancel": () => {
    const wedding = timeOff(0x70e);
    const first = wedding.segments[0]!;
    const child: TimeOffRecord = {
      ...wedding, id: uuid(), request_type: "time_off_cancellation", reason: "Flights changed, I can work the first day.", status: "approved",
      revision: 2, created_at: iso(Date.now() - 30 * 3_600_000), decide_by: null, votes: [], parent_id: wedding.id, parent_revision: wedding.revision,
      segments: [{ ...first, id: uuid(), status: "approved", parent_segment_id: first.id }],
      events: [
        { id: uuid(), action: "submitted", actor_user_id: viewers.employee.userId, note: "", created_at: iso(Date.now() - 30 * 3_600_000), revision: 1 },
        { id: uuid(), action: "approved", actor_user_id: MANAGER_USER_ID, note: "", created_at: iso(Date.now() - 20 * 3_600_000), revision: 2 },
      ],
    };
    records().push(child);
    save();
  },
  // Maria asked to give back the first day of the wedding leave; Rachel has not decided.
  "hub-pending-cancel": () => {
    const wedding = timeOff(0x70e);
    const first = wedding.segments[0]!;
    records().push({
      ...wedding, id: uuid(), request_type: "time_off_cancellation", reason: "Flights changed, I can work the first day.", status: "pending",
      revision: 1, created_at: iso(Date.now() - 3 * 3_600_000), decide_by: iso(Date.parse(first.starts_at) - 24 * 3_600_000), votes: [],
      parent_id: wedding.id, parent_revision: wedding.revision,
      segments: [{ ...first, id: uuid(), status: "pending", parent_segment_id: first.id }],
      events: [{ id: uuid(), action: "submitted", actor_user_id: viewers.employee.userId, note: "Flights changed, I can work the first day.", created_at: iso(Date.now() - 3 * 3_600_000), revision: 1 }],
    });
    save();
  },
  "hub-no-requests": () => {
    const mine = records().filter((one) => one.employee_id === maria());
    for (const one of mine) records().splice(records().indexOf(one), 1);
    save();
  },

  // ---------- Announcements and notifications ----------
  "hub-no-announcements": () => { announcementData().posts.length = 0; save(); },
  // Important Dates: nothing written on a date yet (the dated posts are gone).
  "dates-empty": () => {
    const posts = announcementData().posts;
    for (const post of posts.filter((one) => one.on_important_dates)) posts.splice(posts.indexOf(post), 1);
    save();
  },
  "hub-no-notices": () => { commsData().notices[viewerRole].length = 0; save(); },
  // A busy inbox: 120 unread shift reminders on top of the seed.
  "hub-many-notices": () => {
    const list = commsData().notices[viewerRole];
    for (let n = 0; n < 120; n += 1) {
      list.push(demoNotice(6 * 60 + n * 41, {
        category: "schedule", type_key: "schedule.shift_reminder", severity: "info",
        title: `Shift reminder ${n + 1}`, body: "A shift you work is coming up. Open your schedule for the details.",
        action_url: "/app/employee-hub/schedule", source_type: "shift",
      }));
    }
    save();
  },

  // ---------- the shell ----------
  // The owner, admin or manager has an employee record of their own (and two shifts).
  "hub-staff-employee": () => {
    const id = fixedId(0x6f0);
    const job = viewerRole === "owner" ? world.jobs.find((one) => one.name === "Owner")!.id : world.jobs.find((one) => one.name === "Manager")!.id;
    world.employees.push({ id, employee_code: "HV-000", display_name: viewer.name, location_ids: [LOC.downtown], job_ids: [job], primary_job_id: job, unavailable: [] });
    viewer.employeeId = id;
    publish(shift({ employee: id, date: addDays(nowDate(), 1), start: "10:00", end: "18:00", job }));
    publish(shift({ employee: id, date: addDays(nowDate(), 3), start: "15:00", end: "23:00", job }));
    save();
  },
  // Answered by hub-service.ts (shellRoutes) for these scenarios.
  "hub-switcher": () => {},
  "hub-switch-fails": () => {},
  "hub-setup-pending": () => {},
  "hub-documents-restricted": () => {},
};
