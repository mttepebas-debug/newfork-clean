import type { ScheduleReadModel, ScheduleView } from "@newfork/shared/schedule";

export type ScheduleTimeFormat = ScheduleReadModel["settings"]["time_format"];

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function currentWeekStart(
  today: string,
  weekStartDay: ScheduleReadModel["week_start_day"],
): string {
  const date = new Date(`${today}T12:00:00Z`);
  const day = date.getUTCDay();
  const offset = weekStartDay === "sunday" ? day : (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function formatDateNumber(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "Sep 24, 2:05 PM": when somebody saved or published something.
export function formatShortDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDayNumber(iso: string): string {
  return String(new Date(`${iso}T12:00:00Z`).getUTCDate());
}

export function formatPeriod(
  selected: string,
  weekStart: string,
  view: ScheduleView,
): string {
  return view === "day"
    ? new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : `${formatDateNumber(weekStart)} – ${new Date(`${addDays(weekStart, 6)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

export function formatTime(
  value: string,
  timeFormat: ScheduleTimeFormat = "12h",
  displayStyle: "compact" | "long" = "compact",
): string {
  const [hour, minute] = value.split(":").map(Number);
  const normalizedHour = hour ?? 0;
  const normalizedMinute = minute ?? 0;
  if (timeFormat === "24h") {
    return `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
  }
  const suffix = normalizedHour >= 12 ? "p" : "a";
  const meridiem = normalizedHour >= 12 ? "PM" : "AM";
  const displayHour = normalizedHour % 12 || 12;
  if (displayStyle === "long") {
    return `${displayHour}:${String(normalizedMinute).padStart(2, "0")} ${meridiem}`;
  }
  return normalizedMinute
    ? `${displayHour}:${String(normalizedMinute).padStart(2, "0")}${suffix}`
    : `${displayHour}${suffix}`;
}

export function formatTimeRange(
  startTime: string,
  endTime: string,
  timeFormat: ScheduleTimeFormat = "12h",
  separator = "–",
): string {
  return `${formatTime(startTime, timeFormat)}${separator}${formatTime(endTime, timeFormat)}`;
}
