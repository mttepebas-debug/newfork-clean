import type { ScheduleReadModel } from "@newfork/shared/schedule";

export function scheduleClosureCoversDate(
  closure: ScheduleReadModel["closures"][number],
  date: string,
): boolean {
  const endDate = closure.end_date ?? closure.closed_date;
  return closure.closed_date <= date && date <= endDate;
}
