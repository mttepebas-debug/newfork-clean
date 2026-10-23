import type { ExchangeCase, TimeOffDeciderView } from "@newfork/shared";
import { answerSentence, answerStatus } from "../time-off/time-off-text";
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
    // The other person comes from the request: once approved, the requested
    // shift's live holder is the owner (bug 31; SwapReview reads it the same way).
    const other =
      item.applications.find((application) => application.status === "pending_manager" || application.status === "invited") ??
      item.applications.find((application) => application.status === "approved") ??
      item.applications.at(-1);
    const partner = other?.employee_name ?? item.requested_shift?.employee_name ?? "a teammate";
    const verb = item.status === "completed" ? "swapped" : item.status === "open" ? "want to swap" : "asked to swap";
    return [{ strong: owner }, " and ", { strong: partner }, ` ${verb} their ${shift.job_name} shifts.`];
  }
  const release = item.audience === "eligible_pool";
  const { names, decided } = takers(item);
  // An open shift the manager offered on publishing has no owner (Mert, 2026-10-20).
  if (item.owner_id === null) {
    if (!names.length) return [{ strong: "Open shift" }, `: ${start}${shift.job_name}${where.slice(0, -1)}, offered to eligible employees.`];
    const ask = decided ? "took" : item.status !== "open" ? "asked for" : names.length > 1 ? "want" : "wants";
    return [...people(names), ` ${ask} the open ${start}${shift.job_name} shift${where}`];
  }
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

/** The Time off tab's own sentence (S-151): "Maria Lopez asks for vacation, Nov 13–16". */
export function timeOffSentence(request: TimeOffDeciderView, timeFormat: "12h" | "24h"): Part[] {
  const parts = answerSentence(request, timeFormat);
  return [{ strong: parts.name }, parts.middle, { strong: parts.when }];
}

export const sentenceText = (parts: readonly Part[]) =>
  parts.map((part) => (typeof part === "string" ? part : part.strong)).join("");

/** Somebody waits on a manager: the request is the manager's to decide. */
export const awaitsDecision = (item: ExchangeCase) =>
  item.status === "open" &&
  (item.stage === "ready_for_manager" ||
    item.stage === "awaiting_other_manager" ||
    item.applications.some((application) => application.status === "pending_manager"));

/**
 * A shift change's word (Mert, 2026-10-14 08:32 and 2026-10-18): Needs decision,
 * Approved, Declined, Expired. Somebody waiting is Needs decision whoever votes
 * first, a half-approved swap too; the details say who else approves. A release nobody waits on is an open
 * shift, off the Requests table. A request that closed without a decision (the
 * owner took it back, the shift changed) has no word and leaves the table.
 */
export function exchangeStatus(item: ExchangeCase): { label: string; tone: Tone } | null {
  if (item.status === "completed") return { label: "Approved", tone: "green" };
  if (item.status === "expired") return { label: "Expired", tone: "gray" };
  if (item.status !== "open") {
    // A direct request ends when its manager turns the one person down.
    const refused = item.audience === "direct" && item.applications.some((application) => application.status === "rejected_by_manager");
    return refused ? { label: "Declined", tone: "red" } : null;
  }
  // A swap one location approved is still Needs decision (Mert, 2026-10-18).
  return awaitsDecision(item) ? { label: "Needs decision", tone: "amber" } : { label: "Open", tone: "gray" };
}

/** A row's word; time off says the Time off tab's word (D7). */
export function rowStatus(row: RequestRow): { label: string; tone: Tone } {
  if (row.source === "exchange") return exchangeStatus(row.request) ?? { label: "Open", tone: "gray" };
  const status = answerStatus(row.request);
  return { label: status.label, tone: status.tone };
}

/** Expires: an open request's last moment; red in its last 12 hours. A decided one has none. */
export function rowExpires(row: RequestRow, now = Date.now()): { at: string; soon: boolean } | null {
  if (row.state === "closed" || !row.decideBy) return null;
  return { at: row.decideBy, soon: Date.parse(row.decideBy) - now <= 12 * 60 * 60 * 1000 };
}
