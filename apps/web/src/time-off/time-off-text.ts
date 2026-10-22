import {
  timeOffAskRefusal,
  timeOffDayCount,
  type KindOfLeave,
  type TimeOffDeciderView,
  type TimeOffRequestStatus,
  type TimeOffRequestView,
} from "@newfork/shared";

// What the new Time off says (Karma, KARARLAR S-242): kinds, statuses, dates and the form's own checks.
// Dates are local "YYYY-MM-DD" strings in the zone the request was asked in; nothing here reads the
// browser's own zone.

export type TimeFormat = "12h" | "24h";

export const leaveKinds: ReadonlyArray<{ readonly kind: KindOfLeave; readonly label: string; readonly hint: string }> = [
  { kind: "vacation", label: "Vacation", hint: "Planned time away" },
  { kind: "sick", label: "Sick", hint: "You or someone you care for" },
  { kind: "personal", label: "Personal", hint: "Appointments and errands" },
  { kind: "other", label: "Other", hint: "Anything else" },
];

export const leaveLabel = (kind: KindOfLeave) => leaveKinds.find((k) => k.kind === kind)?.label ?? "Time off";

export const statusLook: Record<TimeOffRequestStatus, { readonly label: string; readonly tone: "warn" | "ok" | "bad" | "mute" }> = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  declined: { label: "Declined", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "mute" },
  expired: { label: "Expired", tone: "mute" },
  cancelled: { label: "Cancelled", tone: "mute" },
  revoked: { label: "Revoked", tone: "bad" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (date: string) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
export const weekday = (date: string) => WEEKDAYS[utc(date).getUTCDay()]!;
/** "Oct 27" */
export const monthDay = (date: string) => `${MONTHS[+date.slice(5, 7) - 1]} ${+date.slice(8, 10)}`;
/** "Tue, Oct 27" */
export const dayText = (date: string) => `${weekday(date)}, ${monthDay(date)}`;

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "1:00 PM" or "13:00"; 24:00 is the end of the day. */
export function clockText(time: string, format: TimeFormat = "12h"): string {
  if (time === "24:00") return format === "24h" ? "24:00" : "12:00 AM";
  const hours = +time.slice(0, 2);
  const minutes = time.slice(3, 5);
  if (format === "24h") return `${time.slice(0, 2)}:${minutes}`;
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

type Range = Pick<TimeOffRequestView, "start_date" | "end_date" | "all_day" | "start_time" | "end_time">;

/** "Nov 13–16", "Oct 30 – Nov 1", "Oct 27" (the table's Dates column). */
export function rangeShort(r: Range): string {
  if (r.start_date === r.end_date) return monthDay(r.start_date);
  return r.start_date.slice(5, 7) === r.end_date.slice(5, 7)
    ? `${monthDay(r.start_date)}–${+r.end_date.slice(8, 10)}`
    : `${monthDay(r.start_date)} – ${monthDay(r.end_date)}`;
}

/** "Tue" for one day, "4 days" for more (under the Dates column). */
export function sizeShort(r: Range): string {
  return r.start_date === r.end_date ? weekday(r.start_date) : `${timeOffDayCount(r.start_date, r.end_date)} days`;
}

/** "All day" or "1:00 PM to 6:00 PM" (the Hours column). */
export function hoursText(r: Range, format: TimeFormat = "12h"): string {
  if (r.all_day || !r.start_time || !r.end_time) return "All day";
  return `${clockText(r.start_time, format)} to ${clockText(r.end_time, format)}`;
}

/** "Fri, Nov 13 to Mon, Nov 16", "Tue, Oct 27, 1:00 PM to 6:00 PM", "Tue, Oct 27 9:00 PM to Wed, Oct 28 6:00 AM". */
export function rangeText(r: Range, format: TimeFormat = "12h"): string {
  if (r.all_day || !r.start_time || !r.end_time)
    return r.start_date === r.end_date ? dayText(r.start_date) : `${dayText(r.start_date)} to ${dayText(r.end_date)}`;
  if (r.start_date === r.end_date) return `${dayText(r.start_date)}, ${hoursText(r, format)}`;
  return `${dayText(r.start_date)} ${clockText(r.start_time, format)} to ${dayText(r.end_date)} ${clockText(r.end_time, format)}`;
}

const minutesOf = (time: string) => +time.slice(0, 2) * 60 + +time.slice(3, 5);

/** "4 days", "5 hours", "2 days, part time". */
export function lengthText(r: Range): string {
  const days = timeOffDayCount(r.start_date, r.end_date);
  if (r.all_day || !r.start_time || !r.end_time) return days === 1 ? "1 day" : `${days} days`;
  if (days > 1) return `${days} days, part time`;
  const hours = (minutesOf(r.end_time) - minutesOf(r.start_time)) / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? "hour" : "hours"}`;
}

/** "Downtown or Midtown", "A, B or C". */
export function placesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Upcoming: waiting or approved, and not over. Past: the rest, but a withdrawn request is gone. */
export function splitRequests(requests: readonly TimeOffRequestView[], now: Date) {
  const upcoming = requests
    .filter((r) => (r.status === "pending" || r.status === "approved") && new Date(r.ends_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = requests
    .filter((r) => !upcoming.includes(r) && r.status !== "withdrawn")
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, past };
}

/** The local date and clock now in a zone ("2026-10-22", "09:30"). */
export function zoneNow(zone: string, now: Date = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "Oct 20" from an instant, in a zone. */
export function instantDay(instant: string, zone: string): string {
  return zoneNow(zone, new Date(instant)).date;
}

/** Tomorrow, the coming Saturday and Sunday, next Monday to Sunday (never today's). */
export function quickRange(which: "tomorrow" | "weekend" | "nextweek", today: string): { start: string; end: string } {
  const dow = utc(today).getUTCDay();
  if (which === "tomorrow") return { start: addDays(today, 1), end: addDays(today, 1) };
  if (which === "weekend") {
    const saturday = addDays(today, (6 - dow + 7) % 7 || 7);
    return { start: saturday, end: addDays(saturday, 1) };
  }
  const monday = addDays(today, (1 - dow + 7) % 7 || 7);
  return { start: monday, end: addDays(monday, 6) };
}

export interface AskDraft {
  readonly kind: KindOfLeave | null;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly from: string;
  readonly to: string;
  readonly note: string;
}

export type AskField = "kind" | "dates" | "time";

/** The form's own checks, by field: what is missing, then the range rules shared with the database. */
export function draftProblems(draft: AskDraft, now: { date: string; time: string }): Partial<Record<AskField, string>> {
  const problems: Partial<Record<AskField, string>> = {};
  if (!draft.kind) problems.kind = "Choose a type.";
  if (!draft.start) {
    problems.dates = "Choose the days you need off.";
    return problems;
  }
  const end = draft.end || draft.start;
  const why = timeOffAskRefusal(
    { start_date: draft.start, end_date: end, all_day: draft.allDay, start_time: draft.allDay ? null : draft.from, end_time: draft.allDay ? null : draft.to },
    now,
  );
  if (why === "time_off.order") {
    if (end < draft.start) problems.dates = "The last day is before the first day.";
    else problems.time = "The end time is before the start time.";
  } else if (why === "time_off.too_long") problems.dates = "Ask for 31 days or fewer at a time.";
  else if (why === "time_off.started") {
    if (draft.start < now.date) problems.dates = "That day has passed.";
    else if (draft.allDay) problems.dates = "Today has already started. Turn off All day to ask for the rest of today.";
    else problems.time = "That time has passed.";
  }
  return problems;
}

/** What a refusal from the database says, by its reason, and the field it belongs to. */
export function refusalText(reason: string | undefined): { readonly field: AskField | null; readonly text: string } {
  switch (reason) {
    case "time_off.overlap":
      return { field: "dates", text: "You already have time off or a request in these hours. Withdraw that request first." };
    case "time_off.started":
      return { field: "dates", text: "That time has already started." };
    case "time_off.too_long":
      return { field: "dates", text: "Ask for 31 days or fewer at a time." };
    case "time_off.order":
      return { field: "time", text: "The end is before the start." };
    case "time_off.no_such_time":
      return { field: "time", text: "The clocks change that night, so this time doesn't exist. Pick another time." };
    case "time_off.no_location":
      return { field: null, text: "You need a location before you can ask for time off. Ask your manager." };
    case "time_off.timezone_changed":
      return { field: null, text: "Your location's time zone changed. Check the days and hours, then send again." };
    case "time_off.key_reused":
    case "time_off.invalid":
      return { field: null, text: "Something in this request didn't go through. Check it and send again." };
    default:
      if (reason?.startsWith("authz.")) return { field: null, text: "You can't ask for time off in this workspace." };
      return { field: null, text: "Couldn't send your request. Check your connection and try again." };
  }
}

export function withdrawRefusalText(reason: string | undefined): string {
  if (reason === "time_off.not_pending") return "This request has an answer already, so it can't be withdrawn.";
  if (reason === "time_off.changed") return "This request changed. Check it again.";
  if (reason === "time_off.not_found") return "This request is gone.";
  return "Couldn't withdraw your request. Try again.";
}

// D3: what the answerer's side says.

const askedFor: Record<KindOfLeave, string> = { vacation: "vacation", sick: "sick time", personal: "personal time off", other: "time off" };

/** "Alex Kim asks for vacation, Nov 13–16"; with hours, "…, Oct 27, 1:00 PM to 6:00 PM" (one sentence, S-151). */
export function answerSentence(request: TimeOffDeciderView, format: TimeFormat = "12h") {
  let when: string;
  if (request.all_day || !request.start_time || !request.end_time) when = rangeShort(request);
  else if (request.start_date === request.end_date) when = `${monthDay(request.start_date)}, ${hoursText(request, format)}`;
  else
    when = `${monthDay(request.start_date)} ${clockText(request.start_time, format)} to ${monthDay(request.end_date)} ${clockText(request.end_time, format)}`;
  const middle = ` asks for ${askedFor[request.kind_of_leave]}, `;
  return { name: request.employee_name, middle, when, text: `${request.employee_name}${middle}${when}` };
}

/** "3 shifts"; "3 shifts go"; "3 shifts went to open shifts." */
export function shiftsText(count: number, form: "count" | "go" | "went"): string {
  const noun = count === 1 ? "1 shift" : `${count} shifts`;
  if (form === "count") return count === 0 ? "no shifts" : noun;
  if (form === "go") return count === 1 ? "1 shift goes" : `${noun} go`;
  return count === 0 ? "No shift went to open shifts." : `${noun} went to open shifts.`;
}

/** Why an answer did not go through, by its reason. */
export function answerRefusalText(reason: string | undefined): string {
  switch (reason) {
    case "time_off.changed":
      return "This request changed. Review it again.";
    case "time_off.not_pending":
      return "This request already has an answer.";
    case "time_off.not_found":
      return "This request is no longer available.";
    case "time_off.invalid":
      return "Approve or decline. A note can be up to 1000 characters.";
    case "authz.rank":
      return "You can't answer your own time off request.";
    case "authz.document_blocked":
      return "Add your missing documents before you answer requests.";
    default:
      if (reason?.startsWith("authz.")) return "You can't answer this request.";
      return "Couldn't save your answer. Try again.";
  }
}
