import type {
  ImportantDate,
  ImportantDateClosureShift,
  ImportantDateHistory,
  ImportantDateLocationDay,
  ImportantDateLocationDays,
  ImportantDateShiftChoice,
} from "@newfork/shared";
import { RequestError } from "../lib/request-error";

/** What a location does on the date, as the drawer's segments say it (L1). */
export type LocationStatus = "open" | "short" | "closed";

export const SHORT_HOURS_DEFAULT = { opens: "10:00", closes: "15:00" } as const;

export function statusOf(days: ImportantDateLocationDays, locationId: string): LocationStatus {
  return days[locationId]?.status ?? "open";
}

/** The day a status gives a location; short hours keep the hours already typed. */
export function dayFor(
  status: LocationStatus,
  current: ImportantDateLocationDay | undefined,
): ImportantDateLocationDay | null {
  if (status === "open") return null;
  if (status === "closed") return { status: "closed" };
  return current?.status === "short" ? current : { status: "short", ...SHORT_HOURS_DEFAULT };
}

export type ShiftTally = { remove: number; open: number; keep: number; listed: number };

/** The choice a listed shift carries: the manager's, else its default (B12). */
export function choiceOf(
  shift: ImportantDateClosureShift,
  choices: Readonly<Record<string, ImportantDateShiftChoice>>,
): ImportantDateShiftChoice {
  return choices[shift.id] ?? shift.default_choice;
}

export function tally(
  shifts: readonly ImportantDateClosureShift[],
  choices: Readonly<Record<string, ImportantDateShiftChoice>>,
): ShiftTally {
  const counts: ShiftTally = { remove: 0, open: 0, keep: 0, listed: shifts.length };
  for (const shift of shifts) counts[choiceOf(shift, choices)] += 1;
  return counts;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The footer's sentence: "3 shifts will be removed · 1 becomes open · 2 kept". */
export function impactPhrase(counts: ShiftTally): string {
  const parts: string[] = [];
  if (counts.remove) parts.push(`${plural(counts.remove, "shift")} will be removed`);
  if (counts.open) {
    parts.push(
      parts.length
        ? `${counts.open} become${counts.open === 1 ? "s" : ""} open`
        : `${plural(counts.open, "shift")} will become ${counts.open === 1 ? "an open shift" : "open shifts"}`,
    );
  }
  if (counts.keep) parts.push(parts.length ? `${counts.keep} kept` : `${plural(counts.keep, "shift")} kept`);
  return parts.join(" · ");
}

/** One location's shift effect, at the end of its row: "2 removed · 1 kept". */
export function locationImpact(status: LocationStatus, counts: ShiftTally): { text: string; tone: "quiet" | "remove" | "open" } {
  if (status === "open") return { text: "Usual hours", tone: "quiet" };
  if (!counts.listed) return { text: "All fit", tone: "quiet" };
  const text = [
    counts.remove ? `${counts.remove} removed` : "",
    counts.open ? `${counts.open} open` : "",
    counts.keep ? `${counts.keep} kept` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { text, tone: counts.remove ? "remove" : counts.open ? "open" : "quiet" };
}

/** The list's Impact column: None, Closed, "1 closed", Short hours. */
export function impactLabel(item: Pick<ImportantDate, "location_days" | "location_ids">, liveLocationCount: number): string {
  const days = Object.values(item.location_days ?? {});
  const closed = days.filter((day) => day.status === "closed").length;
  const short = days.length - closed;
  if (!days.length) return "None";
  const reach = item.location_ids?.length ? item.location_ids.length : liveLocationCount;
  if (closed && !short) return closed >= reach ? "Closed" : `${closed} closed`;
  if (short && !closed) return "Short hours";
  return `${closed} closed · ${short} short hours`;
}

/** "9:00 AM" from "09:00"; "24:00" is midnight at the day's end. */
export function clockLabel(value: string): string {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const hour = hours % 24;
  return `${hour % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hour >= 12 ? "PM" : "AM"}`;
}

const minutesOf = (value: string | null | undefined) => {
  const [hours = 0, minutes = 0] = (value ?? "00:00").split(":").map(Number);
  return hours * 60 + minutes;
};

/** Why a shift is on the list with short hours: "Before opening", "Ends after 3 PM". */
export function shortHoursTag(shift: ImportantDateClosureShift): string {
  if (shift.reason !== "short_hours" || !shift.opens || !shift.closes) return "";
  const start = minutesOf(shift.start_time);
  let end = minutesOf(shift.end_time);
  if (end <= start) end += 1440;
  const opens = minutesOf(shift.opens);
  const closes = minutesOf(shift.closes);
  if (end <= opens) return "Before opening";
  if (start >= closes) return "After closing";
  if (start < opens && end > closes) return `Outside ${clockLabel(shift.opens)}–${clockLabel(shift.closes)}`;
  if (start < opens) return `Starts before ${clockLabel(shift.opens)}`;
  return `Ends after ${clockLabel(shift.closes)}`;
}

/** BL-886: what the drawer says when a save or a state change is refused. */
export function drawerErrorText(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.reason === "important_date.closure_changed") {
      return "The shifts on this date changed. Review them on the Shifts tab, then save again.";
    }
    if (error.reason === "important_date.shift_tied") {
      return "A shift on this date is tied to another record. Choose Open shift or Keep for it.";
    }
    if (error.reason === "important_date.past") return "This date is in a week that is already locked. Choose a later date.";
    if (error.reason?.startsWith("authz.")) return "You can't change dates at this location.";
    if (error.status === 409) return "This date changed. Close it and open it again.";
  }
  return "The date could not be saved. Try again.";
}

/** BL-884: what a save did to the shifts, once it is done. */
export function savedPhrase(result: {
  shifts_removed?: number;
  shifts_opened?: number;
  draft_shifts_opened?: number;
  shifts_stay_open?: number;
}): string {
  const parts: string[] = [];
  if (result.shifts_removed) parts.push(`${plural(result.shifts_removed, "shift")} removed`);
  if (result.shifts_opened) parts.push(`${plural(result.shifts_opened, "shift")} opened`);
  if (result.draft_shifts_opened) parts.push(`${plural(result.draft_shifts_opened, "draft shift")} opened`);
  if (result.shifts_stay_open) parts.push(`${plural(result.shifts_stay_open, "shift")} ${result.shifts_stay_open === 1 ? "stays" : "stay"} open`);
  return parts.length ? `Saved · ${parts.join(" · ")}` : "Saved";
}

type Version = Record<string, unknown> | null;
type Change = ImportantDateHistory["changes"][number];

const statusName: Record<LocationStatus, string> = { open: "Open", short: "Short hours", closed: "Closed" };

function dayName(day: ImportantDateLocationDay | undefined): string {
  if (!day) return statusName.open;
  if (day.status === "short") return `Short hours ${clockLabel(day.opens)}–${clockLabel(day.closes)}`;
  return statusName.closed;
}

function datesOf(version: Record<string, unknown>): string {
  const starts = String(version.starts_on ?? "");
  const ends = String(version.ends_on ?? "");
  return starts === ends ? starts : `${starts} – ${ends}`;
}

function hoursOf(version: Record<string, unknown>): string {
  return version.all_day === false && version.start_time && version.end_time
    ? `${clockLabel(String(version.start_time))}–${clockLabel(String(version.end_time))}`
    : "All day";
}

function locationsOf(version: Record<string, unknown>, name: (id: string) => string): string {
  const ids = Array.isArray(version.location_ids) ? (version.location_ids as string[]) : [];
  return ids.length ? ids.map(name).join(", ") : "All locations";
}

/**
 * The lines of one History entry: "Besiktas: Open → Closed", "Title: Inventory
 * → Inventory day". A creation shows no lines; a change the reader may not see
 * shows none either (K6).
 */
export function historyLines(change: Change, name: (id: string) => string): { label: string; before: string; after: string }[] {
  const before: Version = change.before && !("hidden" in change.before) ? change.before : null;
  const after: Version = change.after && !("hidden" in change.after) ? change.after : null;
  if (!before || !after || change.action === "created") return [];
  const lines: { label: string; before: string; after: string }[] = [];
  const add = (label: string, left: string, right: string) => {
    if (left !== right) lines.push({ label, before: left, after: right });
  };
  add("Title", String(before.title ?? ""), String(after.title ?? ""));
  add("Type", capitalize(String(before.type ?? "")), capitalize(String(after.type ?? "")));
  add("Dates", datesOf(before), datesOf(after));
  add("Hours", hoursOf(before), hoursOf(after));
  add("Repeats", before.recurrence === "annual" ? "Every year" : "Does not repeat", after.recurrence === "annual" ? "Every year" : "Does not repeat");
  add("Locations", locationsOf(before, name), locationsOf(after, name));
  const beforeDays = (before.location_days ?? {}) as ImportantDateLocationDays;
  const afterDays = (after.location_days ?? {}) as ImportantDateLocationDays;
  for (const id of [...new Set([...Object.keys(beforeDays), ...Object.keys(afterDays)])].sort()) {
    add(name(id), dayName(beforeDays[id]), dayName(afterDays[id]));
  }
  add("Note", String(before.note ?? ""), String(after.note ?? ""));
  return lines;
}

const actionWords: Record<Change["action"], string> = {
  created: "Created",
  updated: "Changed",
  unpublished: "Unpublished",
  republished: "Republished",
  archived: "Archived",
  restored: "Restored",
};

/** "Changed by Zeynep Aydin"; a hidden change says only that it happened (K6). */
export function historyHeading(change: Change): string {
  if (!change.changed_at) return "Hidden change";
  return `${actionWords[change.action]} by ${change.actor_name ?? "Workspace member"}`;
}

function capitalize(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}
