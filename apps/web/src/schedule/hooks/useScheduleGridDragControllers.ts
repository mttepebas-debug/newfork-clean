import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
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
  type ScheduleConflictReason,
  scheduleConflictSeverity,
  scheduleConflictShortLabel,
} from "../schedule-conflicts";
import { scheduleJobName } from "../lib/scheduleCatalogNames";
import { formatTime } from "../lib/scheduleDateTime";
import { toScheduleShiftMutation } from "../lib/scheduleShiftMutation";
import { validatePresetDrop } from "../lib/schedulePresetTargets";
import { isScheduleEmployeeEligible } from "../lib/employeeEligibility";
import {
  useSingleShiftPointerDrag,
  type ShiftDropEvaluation,
  type ShiftDropTarget,
} from "./useSingleShiftPointerDrag";
import { useShiftTypePresetPointerDrag } from "./useShiftTypePresetPointerDrag";

function dropConflictEvaluation(reasons: readonly ScheduleConflictReason[]): ShiftDropEvaluation {
  const blockers = reasons.filter(reason => scheduleConflictSeverity(reason) === "block");
  const messages = formatScheduleConflictMessages(blockers.length ? blockers : reasons);
  if (blockers.length) return { allowed: false, reason: messages[0], shortReason: scheduleConflictShortLabel(blockers[0]!), messages, targetStatus: "blocked" };
  if (messages.length) return { allowed: true, reason: messages[0], messages, targetStatus: "warning" };
  return { allowed: true, targetStatus: "allowed" };
}

function missingTargetEvidence(model: ScheduleReadModel, target: { locationId: string; employeeId: string | null; date: string }): ScheduleConflictReason[] {
  const projection = model.employees.find(employee => employee.id === target.employeeId)?.weekly_availability?.find(item => item.location_id === target.locationId);
  const weekEnd = projection ? new Date(Date.parse(`${projection.week_start}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10) : "";
  if (!model.settings.conflict_rules || (target.employeeId && (!projection || projection.status !== "ready" || !projection.clock_segments.length || target.date < projection.week_start || target.date >= weekEnd))) {
    return [{ type: "assessment_unknown", severity: "confirm", message: "Scheduling rules or availability need checking." }];
  }
  return [];
}

export function formatScheduleDragShiftLabel(
  model: ScheduleReadModel,
  shift: ScheduleEditableShift | undefined,
): string {
  if (!shift) return "Shift";
  const job = scheduleJobName(model, shift.job_id) ?? "Shift";
  return `${job}, ${formatTime(
    shift.start_time,
    model.settings.time_format,
    "long",
  )} - ${formatTime(shift.end_time, model.settings.time_format, "long")}`;
}

export function evaluateScheduleShiftDropTarget({
  model,
  shift,
  target,
  shifts = model.shifts,
}: {
  readonly model: ScheduleReadModel;
  readonly shift: ScheduleEditableShift | undefined;
  readonly target: ShiftDropTarget;
  /** The shifts to check against; the target person's own are enough. */
  readonly shifts?: readonly ScheduleShift[];
}): ShiftDropEvaluation {
  if (!shift) return { allowed: false, reason: "Shift no longer exists." };
  const sameTarget =
    !target.copy &&
    shift.location_id === target.locationId &&
    shift.employee_id === target.employeeId &&
    shift.scheduled_date === target.date;
  // Letting go over its own cell puts the shift back: the cell the drag
  // starts on stays plain (Mert, 2026-10-13).
  if (sameTarget) return { allowed: false, targetStatus: null };

  return dropConflictEvaluation(
    [...evaluateScheduleShiftConflicts(
      model,
      shifts,
      toScheduleShiftMutation(shift, {
        location_id: target.locationId,
        employee_id: target.employeeId,
        scheduled_date: target.date,
      }),
      target.copy ? null : shift.id,
    ), ...missingTargetEvidence(model, target)],
  );
}

/**
 * Whether a dragged shift has a cell in this person's row: any of the days
 * at the shift's own location whose drop colour is not "blocked" (Mert,
 * 2026-10-20). The same check as the cell under the pointer, so the row and
 * the cell never disagree. The shift's own person always has one.
 */
export function canTakeDraggedShift({
  model,
  shift,
  employee,
  dates,
}: {
  readonly model: ScheduleReadModel;
  readonly shift: ScheduleEditableShift;
  readonly employee: ScheduleReadModel["employees"][number];
  readonly dates: readonly string[];
}): boolean {
  if (employee.id === shift.employee_id) return true;
  if (!shift.job_id || !isScheduleEmployeeEligible(employee, {
    locationId: shift.location_id, jobId: shift.job_id, shiftTypeId: shift.shift_type_id ?? null,
  })) return false;
  const own = model.shifts.filter((item) => item.employee_id === employee.id);
  return dates.some((date) => evaluateScheduleShiftDropTarget({
    model,
    shift,
    shifts: own,
    target: { shiftId: shift.id, employeeId: employee.id, locationId: shift.location_id, date, copy: false },
  }).targetStatus !== "blocked");
}

export interface ScheduleShiftGroupDropMemberEvaluation extends ShiftDropEvaluation {
  readonly shiftId: string;
  readonly target: ShiftDropTarget;
}

export interface ScheduleShiftGroupDropEvaluation extends ShiftDropEvaluation {
  readonly members: readonly ScheduleShiftGroupDropMemberEvaluation[];
}

export function evaluateScheduleShiftGroupDropTarget({
  model,
  shifts,
  targets,
}: {
  readonly model: ScheduleReadModel;
  readonly shifts: readonly ScheduleEditableShift[];
  readonly targets: readonly ShiftDropTarget[];
}): ScheduleShiftGroupDropEvaluation {
  if (targets.length === 0) {
    return {
      allowed: false,
      reason: "No shifts selected.",
      targetStatus: "blocked",
      members: [],
    };
  }

  const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
  const movingShiftIds = new Set(
    targets
      .filter((target) => !target.copy && shiftsById.has(target.shiftId))
      .map((target) => target.shiftId),
  );
  const retainedShifts = model.shifts.filter(
    (candidate) => !movingShiftIds.has(candidate.id),
  );
  const projectedShifts = targets.flatMap((target, targetIndex) => {
    const shift = shiftsById.get(target.shiftId);
    if (!shift) return [];
    return [
      {
        targetIndex,
        shift: {
          ...shift,
          location_id: target.locationId,
          employee_id: target.employeeId,
          scheduled_date: target.date,
        } satisfies ScheduleShift,
      },
    ];
  });

  const members = targets.map((target, targetIndex) => {
    const shift = shiftsById.get(target.shiftId);
    if (!shift) {
      return {
        shiftId: target.shiftId,
        target,
        allowed: false,
        reason: "Shift no longer exists.",
        targetStatus: "blocked" as const,
      };
    }

    const sameTarget =
      !target.copy &&
      shift.location_id === target.locationId &&
      shift.employee_id === target.employeeId &&
      shift.scheduled_date === target.date;
    if (sameTarget) {
      return {
        shiftId: target.shiftId,
        target,
        allowed: false,
        reason: "Drop on a different cell to move the shift.",
        targetStatus: "blocked" as const,
      };
    }

    const evaluation = dropConflictEvaluation(
      [...evaluateScheduleShiftConflicts(
        model,
        [
          ...retainedShifts,
          ...projectedShifts
            .filter((candidate) => candidate.targetIndex !== targetIndex)
            .map((candidate) => candidate.shift),
        ],
        toScheduleShiftMutation(shift, {
          location_id: target.locationId,
          employee_id: target.employeeId,
          scheduled_date: target.date,
        }),
      ), ...missingTargetEvidence(model, target)],
    );
    return {
      shiftId: target.shiftId,
      target,
      ...evaluation,
    };
  });
  const blockedMembers = members.filter((member) => !member.allowed);
  if (blockedMembers.length === 0) {
    return { allowed: true, targetStatus: members.some(member => member.targetStatus === "warning") ? "warning" : "allowed", members };
  }

  const messages = [
    ...new Set(
      blockedMembers.flatMap((member) =>
        member.messages?.length
          ? member.messages
          : member.reason
            ? [member.reason]
            : [],
      ),
    ),
  ];
  return {
    allowed: false,
    reason: blockedMembers[0]?.reason ?? "The group cannot be moved here.",
    ...(blockedMembers[0]?.shortReason ? { shortReason: blockedMembers[0].shortReason } : {}),
    ...(messages.length > 0 ? { messages } : {}),
    targetStatus: "blocked",
    members,
  };
}

export function evaluateSchedulePresetDropTarget({
  model,
  target,
}: {
  readonly model: ScheduleReadModel;
  readonly target: PresetDropTarget;
}): PresetDropEvaluation {
  // A type with several times is droppable where any of them fits (PRESET-SAAT, S-183).
  const validation = validatePresetDrop(model, {
    locationId: target.locationId,
    employeeId: target.employeeId,
    date: target.date,
    preset: {
      jobId: target.jobId,
      shiftTypeId: target.shiftTypeId,
      startTime: target.startTime,
      endTime: target.endTime,
    },
  });
  return validation.allowed
    ? { allowed: true, targetStatus: validation.warning || missingTargetEvidence(model, target).length ? "warning" : "allowed", ...(validation.warning ? { reason: validation.warning } : {}) }
    : {
        allowed: false,
        reason: validation.reason,
        shortReason: validation.shortReason,
        targetStatus: "blocked",
      };
}

export function useScheduleGridDragControllers({
  enabled,
  filtered,
  model,
  showShiftTypePresets,
  onMove,
  onCopyMove,
  onPresetCreate,
}: {
  readonly enabled: boolean;
  readonly filtered: ScheduleReadModel;
  readonly model: ScheduleReadModel;
  readonly showShiftTypePresets: boolean;
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
        ScheduleEditableShift | undefined,
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
          dedupeKey: "schedule-drag-assignment-blocked",
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
      }),
    onDropAttempt: (target) => {
      setDragOverCell(target?.targetKey ?? null);
      if (!target || target.allowed) return;
      toast.error("Preset shift is unavailable", {
        dedupeKey: "schedule-drag-preset-blocked",
        description: target.reason,
      });
    },
    onDragEnd: () => setDragOverCell(null),
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
      shiftDrag.dragState?.targetKey ??
      presetDrag.dragState?.targetKey ??
      dragOverCell,
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
