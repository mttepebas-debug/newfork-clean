import type { ScheduleShift } from "@newfork/shared/schedule";
import { toInterval } from "./shiftInterval";
import { getShiftTimeBasis } from "@newfork/shared";

export interface ScheduleHourTotalValue {
  readonly visibleMinutes: number;
  readonly totalMinutes: number;
  readonly containsEstimates?: boolean;
}

export function shiftMinutes(shift: ScheduleShift): number {
  const interval = toInterval(
    shift.start_time,
    shift.end_time,
    shift.crosses_midnight || shift.end_time <= shift.start_time,
    0,
  );
  const grossMinutes = Math.max(0, interval.e - interval.s);
  const breakMinutes = Math.max(0, Number(shift.unpaid_break_minutes ?? 0));
  return Math.max(0, grossMinutes - breakMinutes);
}

export function formatHourTotal(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0h";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function buildScheduleHourTotalValue(
  visibleShifts: readonly ScheduleShift[],
  totalShifts: readonly ScheduleShift[],
): ScheduleHourTotalValue {
  const visibleMinutes = visibleShifts.reduce(
    (sum, shift) => sum + shiftMinutes(shift),
    0,
  );
  const totalMinutes = totalShifts.reduce(
    (sum, shift) => sum + shiftMinutes(shift),
    0,
  );
  const included = totalShifts.length ? totalShifts : visibleShifts;
  const containsEstimates = included.some((shift) => getShiftTimeBasis(shift) === "type_default");
  return {
    ...(containsEstimates ? { containsEstimates } : {}),
    visibleMinutes,
    totalMinutes:
      totalMinutes === visibleMinutes || totalMinutes <= 0
        ? visibleMinutes
        : totalMinutes,
  };
}

export function formatHourTotalValue(total: ScheduleHourTotalValue): string {
  const prefix = total.containsEstimates ? "~" : "";
  if (total.totalMinutes !== total.visibleMinutes) {
    return `${prefix}${formatHourTotal(total.visibleMinutes)} / ${formatHourTotal(total.totalMinutes)}`;
  }
  return `${prefix}${formatHourTotal(total.visibleMinutes)}`;
}
