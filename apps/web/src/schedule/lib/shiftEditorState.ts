import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

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
  const employeeJobId =
    employee?.primary_job_id &&
    employee.job_ids.includes(employee.primary_job_id)
      ? employee.primary_job_id
      : employee?.job_ids[0];

  return employeeJobId ?? model.jobs[0]?.id ?? "";
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
      model.shift_types[0]?.default_start_time ??
      "09:00",
    end_time:
      base?.end_time ??
      createPreset?.endTime ??
      model.shift_types[0]?.default_end_time ??
      "17:00",
    unpaid_break_minutes: base?.unpaid_break_minutes ?? 30,
    hide_time_on_badge: base?.hide_time_on_badge ?? createPresetIsClockOff,
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
}: {
  readonly value: ScheduleShiftMutationInput;
  readonly shiftType: ScheduleReadModel["shift_types"][number] | undefined;
  readonly shiftTypeId: string | null;
  readonly clockOffFallbackStartTime: string;
  readonly clockOffFallbackEndTime: string;
}): ScheduleShiftMutationInput {
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
    };
  }
  if (shiftTypeId) {
    return {
      ...value,
      shift_type_id: shiftTypeId,
      start_time: clockOffFallbackStartTime,
      end_time: clockOffFallbackEndTime,
      hide_time_on_badge: true,
    };
  }
  return { ...value, shift_type_id: null };
}
