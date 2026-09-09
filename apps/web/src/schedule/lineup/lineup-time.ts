import { addDays, formatTimeRange } from "../lib/scheduleDateTime";

export function parseLineupDate(value: string | null): string | null {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
    ? value
    : null;
}

// Include today in every assigned location, including after UTC midnight.
export function lineupDateWindow(
  now: Date,
  timezones: Array<string | undefined>,
) {
  const days = (timezones.length ? timezones : [undefined])
    .map((timezone) => {
      try {
        return now.toLocaleDateString("en-CA", { timeZone: timezone });
      } catch {
        return now.toLocaleDateString("en-CA", { timeZone: "UTC" });
      }
    })
    .sort();
  return { from: days[0]!, to: addDays(days[days.length - 1]!, 42) };
}
type Interval = {
  start_time: string | null;
  end_time: string | null;
  placement_start_at?: string | null;
  placement_end_at?: string | null;
};
export function labelLineupInterval(
  entry: Interval,
  time: string,
  date: string,
  timezone: string,
) {
  const localDay = (instant?: string | null) =>
    instant && Number.isFinite(new Date(instant).getTime())
      ? new Date(instant).toLocaleDateString("en-CA", { timeZone: timezone })
      : null;
  const startDay = localDay(entry.placement_start_at);
  const endDay = localDay(entry.placement_end_at);
  const nextDay =
    startDay && endDay
      ? endDay > startDay
      : Boolean(
          entry.start_time &&
          entry.end_time &&
          entry.end_time <= entry.start_time,
        );
  return `${startDay && startDay !== date ? `${startDay} · ` : ""}${time}${nextDay ? " (+1 day)" : ""}`;
}
export function formatLineupInterval(
  entry: Interval,
  timeFormat: "12h" | "24h",
  date: string,
  timezone: string,
) {
  return entry.start_time && entry.end_time
    ? labelLineupInterval(
        entry,
        formatTimeRange(entry.start_time, entry.end_time, timeFormat),
        date,
        timezone,
      )
    : "Time to be confirmed";
}
