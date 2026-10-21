import { zoneName } from "../lib/today";
export function timeOffWallParts(instant: string, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}:${parts.second}` };
}

// Probe offsets on both sides of a transition, then round-trip every candidate.
// A gap has no candidate; a fold requires an explicit occurrence.
export function resolveTimeOffSplit(date: string, clock: string, zone: string, fold?: "earlier" | "later") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(clock))
    throw new Error("Enter the split date and time.");
  const canonical = clock.length === 5 ? `${clock}:00` : clock;
  const wall = Date.parse(`${date}T${canonical}Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) throw new Error("Enter a valid split date.");
  const candidates = new Set<number>();
  for (const days of [-2, -1, 0, 1, 2]) {
    const probe = wall + days * 86400000;
    const parts = timeOffWallParts(new Date(probe).toISOString(), zone);
    const offset = Date.parse(`${parts.date}T${parts.clock}Z`) - probe;
    const candidate = wall - offset;
    const roundTrip = timeOffWallParts(new Date(candidate).toISOString(), zone);
    if (roundTrip.date === date && roundTrip.clock === canonical) candidates.add(candidate);
  }
  const ordered = [...candidates].sort((a, b) => a - b);
  if (!ordered.length) throw new Error("This time does not exist on this date in the request time zone.");
  if (ordered.length > 1 && !fold) throw new Error("This time repeats. Choose its first or second occurrence.");
  return new Date(fold === "later" ? ordered.at(-1)! : ordered[0]!).toISOString();
}

export function formatTimeOffInstant(value: string, zone: string, format: "12h" | "24h") {
  return `${new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    ...(new Date(value).getUTCSeconds() ? { second: "2-digit" as const } : {}), hour12: format === "12h" }).format(new Date(value))} ${zoneName(zone, new Date(value))}`;
}

export function formatTimeOffDay(date: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

export function timeOffZoneName(zone: string) {
  return zoneName(zone);
}

// The decision deadline, as a person in the request's zone reads it (FB-6.3.8d).
export function formatTimeOffDeadline(value: string, zone: string, format: "12h" | "24h") {
  return `${timeOffDeadlineAt(value, zone, format)} ${timeOffZoneName(zone)}`;
}

/** "Oct 15, 4:00 PM": the deadline in its zone, the zone's name left to the caller. */
export function timeOffDeadlineAt(value: string, zone: string, format: "12h" | "24h") {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: format === "12h" }).format(new Date(value));
}
