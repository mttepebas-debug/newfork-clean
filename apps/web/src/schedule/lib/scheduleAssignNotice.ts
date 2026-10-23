import type { ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { firstName } from "../../availability/day-availability";
import {
  formatAvailabilityMarkDay,
  hoursWords,
  scheduleAvailabilityMarks,
  schedulePendingTimeOff,
  shiftMeetsRanges,
  windowsDuringShift,
} from "./scheduleAvailabilityMark";
import { weeklyTargetAvailability, weeklyTargetNote } from "./scheduleWeeklyAvailability";

/** What the write did, for the notice's first line. */
export type ScheduleAssignKind = "add" | "move" | "save";

export interface ScheduleAssignNotice {
  readonly title: string;
  readonly lines: readonly string[];
}

const NOTE_LIMIT = 80;

function shortNote(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > NOTE_LIMIT ? `${trimmed.slice(0, NOTE_LIMIT - 1).trimEnd()}…` : trimmed;
}

/**
 * The short notice after a shift lands on someone's preference (KARARLAR
 * "Müsaitlik tercih" 3, M12 as of 2026-10-16): the shift is already written,
 * nothing is asked. Null when the person is free and no manager note applies.
 * The words come from the week on screen, the same data the orange "!" reads.
 */
export function scheduleAssignNotice(
  model: Pick<ScheduleReadModel, "employees" | "settings">,
  inputs: readonly ScheduleShiftMutationInput[],
  kind: ScheduleAssignKind,
): ScheduleAssignNotice | null {
  const input = inputs.find((item) => item.employee_id);
  const employee = input && model.employees.find((item) => item.id === input.employee_id);
  if (!input || !employee) return null;
  const timeFormat = model.settings.time_format === "24h" ? "24h" : "12h";
  const lines: string[] = [];
  if (weeklyTargetAvailability(employee, input) === "unavailable") {
    const projection = employee.weekly_availability?.find((item) => item.location_id === input.location_id);
    const mark = projection ? scheduleAvailabilityMarks(projection).get(input.scheduled_date) : undefined;
    const windows = mark?.kind === "unavailable" ? windowsDuringShift(mark.windows, input.start_time, input.end_time) : [];
    const weekday = new Date(`${input.scheduled_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const hours = windows.map((window) => hoursWords(window, timeFormat)).join(", ");
    lines.push(`${firstName(employee.display_name)} prefers not to work ${weekday}${hours ? ` ${hours}` : ""}.`);
  }
  // Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer over the shift's hours is said the
  // same way; the shift is written, nothing is asked.
  {
    const projection = employee.weekly_availability?.find((item) => item.location_id === input.location_id);
    const ranges = projection ? schedulePendingTimeOff(projection).get(input.scheduled_date) : undefined;
    if (ranges && shiftMeetsRanges(ranges, input.start_time, input.end_time))
      lines.push(`${firstName(employee.display_name)} has time off waiting for an answer on ${formatAvailabilityMarkDay(input.scheduled_date)}.`);
  }
  const note = weeklyTargetNote(employee, input);
  if (note) lines.push(note.text ? `Manager note: ${shortNote(note.text)}` : "Manager note for this day.");
  if (!lines.length) return null;
  const count = inputs.filter((item) => item.employee_id === employee.id).length;
  const name = employee.display_name;
  const title = kind === "move" ? `Shift moved to ${name}.`
    : kind === "save" ? `Shift saved for ${name}.`
    : count > 1 ? `${count} shifts added to ${name}.` : `Shift added to ${name}.`;
  return { title, lines };
}
