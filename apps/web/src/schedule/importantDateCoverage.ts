import { importantDateCoversDate, type ScheduleReadModel } from "@newfork/shared/schedule";

// The one rule the API and the Schedule's closed days use (KK-92 d).
export function scheduleImportantDateCoversDate(
  importantDate: ScheduleReadModel["important_dates"][number],
  date: string,
): boolean {
  return importantDateCoversDate(importantDate, date);
}
