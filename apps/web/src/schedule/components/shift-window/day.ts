// The day a shift sits on, in minutes: its span, who is free, busy, marked
// unavailable or on time off at those hours, and their paid hours this week.
import type { ScheduleEmployee, ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useMemo } from "react";

import { formatAvailabilityClock, scheduleAvailabilityMarks, type AvailabilityRange } from "../../lib/scheduleAvailabilityMark";

export const DAY = 1440;
export const SNAP = 15;
export const OVERTIME_MINUTES = 40 * 60;

export interface Span {
  readonly s: number;
  readonly e: number;
}

/** "16:30" → 990; anything else is no time. */
export function toMinutes(canonical: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(canonical ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 990 → "16:30", wrapping past midnight. */
export function toCanonical(minutes: number): string {
  const value = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function formatClock(minutes: number, timeFormat: "12h" | "24h"): string {
  return formatAvailabilityClock(((minutes % DAY) + DAY) % DAY, timeFormat);
}

/** "7a", "7:30a", "12p" (12-hour) or "07", "07:30" (24-hour), for tight spots. */
export function shortClock(minutes: number, timeFormat: "12h" | "24h"): string {
  const value = ((minutes % DAY) + DAY) % DAY;
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const tail = minute ? `:${String(minute).padStart(2, "0")}` : "";
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}${tail}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}${tail}${hour < 12 ? "a" : "p"}`;
}

/** A shift's minutes on its own day; an end at or before the start is the next day. */
export function shiftSpan(start: string | null | undefined, end: string | null | undefined): Span | null {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (s === null || e === null || s === e) return null;
  if (e <= s) e += DAY;
  return { s, e };
}

export const overlaps = (a: Span, b: Span) => a.s < b.e && b.s < a.e;

export function paidMinutes(shift: Pick<ScheduleShiftMutationInput, "start_time" | "end_time" | "unpaid_break_minutes">): number {
  const span = shiftSpan(shift.start_time, shift.end_time);
  return span ? Math.max(0, span.e - span.s - (shift.unpaid_break_minutes ?? 0)) : 0;
}

export type PersonStatus = "free" | "busy" | "unavailable" | "time_off";
export const personStatusText: Record<PersonStatus, string> = {
  free: "Free",
  busy: "Busy",
  unavailable: "Unavailable",
  time_off: "Time off",
};
const statusOrder: Record<PersonStatus, number> = { free: 0, busy: 1, unavailable: 2, time_off: 3 };

export interface Person {
  readonly employee: ScheduleEmployee;
  readonly weekMinutes: number;
  readonly dayShifts: ReadonlyArray<{ readonly id: string; readonly span: Span; readonly job: string; readonly color: string }>;
  readonly unavailable: readonly AvailabilityRange[];
  readonly timeOff: readonly AvailabilityRange[];
  readonly status: PersonStatus;
}

/** Free people first, then the busy, then the marked; fewest hours first within each. */
export function byAvailability(a: Person, b: Person): number {
  return statusOrder[a.status] - statusOrder[b.status] || a.weekMinutes - b.weekMinutes;
}

export function usePeople(
  model: ScheduleReadModel,
  value: ScheduleShiftMutationInput,
  shiftId: string | null,
  employees: readonly ScheduleEmployee[],
): Person[] {
  const mine = shiftSpan(value.start_time, value.end_time);
  const mineStart = mine?.s;
  const mineEnd = mine?.e;
  return useMemo(() => {
    const span = mineStart === undefined || mineEnd === undefined ? null : { s: mineStart, e: mineEnd };
    return employees.map((employee) => {
      const theirs = model.shifts.filter((shift) => shift.employee_id === employee.id && shift.id !== shiftId);
      const dayShifts = theirs
        .filter((shift) => shift.scheduled_date === value.scheduled_date)
        .flatMap((shift) => {
          const own = shiftSpan(shift.start_time, shift.end_time);
          const job = model.jobs.find((item) => item.id === shift.job_id);
          const type = model.shift_types.find((item) => item.id === shift.shift_type_id);
          return own ? [{ id: shift.id, span: own, job: job?.name ?? "Shift", color: type?.color ?? job?.color ?? "#94a3b8" }] : [];
        });
      const projection = employee.weekly_availability?.find((item) => item.location_id === value.location_id);
      const mark = projection ? scheduleAvailabilityMarks(projection).get(value.scheduled_date) ?? null : null;
      const timeOff = mark?.kind === "time_off" ? mark.ranges : [];
      const unavailable = mark?.kind === "unavailable" ? mark.windows : [];
      const hit = (ranges: readonly AvailabilityRange[]) => !!span && ranges.some((range) => overlaps(span, { s: range.from, e: range.to }));
      const status: PersonStatus = hit(timeOff) ? "time_off"
        : hit(unavailable) ? "unavailable"
        : span && dayShifts.some((shift) => overlaps(span, shift.span)) ? "busy"
        : "free";
      return { employee, weekMinutes: theirs.reduce((sum, shift) => sum + paidMinutes(shift), 0), dayShifts, unavailable, timeOff, status };
    });
  }, [employees, model.shifts, model.jobs, model.shift_types, shiftId, value.scheduled_date, value.location_id, mineStart, mineEnd]);
}
