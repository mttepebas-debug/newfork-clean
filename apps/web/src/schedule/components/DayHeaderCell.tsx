import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { Calendar, Clock, Lock } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

import {
  formatDateNumber,
  formatDay,
  formatDayNumber,
  type ScheduleTimeFormat,
} from "../lib/scheduleDateTime";
import { scheduleClosureLabel } from "../lib/scheduleClosures";
import { importantDateTypeLabels } from "../../lib/importantDateTypes";

interface DayHeaderCellProps {
  readonly date: string;
  readonly closure?: ScheduleReadModel["closures"][number] | null;
  /** Closed spans and short hours that day (EKRAN-08); a whole closed day is `closure`. */
  readonly partialClosures?: readonly ScheduleReadModel["closures"][number][];
  readonly timeFormat?: ScheduleTimeFormat;
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
  partialClosures = [],
  timeFormat = "12h",
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
    .map((item) => `${importantDateTypeLabels[item.type]}: ${item.title}`)
    .join(" · ");
  const hourLabels = closure
    ? []
    : [...new Set(partialClosures.map((item) => scheduleClosureLabel(item, timeFormat).text))];
  const hourSummary = closure
    ? ""
    : [...new Set(partialClosures.map((item) => `${scheduleClosureLabel(item, timeFormat).text}: ${item.title}`))].join(" · ");
  const firstHours = hourLabels.length
    ? (scheduleClosureLabel(partialClosures[0]!, timeFormat).hours ?? "Closed")
    : "";
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
      data-partial-closed={hourLabels.length > 0}
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
      {hourLabels.length ? (
        <span
          className="schedule-day-header-partial-closed"
          data-kind={partialClosures[0]!.kind}
          aria-label={hourSummary}
          title={hourSummary}
        >
          {partialClosures[0]!.kind === "short" ? <Clock size={9} aria-hidden /> : <Lock size={9} aria-hidden />}
          {hourLabels.length > 1 ? `${firstHours} +${hourLabels.length - 1}` : firstHours}
        </span>
      ) : null}
    </div>
  );
}
