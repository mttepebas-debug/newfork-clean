// Typing times without the mouse: "9", "930", "9:30p", "17", "1730" and
// ranges like "9-5", "9a-5p", "16-22" or "9:30 am to 2 pm". In the 12-hour
// setting a bare hour picks AM or PM by context: the start lands nearest the
// hint (the shift type's or the current start), the end is the first match
// after the start. The 24-hour setting reads every hour as written.
import type { ClockFormat } from "./store";

const DAY = 24 * 60;

export function toMinutes(canonical: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(canonical ?? "");
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function toCanonical(minutes: number): string {
  const value = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function formatClock(minutes: number | null, format: ClockFormat): string {
  if (minutes === null) return "";
  const value = ((minutes % DAY) + DAY) % DAY;
  const hour = Math.floor(value / 60);
  const minute = String(value % 60).padStart(2, "0");
  if (format === "24h") return `${String(hour).padStart(2, "0")}:${minute}`;
  const period = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${period}`;
}

export function formatRange(start: number | null, end: number | null, format: ClockFormat): string {
  if (start === null || end === null) return "";
  return `${formatClock(start, format)} – ${formatClock(end, format)}`;
}

/** Minutes from start to end, across midnight when the end is earlier. */
export function spanMinutes(start: number, end: number): number {
  const span = (end - start + DAY) % DAY;
  return span === 0 ? 0 : span;
}

export function formatSpan(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

interface ClockToken {
  readonly hour: number;
  readonly minute: number;
  readonly period: "a" | "p" | null;
}

/** One time as typed: digits with an optional colon and an optional a/p. */
export function readToken(raw: string): ClockToken | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  const match = /^(\d{1,2})(?:[:.h]?(\d{2}))?(a|am|a\.m|p|pm|p\.m)?$/.exec(text)
    ?? /^(\d)(\d{2})(a|am|p|pm)?$/.exec(text)
    ?? /^(\d{2})(\d{2})(a|am|p|pm)?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3] ? (match[3].startsWith("a") ? "a" : "p") : null;
  if (minute > 59) return null;
  if (period ? hour < 1 || hour > 12 : hour > 24) return null;
  return { hour: hour === 24 ? 0 : hour, minute, period };
}

/** Every clock time the token could mean in this setting. */
function candidates(token: ClockToken, format: ClockFormat): number[] {
  const { hour, minute, period } = token;
  if (period) return [((hour % 12) + (period === "p" ? 12 : 0)) * 60 + minute];
  if (format === "24h" || hour === 0 || hour > 12) return [hour * 60 + minute];
  return [(hour % 12) * 60 + minute, ((hour % 12) + 12) * 60 + minute];
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY;
  return Math.min(d, DAY - d);
}

export function resolveStart(token: ClockToken, format: ClockFormat, hint: number | null): number {
  const options = candidates(token, format);
  if (options.length === 1 || hint === null) return options[0]!;
  return options.reduce((best, option) => (circularDistance(option, hint) < circularDistance(best, hint) ? option : best));
}

export function resolveEnd(token: ClockToken, format: ClockFormat, start: number): number {
  const options = candidates(token, format);
  // The first one after the start; a shift is never longer than a day.
  return options.reduce((best, option) => {
    const span = spanMinutes(start, option) || DAY;
    const bestSpan = spanMinutes(start, best) || DAY;
    return span < bestSpan ? option : best;
  });
}

export type RangeRead =
  | { readonly ok: true; readonly start: number; readonly end: number }
  | { readonly ok: false; readonly start: number | null; readonly message: string };

const separator = /\s*(?:-|–|—|\bto\b|\s+)\s*/i;

export function readRange(text: string, format: ClockFormat, hint: number | null): RangeRead {
  const cleaned = text.trim().replace(/\s*(am|pm|a\.m\.|p\.m\.|a|p)\b/gi, "$1");
  if (!cleaned) return { ok: false, start: null, message: format === "12h" ? "Type a range like 9-5 or 9:30a-2p" : "Type a range like 9-17 or 0930-1430" };
  const parts = cleaned.split(separator).filter(Boolean);
  if (parts.length > 2) return { ok: false, start: null, message: "Use one start and one end, like 9-5" };
  const startToken = readToken(parts[0]!);
  if (!startToken) return { ok: false, start: null, message: `"${parts[0]}" is not a time` };
  if (parts.length < 2) return { ok: false, start: resolveStart(startToken, format, hint), message: "Add the end time, like -5" };
  const endToken = readToken(parts[1]!);
  if (!endToken) return { ok: false, start: resolveStart(startToken, format, hint), message: `"${parts[1]}" is not a time` };
  // "9-5" is 9 AM to 5 PM, not 9 PM to 5 AM: a reading that stays within the
  // day wins, then one of 14 hours or less, then the one nearest the hint.
  const readings = candidates(startToken, format).map((option) => {
    const end = resolveEnd(endToken, format, option);
    return { start: option, end, crosses: end < option, long: spanMinutes(option, end) > 14 * 60 };
  });
  const score = (reading: (typeof readings)[number]) =>
    (reading.crosses ? 2 : 0) + (reading.long ? 1 : 0);
  const best = readings.reduce((winner, reading) => {
    if (score(reading) !== score(winner)) return score(reading) < score(winner) ? reading : winner;
    if (hint === null) return winner;
    return circularDistance(reading.start, hint) < circularDistance(winner.start, hint) ? reading : winner;
  });
  const { start, end } = best;
  if (end === start) return { ok: false, start, message: "Start and end time cannot be the same." };
  return { ok: true, start, end };
}

/** Suggestions for a half-typed time: the typed hour's quarter hours, both halves of the day in 12h. */
export function suggestTimes(raw: string, format: ClockFormat, around: number | null, after: number | null): number[] {
  const text = raw.trim();
  const step = 30;
  if (!text) {
    const base = after ?? around ?? 9 * 60;
    const first = after !== null ? after + step : Math.max(0, Math.round((base - 2 * 60) / step) * step);
    return Array.from({ length: 32 }, (_, index) => (first + index * step) % DAY);
  }
  const token = readToken(text);
  if (!token) return [];
  const exact = candidates(token, format);
  const quarters = /^\d{1,2}$/.test(text.replace(/[^\d]/g, "")) && !/[:.]/.test(text) && text.replace(/[^\d]/g, "").length <= 2
    ? exact.flatMap((minutes) => [0, 15, 30, 45].map((offset) => minutes + offset))
    : exact;
  const order = (minutes: number) =>
    after !== null ? spanMinutes(after, minutes) || DAY : around !== null ? circularDistance(minutes, around) : minutes;
  const unique = [...new Set(quarters.map((value) => value % DAY))];
  if (after !== null || around !== null) {
    // Keep each hour's quarters together, nearest hour first.
    const hours = [...new Set(unique.map((value) => Math.floor(value / 60)))].sort((a, b) => order(a * 60) - order(b * 60));
    return hours.flatMap((hour) => unique.filter((value) => Math.floor(value / 60) === hour).sort((a, b) => a - b));
  }
  return unique;
}
