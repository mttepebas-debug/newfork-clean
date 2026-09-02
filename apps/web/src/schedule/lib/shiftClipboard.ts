import type {
  ScheduleEditableShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

export interface ShiftClipboardSnapshot extends ScheduleShiftMutationInput {
  readonly id: string;
  readonly source_employee_id: string | null;
  readonly source_location_id: string;
}

export function createShiftClipboardSnapshot(
  shift: ScheduleEditableShift,
): ShiftClipboardSnapshot {
  return {
    id: shift.id,
    source_employee_id: shift.employee_id,
    source_location_id: shift.location_id,
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

export function applyShiftClipboardSnapshot(
  snapshot: ShiftClipboardSnapshot,
  target: {
    readonly locationId: string;
    readonly employeeId: string | null;
    readonly date: string;
  },
): ScheduleShiftMutationInput {
  return {
    location_id: target.locationId,
    employee_id: target.employeeId,
    job_id: snapshot.job_id,
    shift_type_id: snapshot.shift_type_id,
    scheduled_date: target.date,
    start_time: snapshot.start_time,
    end_time: snapshot.end_time,
    unpaid_break_minutes: snapshot.unpaid_break_minutes,
    hide_time_on_badge: snapshot.hide_time_on_badge,
    label_ids: [...(snapshot.label_ids ?? [])],
    label_names: [...(snapshot.label_names ?? [])],
    note: snapshot.note,
  };
}
