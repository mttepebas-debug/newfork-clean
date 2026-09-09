import type {
  ScheduleShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import { intervalsOverlap, toInterval } from "@newfork/scheduling-shared";
import { getShiftTimeBasis } from "@newfork/shared";

export interface ShiftOccupancyTarget {
  readonly employeeId: string | null;
  readonly date: string;
  readonly shiftTypeId: string | null;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly usesClockTime?: boolean;
  readonly excludeShiftId?: string | null;
}

export interface ShiftOccupancyConflict {
  readonly kind: "named_duplicate" | "time_overlap";
  readonly shift: ScheduleShift;
}

const DAY_MS = 86_400_000;

function dateOnlyUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function dayDelta(fromDate: string, targetDate: string): number {
  return Math.round((dateOnlyUtcMs(fromDate) - dateOnlyUtcMs(targetDate)) / DAY_MS);
}

function crossesMidnight(start: string, end: string): boolean {
  return end <= start;
}

export function shiftUsesRealClockTime(shift: ScheduleShift): boolean {
  return getShiftTimeBasis(shift) === "explicit";
}

export function shiftHasSameNamedTypeOnDate(
  shift: ScheduleShift,
  target: Pick<ShiftOccupancyTarget, "date" | "shiftTypeId">,
): boolean {
  return (
    shift.scheduled_date === target.date &&
    Boolean(target.shiftTypeId) &&
    shift.shift_type_id === target.shiftTypeId
  );
}

export function shiftConflictsNamedDuplicate(
  shift: ScheduleShift,
  target: Pick<ShiftOccupancyTarget, "date" | "shiftTypeId">,
): boolean {
  return shiftHasSameNamedTypeOnDate(shift, target);
}

export function shiftOverlapsTargetClockTime(
  shift: ScheduleShift,
  target: Required<Pick<ShiftOccupancyTarget, "date" | "startTime" | "endTime">>,
): boolean {
  const delta = dayDelta(shift.scheduled_date, target.date);
  if (delta < -1 || delta > 1) return false;
  return intervalsOverlap(
    toInterval(
      target.startTime,
      target.endTime,
      crossesMidnight(target.startTime, target.endTime),
      0,
    ),
    toInterval(
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight || crossesMidnight(shift.start_time, shift.end_time),
      delta,
    ),
  );
}

export function findShiftOccupancyConflict(
  shift: ScheduleShift,
  target: ShiftOccupancyTarget,
): ShiftOccupancyConflict | null {
  if (!target.employeeId || shift.employee_id !== target.employeeId) return null;
  if (target.excludeShiftId && shift.id === target.excludeShiftId) return null;

  if (shiftConflictsNamedDuplicate(shift, target)) {
    return { kind: "named_duplicate", shift };
  }

  if (!target.usesClockTime || !shiftUsesRealClockTime(shift)) return null;
  if (!target.startTime || !target.endTime) return null;
  return shiftOverlapsTargetClockTime(shift, {
    date: target.date,
    startTime: target.startTime,
    endTime: target.endTime,
  })
    ? { kind: "time_overlap", shift }
    : null;
}

export function findScheduleShiftOccupancyConflict(
  shifts: readonly ScheduleShift[],
  value: ScheduleShiftMutationInput,
  excludeShiftId: string | null = null,
): ShiftOccupancyConflict | null {
  const target: ShiftOccupancyTarget = {
    employeeId: value.employee_id,
    date: value.scheduled_date,
    shiftTypeId: value.shift_type_id,
    startTime: value.start_time,
    endTime: value.end_time,
    usesClockTime: getShiftTimeBasis(value) === "explicit",
    excludeShiftId,
  };
  return shifts
    .map((shift) => findShiftOccupancyConflict(shift, target))
    .find((conflict): conflict is ShiftOccupancyConflict => conflict !== null) ?? null;
}

export function shiftConflictsOccupancy(
  shift: ScheduleShift,
  target: ShiftOccupancyTarget,
): boolean {
  return findShiftOccupancyConflict(shift, target) !== null;
}
