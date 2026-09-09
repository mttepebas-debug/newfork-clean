import type { ScheduleLocation } from "@newfork/shared/schedule";

type ScheduleGridLocation = ScheduleLocation & {
  readonly sourceIds: readonly string[];
  readonly sourceNames: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

export function ScheduleFillerRow({
  locations,
  days,
  showTotalHours,
}: {
  readonly locations: readonly ScheduleGridLocation[];
  readonly days: readonly string[];
  readonly showTotalHours: boolean;
}) {
  return (
    <>
      <div
        className="schedule-filler-row-label schedule-grid-sticky"
        role="rowheader"
        data-schedule-filler-height-px="true"
        aria-hidden="true"
      />
      {locations.flatMap((_location, locationIndex) =>
        days.map((day, dayIndex) => (
          <div
            key={`filler-${locationIndex}-${day}-${dayIndex}`}
            className="schedule-cell schedule-filler-cell"
            role="gridcell"
            data-location-boundary={
              locationIndex > 0 && dayIndex === 0 ? "start" : undefined
            }
            data-schedule-filler-location-cell="true"
            aria-hidden="true"
          />
        )),
      )}
      {showTotalHours ? (
        <div
          className="schedule-total-cell schedule-filler-cell"
          role="gridcell"
          data-schedule-filler-total-cell="true"
          data-schedule-total-column-cell="true"
          data-schedule-total-hours-empty="true"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
