import type { ScheduleReadModel } from "@newfork/shared/schedule";

// A post on the Schedule falls on its own days; a yearly post's next year is
// its own record (EKRAN-08).
export function scheduleImportantDateCoversDate(
  importantDate: ScheduleReadModel["important_dates"][number],
  date: string,
): boolean {
  return importantDate.starts_on <= date && date <= importantDate.ends_on;
}
