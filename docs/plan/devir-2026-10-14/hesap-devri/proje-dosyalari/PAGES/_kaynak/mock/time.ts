// Date and time-zone helpers for the demo backend. Dates are "YYYY-MM-DD"
// strings; instants are epoch milliseconds.

export const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayIndex(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

export function mondayOf(date: string): string {
  const day = weekdayIndex(date);
  return addDays(date, day === 0 ? -6 : 1 - day);
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's offset from UTC at an instant, in seconds (EDT = -14400). */
export function offsetSeconds(instant: number, zone: string): number {
  let formatter = offsetFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
    offsetFormatters.set(zone, formatter);
  }
  const name = formatter.formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60);
}

/** The instant a local wall clock reading names in a zone. */
export function localInstant(date: string, clock: string, zone: string): number {
  const wall = Date.parse(`${date}T${clock.length === 5 ? clock : clock.slice(0, 5)}:00Z`);
  let guess = wall - offsetSeconds(wall, zone) * 1000;
  guess = wall - offsetSeconds(guess, zone) * 1000;
  return guess;
}

export function todayIn(zone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function iso(instant: number): string {
  return new Date(instant).toISOString();
}

/** Offset segments covering a week (plus a day either side), split where the zone's offset changes. */
export function clockSegments(weekStart: string, zone: string) {
  const from = localInstant(addDays(weekStart, -1), "00:00", zone);
  const to = localInstant(addDays(weekStart, 9), "00:00", zone);
  const segments: { start_at: string; end_at: string; offset_seconds: number }[] = [];
  let start = from;
  let offset = offsetSeconds(from, zone);
  for (let probe = from + 3_600_000; probe <= to; probe += 3_600_000) {
    const next = offsetSeconds(probe, zone);
    if (next !== offset) {
      let low = probe - 3_600_000;
      let high = probe;
      while (high - low > 1000) {
        const mid = Math.floor((low + high) / 2);
        if (offsetSeconds(mid, zone) === offset) low = mid;
        else high = mid;
      }
      segments.push({ start_at: iso(start), end_at: iso(high), offset_seconds: offset });
      start = high;
      offset = next;
    }
  }
  segments.push({ start_at: iso(start), end_at: iso(to), offset_seconds: offset });
  return segments;
}

export function minutesOf(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

/** A shift's span as instants; an end at or before the start runs into the next day. */
export function shiftSpan(shift: { scheduled_date: string; start_time: string; end_time: string }, zone: string) {
  if (!shift.start_time || !shift.end_time) return null;
  const start = localInstant(shift.scheduled_date, shift.start_time, zone);
  const endDate = minutesOf(shift.end_time) <= minutesOf(shift.start_time) ? addDays(shift.scheduled_date, 1) : shift.scheduled_date;
  const end = localInstant(endDate, shift.end_time, zone);
  return { start, end };
}

// PAGES: ids made while the demo data is reseeded (and by the scenario's setup
// right after) follow a fixed sequence. The desktop and phone frames reseed on
// their own; this way they name every record the same, and an address one
// frame passes to the other (?shift=<id>) opens the same record in both.
let sequence = 0;
export function seededIds(): void {
  sequence = 1;
  queueMicrotask(() => { sequence = 0; });
}

export function uuid(): string {
  if (!sequence) return crypto.randomUUID();
  return `5eed0000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;
}

/** A stable 64-hex fingerprint of a text (not cryptographic; the demo only compares it). */
export function fingerprint(text: string): string {
  let out = "";
  for (let round = 0; round < 8; round += 1) {
    let hash = 0x811c9dc5 ^ round;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += hash.toString(16).padStart(8, "0");
  }
  return out;
}
