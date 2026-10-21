import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { dateInZone, validZone } from "../lib/today";
import { addDays } from "../schedule/lib/scheduleDateTime";
export function shiftZone(
  model: EmployeeHubReadModel,
  shift: EmployeeHubShift,
): string {
  return validZone(
    model.locations.find((location) => location.id === shift.location_id)
      ?.timezone,
  );
}
// The page's own "today" (S-226): the primary location's zone, else the first location's, else the device's.
export function homeZone(model: EmployeeHubReadModel): string {
  return validZone(model.time_off_timezone ?? model.locations[0]?.timezone);
}
// Compare wall times in each shift's own location. This also handles yesterday's overnight shift.
export function shiftState(
  shift: EmployeeHubShift,
  now: Date,
  timezone: string,
) {
  const today = dateInZone(now, timezone);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const start = `${shift.scheduled_date}T${shift.start_time.slice(0, 5)}`;
  const endDate =
    shift.end_time.slice(0, 5) <= shift.start_time.slice(0, 5)
      ? addDays(shift.scheduled_date, 1)
      : shift.scheduled_date;
  const end = `${endDate}T${shift.end_time.slice(0, 5)}`;
  const current = `${today}T${clock}`;
  return {
    state:
      current < start
        ? "upcoming"
        : current < end
          ? "scheduled_now"
          : "finished",
    today,
    start,
    end,
  } as const;
}
export function nextShift(model: EmployeeHubReadModel, now: Date) {
  return (
    [...model.shifts]
      .filter(
        (shift) =>
          shiftState(shift, now, shiftZone(model, shift)).state !== "finished",
      )
      .sort((a, b) => shiftInstant(a, model) - shiftInstant(b, model))[0] ??
    null
  );
}
// Resolve an IANA wall-clock timestamp for ordering shifts across locations.
export function shiftInstant(
  shift: EmployeeHubShift,
  model: EmployeeHubReadModel,
): number {
  const wanted = Date.parse(
    `${shift.scheduled_date}T${shift.start_time.slice(0, 5)}:00Z`,
  );
  let result = wanted;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: shiftZone(model, shift),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(result));
    const value = (type: string) => parts.find((p) => p.type === type)!.value;
    const actual = Date.parse(
      `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`,
    );
    result += wanted - actual;
  }
  return result;
}
export function greeting(now: Date) {
  const hour = now.getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}
export function shiftDate(date: string, full = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: full ? "long" : "short",
    month: "short",
    day: "numeric",
  });
}
