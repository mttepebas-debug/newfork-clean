import { zoneName } from "../lib/today";

export function timeOffZoneName(zone: string) {
  return zoneName(zone);
}

/** "Oct 15, 4:00 PM": the deadline in its zone, the zone's name left to the caller. */
export function timeOffDeadlineAt(value: string, zone: string, format: "12h" | "24h") {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: format === "12h" }).format(new Date(value));
}
