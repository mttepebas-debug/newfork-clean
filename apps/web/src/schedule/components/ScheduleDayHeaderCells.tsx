import type { ScheduleReadModel } from "@newfork/shared/schedule";
import type { KeyboardEvent, MouseEvent } from "react";

import { todayIn } from "../../lib/today";
import { scheduleImportantDateCoversDate } from "../importantDateCoverage";
import { scheduleClosureCoversDate } from "../lib/scheduleClosures";
import type { ScheduleTimeFormat } from "../lib/scheduleDateTime";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import { DayHeaderCell } from "./DayHeaderCell";

export function ScheduleDayHeaderCells({
  closures,
  days,
  importantDates,
  locationGroups,
  selectedDate,
  timeFormat = "12h",
  todayDate,
  onDayHeaderClick,
  onOpenPost,
}: {
  readonly closures: ScheduleReadModel["closures"];
  readonly days: readonly string[];
  readonly importantDates: ScheduleReadModel["important_dates"];
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly selectedDate: string;
  readonly timeFormat?: ScheduleTimeFormat;
  readonly todayDate?: string;
  readonly onDayHeaderClick: (
    date: string,
    locationIds: readonly string[],
  ) => void;
  readonly onOpenPost?: (announcementId: string) => void;
}) {
  return (
    <>
      {locationGroups.flatMap((location, locationIndex) => {
        // Each column marks its own location's day (S-226).
        const today = todayDate ?? todayIn(location.timezone);
        return days.map((day, dayIndex) => {
          const dayClosures = closures.filter(
            (item) =>
              location.sourceIds.includes(item.location_id) &&
              scheduleClosureCoversDate(item, day),
          );
          // A Closed day that is out shades the column when every location
          // in it is closed; a scheduled one is only its dashed chip (EKRAN-08).
          const allDayClosures = dayClosures.filter(
            (item) => item.kind === "closed" && item.status !== "scheduled",
          );
          const allSourcesClosed =
            location.sourceIds.length > 0 &&
            location.sourceIds.every((sourceId) =>
              allDayClosures.some((item) => item.location_id === sourceId),
            );
          const posts = dedupePosts(
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
              isToday={day === today}
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
              posts={posts}
              timeFormat={timeFormat}
              timezone={location.timezone || undefined}
              onOpenPost={onOpenPost}
            />
          );
        });
      })}
    </>
  );
}

// One chip per post: a post at two locations of a group shows once, Closed
// before Short hours before an open day.
function dedupePosts(
  items: readonly ScheduleReadModel["important_dates"][number][],
): ScheduleReadModel["important_dates"] {
  const weight = { closed: 0, short: 1, open: 2 } as const;
  const byId = new Map<string, ScheduleReadModel["important_dates"][number]>();
  for (const item of items) {
    const seen = byId.get(item.id);
    if (!seen || weight[item.day] < weight[seen.day]) byId.set(item.id, item);
  }
  return [...byId.values()];
}
