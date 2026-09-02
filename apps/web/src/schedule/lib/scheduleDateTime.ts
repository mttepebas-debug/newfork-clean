import type { ScheduleReadModel, ScheduleView } from "@newfork/shared/schedule";

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

export function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "p" : "a";
  const display = (hour ?? 0) % 12 || 12;
  return minute
    ? `${display}:${String(minute).padStart(2, "0")}${suffix}`
    : `${display}${suffix}`;
}
