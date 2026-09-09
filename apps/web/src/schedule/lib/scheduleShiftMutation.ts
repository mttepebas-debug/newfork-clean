import type {
  ScheduleShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

export function toScheduleShiftMutation(
  shift: ScheduleShift,
  overrides: Partial<ScheduleShiftMutationInput> = {},
): ScheduleShiftMutationInput {
  return {
    location_id: shift.location_id,
    employee_id: shift.employee_id,
    job_id: shift.job_id,
    shift_type_id: shift.shift_type_id,
    scheduled_date: shift.scheduled_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    unpaid_break_minutes: shift.unpaid_break_minutes,
    hide_time_on_badge: shift.hide_time_on_badge,
    time_basis: shift.time_basis,
    time_snapshot: shift.time_snapshot,
    time_timezone: shift.time_timezone,
    label_ids: shift.label_ids ?? [],
    label_names: shift.label_names ?? [],
    note: shift.note,
    ...overrides,
  };
}
