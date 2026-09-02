import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { Calendar, Lock } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

import {
  formatDateNumber,
  formatDay,
  formatDayNumber,
} from "../lib/scheduleDateTime";

interface DayHeaderCellProps {
  readonly date: string;
  readonly closure?: ScheduleReadModel["closures"][number] | null;
  readonly partialClosedShiftTypeIds?: readonly string[];
  readonly importantDates?: readonly ScheduleReadModel["important_dates"][number][];
  readonly isToday?: boolean;
  readonly viewed?: boolean;
  readonly locationBoundary?: boolean;
  readonly locationIds?: readonly string[];
  readonly locationName?: string;
  readonly onClick?: (
    event: KeyboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
  ) => void;
}

export function DayHeaderCell({
  date,
  closure = null,
  partialClosedShiftTypeIds = [],
  importantDates = [],
  isToday = false,
  viewed = false,
  locationBoundary = false,
  locationIds = [],
  locationName,
  onClick,
}: DayHeaderCellProps) {
  const closedReason = closure?.title ?? "Closed";
  const importantSummary = importantDates
    .map((item) => `${item.type}: ${item.title}`)
    .join(" · ");
  const partialClosedCount = closure
    ? 0
    : new Set(partialClosedShiftTypeIds).size;
  const interactive = Boolean(onClick);
  const label = `${formatDay(date)} ${formatDateNumber(date)}${locationName ? `, ${locationName}` : ""}`;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(event);
  };

  return (
    <div
      className="schedule-day-header"
      role="columnheader"
      data-testid={`schedule-day-header-${date}`}
      data-schedule-day-header-content="true"
      data-schedule-day-header-tint="true"
      data-today={isToday}
      data-viewed={viewed}
      data-closed={Boolean(closure)}
      data-partial-closed={partialClosedCount > 0}
      data-important={importantDates.length > 0}
      data-clickable={interactive}
      data-location-boundary={locationBoundary ? "start" : undefined}
      data-schedule-location-filter-ids={
        locationIds.length ? locationIds.join(",") : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `View ${label}` : label}
      title={closure ? closedReason : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span className="schedule-day-header-main">
        {closure ? (
          <span
            className="schedule-day-header-icon"
            aria-label={`Closed: ${closedReason}`}
            title={closedReason}
          >
            <Lock size={12} aria-hidden className="schedule-day-header-lock" />
          </span>
        ) : null}
        {importantDates.length ? (
          <span
            className="schedule-day-header-icon"
            aria-label={`Important: ${importantSummary}`}
            title={importantSummary}
          >
            <Calendar
              size={12}
              aria-hidden
              className="schedule-day-header-important"
            />
          </span>
        ) : null}
        <strong>{formatDay(date)}</strong>
      </span>
      <span className="schedule-day-header-date">
        {formatDayNumber(date)}
      </span>
      {partialClosedCount > 0 ? (
        <span
          className="schedule-day-header-partial-closed"
          aria-label={`Closed for ${partialClosedCount} shift types`}
          title={`Closed for ${partialClosedCount} shift type(s)`}
        >
          ⊘{partialClosedCount}
        </span>
      ) : null}
    </div>
  );
}
