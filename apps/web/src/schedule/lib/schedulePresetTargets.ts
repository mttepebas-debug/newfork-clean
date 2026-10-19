import type { ScheduleReadModel } from "@newfork/shared/schedule";


import type {
  CellContextMenuTarget,
  CellPresetMenuItem,
} from "../components/ScheduleContextMenu";
import type { PresetCreateTarget } from "../components/SchedulePresetRows";
import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessages,
  scheduleConflictSeverity,
  scheduleConflictShortLabel,
} from "../schedule-conflicts";
import { presetHoursOfType, withPresetHours } from "./presetTimes";


function employeeName(
  model: ScheduleReadModel,
  employeeId: string | null,
): string {
  if (!employeeId) return "Unassigned";
  return (
    model.employees.find((employee) => employee.id === employeeId)
      ?.display_name ?? "Employee"
  );
}

function locationName(model: ScheduleReadModel, locationId: string): string {
  return (
    model.locations.find((location) => location.id === locationId)?.name ??
    "Location"
  );
}

export function formatPresetCreateContext(
  model: ScheduleReadModel,
  target: PresetCreateTarget,
): string {
  const shiftType =
    model.shift_types.find((item) => item.id === target.preset.shiftTypeId)
      ?.name ?? "Preset";
  const job =
    model.jobs.find((item) => item.id === target.preset.jobId)?.name ?? "Job";
  const employee = target.employeeId
    ? employeeName(model, target.employeeId)
    : "Open shift";
  return `${shiftType}-${job} / ${employee} / ${locationName(
    model,
    target.locationId,
  )} / ${target.date}`;
}

export function validatePresetCreateTarget(
  model: ScheduleReadModel,
  target: PresetCreateTarget,
): { readonly allowed: true; readonly warning?: string } | { readonly allowed: false; readonly reason: string; readonly shortReason: string } {
  const hasHours = Boolean(target.preset.startTime && target.preset.endTime);
  const conflicts = evaluateScheduleShiftConflicts(model, model.shifts, {
    location_id: target.locationId, employee_id: target.employeeId, job_id: target.preset.jobId,
    shift_type_id: target.preset.shiftTypeId, scheduled_date: target.date,
    start_time: target.preset.startTime ?? "", end_time: target.preset.endTime ?? "",
    unpaid_break_minutes: 30, hide_time_on_badge: false,
    time_basis: hasHours ? "type_default" : "explicit", label_ids: [], note: "",
  });
  const blockers = conflicts.filter(reason => scheduleConflictSeverity(reason) === "block");
  if (blockers.length) return { allowed: false, reason: formatScheduleConflictMessages(blockers).join(" "), shortReason: scheduleConflictShortLabel(blockers[0]!) };
  return conflicts.length ? { allowed: true, warning: formatScheduleConflictMessages(conflicts).join(" ") } : { allowed: true };
}

/** Whether a preset may drop here: a type with several times fits where any of them does (PRESET-SAAT, S-183). */
export function validatePresetDrop(
  model: ScheduleReadModel,
  target: PresetCreateTarget,
): ReturnType<typeof validatePresetCreateTarget> {
  const hours = presetHoursOfType(model.shift_types.find((type) => type.id === target.preset.shiftTypeId));
  if (hours.length <= 1) return validatePresetCreateTarget(model, hours[0] ? withPresetHours(target, hours[0]) : target);
  const results = hours.map((item) => validatePresetCreateTarget(model, withPresetHours(target, item)));
  return results.find((result) => result.allowed) ?? results[0]!;
}

export function buildCellPresetMenuItems(
  model: ScheduleReadModel,
  target: CellContextMenuTarget | null,
): readonly CellPresetMenuItem[] {
  if (!target?.employeeId || !target.jobId) return [];
  const job = model.jobs.find((item) => item.id === target.jobId);
  if (!job) return [];
  return model.shift_types.map((shiftType) => {
    const validation = validatePresetDrop(
      model,
      {
        locationId: target.locationId,
        employeeId: target.employeeId,
        date: target.date,
        preset: {
          jobId: target.jobId!,
          shiftTypeId: shiftType.id,
          startTime: shiftType.default_start_time,
          endTime: shiftType.default_end_time,
        },
        point: { x: target.x, y: target.y },
      },
    );
    return {
      id: shiftType.id,
      label: `${shiftType.name}-${job.name}`,
      color: shiftType.color,
      ...(validation.allowed ? {} : { disabledReason: validation.reason }),
    };
  });
}
