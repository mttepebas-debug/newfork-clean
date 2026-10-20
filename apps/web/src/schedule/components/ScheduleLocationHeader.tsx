import type { SchedulingSettings } from "@newfork/shared";
import { todayIn } from "../../lib/today";
import type { KeyboardEvent, MouseEvent } from "react";

import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";

const PUBLISH_DEADLINE_WARNING_DAYS = 2;
const SCHEDULE_WEEK_LENGTH_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type PublishDeadlineDay = SchedulingSettings["schedule_deadline_day"];

export function ScheduleLocationHeader({
  location,
  locationIndex,
  daysLength,
  weekStartDate,
  // A group of several locations has no zone of its own: the device's calendar.
  currentDate = todayIn(location.timezone),
  publishWarnings = true,
  publishDeadlineDay,
  onToggleLocationFilter,
}: {
  readonly location: ScheduleGridLocationGroup;
  readonly locationIndex: number;
  readonly daysLength: number;
  readonly weekStartDate: string;
  readonly currentDate?: string;
  /** BL-683: false for a viewer who cannot publish (an employee): no deadline call to action. */
  readonly publishWarnings?: boolean;
  /** Settings → Scheduling → Publish by; until it loads, the week's start is the deadline. */
  readonly publishDeadlineDay?: PublishDeadlineDay;
  readonly onToggleLocationFilter: (locationIds: readonly string[]) => void;
}) {
  const status = getLocationPublicationStatus(
    location,
    weekStartDate,
    currentDate,
    publishWarnings,
    publishDeadlineDay,
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
            // BL-713: an image with a name, so the status is read, not only seen.
            role="img"
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
            // BL-713: an image with a name, so the status is read, not only seen.
            role="img"
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
  publishWarnings: boolean,
  publishDeadlineDay: PublishDeadlineDay | undefined,
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

  const daysUntilStart = daysBetween(currentDate, weekStartDate);
  const deadline = publishDeadlineDay
    ? publishDeadlineDate(weekStartDate, publishDeadlineDay)
    : null;
  const daysUntilDeadline = deadline ? daysBetween(currentDate, deadline) : daysUntilStart;
  const deadlineWarning =
    publishWarnings &&
    daysUntilDeadline <= PUBLISH_DEADLINE_WARNING_DAYS &&
    daysUntilStart > -SCHEDULE_WEEK_LENGTH_DAYS;
  return {
    status: "unpublished",
    deadlineWarning,
    label: getUnpublishedStatusLabel(weekStartDate, daysUntilStart, deadline, daysUntilDeadline, deadlineWarning),
  };
}

function getUnpublishedStatusLabel(
  weekStartDate: string,
  daysUntilStart: number,
  deadline: string | null,
  daysUntilDeadline: number,
  deadlineWarning: boolean,
): string {
  if (!deadlineWarning) {
    return "Unpublished";
  }

  if (daysUntilStart < 0) {
    return "Schedule week is underway. Publish this schedule as soon as possible.";
  }

  const weekStart = shortDate(weekStartDate);
  if (!deadline) {
    return `Deadline approaching. The week starts ${weekStart}; publish the schedule as soon as possible.`;
  }
  if (daysUntilDeadline < 0) {
    return `Publish deadline passed on ${shortDate(deadline)}. The week starts ${weekStart}; publish as soon as possible.`;
  }
  return `Deadline approaching. Publish by ${shortDate(deadline)}. The week starts ${weekStart}.`;
}

/** The last `day` before the week starts. */
function publishDeadlineDate(weekStartDate: string, day: PublishDeadlineDay): string {
  const start = new Date(toUtcDay(weekStartDate));
  const back = (start.getUTCDay() - WEEKDAYS.indexOf(day) + 7) % 7 || 7;
  return new Date(start.getTime() - back * MS_PER_DAY).toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(toUtcDay(iso)),
  );
}

function daysBetween(from: string, to: string): number {
  return Math.ceil((toUtcDay(to) - toUtcDay(from)) / MS_PER_DAY);
}

function toUtcDay(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getTime();
}
