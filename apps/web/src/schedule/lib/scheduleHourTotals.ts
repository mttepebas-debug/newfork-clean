import type { ScheduleShift } from "@newfork/shared/schedule";
import { toInterval } from "./shiftInterval";
import { getShiftTimeBasis } from "@newfork/shared";

export interface ScheduleHourTotalValue {
  readonly visibleMinutes: number;
  readonly totalMinutes: number;
  /** The shown minutes hold reference hours ("~"). */
  readonly containsEstimates?: boolean;
  /** The comparison total holds reference hours: a filter can hide them (QA 49). */
  readonly totalContainsEstimates?: boolean;
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
  const hasEstimates = (shifts: readonly ScheduleShift[]) =>
    shifts.some((shift) => getShiftTimeBasis(shift) === "type_default");
  const comparison = totalMinutes !== visibleMinutes && totalMinutes > 0;
  const containsEstimates = hasEstimates(visibleShifts);
  const totalContainsEstimates = comparison && hasEstimates(totalShifts);
  return {
    ...(containsEstimates ? { containsEstimates } : {}),
    ...(totalContainsEstimates ? { totalContainsEstimates } : {}),
    visibleMinutes,
    totalMinutes: comparison ? totalMinutes : visibleMinutes,
  };
}

export function hourTotalHasEstimates(total: ScheduleHourTotalValue): boolean {
  return Boolean(total.containsEstimates || total.totalContainsEstimates);
}

export function formatHourTotalValue(total: ScheduleHourTotalValue): string {
  const prefix = total.containsEstimates ? "~" : "";
  if (total.totalMinutes !== total.visibleMinutes) {
    const totalPrefix = total.totalContainsEstimates ? "~" : "";
    return `${prefix}${formatHourTotal(total.visibleMinutes)} / ${totalPrefix}${formatHourTotal(total.totalMinutes)}`;
  }
  return `${prefix}${formatHourTotal(total.visibleMinutes)}`;
}
