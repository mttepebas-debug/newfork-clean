import type { KeyboardEvent, MouseEvent } from "react";

import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";

const PUBLISH_DEADLINE_WARNING_DAYS = 2;
const SCHEDULE_WEEK_LENGTH_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function ScheduleLocationHeader({
  location,
  locationIndex,
  daysLength,
  weekStartDate,
  currentDate = todayIso(),
  onToggleLocationFilter,
}: {
  readonly location: ScheduleGridLocationGroup;
  readonly locationIndex: number;
  readonly daysLength: number;
  readonly weekStartDate: string;
  readonly currentDate?: string;
  readonly onToggleLocationFilter: (locationIds: readonly string[]) => void;
}) {
  const status = getLocationPublicationStatus(
    location,
    weekStartDate,
    currentDate,
  );
  const toggle = (
    locationIds: readonly string[],
    event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    onToggleLocationFilter(locationIds);
  };

  return (
    <div
      id={`schedule-loc-${location.id}`}
      className="schedule-location-header"
      role="columnheader"
      data-testid={locationIndex > 0 ? "schedule-location-seam" : undefined}
      tabIndex={0}
      data-clickable="true"
      data-schedule-location-filter-ids={location.sourceIds.join(",")}
      data-location-boundary={locationIndex > 0 ? "start" : undefined}
      data-schedule-location-header-tint="true"
      style={{ gridColumn: `span ${daysLength}` }}
      onClick={(event) => toggle(location.sourceIds, event)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        toggle(location.sourceIds, event);
      }}
    >
      {location.sourceNames.length > 1 ? (
        <span className="schedule-location-header-list">
          <span
            className="schedule-location-status-dot"
            data-status={status.status}
            data-deadline={status.deadlineWarning}
            title={status.label}
            aria-label={status.label}
          />
          {location.sourceNames.map((source) => (
            <button
              key={source.id}
              type="button"
              data-schedule-location-filter-ids={source.id}
              onClick={(event) => toggle([source.id], event)}
            >
              {source.name}
            </button>
          ))}
        </span>
      ) : (
        <span>
          <span
            className="schedule-location-status-dot"
            data-status={status.status}
            data-deadline={status.deadlineWarning}
            title={status.label}
            aria-label={status.label}
          />
          {location.name || "Selected locations"}
        </span>
      )}
    </div>
  );
}

function getLocationPublicationStatus(
  location: ScheduleGridLocationGroup,
  weekStartDate: string,
  currentDate: string,
): {
  readonly status: "published" | "unpublished";
  readonly deadlineWarning: boolean;
  readonly label: string;
} {
  if (location.publication_status === "published") {
    return {
      status: "published",
      deadlineWarning: false,
      label: "Published - Live",
    };
  }

  const daysUntilStart = daysUntilWeekStart(weekStartDate, currentDate);
  const deadlineWarning =
    daysUntilStart <= PUBLISH_DEADLINE_WARNING_DAYS &&
    daysUntilStart > -SCHEDULE_WEEK_LENGTH_DAYS;
  return {
    status: "unpublished",
    deadlineWarning,
    label: getUnpublishedStatusLabel(daysUntilStart, deadlineWarning),
  };
}

function getUnpublishedStatusLabel(
  daysUntilStart: number,
  deadlineWarning: boolean,
): string {
  if (!deadlineWarning) {
    return "Unpublished";
  }

  if (daysUntilStart < 0) {
    return "Schedule week is underway. Publish this schedule as soon as possible.";
  }

  return "Deadline approaching. This week starts soon; publish the schedule as soon as possible.";
}

function daysUntilWeekStart(weekStartDate: string, today: string): number {
  return Math.ceil((toUtcDay(weekStartDate) - toUtcDay(today)) / MS_PER_DAY);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toUtcDay(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getTime();
}
