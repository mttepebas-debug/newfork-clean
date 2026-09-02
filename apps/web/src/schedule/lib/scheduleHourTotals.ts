import type { ScheduleShift } from "@newfork/shared/schedule";
import { toInterval } from "@newfork/scheduling-shared";

export interface ScheduleHourTotalValue {
  readonly visibleMinutes: number;
  readonly totalMinutes: number;
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
  return {
    visibleMinutes,
    totalMinutes:
      totalMinutes === visibleMinutes || totalMinutes <= 0
        ? visibleMinutes
        : totalMinutes,
  };
}

export function formatHourTotalValue(total: ScheduleHourTotalValue): string {
  if (total.totalMinutes !== total.visibleMinutes) {
    return `${formatHourTotal(total.visibleMinutes)} / ${formatHourTotal(total.totalMinutes)}`;
  }
  return formatHourTotal(total.visibleMinutes);
}
