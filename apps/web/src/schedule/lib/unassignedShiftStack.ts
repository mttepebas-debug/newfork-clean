import type { ScheduleShift } from "@newfork/shared/schedule";

/**
 * Which open shifts stack into one "xN" card on the Unassigned row: same
 * place, day, type, hours and badge clock, and the same note. A note sets a
 * shift apart (BL-199), since a stack shows only its first card. The row and
 * its height measurement both read this, so they always count alike.
 */
export function unassignedShiftStackKey(shift: ScheduleShift): string {
  return [
    shift.location_id,
    shift.scheduled_date,
    shift.shift_type_id ?? "",
    shift.start_time,
    shift.end_time,
    shift.hide_time_on_badge ? "clock-hidden" : "clock-visible",
    shift.crosses_midnight ? "overnight" : "same-day",
    shift.note.trim(),
  ].join("|");
}
