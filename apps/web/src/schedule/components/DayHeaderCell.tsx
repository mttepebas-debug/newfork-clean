import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { Lock } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

import {
  formatDateNumber,
  formatDay,
  formatDayNumber,
  type ScheduleTimeFormat,
} from "../lib/scheduleDateTime";
import { scheduleClosureLabel } from "../lib/scheduleClosures";

type SchedulePost = ScheduleReadModel["important_dates"][number];

interface DayHeaderCellProps {
  readonly date: string;
  /** A Closed day that is out, at every location the column shows. */
  readonly closure?: ScheduleReadModel["closures"][number] | null;
  /** Posts with Show on the Schedule that fall on this day here (EKRAN-08). */
  readonly posts?: readonly SchedulePost[];
  readonly timeFormat?: ScheduleTimeFormat;
  /** The column's clock, for a scheduled post's "announces" day. */
  readonly timezone?: string;
  readonly isToday?: boolean;
  readonly viewed?: boolean;
  readonly locationBoundary?: boolean;
  readonly locationIds?: readonly string[];
  readonly locationName?: string;
  readonly onClick?: (
    event: KeyboardEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
  ) => void;
  /** Opens the post a chip names; without it the chip is text. */
  readonly onOpenPost?: (announcementId: string) => void;
}

/**
 * What a chip says: "Closed · Labor Day", "Short hours 10a–3p · Deep clean",
 * the title alone on an open day; a scheduled post says when it goes out
 * ("Closed · announces Oct 19") and only managers get it.
 */
export function schedulePostChipText(
  post: SchedulePost,
  timeFormat: ScheduleTimeFormat = "12h",
  timezone?: string,
): string {
  const day =
    post.day === "open"
      ? ""
      : scheduleClosureLabel({ kind: post.day === "closed" ? "closed" : "short", opens: post.opens, closes: post.closes }, timeFormat).text;
  if (post.status === "scheduled") {
    const when = post.publish_at
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(post.publish_at))
      : null;
    return `${day || post.title} · ${when ? `announces ${when}` : "scheduled"}`;
  }
  return day ? `${day} · ${post.title}` : post.title;
}

export function DayHeaderCell({
  date,
  closure = null,
  posts = [],
  timeFormat = "12h",
  timezone,
  isToday = false,
  viewed = false,
  locationBoundary = false,
  locationIds = [],
  locationName,
  onClick,
  onOpenPost,
}: DayHeaderCellProps) {
  const closedReason = closure?.title ?? "Closed";
  const chips = posts.map((post) => ({ post, text: schedulePostChipText(post, timeFormat, timezone) }));
  const interactive = Boolean(onClick);
  const label = `${formatDay(date)} ${formatDateNumber(date)}${locationName ? `, ${locationName}` : ""}`;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    onClick(event);
  };
  const first = chips[0];
  const rest = chips.slice(1);

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
      data-posts={chips.length > 0}
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
        <strong>{formatDay(date)}</strong>
      </span>
      <span className="schedule-day-header-date">
        {formatDayNumber(date)}
      </span>
      {first ? (
        <span className="schedule-day-header-posts">
          {onOpenPost ? (
            <button
              type="button"
              className="schedule-day-post"
              data-day={first.post.day}
              data-scheduled={first.post.status === "scheduled"}
              title={chips.map((chip) => chip.text).join("\n")}
              onClick={(event) => {
                event.stopPropagation();
                onOpenPost(first.post.id);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {first.text}
            </button>
          ) : (
            <span
              className="schedule-day-post"
              data-day={first.post.day}
              data-scheduled={first.post.status === "scheduled"}
              title={chips.map((chip) => chip.text).join("\n")}
            >
              {first.text}
            </span>
          )}
          {rest.length ? (
            <span
              className="schedule-day-post-more"
              title={rest.map((chip) => chip.text).join("\n")}
              aria-label={`${rest.length} more: ${rest.map((chip) => chip.text).join(", ")}`}
            >
              +{rest.length}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
