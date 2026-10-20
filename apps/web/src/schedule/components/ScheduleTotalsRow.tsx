import type { ScheduleLocation, ScheduleShift } from "@newfork/shared/schedule";

import {
  buildScheduleHourTotalValue,
  formatHourTotal,
  formatHourTotalValue,
  hourTotalHasEstimates,
  type ScheduleHourTotalValue,
} from "../lib/scheduleHourTotals";
import { formatWeekdayDate } from "../lib/scheduleDateTime";

type TotalLocation = ScheduleLocation & {
  readonly sourceIds: readonly string[];
};

export function ScheduleTotalsRow({
  visibleShifts,
  totalShifts,
  locations,
  days,
}: {
  readonly visibleShifts: readonly ScheduleShift[];
  readonly totalShifts: readonly ScheduleShift[];
  readonly locations: readonly TotalLocation[];
  readonly days: readonly string[];
}) {
  const weekTotal = buildScheduleHourTotalValue(
    visibleShifts.filter((shift) => shift.employee_id),
    totalShifts.filter((shift) => shift.employee_id),
  );
  return (
    <>
      <div
        className="schedule-total-row-label schedule-grid-sticky"
        role="rowheader"
        data-schedule-total-hours-row-label="true"
        data-schedule-pinned-cell="employee"
      >
        Total
      </div>
      {locations.flatMap((location, locationIndex) =>
        days.map((day, dayIndex) => {
          const inCell = (shift: ScheduleShift) =>
            Boolean(shift.employee_id) &&
            location.sourceIds.includes(shift.location_id) &&
            shift.scheduled_date === day;
          const total = buildScheduleHourTotalValue(
            visibleShifts.filter(inCell),
            totalShifts.filter(inCell),
          );
          return (
            <div
              key={`total-${location.id}-${day}`}
              className="schedule-total-day-cell"
              role="gridcell"
              data-schedule-total-hours-day-cell="true"
              data-location-boundary={
                locationIndex > 0 && dayIndex === 0 ? "start" : undefined
              }
              aria-label={`${location.name || "Selected locations"} ${formatWeekdayDate(day)} total hours ${formatHourTotalValue(total)}`}
            >
              <ScheduleTotalValue total={total} />
            </div>
          );
        }),
      )}
      <div
        className="schedule-total-week-cell"
        role="gridcell"
        data-schedule-total-column-cell="true"
        data-schedule-total-hours-week-cell="true"
        data-schedule-grid-content-end="true"
        aria-label={`Week total hours ${formatHourTotalValue(weekTotal)}`}
      >
        <ScheduleTotalValue total={weekTotal} />
      </div>
    </>
  );
}

export function ScheduleTotalValue({
  total,
}: {
  readonly total: ScheduleHourTotalValue;
}) {
  const title = hourTotalHasEstimates(total) ? "~ Some shifts use their shift type's default hours, which can change." : undefined;
  if (total.totalMinutes !== total.visibleMinutes) {
    return (
      <span className="schedule-total-value" data-has-comparison="true" title={title}>
        <span>{total.containsEstimates ? "~" : ""}{formatHourTotal(total.visibleMinutes)}</span>
        <small>/ {total.totalContainsEstimates ? "~" : ""}{formatHourTotal(total.totalMinutes)}</small>
      </span>
    );
  }
  if (total.containsEstimates) {
    return <span className="schedule-total-value" title={title}>{formatHourTotalValue(total)}</span>;
  }
  return (
    <span className="schedule-total-value">
      {formatHourTotal(total.visibleMinutes)}
    </span>
  );
}
