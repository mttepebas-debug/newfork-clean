// PRESET-SAAT (KARARLAR S-183, variant A): the hours a preset dropped on the
// Schedule offers are its shift type's saved times, the primary first (Settings
// → Shift types). One time: placed at once. Several: a small list beside the
// cell, the picked one is written. The shift's card shows its hours.
import type { ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";

import type { PresetCreateTarget } from "../components/SchedulePresetRows";
import { formatScheduleBadgeTimeRange } from "../components/ShiftCard";
import { parseTimeInputValue } from "../timeInput";

export interface PresetHours {
  readonly start: string;
  readonly end: string;
}

export interface PresetTimeOption extends PresetHours {
  readonly primary: boolean;
  /** "Last for Daniel" when this person's nearest shift of this kind used these hours. */
  readonly note: string | null;
}

const hhmm = (value: string | null | undefined): string | null => (value ? value.slice(0, 5) : null);

type ShiftTypeTimes = Pick<ScheduleReadModel["shift_types"][number], "default_start_time" | "default_end_time" | "time_options">;

/** A type's saved times, primary first ([] when it has none). */
export function presetHoursOfType(type: ShiftTypeTimes | undefined): PresetHours[] {
  if (!type) return [];
  const start = hhmm(type.default_start_time);
  const end = hhmm(type.default_end_time);
  if (!start || !end) return [];
  return [{ start, end }, ...(type.time_options ?? []).map((option) => ({ start: option.start_time, end: option.end_time }))];
}

export function presetTimeOptions(model: ScheduleReadModel, target: PresetCreateTarget): PresetTimeOption[] {
  const hours = presetHoursOfType(model.shift_types.find((type) => type.id === target.preset.shiftTypeId));
  let last: PresetHours | null = null;
  let name = "";
  if (target.employeeId) {
    const day = Date.parse(target.date);
    const theirs = model.shifts
      .filter((shift) => shift.employee_id === target.employeeId && shift.shift_type_id === target.preset.shiftTypeId && shift.job_id === target.preset.jobId)
      .sort((a, b) => Math.abs(Date.parse(a.scheduled_date) - day) - Math.abs(Date.parse(b.scheduled_date) - day));
    if (theirs[0]) last = { start: hhmm(theirs[0].start_time)!, end: hhmm(theirs[0].end_time)! };
    name = model.employees.find((employee) => employee.id === target.employeeId)?.display_name.split(" ")[0] ?? "";
  }
  // The person's last hours only mark a saved time; they never add one.
  return hours.map((item, index) => ({
    ...item,
    primary: index === 0,
    note: last && name && last.start === item.start && last.end === item.end ? `Last for ${name}` : null,
  }));
}

export function withPresetHours(target: PresetCreateTarget, hours: PresetHours): PresetCreateTarget {
  return { ...target, preset: { ...target.preset, startTime: hours.start, endTime: hours.end } };
}

/** The shift a picked time writes: its hours on the card; the primary keeps following the type's default. */
export function presetDropInput(model: ScheduleReadModel, target: PresetCreateTarget, hours: PresetHours): ScheduleShiftMutationInput {
  const type = model.shift_types.find((item) => item.id === target.preset.shiftTypeId);
  const timezone = model.locations.find((location) => location.id === target.locationId)?.timezone ?? "UTC";
  const primary = presetHoursOfType(type)[0];
  const isPrimary = Boolean(type && primary && primary.start === hours.start && primary.end === hours.end);
  return {
    location_id: target.locationId,
    employee_id: target.employeeId,
    job_id: target.preset.jobId,
    shift_type_id: target.preset.shiftTypeId,
    scheduled_date: target.date,
    start_time: hours.start,
    end_time: hours.end,
    unpaid_break_minutes: 30,
    hide_time_on_badge: false,
    time_basis: isPrimary ? "type_default" : "explicit",
    time_snapshot: isPrimary
      ? { shift_type_id: target.preset.shiftTypeId, default_revision: type?.default_revision ?? 1, start_time: hours.start, end_time: hours.end, timezone }
      : null,
    time_timezone: timezone,
    label_ids: [],
    label_names: [],
    note: "",
  };
}

export function presetTimeText(hours: PresetHours): string {
  return formatScheduleBadgeTimeRange(hours.start, hours.end, "12h");
}

/** "4–10 PM", "11 AM–4 PM", "4:15–11:30 PM". */
export function presetShortRange(hours: PresetHours): string {
  const part = (value: string) => {
    const [hour, minute] = value.split(":").map(Number) as [number, number];
    return { text: `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}`, period: hour < 12 ? "AM" : "PM" };
  };
  const a = part(hours.start);
  const b = part(hours.end);
  return a.period === b.period ? `${a.text}–${b.text} ${b.period}` : `${a.text} ${a.period}–${b.text} ${b.period}`;
}

/** "7h 15m" between two clock times; an end before the start runs past midnight. */
export function presetDuration(hours: PresetHours): string {
  const minutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number) as [number, number];
    return hour * 60 + minute;
  };
  const total = (((minutes(hours.end) - minutes(hours.start)) % 1440) + 1440) % 1440 || 1440;
  const whole = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${whole}h ${rest}m` : `${whole}h`;
}

/** "5-11p", "530p-11", "10 to 4", "16:00-22:00" → start and end, or null. */
export function parsePresetRange(text: string): PresetHours | null {
  const parts = text.toLowerCase().replace(/\s+/g, "").split(/-|–|—|to/).filter(Boolean);
  if (parts.length !== 2) return null;
  const [rawStart, rawEnd] = parts as [string, string];
  const suffix = (value: string): "AM" | "PM" | null => {
    const match = value.match(/([ap])m?$/);
    return match ? (match[1] === "a" ? "AM" : "PM") : null;
  };
  const hourOf = (value: string) => {
    if (value.includes(":")) return Number(value.split(":")[0]!.replace(/\D/g, ""));
    const digits = value.replace(/\D/g, "");
    return Number(digits.length <= 2 ? digits : digits.slice(0, -2));
  };
  // A start with no a/p: earlier on the clock than the end means the same
  // half of the day ("4-10p" = 4 PM), later means the other ("10-4" = 10 AM).
  const endPeriod = suffix(rawEnd) ?? "PM";
  const startPeriod = suffix(rawStart) ?? (hourOf(rawStart) % 12 < hourOf(rawEnd) % 12 ? endPeriod : endPeriod === "PM" ? "AM" : "PM");
  const parse = (value: string, period: "AM" | "PM") => {
    const twentyFour = /^\d{1,2}:\d{2}$/.test(value) && Number(value.split(":")[0]) > 12;
    return parseTimeInputValue(value.replace(/[ap]m?$/, (found) => found[0]!).replace(/m$/, ""), {
      timeFormat: twentyFour ? "24h" : "12h",
      activePeriod: period,
    })?.canonical ?? null;
  };
  const start = parse(rawStart, startPeriod);
  const end = parse(rawEnd, endPeriod);
  return start && end && start !== end ? { start, end } : null;
}

/** "Dinner-Barback": the list's title, as the preset chip says it. */
export function presetPickName(model: ScheduleReadModel, target: PresetCreateTarget): string {
  const type = model.shift_types.find((item) => item.id === target.preset.shiftTypeId);
  const job = model.jobs.find((item) => item.id === target.preset.jobId);
  return `${type?.name ?? "Shift"}-${job?.name ?? "Job"}`;
}

/** "Daniel Kim · Wed, Oct 21" or "Open shift · Wed, Oct 21". */
export function presetPickWhere(model: ScheduleReadModel, target: PresetCreateTarget): string {
  const person = target.employeeId
    ? model.employees.find((employee) => employee.id === target.employeeId)?.display_name ?? "Employee"
    : "Open shift";
  const day = new Date(`${target.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${person} · ${day}`;
}
