import type { ScheduleClosure } from "@newfork/shared/schedule";

import { formatTime, type ScheduleTimeFormat } from "./scheduleDateTime";

export function scheduleClosureCoversDate(closure: Pick<ScheduleClosure, "closed_date">, date: string): boolean {
  return closure.closed_date === date;
}

/** "24:00" is the day's end; it reads as midnight. */
const clock = (value: string, timeFormat: ScheduleTimeFormat) =>
  formatTime(value === "24:00" ? "00:00" : value, timeFormat);

/**
 * What a location's day says on the Schedule (EKRAN-08): "Closed", "Closed
 * 1p–5p" or "Short hours 10a–3p". `hours` alone is the part a narrow header
 * shows.
 */
export function scheduleClosureLabel(
  closure: Pick<ScheduleClosure, "kind" | "window_start" | "window_end">,
  timeFormat: ScheduleTimeFormat = "12h",
): { text: string; hours: string | null } {
  if (!closure.window_start || !closure.window_end) return { text: "Closed", hours: null };
  const hours = `${clock(closure.window_start, timeFormat)}–${clock(closure.window_end, timeFormat)}`;
  return { text: `${closure.kind === "short" ? "Short hours" : "Closed"} ${hours}`, hours };
}
