import type { WeeklyPreference } from "@newfork/shared";
import { DAY_END, DAY_START, fullClock, shortDay, toMinutes, type TimeFormat } from "../availability/day-availability";

/**
 * The employee's own mark under one of their shifts (spec "Kurallar" 5;
 * KARARLAR "Müsaitlik tercih"): "Mon after 6:00 PM", or null when the shift
 * misses the marked hours. The week is a weekday pattern on the location's
 * clock, as the shift's hours are. An overnight shift counts to midnight.
 */
export function ownAvailabilityClash(
  week: WeeklyPreference | undefined,
  shift: { readonly scheduled_date: string; readonly start_time: string; readonly end_time: string },
  format: TimeFormat,
): string | null {
  if (!week || !/^\d{2}:\d{2}/.test(shift.start_time) || !/^\d{2}:\d{2}/.test(shift.end_time)) return null;
  const weekday = new Date(`${shift.scheduled_date}T12:00:00Z`).getUTCDay();
  const day = week.days.find((item) => item.day === weekday);
  if (!day) return null;
  const from = toMinutes(shift.start_time);
  const end = toMinutes(shift.end_time);
  const to = end <= from ? DAY_END : end;
  const name = shortDay(weekday);
  if (day.all_day) return `${name} all day`;
  const hit = day.ranges
    .map((range) => [toMinutes(range.start), range.end === "24:00" ? DAY_END : toMinutes(range.end)] as const)
    .filter(([start, stop]) => start < to && stop > from);
  if (!hit.length) return null;
  return `${name} ${hit.map(([start, stop]) => {
    if (start <= DAY_START) return `before ${fullClock(stop, format)}`;
    if (stop >= DAY_END) return `after ${fullClock(start, format)}`;
    return `${fullClock(start, format)} – ${fullClock(stop, format)}`;
  }).join(", ")}`;
}
