import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { useToast } from "@newfork/ui";
import { useCallback, useState } from "react";

import type {
  PresetCreateTarget,
  PresetDropEvaluation,
  PresetDropTarget,
} from "../components/SchedulePresetRows";
import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessages,
} from "../schedule-conflicts";
import { formatTime } from "../lib/scheduleDateTime";
import { toScheduleShiftMutation } from "../lib/scheduleShiftMutation";
import { validatePresetCreateTarget } from "../lib/schedulePresetTargets";
import {
  useSingleShiftPointerDrag,
  type ShiftDropEvaluation,
  type ShiftDropTarget,
} from "./useSingleShiftPointerDrag";
import { useShiftTypePresetPointerDrag } from "./useShiftTypePresetPointerDrag";

export function formatScheduleDragShiftLabel(
  model: ScheduleReadModel,
  shift: ScheduleEditableShift | undefined,
): string {
  if (!shift) return "Shift";
  const job =
    model.jobs.find((item) => item.id === shift.job_id)?.name ?? "Shift";
  return `${job}, ${formatTime(shift.start_time)} to ${formatTime(
    shift.end_time,
  )}`;
}

export function evaluateScheduleShiftDropTarget({
  model,
  shift,
  target,
}: {
  readonly model: ScheduleReadModel;
  readonly shift: ScheduleEditableShift | undefined;
  readonly target: ShiftDropTarget;
}): ShiftDropEvaluation {
  if (!shift) return { allowed: false, reason: "Shift no longer exists." };
  const sameTarget =
    !target.copy &&
    shift.location_id === target.locationId &&
    shift.employee_id === target.employeeId &&
    shift.scheduled_date === target.date;
  if (sameTarget)
    return {
      allowed: false,
      reason: "Drop on a different cell to move the shift.",
      targetStatus: "blocked",
    };

  const messages = formatScheduleConflictMessages(
    evaluateScheduleShiftConflicts(
      model,
      model.shifts,
      toScheduleShiftMutation(shift, {
        location_id: target.locationId,
        employee_id: target.employeeId,
        scheduled_date: target.date,
      }),
      target.copy ? null : shift.id,
    ),
  );
  if (messages.length > 0)
    return {
      allowed: false,
      reason: messages[0],
      messages,
      targetStatus: "blocked",
    };
  return { allowed: true, targetStatus: "allowed" };
}

export function evaluateSchedulePresetDropTarget({
  model,
  target,
  useDefaultTimesForScheduling,
}: {
  readonly model: ScheduleReadModel;
  readonly target: PresetDropTarget;
  readonly useDefaultTimesForScheduling: boolean;
}): PresetDropEvaluation {
  const validation = validatePresetCreateTarget(
    model,
    {
      locationId: target.locationId,
      employeeId: target.employeeId,
      date: target.date,
      preset: {
        jobId: target.jobId,
        shiftTypeId: target.shiftTypeId,
        startTime: target.startTime,
        endTime: target.endTime,
      },
    },
    useDefaultTimesForScheduling,
  );
  return validation.allowed
    ? { allowed: true, targetStatus: "allowed" }
    : {
        allowed: false,
        reason: validation.reason,
        targetStatus: "blocked",
      };
}

export function useScheduleGridDragControllers({
  enabled,
  filtered,
  model,
  showShiftTypePresets,
  useDefaultTimesForScheduling,
  onMove,
  onCopyMove,
  onPresetCreate,
}: {
  readonly enabled: boolean;
  readonly filtered: ScheduleReadModel;
  readonly model: ScheduleReadModel;
  readonly showShiftTypePresets: boolean;
  readonly useDefaultTimesForScheduling: boolean;
  readonly onMove: (
    shift: ScheduleEditableShift,
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onCopyMove: (
    shift: ScheduleEditableShift,
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onPresetCreate: (target: PresetCreateTarget) => void;
}) {
  const toast = useToast();
  const [draggedShiftId, setDraggedShiftId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const resolveDraggedShift = useCallback(
    (shiftId: string) =>
      filtered.shifts.find((shift) => shift.id === shiftId) as
        | ScheduleEditableShift
        | undefined,
    [filtered.shifts],
  );

  const shiftDrag = useSingleShiftPointerDrag({
    enabled,
    resolveLabel: (shiftId) =>
      formatScheduleDragShiftLabel(model, resolveDraggedShift(shiftId)),
    evaluateTarget: (target) =>
      evaluateScheduleShiftDropTarget({
        model,
        shift: resolveDraggedShift(target.shiftId),
        target,
      }),
    onDragStart: setDraggedShiftId,
    onDragEnd: () => {
      setDraggedShiftId(null);
      setDragOverCell(null);
    },
    onDropAttempt: (target) => {
      if (target?.targetStatus) setDragOverCell(target.targetKey ?? null);
      if (target && !target.allowed && target.messages?.length) {
        toast.error("This assignment cannot be saved", {
          description: target.messages.join(" "),
        });
      }
    },
    onDrop: (target) => {
      const shift = resolveDraggedShift(target.shiftId);
      if (!shift) return;
      if (target.copy)
        onCopyMove(shift, target.locationId, target.employeeId, target.date);
      else onMove(shift, target.locationId, target.employeeId, target.date);
    },
  });

  const presetDrag = useShiftTypePresetPointerDrag({
    enabled: enabled && showShiftTypePresets,
    evaluateTarget: (target) =>
      evaluateSchedulePresetDropTarget({
        model,
        target,
        useDefaultTimesForScheduling,
      }),
    onDropAttempt: (target) => {
      setDragOverCell(target?.targetKey ?? null);
      if (!target || target.allowed) return;
      toast.error("Preset shift is unavailable", {
        description: target.reason,
      });
    },
    onDrop: (target, point) => {
      onPresetCreate({
        locationId: target.locationId,
        employeeId: target.employeeId,
        date: target.date,
        point: { x: point.clientX, y: point.clientY },
        preset: {
          jobId: target.jobId,
          shiftTypeId: target.shiftTypeId,
          startTime: target.startTime,
          endTime: target.endTime,
        },
      });
    },
  });

  return {
    activeDragOverCell:
      shiftDrag.dragState?.targetKey ?? presetDrag.dragState?.targetKey ?? dragOverCell,
    draggedShiftId,
    dragOverCell,
    dragPreviewShift: shiftDrag.dragState
      ? resolveDraggedShift(shiftDrag.dragState.activeShiftId)
      : undefined,
    presetDrag,
    setDragOverCell,
    shiftDrag,
  };
}
