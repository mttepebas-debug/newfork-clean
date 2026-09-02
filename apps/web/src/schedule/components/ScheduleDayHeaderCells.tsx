import type { ScheduleReadModel } from "@newfork/shared/schedule";
import type { KeyboardEvent, MouseEvent } from "react";

import { scheduleImportantDateCoversDate } from "../importantDateCoverage";
import { scheduleClosureCoversDate } from "../lib/scheduleClosures";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import { DayHeaderCell } from "./DayHeaderCell";

export function ScheduleDayHeaderCells({
  closures,
  days,
  importantDates,
  locationGroups,
  selectedDate,
  todayDate = new Date().toLocaleDateString("en-CA"),
  onDayHeaderClick,
}: {
  readonly closures: ScheduleReadModel["closures"];
  readonly days: readonly string[];
  readonly importantDates: ScheduleReadModel["important_dates"];
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly selectedDate: string;
  readonly todayDate?: string;
  readonly onDayHeaderClick: (
    date: string,
    locationIds: readonly string[],
  ) => void;
}) {
  return (
    <>
      {locationGroups.flatMap((location, locationIndex) =>
        days.map((day, dayIndex) => {
          const dayClosures = closures.filter(
            (item) =>
              location.sourceIds.includes(item.location_id) &&
              scheduleClosureCoversDate(item, day),
          );
          const allDayClosures = dayClosures.filter((item) => item.is_all_day);
          const allSourcesClosed =
            location.sourceIds.length > 0 &&
            location.sourceIds.every((sourceId) =>
              allDayClosures.some((item) => item.location_id === sourceId),
            );
          const closedShiftTypeIds = Array.from(
            new Set(dayClosures.flatMap((item) => item.shift_type_ids)),
          );
          const importantDateItems = dedupeImportantDates(
            importantDates.filter(
              (item) =>
                scheduleImportantDateCoversDate(item, day) &&
                (item.location_id === null ||
                  location.sourceIds.includes(item.location_id)),
            ),
          );

          return (
            <DayHeaderCell
              key={`${location.id}-${day}`}
              date={day}
              isToday={day === todayDate}
              viewed={day === selectedDate}
              locationBoundary={locationIndex > 0 && dayIndex === 0}
              locationIds={location.sourceIds}
              locationName={location.name}
              onClick={(
                event:
                  KeyboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
              ) => {
                event.preventDefault();
                event.stopPropagation();
                onDayHeaderClick(day, location.sourceIds);
              }}
              closure={allSourcesClosed ? allDayClosures[0] : null}
              partialClosedShiftTypeIds={closedShiftTypeIds}
              importantDates={importantDateItems}
            />
          );
        }),
      )}
    </>
  );
}

function dedupeImportantDates(
  items: readonly ScheduleReadModel["important_dates"][number][],
): ScheduleReadModel["important_dates"] {
  const seen = new Set<string>();
  const result: ScheduleReadModel["important_dates"] = [];
  for (const item of items) {
    const key = `${item.type}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
