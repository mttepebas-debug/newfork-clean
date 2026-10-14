// Published shifts as Requests, Shift Hub and the Employee Hub read them: the
// current publications of the demo world (the same rows Schedule shows).
// Mirrors public.shift_exchange_shift and the leave helpers of the time-off core.
import { addDays, iso, localInstant, minutesOf, shiftSpan } from "./time";
import { ZONE, world, type Shift } from "./world";
import { employeeName, jobName, locationName } from "./requests-people";

export interface Span { start: number; end: number }

/** Every currently published shift, with the week's location. */
export function publishedShifts(): Shift[] {
  return world.publications.flatMap((publication) => publication.shifts);
}

/** A published shift by its id or the id it was published from. */
export function findPublished(source: string | null | undefined): Shift | undefined {
  if (!source) return undefined;
  return publishedShifts().find((shift) => shift.id === source || shift.source_published_shift_id === source);
}

export function sourceId(shift: Shift): string {
  return shift.source_published_shift_id ?? shift.id;
}

export function spanOf(shift: Pick<Shift, "scheduled_date" | "start_time" | "end_time">): Span | null {
  return shiftSpan(shift, ZONE);
}

const clock = (value: string) => (value.length === 5 ? `${value}:00` : value);

/** shift_exchange_shift: one published shift as the Shift Hub draws it. */
export function exchangeShift(shift: Shift) {
  const span = spanOf(shift);
  const type = world.shift_types.find((item) => item.id === shift.shift_type_id);
  return {
    id: shift.id,
    source_id: sourceId(shift),
    location_id: shift.location_id,
    location_name: locationName(shift.location_id),
    timezone: shift.time_timezone ?? ZONE,
    job_id: shift.job_id,
    job_name: jobName(shift.job_id),
    shift_type_name: type?.name ?? null,
    unpaid_break_minutes: shift.unpaid_break_minutes,
    scheduled_date: shift.scheduled_date,
    time_basis: shift.time_basis ?? "explicit",
    time_snapshot: (shift.time_snapshot ?? null) as never,
    time_timezone: shift.time_timezone ?? ZONE,
    start_time: shift.start_time ? clock(shift.start_time) : null,
    end_time: shift.end_time ? clock(shift.end_time) : null,
    starts_at: span ? iso(span.start) : null,
    ends_at: span ? iso(span.end) : null,
    employee_id: shift.employee_id,
    employee_name: shift.employee_id ? employeeName(shift.employee_id) : null,
  };
}
export type ExchangeShiftJson = ReturnType<typeof exchangeShift>;

/** time_off_impact's row for a shift the leave would open. */
export function impactShift(shift: Shift) {
  const span = spanOf(shift);
  return {
    id: shift.id,
    location_id: shift.location_id,
    location_name: locationName(shift.location_id),
    job_id: shift.job_id,
    scheduled_date: shift.scheduled_date,
    start_time: shift.start_time ? clock(shift.start_time) : null,
    end_time: shift.end_time ? clock(shift.end_time) : null,
    timezone: shift.time_timezone ?? ZONE,
    job_name: jobName(shift.job_id),
    time_unknown: !span,
    starts_at: span ? iso(span.start) : null,
    ends_at: span ? iso(span.end) : null,
  };
}

/** The day's span in the zone: midnight to midnight. */
export function daySpan(date: string): Span {
  return { start: localInstant(date, "00:00", ZONE), end: localInstant(addDays(date, 1), "00:00", ZONE) };
}

/** A requested period's span: a full day, or hours (an end at or before the start runs into the next day). */
export function periodSpan(date: string, start: string | null, end: string | null, endsNextDay = false): Span {
  if (!start || !end) return daySpan(date);
  const from = localInstant(date, start.slice(0, 5), ZONE);
  const nextDay = endsNextDay || end.startsWith("24:") || minutesOf(end) <= minutesOf(start);
  const to = end.startsWith("24:") ? localInstant(addDays(date, 1), "00:00", ZONE) : localInstant(nextDay ? addDays(date, 1) : date, end.slice(0, 5), ZONE);
  return { start: from, end: to };
}

export const overlapsSpan = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Subtract ranges from ranges (all half-open). */
export function subtract(ranges: Span[], cuts: Span[]): Span[] {
  let pieces = ranges.map((item) => ({ ...item }));
  for (const cut of cuts) {
    pieces = pieces.flatMap((piece) => {
      if (!overlapsSpan(piece, cut)) return [piece];
      const out: Span[] = [];
      if (piece.start < cut.start) out.push({ start: piece.start, end: cut.start });
      if (cut.end < piece.end) out.push({ start: cut.end, end: piece.end });
      return out;
    });
  }
  return pieces;
}

/** Ranges joined where they touch, in order. */
export function merge(ranges: Span[]): Span[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const range of sorted) {
    const last = out.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else out.push({ ...range });
  }
  return out;
}

export const toInterval = (span: Span) => ({ start_at: iso(span.start), end_at: iso(span.end) });

/** Wall date and clock of an instant in the zone. */
export function wallOf(instant: number): { date: string; clock: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}:${parts.second}` };
}
