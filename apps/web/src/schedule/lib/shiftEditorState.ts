import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

import { primaryScheduleJobId } from "./scheduleEmployeeSort";
import {
  applyShiftClipboardSnapshot,
  type ShiftClipboardSnapshot,
} from "./shiftClipboard";

export interface PresetCreateInput {
  readonly jobId: string;
  readonly shiftTypeId: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
}

export type ScheduleShiftEditorState =
  | { mode: "edit"; shift: ScheduleEditableShift; x?: number; y?: number }
  | {
      mode: "create";
      locationId: string;
      employeeId: string | null;
      date: string;
      copy?: ShiftClipboardSnapshot;
      preset?: PresetCreateInput;
      x?: number;
      y?: number;
    };

function defaultJobIdForCreateState(
  state: Extract<ScheduleShiftEditorState, { mode: "create" }>,
  model: ScheduleReadModel,
): string {
  const employee = state.employeeId
    ? model.employees.find((item) => item.id === state.employeeId)
    : null;
  // The row's own job (BL-218): an owner who only works Owner starts on Owner.
  const employeeJobId = employee
    ? primaryScheduleJobId(employee, model.jobs, model.departments)
    : null;

  // Only the owner works Owner, so it is never the stand-in (BL-218).
  return (
    employeeJobId ??
    model.jobs.find((job) => job.system_key !== "owner")?.id ??
    ""
  );
}

export function buildScheduleShiftEditorInitialValue({
  state,
  model,
}: {
  readonly state: ScheduleShiftEditorState;
  readonly model: ScheduleReadModel;
}): ScheduleShiftMutationInput {
  const copiedValue =
    state.mode === "create" && state.copy
      ? applyShiftClipboardSnapshot(state.copy, {
          locationId: state.locationId,
          employeeId: state.employeeId,
          date: state.date,
        })
      : null;
  const base = state.mode === "edit" ? state.shift : copiedValue;
  const createPreset = state.mode === "create" ? state.preset : undefined;
  const createPresetHasDefaultTimes = Boolean(
    createPreset?.startTime && createPreset.endTime,
  );
  const createPresetIsClockOff = Boolean(
    createPreset?.shiftTypeId && !createPresetHasDefaultTimes,
  );
  const presetType = model.shift_types.find((type) => type.id === createPreset?.shiftTypeId);
  const locationId = state.mode === "edit" ? state.shift.location_id : state.locationId;
  const timezone = model.locations.find((location) => location.id === locationId)?.timezone ?? "UTC";
  const presetStart = createPreset?.startTime ?? presetType?.default_start_time;
  const presetEnd = createPreset?.endTime ?? presetType?.default_end_time;
  const timeBasis = base ? base.time_basis ?? "explicit"
    : createPreset && presetStart && presetEnd ? "type_default" : "explicit";

  return {
    location_id:
      state.mode === "edit" ? state.shift.location_id : state.locationId,
    employee_id:
      state.mode === "edit" ? state.shift.employee_id : state.employeeId,
    job_id:
      base?.job_id ??
      createPreset?.jobId ??
      (state.mode === "create" ? defaultJobIdForCreateState(state, model) : ""),
    shift_type_id: base?.shift_type_id ?? createPreset?.shiftTypeId ?? null,
    scheduled_date:
      state.mode === "edit" ? state.shift.scheduled_date : state.date,
    start_time:
      base?.start_time ??
      createPreset?.startTime ??
      (createPreset ? presetType?.default_start_time ?? "" : model.shift_types[0]?.default_start_time ?? "09:00"),
    end_time:
      base?.end_time ??
      createPreset?.endTime ??
      (createPreset ? presetType?.default_end_time ?? "" : model.shift_types[0]?.default_end_time ?? "17:00"),
    unpaid_break_minutes: base?.unpaid_break_minutes ?? 30,
    hide_time_on_badge: base?.hide_time_on_badge ?? createPresetIsClockOff,
    time_basis: timeBasis,
    time_timezone: base?.time_timezone ?? timezone,
    time_snapshot: base?.time_snapshot ?? (timeBasis === "type_default" && presetType && presetStart && presetEnd ? {
      shift_type_id: presetType.id, default_revision: presetType.default_revision ?? 1,
      start_time: presetStart, end_time: presetEnd, timezone,
    } : null),
    label_ids: base?.label_ids ?? [],
    label_names: base?.label_names ?? [],
    note: base?.note ?? "",
  };
}

export function applyScheduleShiftTypeDefaults({
  value,
  shiftType,
  shiftTypeId,
  clockOffFallbackStartTime,
  clockOffFallbackEndTime,
  preserveTimes = false,
}: {
  readonly value: ScheduleShiftMutationInput;
  readonly shiftType: ScheduleReadModel["shift_types"][number] | undefined;
  readonly shiftTypeId: string | null;
  readonly clockOffFallbackStartTime: string;
  readonly clockOffFallbackEndTime: string;
  readonly preserveTimes?: boolean;
}): ScheduleShiftMutationInput {
  if (preserveTimes) return { ...value, shift_type_id: shiftTypeId };
  const hasDefaultTimes = Boolean(
    shiftType?.default_start_time && shiftType.default_end_time,
  );
  if (hasDefaultTimes) {
    return {
      ...value,
      shift_type_id: shiftTypeId,
      start_time: shiftType!.default_start_time!,
      end_time: shiftType!.default_end_time!,
      hide_time_on_badge: false,
      time_basis: "type_default",
      time_snapshot: { shift_type_id: shiftType!.id, default_revision: shiftType!.default_revision ?? 1,
        start_time: shiftType!.default_start_time!, end_time: shiftType!.default_end_time!, timezone: value.time_timezone ?? "UTC" },
    };
  }
  // No default hours: the manager enters them before the shift can be saved.
  if (shiftTypeId) {
    return {
      ...value,
      shift_type_id: shiftTypeId,
      start_time: clockOffFallbackStartTime,
      end_time: clockOffFallbackEndTime,
      hide_time_on_badge: true,
      time_basis: "explicit",
      time_snapshot: null,
    };
  }
  return { ...value, shift_type_id: null };
}
