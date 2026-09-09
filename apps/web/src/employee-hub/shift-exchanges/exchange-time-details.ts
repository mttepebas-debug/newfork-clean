import type { ExchangeShift } from "@newfork/shared";

/** Presentation only: never reconstruct or change the server's scheduled instants. */
export function exchangeTimeDetails(shift: ExchangeShift) {
  const timezone = shift.time_timezone || shift.timezone;
  const start = Date.parse(shift.starts_at ?? "");
  const end = Date.parse(shift.ends_at ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  try {
    const wall = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const zone = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    });
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "longOffset",
    });
    const offset = (instant: number) => {
      const name = zone
        .formatToParts(instant)
        .find((part) => part.type === "timeZoneName")!.value;
      if (name === "GMT") return 0;
      const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
      if (!match) throw new Error("Unknown UTC offset");
      return (
        (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1)
      );
    };
    const repeated = (instant: number) => {
      const current = offset(instant);
      // Discover the actual nearby offset difference, including 30-minute changes.
      for (const hours of [-48, 48]) {
        const other = offset(instant + hours * 3600000);
        const alternative = instant + (current - other) * 60000;
        if (
          current !== other &&
          wall.format(instant) === wall.format(alternative)
        )
          return alternative < instant
            ? "Second occurrence"
            : "First occurrence";
      }
      return null;
    };
    const dateKey = (instant: number) =>
      wall
        .formatToParts(instant)
        .filter((part) => ["year", "month", "day"].includes(part.type))
        .map((part) => part.value)
        .join("-");
    const startOccurrence = repeated(start);
    const endOccurrence = repeated(end);
    return {
      timezone,
      endsNextDay: dateKey(start) !== dateKey(end),
      clockChange: offset(start) !== offset(end),
      repeatedClock: Boolean(startOccurrence || endOccurrence),
      startOccurrence,
      endOccurrence,
      startLabel: label.format(start).replace("GMT", "UTC"),
      endLabel: label.format(end).replace("GMT", "UTC"),
    };
  } catch {
    // An unavailable timezone must not crash request history or invent clock details.
    return null;
  }
}
