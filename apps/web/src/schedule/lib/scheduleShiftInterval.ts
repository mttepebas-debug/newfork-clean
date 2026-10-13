import type { ScheduleShift } from "@newfork/shared/schedule";

export function shiftsOverlap(left: ScheduleShift, right: ScheduleShift): boolean {
  return (
    datedInterval(left.scheduled_date, left.start_time, left.end_time).start <
      datedInterval(right.scheduled_date, right.start_time, right.end_time).end &&
    datedInterval(right.scheduled_date, right.start_time, right.end_time).start <
      datedInterval(left.scheduled_date, left.start_time, left.end_time).end
  );
}

function datedInterval(date: string, start: string, end: string) {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const startMinutes = day * 1_440 + timeMinutes(start);
  let endMinutes = day * 1_440 + timeMinutes(end);
  if (endMinutes <= startMinutes) endMinutes += 1_440;
  return { start: startMinutes, end: endMinutes };
}

export function timeMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}
