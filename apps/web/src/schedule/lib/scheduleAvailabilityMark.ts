import type { ScheduleEmployee } from "@newfork/shared/schedule";

type Projection = NonNullable<ScheduleEmployee["weekly_availability"]>[number];
type Interval = Projection["unavailable_intervals"][number];

/** Minutes from the location's local midnight, 0..1440. */
export interface AvailabilityRange {
  readonly from: number;
  readonly to: number;
}
/** The employee's own unavailable hours; a manager's note is never drawn (M12). */
export type AvailabilityWindow = AvailabilityRange;
/** What a Schedule cell says about its person's day (G14, BL-204). */
export type ScheduleAvailabilityMark =
  | { readonly kind: "unavailable"; readonly windows: readonly AvailabilityWindow[] }
  | { readonly kind: "time_off"; readonly ranges: readonly AvailabilityRange[] };

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

// The server's offset segments place an instant on the local clock, the same
// way scheduleWeeklyAvailability does, so the browser runs no zone engine.
function wall(instant: number, projection: Projection): number | null {
  const segment = projection.clock_segments.find(
    (item) => instant >= Date.parse(item.start_at) && instant < Date.parse(item.end_at),
  );
  return segment ? instant + segment.offset_seconds * 1000 : null;
}

function rangeOnDay(interval: Interval, day: string, projection: Projection): AvailabilityRange | null {
  const start = wall(Date.parse(interval.start_at), projection);
  // The last instant inside the interval decides its offset; the end is open.
  const end = wall(Date.parse(interval.end_at) - 1, projection);
  if (start === null || end === null) return null;
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const from = Math.max(start, dayStart);
  const to = Math.min(end + 1, dayStart + DAY_MS);
  if (to <= from) return null;
  return { from: Math.round((from - dayStart) / MINUTE_MS), to: Math.round((to - dayStart) / MINUTE_MS) };
}

/** The week's marks for one person at one location, by local date. */
export function scheduleAvailabilityMarks(projection: Projection): Map<string, ScheduleAvailabilityMark> {
  const marks = new Map<string, ScheduleAvailabilityMark>();
  if (projection.status !== "ready") return marks;
  for (const { date, has_unavailable } of projection.days) {
    const ranges = projection.leave_intervals.flatMap((interval) => rangeOnDay(interval, date, projection) ?? []);
    if (ranges.length) {
      marks.set(date, { kind: "time_off", ranges });
      continue;
    }
    if (!has_unavailable) continue;
    const windows = projection.unavailable_intervals.flatMap((interval) => rangeOnDay(interval, date, projection) ?? []);
    if (windows.length) marks.set(date, { kind: "unavailable", windows });
  }
  return marks;
}

/**
 * Time off waiting for an answer, by local date (time off rebuild D3b, KARARLAR S-239 (9)): only a
 * warning, kept apart from the marks above; approved time off and availability never read it.
 */
export function schedulePendingTimeOff(projection: Projection): Map<string, readonly AvailabilityRange[]> {
  const days = new Map<string, readonly AvailabilityRange[]>();
  if (projection.status !== "ready") return days;
  for (const { date } of projection.days) {
    const ranges = (projection.pending_leave_intervals ?? []).flatMap((interval) => rangeOnDay(interval, date, projection) ?? []);
    if (ranges.length) days.set(date, ranges);
  }
  return days;
}

/** "Time off waiting for an answer: Fri, Nov 13, all day" (or its hours). */
export function formatPendingTimeOffLine(day: string, ranges: readonly AvailabilityRange[], timeFormat: "12h" | "24h"): string {
  return `Time off waiting for an answer: ${formatAvailabilityMarkDay(day)}, ${ranges.map((range) => hoursWords(range, timeFormat)).join(", ")}`;
}

/** Whether a shift's clock runs into any of the ranges; an overnight shift counts to the end of its day. */
export function shiftMeetsRanges(ranges: readonly AvailabilityRange[], startTime: string, endTime: string): boolean {
  const from = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  const to = end <= from ? 1440 : end;
  return ranges.some((range) => range.from < to && range.to > from);
}

/** Approved time off over the whole local day (Mert, 2026-10-10: its cell opens no Add shift). */
export function isFullDayTimeOff(mark: ScheduleAvailabilityMark | null): boolean {
  if (mark?.kind !== "time_off") return false;
  let reached = 0;
  for (const range of [...mark.ranges].sort((left, right) => left.from - right.from)) {
    if (range.from > reached) return false;
    reached = Math.max(reached, range.to);
  }
  return reached >= 1440;
}

const sameRange = (left: AvailabilityRange, right: AvailabilityRange) => left.from === right.from && left.to === right.to;

/** One cell can gather several source locations; time off wins. */
export function mergeAvailabilityMarks(
  left: ScheduleAvailabilityMark | null,
  right: ScheduleAvailabilityMark | null,
): ScheduleAvailabilityMark | null {
  if (!left || !right) return left ?? right;
  if (left.kind === "time_off" && right.kind === "time_off") {
    return { kind: "time_off", ranges: [...left.ranges, ...right.ranges.filter((range) => !left.ranges.some((item) => sameRange(item, range)))] };
  }
  if (left.kind === "time_off") return left;
  if (right.kind === "time_off") return right;
  return {
    kind: "unavailable",
    windows: [
      ...left.windows,
      ...right.windows.filter((window) => !left.windows.some((item) => sameRange(item, window))),
    ],
  };
}

export function formatAvailabilityClock(minutes: number, timeFormat: "12h" | "24h"): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = String(minutes % 60).padStart(2, "0");
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:${minute}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

/** "Unavailable after 2:00 PM", "Approved time off, all day" (the approved prototype's words). */
export function formatAvailabilityRange(
  kind: ScheduleAvailabilityMark["kind"],
  range: AvailabilityRange,
  timeFormat: "12h" | "24h",
): string {
  if (kind === "unavailable") return `Unavailable ${hoursWords(range, timeFormat)}`;
  const clock = (minutes: number) => formatAvailabilityClock(minutes, timeFormat);
  if (range.from <= 0 && range.to >= 1440) return "Approved time off, all day";
  return `Approved time off ${clock(range.from)} – ${clock(range.to)}`;
}

/** "after 2:00 PM", "until 9:00 AM", "all day", "9:00 AM – 2:00 PM". */
export function hoursWords(range: AvailabilityRange, timeFormat: "12h" | "24h"): string {
  const clock = (minutes: number) => formatAvailabilityClock(minutes, timeFormat);
  if (range.from <= 0 && range.to >= 1440) return "all day";
  if (range.from <= 0) return `until ${clock(range.to)}`;
  if (range.to >= 1440) return `after ${clock(range.from)}`;
  return `${clock(range.from)} – ${clock(range.to)}`;
}

/** "KadıköyMüdür1 · Sep 28" under the note's words (S2 B); the day alone without a writer; null without either. */
export function formatNoteBy(projection: Projection | undefined): string | null {
  const on = projection?.note_edited_at
    ? new Date(projection.note_edited_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: projection.timezone })
    : null;
  const parts = [projection?.note_author?.trim() || null, on].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The note card's head (S2 B): "Wed after 6:00 PM"; the day alone when the note's hours are not there. */
export function formatNoteWhen(projection: Projection | undefined, day: string, timeFormat: "12h" | "24h"): string {
  const windows = (projection?.note_intervals ?? []).flatMap((interval) => rangeOnDay(interval, day, projection!) ?? []);
  if (!windows.length) return formatAvailabilityMarkDay(day);
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${windows.map((window) => hoursWords(window, timeFormat)).join(", ")}`;
}

/** The "!" window's line: "Marked unavailable Wed, Sep 30 · All day" (no author: only the employee marks it, M2). */
export function formatAvailabilityMarkLine(day: string, window: AvailabilityWindow, timeFormat: "12h" | "24h"): string {
  const hours = hoursWords(window, timeFormat);
  return `Marked unavailable ${formatAvailabilityMarkDay(day)} · ${hours.charAt(0).toUpperCase()}${hours.slice(1)}`;
}

/** One of the row's cells, as the name-cell "!" reads it. */
export interface NameCellAvailabilityDay {
  readonly date: string;
  readonly mark: ScheduleAvailabilityMark | null;
  readonly shiftCount: number;
  /** A shift in the cell runs into the unavailable hours (its card shows the "!"). */
  readonly clashes: boolean;
}

/**
 * The name cell's "!" (Mert, 2026-10-06) shows in two cases only: a shift that
 * does not clash hides a cell's corner "!", or the person is unavailable on
 * two or more days this week. Time off is not availability and never counts.
 */
export function nameCellShowsAvailabilityMark(cells: readonly NameCellAvailabilityDay[]): boolean {
  const unavailable = cells.filter((cell) => cell.mark?.kind === "unavailable");
  return new Set(unavailable.map((cell) => cell.date)).size >= 2
    || unavailable.some((cell) => cell.shiftCount > 0 && !cell.clashes);
}

export function formatAvailabilityMarkDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function clockMinutes(clock: string): number {
  const [hour = "0", minute = "0"] = clock.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** The windows a shift runs into; an overnight shift counts to the end of its day. */
export function windowsDuringShift(
  windows: readonly AvailabilityWindow[],
  startTime: string,
  endTime: string,
): readonly AvailabilityWindow[] {
  const from = clockMinutes(startTime);
  const end = clockMinutes(endTime);
  const to = end <= from ? 1440 : end;
  const hit = windows.filter((window) => window.from < to && window.to > from);
  return hit.length ? hit : windows;
}
