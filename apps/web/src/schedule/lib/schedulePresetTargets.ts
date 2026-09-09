import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { availabilityForDate } from "@newfork/shared";

import type {
  CellContextMenuTarget,
  CellPresetMenuItem,
} from "../components/ScheduleContextMenu";
import type { PresetCreateTarget } from "../components/SchedulePresetRows";
import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessages,
} from "../schedule-conflicts";
import { scheduleClosureCoversDate } from "./scheduleClosures";

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
  useDefaultTimesForScheduling: boolean,
): { readonly allowed: true; readonly warning?: string } | { readonly allowed: false; readonly reason: string } {
  if (target.employeeId) {
    const employee = model.employees.find(
      (candidate) => candidate.id === target.employeeId,
    );
    if (!employee) return { allowed: false, reason: "Employee not found" };
    if (employee.is_excluded_from_schedule) {
      return {
        allowed: false,
        reason: "This employee is excluded from schedule",
      };
    }
    if (!employee.location_ids.includes(target.locationId)) {
      return {
        allowed: false,
        reason: "Employee is not assigned to this location",
      };
    }
    if (!employee.job_ids.includes(target.preset.jobId)) {
      return {
        allowed: false,
        reason: "Employee is not assigned to this job",
      };
    }
    if (
      (employee.shift_type_ids ?? []).length > 0 &&
      !employee.shift_type_ids?.includes(target.preset.shiftTypeId)
    ) {
      return {
        allowed: false,
        reason: "Employee is not eligible for this shift type",
      };
    }
  }

  const closures = model.closures.filter(
    (closure) =>
      closure.location_id === target.locationId &&
      scheduleClosureCoversDate(closure, target.date),
  );
  if (closures.some((closure) => closure.is_all_day)) {
    return { allowed: false, reason: "Location is closed all day." };
  }
  if (
    closures.some((closure) =>
      closure.shift_type_ids.includes(target.preset.shiftTypeId),
    )
  ) {
    return {
      allowed: false,
      reason: "Location is closed for this shift type.",
    };
  }
  if (
    target.preset.startTime &&
    target.preset.endTime &&
    target.preset.startTime === target.preset.endTime
  ) {
    return {
      allowed: false,
      reason: "Default start and end time cannot be the same.",
    };
  }
  if (target.employeeId && target.preset.startTime && target.preset.endTime) {
    const conflicts = evaluateScheduleShiftConflicts(model, model.shifts, {
        location_id: target.locationId,
        employee_id: target.employeeId,
        job_id: target.preset.jobId,
        shift_type_id: target.preset.shiftTypeId,
        scheduled_date: target.date,
        start_time: target.preset.startTime,
        end_time: target.preset.endTime,
        unpaid_break_minutes: 30,
        hide_time_on_badge: !useDefaultTimesForScheduling,
        time_basis: "type_default",
        label_ids: [],
        note: "",
      });
    const messages = formatScheduleConflictMessages(conflicts.filter(reason => typeof reason === "string" || reason.type !== "availability"));
    if (messages.length > 0) {
      return { allowed: false, reason: messages.join(" ") };
    }
    if (conflicts.length > 0) return { allowed: true, warning: "Employee has unavailable hours. Review on assignment." };
  }
  if (target.employeeId && (!target.preset.startTime || !target.preset.endTime)) {
    const employee = model.employees.find((item) => item.id === target.employeeId);
    const weekday = new Date(`${target.date}T12:00:00Z`).getUTCDay();
    if (employee?.weekly_availability !== undefined) return { allowed: true, warning: "Confirm shift hours and availability before assignment." };
    if (employee && availabilityForDate(employee, target.date)?.find((day) => day.day === weekday)?.mode === "unavailable")
      return { allowed: true, warning: "Employee is unavailable all day. Review on assignment." };
  }
  return { allowed: true };
}

export function buildCellPresetMenuItems(
  model: ScheduleReadModel,
  target: CellContextMenuTarget | null,
  useDefaultTimesForScheduling: boolean,
): readonly CellPresetMenuItem[] {
  if (!target?.employeeId || !target.jobId) return [];
  const job = model.jobs.find((item) => item.id === target.jobId);
  if (!job) return [];
  return model.shift_types.map((shiftType) => {
    const validation = validatePresetCreateTarget(
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
      useDefaultTimesForScheduling,
    );
    return {
      id: shiftType.id,
      label: `${shiftType.name}-${job.name}`,
      color: shiftType.color,
      ...(validation.allowed ? {} : { disabledReason: validation.reason }),
    };
  });
}
