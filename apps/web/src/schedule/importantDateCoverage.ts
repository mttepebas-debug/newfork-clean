import type { ScheduleReadModel } from "@newfork/shared/schedule";

export function scheduleImportantDateCoversDate(
  importantDate: ScheduleReadModel["important_dates"][number],
  date: string,
): boolean {
  if (importantDate.recurrence === "annual") {
    return annualImportantDateCoversDate(
      importantDate.starts_on,
      importantDate.ends_on,
      date,
    );
  }
  return importantDate.starts_on <= date && date <= importantDate.ends_on;
}

function annualImportantDateCoversDate(
  start: string,
  end: string,
  date: string,
): boolean {
  const target = monthDayNumber(date);
  const startMonthDay = monthDayNumber(start);
  const endMonthDay = monthDayNumber(end);
  if (startMonthDay <= endMonthDay) {
    return startMonthDay <= target && target <= endMonthDay;
  }
  return target >= startMonthDay || target <= endMonthDay;
}

function monthDayNumber(iso: string): number {
  return Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
}
