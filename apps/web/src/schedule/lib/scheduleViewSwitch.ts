import { addDays } from "./scheduleDateTime";

/**
 * The date the Week | Day switch opens (S-228 (4)): Day opens the chosen day
 * when it is in the shown week, else today when this is this week, else the
 * week's first day; Week keeps the open day, so that day's week opens.
 */
export function viewSwitchDate({
  to,
  selectedDate,
  weekStart,
  currentWeek,
  today,
}: {
  readonly to: "day" | "week";
  readonly selectedDate: string;
  readonly weekStart: string;
  readonly currentWeek: string;
  readonly today: string;
}): string {
  if (to === "week") return selectedDate;
  const inWeek = (date: string) => date >= weekStart && date <= addDays(weekStart, 6);
  if (inWeek(selectedDate)) return selectedDate;
  return weekStart === currentWeek ? today : weekStart;
}
