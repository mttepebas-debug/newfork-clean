import type {
  PreferenceShiftType,
  WeeklyPreference,
  WeeklyPreferenceDay,
} from "@newfork/shared";

// The employee's week, one day at a time (KARARLAR "Müsaitlik giriş ekranı =
// 4 · Gün gün"; Mert 2026-10-16 "A · Alt sayfa"). A day is available, or
// unavailable all day, or unavailable some hours: one range a day (Mert
// 2026-10-16, "kural da 1'e insin") on a strip from 12 AM to 12 AM, or some
// shift types. Everything here is pure; the screens draw it.

export type TimeFormat = "12h" | "24h";
export type DayState = "free" | "off" | "some";
/** Minutes from the start of the day, [start, end]; the end may be 1440. */
export type MinuteRange = readonly [number, number];

export const DAY_START = 0;
export const DAY_END = 1440;
export const STEP = 30;
/** Monday first, as the week reads in the US workplace. */
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const shortDay = (day: number) => WEEKDAY_NAMES[day]!.slice(0, 3);

export const toMinutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
export const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export const snap = (minutes: number, step = STEP) =>
  Math.round(minutes / step) * step;

function parts(minutes: number) {
  const inDay = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(inDay / 60);
  return { hour, minute: inDay % 60, h12: hour % 12 || 12, pm: hour >= 12 };
}

/** "9 AM", "5:30 PM"; "09:00" in a 24-hour workspace (the end of the day is 24:00). */
export function compactClock(minutes: number, format: TimeFormat) {
  if (format === "24h") return minutes >= DAY_END ? "24:00" : toClock(minutes);
  const { h12, minute, pm } = parts(minutes);
  return `${h12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${pm ? "PM" : "AM"}`;
}
/** "9:00 AM" — what a time field shows. */
export function fullClock(minutes: number, format: TimeFormat) {
  if (format === "24h") return minutes >= DAY_END ? "24:00" : toClock(minutes);
  const { h12, minute, pm } = parts(minutes);
  return `${h12}:${String(minute).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}
/** "6p", "11:30a" — the strip's scale and the tip over a handle. */
export function shortClock(minutes: number, format: TimeFormat) {
  if (format === "24h") return minutes >= DAY_END ? "24" : String(Math.floor(minutes / 60)) + (minutes % 60 ? `:${String(minutes % 60).padStart(2, "0")}` : "");
  const { h12, minute, pm } = parts(minutes);
  return `${h12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${pm ? "p" : "a"}`;
}

export function rangeText([start, end]: MinuteRange, format: TimeFormat) {
  if (start <= DAY_START && end >= DAY_END) return "All day";
  if (start <= DAY_START) return `Before ${compactClock(end, format)}`;
  if (end >= DAY_END) return `After ${compactClock(start, format)}`;
  return `${compactClock(start, format)} – ${compactClock(end, format)}`;
}

export function dayState(day: WeeklyPreferenceDay): DayState {
  if (day.all_day) return "off";
  return day.ranges.length || day.shift_type_ids.length ? "some" : "free";
}

/** The day as one range: all day is the whole strip; several saved ranges are edited as one. */
export function rangeOf(day: WeeklyPreferenceDay): MinuteRange | null {
  if (day.all_day) return [DAY_START, DAY_END];
  const first = day.ranges[0];
  const last = day.ranges.at(-1);
  return first && last ? [toMinutes(first.start), toMinutes(last.end)] : null;
}

export function withRange(day: WeeklyPreferenceDay, [start, end]: MinuteRange): WeeklyPreferenceDay {
  if (start <= DAY_START && end >= DAY_END)
    return { ...day, all_day: true, ranges: [], shift_type_ids: [] };
  return { ...day, all_day: false, ranges: [{ start: toClock(start), end: toClock(end) }] };
}

export function dayStatusText(
  day: WeeklyPreferenceDay,
  shiftTypes: readonly PreferenceShiftType[],
  format: TimeFormat,
) {
  const state = dayState(day);
  if (state === "off") return "Unavailable all day";
  if (state === "free") return "Available";
  if (day.ranges.length)
    return day.ranges
      .map((range) => rangeText([toMinutes(range.start), toMinutes(range.end)], format))
      .join(", ");
  // In the order the workspace lists its shift types.
  const order = shiftTypes.map((type) => type.id);
  return [...day.shift_type_ids]
    .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999))
    .map((id) => shiftTypes.find((type) => type.id === id)?.name ?? "Saved shift type")
    .join(", ");
}

/** A row's tone: green when the day is open, orange when any of it is not. */
export type DayTone = "free" | "blocked";

/**
 * How a day of the week reads in a list (Mert 2026-10-16): its tone, a plain
 * sentence and the class that colours it (`.dav-tone` in day-availability.css).
 * The employee's day list uses it; the manager's read-only days reuse it.
 */
export function dayTone(
  day: WeeklyPreferenceDay,
  shiftTypes: readonly PreferenceShiftType[],
  format: TimeFormat,
): { tone: DayTone; label: string; className: string } {
  const state = dayState(day);
  const tone: DayTone = state === "free" ? "free" : "blocked";
  const className = `dav-tone is-${tone}`;
  if (state === "free") return { tone, label: "Available all day", className };
  if (state === "off") return { tone, label: "Unavailable all day", className };
  if (!day.ranges.length)
    return { tone, label: `Unavailable for ${dayStatusText(day, shiftTypes, format)}`, className };
  const pieces = day.ranges.map((range) => {
    const [start, end] = [toMinutes(range.start), toMinutes(range.end)];
    if (start <= DAY_START) return `before ${fullClock(end, format)}`;
    if (end >= DAY_END) return `after ${fullClock(start, format)}`;
    return `${fullClock(start, format)} – ${fullClock(end, format)}`;
  });
  return { tone, label: `Unavailable ${pieces.join(", ")}`, className };
}

const evening: MinuteRange = [18 * 60, DAY_END];

export function setDayState(
  day: WeeklyPreferenceDay,
  state: DayState,
  mode: WeeklyPreference["input_mode"],
  shiftTypes: readonly PreferenceShiftType[],
): WeeklyPreferenceDay {
  if (state === "free") return { ...day, all_day: false, ranges: [], shift_type_ids: [] };
  if (state === "off") return { ...day, all_day: true, ranges: [], shift_type_ids: [] };
  if (dayState(day) === "some") return day;
  if (mode === "time_range") return withRange(day, evening);
  // The last shift type of the day, the one most often turned down.
  const selectable = shiftTypes.filter((type) => type.selectable);
  const last = selectable.at(-1);
  return last ? { ...day, all_day: false, ranges: [], shift_type_ids: [last.id] } : day;
}

/** M3: marking every shift type a day can take is all day. */
export function toggleShiftType(
  day: WeeklyPreferenceDay,
  id: string,
  shiftTypes: readonly PreferenceShiftType[],
): WeeklyPreferenceDay {
  const selectable = shiftTypes.filter((type) => type.selectable).map((type) => type.id);
  const current = day.all_day ? selectable : day.shift_type_ids;
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  if (selectable.length > 0 && selectable.every((item) => next.includes(item)))
    return { ...day, all_day: true, ranges: [], shift_type_ids: [] };
  const order = shiftTypes.map((type) => type.id);
  return {
    ...day,
    all_day: false,
    ranges: [],
    shift_type_ids: [...next].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  };
}

export const sameDay = (a: WeeklyPreferenceDay, b: WeeklyPreferenceDay) =>
  a.all_day === b.all_day &&
  JSON.stringify(a.ranges) === JSON.stringify(b.ranges) &&
  JSON.stringify([...a.shift_type_ids].sort()) === JSON.stringify([...b.shift_type_ids].sort());

/** The weekdays (0 = Sunday) whose rule differs between two weeks. */
export function changedDays(saved: WeeklyPreference, draft: WeeklyPreference) {
  return draft.days
    .filter((day) => {
      const before = saved.days.find((item) => item.day === day.day);
      return !before || !sameDay(before, day);
    })
    .map((day) => day.day)
    .sort((a, b) => a - b);
}

/** The days the edited day is copied to, and how each looked before. */
export type Copies = {
  readonly days: readonly number[];
  readonly before: Readonly<Record<number, WeeklyPreferenceDay>>;
};
export const noCopies: Copies = { days: [], before: {} };

const dayOf = (week: WeeklyPreference, weekday: number) =>
  week.days.find((item) => item.day === weekday)!;
const replace = (week: WeeklyPreference, weekday: number, rule: WeeklyPreferenceDay): WeeklyPreference => ({
  ...week,
  days: week.days.map((item) => (item.day === weekday ? { ...rule, day: weekday } : item)),
});

/** A change to the edited day also reaches the days it was copied to. */
export function applyDay(
  week: WeeklyPreference,
  weekday: number,
  rule: WeeklyPreferenceDay,
  copies: Copies,
): WeeklyPreference {
  return [weekday, ...copies.days].reduce((next, target) => replace(next, target, rule), week);
}

/** Copy the edited day to another day; pressed again, that day is as it was. */
export function toggleCopy(
  week: WeeklyPreference,
  weekday: number,
  target: number,
  copies: Copies,
): { week: WeeklyPreference; copies: Copies } {
  if (copies.days.includes(target)) {
    const { [target]: previous, ...before } = copies.before;
    return {
      week: replace(week, target, previous ?? { ...dayOf(week, target), all_day: false, ranges: [], shift_type_ids: [] }),
      copies: { days: copies.days.filter((item) => item !== target), before },
    };
  }
  return {
    week: replace(week, target, dayOf(week, weekday)),
    copies: {
      days: [...copies.days, target],
      before: { ...copies.before, [target]: dayOf(week, target) },
    },
  };
}
