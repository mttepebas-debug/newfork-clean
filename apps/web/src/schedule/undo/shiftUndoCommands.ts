import type {
  ScheduleEditableShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

export interface ScheduleShiftUndoCommand {
  readonly label: string;
  readonly domain: "schedule";
  readonly shiftId: string;
  readonly before: ScheduleEditableShift | null;
  readonly after: ScheduleShiftMutationInput | null;
}

export function shiftToMutationInput(
  shift: ScheduleEditableShift,
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
    label_ids: shift.label_ids ?? [],
    label_names: shift.label_names ?? [],
    note: shift.note,
  };
}

export function createShiftUndoable(
  created: ScheduleEditableShift,
): ScheduleShiftUndoCommand {
  return {
    label: "Create shift",
    domain: "schedule",
    shiftId: created.id,
    before: null,
    after: shiftToMutationInput(created),
  };
}

export function deleteShiftUndoable(
  deleted: ScheduleEditableShift,
): ScheduleShiftUndoCommand {
  return {
    label: "Delete shift",
    domain: "schedule",
    shiftId: deleted.id,
    before: deleted,
    after: null,
  };
}

export function updateShiftUndoable(
  before: ScheduleEditableShift,
  after: ScheduleEditableShift,
): ScheduleShiftUndoCommand {
  return {
    label: "Edit shift",
    domain: "schedule",
    shiftId: after.id,
    before,
    after: shiftToMutationInput(after),
  };
}

export function bulkDeleteShiftsUndoable(
  deleted: readonly ScheduleEditableShift[],
): ScheduleShiftUndoCommand[] {
  return deleted.map(deleteShiftUndoable);
}
