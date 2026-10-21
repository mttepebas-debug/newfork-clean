/** The calendar day (YYYY-MM-DD) a clock in `timezone` reads at `now`. */
export function dateInZone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
}

/** `zone` when the browser knows it, else the device's own zone. */
export function validZone(zone?: string): string {
  try {
    if (zone) {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return zone;
    }
  } catch {
    /* Use an explicitly labeled device zone if metadata is unavailable. */
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Today's date (BL-277): in the location's zone when one is known, else on
 * the device's own calendar. Never UTC's: at 5 pm on a Sunday in Los Angeles,
 * UTC already reads Monday.
 */
export function todayIn(zone?: string, now: Date = new Date()): string {
  return dateInZone(now, validZone(zone));
}

/**
 * The zone of a page that shows several locations (S-226): the first one's in their own order. Each
 * location's column still marks its own day; undefined with no location (then the device's).
 */
export function firstLocationZone(
  locations: readonly { readonly timezone: string; readonly sort_order: number }[],
): string | undefined {
  return [...locations].sort((a, b) => a.sort_order - b.sort_order)[0]?.timezone;
}

/** The wall-clock time (HH:MM, 24 h) in the location's zone, else the device's. */
export function clockIn(zone?: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: validZone(zone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "hour")!.value}:${parts.find((part) => part.type === "minute")!.value}`;
}
