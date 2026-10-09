import type { ScheduleEmployee, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { getShiftTimeBasis } from "@newfork/shared";

type Projection = NonNullable<ScheduleEmployee["weekly_availability"]>[number];
type Interval = Projection["unavailable_intervals"][number];
// "unavailable": the employee's own mark overlaps, always a warning (M8). A
// manager's note is no status: it is a separate reminder (weeklyTargetNote, M12).
export type WeeklyTargetStatus = "available" | "unavailable" | "time_off" | "unknown";

// Server-provided offset segments avoid a second timezone engine in the browser.
// The latest matching instant agrees with PostgreSQL's repeated-clock choice.
function instant(wall: number, projection: Projection): number | null {
  const matches = projection.clock_segments.flatMap(segment => {
    const value = wall - segment.offset_seconds * 1000;
    return value >= Date.parse(segment.start_at) && value < Date.parse(segment.end_at) ? [value] : [];
  });
  return matches.length ? Math.max(...matches) : null;
}
function overlaps(intervals: readonly Interval[], start: number, end: number): boolean {
  return intervals.some(interval => Date.parse(interval.start_at) < end && start < Date.parse(interval.end_at));
}
export function weeklyTargetAvailability(employee: ScheduleEmployee, input: ScheduleShiftMutationInput): WeeklyTargetStatus | null {
  if (employee.weekly_availability === undefined) return null;
  const interval = weeklyTargetInterval(employee, input);
  if (!interval) return "unknown";
  const projection = employee.weekly_availability.find(item => item.location_id === input.location_id)!;
  if (overlaps(projection.leave_intervals, interval.start, interval.end)) return "time_off";
  return overlaps(projection.unavailable_intervals, interval.start, interval.end) ? "unavailable" : "available";
}

/**
 * The manager note a write runs into (M12): its words for the day ("" when the
 * note has hours but no words), who last wrote it and when (AVAIL-002), or
 * null. Only a reader the note is for gets note_intervals, so nobody else ever
 * sees one.
 */
export function weeklyTargetNote(employee: ScheduleEmployee, input: ScheduleShiftMutationInput):
  { text: string; author: string | null; edited_at: string | null } | null {
  const interval = weeklyTargetInterval(employee, input);
  const projection = employee.weekly_availability?.find(item => item.location_id === input.location_id);
  if (!interval || !projection?.note_intervals || !overlaps(projection.note_intervals, interval.start, interval.end)) return null;
  return {
    text: projection.manager_notes?.[new Date(`${input.scheduled_date}T00:00:00Z`).getUTCDay()]?.trim() ?? "",
    author: projection.note_author ?? null,
    edited_at: projection.note_edited_at ?? null,
  };
}

export function weeklyTargetInterval(employee: ScheduleEmployee, input: ScheduleShiftMutationInput): { start: number; end: number } | null {
  const projection = employee.weekly_availability?.find(item => item.location_id === input.location_id);
  if (!projection || projection.status !== "ready") return null;
  const weekEnd = new Date(Date.parse(`${projection.week_start}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  if (input.scheduled_date < projection.week_start || input.scheduled_date >= weekEnd) return null;
  const zone = input.time_timezone || input.time_snapshot?.timezone || projection.timezone;
  if (zone !== projection.timezone) return null;
  if (input.time_snapshot && getShiftTimeBasis(input) === "type_default" &&
    (input.time_snapshot.start_time.slice(0, 5) !== input.start_time.slice(0, 5) || input.time_snapshot.end_time.slice(0, 5) !== input.end_time.slice(0, 5))) return null;
  const validClock = (clock: string) => /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(clock);
  if (!validClock(input.start_time) || !(validClock(input.end_time) || input.end_time === "24:00") || input.start_time === input.end_time) return null;
  const startWall = Date.parse(`${input.scheduled_date}T${input.start_time}Z`);
  let endWall = Date.parse(`${input.scheduled_date}T${input.end_time}Z`);
  if (endWall < startWall) endWall += 86_400_000;
  const start = instant(startWall, projection), end = instant(endWall, projection);
  return start === null || end === null || end <= start ? null : { start, end };
}
