import type {
  ScheduleEditableShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

import { addDays } from "./scheduleDateTime";

export interface ShiftClipboardSnapshot extends ScheduleShiftMutationInput {
  readonly id: string;
  readonly source_employee_id: string | null;
  readonly source_location_id: string;
  readonly selected_shifts?: readonly ShiftClipboardSnapshot[];
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
    time_basis: shift.time_basis ?? "explicit",
    time_snapshot: shift.time_snapshot ? { ...shift.time_snapshot } : null,
    time_timezone: shift.time_timezone ?? null,
    label_ids: shift.label_ids ?? [],
    label_names: shift.label_names ?? [],
    note: shift.note,
  };
}

export function createShiftClipboardSnapshotSelection(
  shifts: readonly ScheduleEditableShift[],
): ShiftClipboardSnapshot | null {
  const snapshots = shifts.map(createShiftClipboardSnapshot);
  const [primary] = snapshots;
  if (!primary) return null;
  if (snapshots.length === 1) return primary;
  return { ...primary, selected_shifts: snapshots };
}

export function getShiftClipboardSnapshots(
  snapshot: ShiftClipboardSnapshot,
): readonly ShiftClipboardSnapshot[] {
  return snapshot.selected_shifts?.length
    ? snapshot.selected_shifts
    : [snapshot];
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
    time_basis: snapshot.time_basis,
    time_snapshot: snapshot.time_snapshot ? { ...snapshot.time_snapshot } : null,
    time_timezone: snapshot.time_timezone,
    label_ids: [...(snapshot.label_ids ?? [])],
    label_names: [...(snapshot.label_names ?? [])],
    note: snapshot.note,
  };
}

export function applyShiftClipboardSnapshotSelection(
  snapshot: ShiftClipboardSnapshot,
  target: {
    readonly locationId: string;
    readonly employeeId: string | null;
    readonly date: string;
  },
): readonly ScheduleShiftMutationInput[] {
  const snapshots = getShiftClipboardSnapshots(snapshot);
  const [anchor] = snapshots;
  if (!anchor || snapshots.length === 1) {
    return [applyShiftClipboardSnapshot(snapshot, target)];
  }

  return snapshots.map((item) =>
    applyShiftClipboardSnapshot(item, {
      ...target,
      date: addDays(
        target.date,
        scheduleDateOffsetDays(anchor.scheduled_date, item.scheduled_date),
      ),
    }),
  );
}

function scheduleDateOffsetDays(anchorDate: string, date: string): number {
  const anchorTime = Date.parse(`${anchorDate}T12:00:00Z`);
  const targetTime = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(anchorTime) || !Number.isFinite(targetTime)) return 0;
  return Math.round((targetTime - anchorTime) / 86_400_000);
}
