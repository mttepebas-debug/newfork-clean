import type { ScheduleClosure } from "@newfork/shared/schedule";

import { formatTime, type ScheduleTimeFormat } from "./scheduleDateTime";

export function scheduleClosureCoversDate(closure: Pick<ScheduleClosure, "closed_date">, date: string): boolean {
  return closure.closed_date === date;
}

/** "24:00" is the day's end; it reads as midnight. */
const clock = (value: string, timeFormat: ScheduleTimeFormat) =>
  formatTime(value === "24:00" ? "00:00" : value, timeFormat);

/**
 * What a location's day says on the Schedule (EKRAN-08): "Closed" or "Short
 * hours 10a–3p" (closing at or before opening: the next day). `hours` alone
 * is the part a narrow header shows.
 */
export function scheduleClosureLabel(
  closure: Pick<ScheduleClosure, "kind" | "opens" | "closes">,
  timeFormat: ScheduleTimeFormat = "12h",
): { text: string; hours: string | null } {
  if (closure.kind === "closed" || !closure.opens || !closure.closes)
    return { text: "Closed", hours: null };
  const hours = `${clock(closure.opens, timeFormat)}–${clock(closure.closes, timeFormat)}`;
  return { text: `Short hours ${hours}`, hours };
}
