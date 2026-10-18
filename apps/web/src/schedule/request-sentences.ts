import type { ExchangeCase, TimeOffRequest } from "@newfork/shared";
import type { RequestRow } from "./requests-list";

// Schedule → Requests rows as one sentence each (TAKAS-RELEASE; shift changes:
// Mert, 2026-10-14 00:28–08:45; time off too: Mert, 2026-10-17). A row starts
// with the person who would work the shift and says who comes off it; the
// detail lives in the drawer. Status is one short word; Expires is when the
// request closes on its own.

export type RowKind = "time_off" | "pickup" | "cover" | "swap";
export type Tone = "amber" | "green" | "red" | "gray";
/** A sentence in parts: names are strong. */
export type Part = string | { readonly strong: string };

export const rowKindLabels: Record<RowKind, string> = {
  time_off: "Time off",
  pickup: "Shift pickup",
  cover: "Cover request",
  swap: "Shift swap",
};

/** A release (a cover asked of everyone eligible) is a pickup on the manager's side. */
export function rowKind(row: RequestRow): RowKind {
  if (row.source === "time_off") return "time_off";
  const item = row.request;
  if (item.kind === "swap") return "swap";
  return item.audience === "eligible_pool" ? "pickup" : "cover";
}

const possessive = (name: string) => `${name}’s`;
const clock = (time: string, timeFormat: "12h" | "24h") => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour % 24 < 12 ? "AM" : "PM"}`;
};
const day = (date: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
const range = (start: string, end: string) =>
  start === end ? day(start) : `${day(start)} – ${day(end)}`;

/** Who comes on: the approved taker, else the people waiting for a decision. */
function takers(item: ExchangeCase) {
  const taker = item.applications.find((application) => application.status === "approved");
  if (taker) return { names: [taker.employee_name], decided: true };
  const waiting = item.applications.filter((application) =>
    item.status === "open" ? application.status === "pending_manager" : application.status !== "declined_by_employee",
  );
  return { names: waiting.map((application) => application.employee_name), decided: false };
}

function people(names: readonly string[]): Part[] {
  if (names.length === 1) return [{ strong: names[0]! }];
  if (names.length === 2) return [{ strong: names[0]! }, " and ", { strong: names[1]! }];
  return [{ strong: names[0]! }, ` and ${names.length - 1} others`];
}

export function exchangeSentence(item: ExchangeCase, timeFormat: "12h" | "24h"): Part[] {
  const owner = item.owner_name ?? "A teammate";
  const shift = item.shift;
  const start = shift.start_time ? `${clock(shift.start_time, timeFormat)} ` : "";
  const where = ` at ${shift.location_name} on ${day(shift.scheduled_date)}.`;
  if (item.kind === "swap") {
    const partner = item.requested_shift?.employee_name ?? "a teammate";
    const verb = item.status === "completed" ? "swapped" : item.status === "open" ? "want to swap" : "asked to swap";
    return [{ strong: owner }, " and ", { strong: partner }, ` ${verb} their ${shift.job_name} shifts.`];
  }
  const release = item.audience === "eligible_pool";
  const { names, decided } = takers(item);
  if (!names.length)
    return [{ strong: owner }, ` ${release ? "released" : "asked for cover on"} their ${start}${shift.job_name} shift${where}`];
  const many = names.length > 1;
  const verb = decided
    ? release ? "took over" : "is covering"
    : item.status !== "open"
      ? release ? "asked to take over" : "offered to cover"
      : release ? (many ? "want to take over" : "wants to take over") : "offered to cover";
  return [...people(names), ` ${verb} `, { strong: possessive(owner) }, ` ${start}${shift.job_name} shift${where}`];
}

export function timeOffSentence(request: TimeOffRequest, opens: number): Part[] {
  const when = range(request.start_date, request.end_date);
  const lead: Part[] =
    request.request_type === "time_off_cancellation"
      ? [{ strong: request.employee_name }, ` asked to cancel approved time off ${when}.`]
      : [{ strong: request.employee_name }, ` asked for time off ${when}.`];
  return opens ? [...lead, ` ${opens} ${opens === 1 ? "shift becomes" : "shifts become"} open.`] : lead;
}

export const sentenceText = (parts: readonly Part[]) =>
  parts.map((part) => (typeof part === "string" ? part : part.strong)).join("");

/** One short status (Mert, 2026-10-14 08:32): Needs decision, Approved, Declined, Expired; a few close otherwise. */
export function rowStatus(row: RequestRow): { label: string; tone: Tone } {
  if (row.source === "time_off") {
    const request = row.request;
    if (row.state === "needs_review") return { label: "Needs decision", tone: "amber" };
    if (row.state === "in_progress") return { label: "Waiting for others", tone: "gray" };
    if (request.status === "approved") return { label: "Approved", tone: "green" };
    if (request.status === "denied")
      return request.events.some((event) => event.action === "expired")
        ? { label: "Expired", tone: "gray" }
        : { label: "Declined", tone: "red" };
    return { label: "Revoked", tone: "gray" };
  }
  const item = row.request;
  if (item.status === "completed") return { label: "Approved", tone: "green" };
  if (item.status === "expired") return { label: "Expired", tone: "gray" };
  if (item.status !== "open") return { label: "Closed", tone: "gray" };
  // A swap one location approved waits for the other (Mert, 2026-10-14 10:34).
  if (item.stage === "awaiting_other_manager") {
    const other = item.requested_shift && item.requested_shift.location_id !== item.shift.location_id ? item.requested_shift.location_name : null;
    return { label: other ? `Waiting for ${other}` : "Waiting for the other manager", tone: "amber" };
  }
  if (row.state === "needs_review") return { label: "Needs decision", tone: "amber" };
  const declined = item.applications.some((application) => application.status === "rejected_by_manager");
  if (declined && !item.applications.some((application) => application.status === "pending_manager"))
    return { label: "Declined", tone: "red" };
  return { label: "Waiting for teammates", tone: "gray" };
}

/** Expires: an open request's last moment; red in its last 12 hours. A decided one has none. */
export function rowExpires(row: RequestRow, now = Date.now()): { at: string; soon: boolean } | null {
  if (row.state === "closed" || !row.decideBy) return null;
  return { at: row.decideBy, soon: Date.parse(row.decideBy) - now <= 12 * 60 * 60 * 1000 };
}
