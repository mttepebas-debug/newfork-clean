import { z } from "zod";
import { timeOffPeriodInputSchema } from "./time-off";

export const availabilityDateOverrideSchema = timeOffPeriodInputSchema.safeExtend({
  mode: z.enum(["available", "unavailable"]),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).optional(),
  time_timezone: z.string().optional(),
  fold_choices: z.object({ start_fold: z.enum(["earlier", "later"]).optional(), end_fold: z.enum(["earlier", "later"]).optional() }).optional(),
});
export type AvailabilityDateOverride = z.infer<typeof availabilityDateOverrideSchema>;

export function availabilityDateOverrideBounds(changes: readonly AvailabilityDateOverride[]) {
  const starts = changes.map(p => p.segment_date).sort();
  const ends = changes.map(p => p.ends_next_day && Number.isFinite(Date.parse(p.segment_date)) && clockSeconds(p.end_time ?? "00:00") > 0
    ? new Date(Date.parse(`${p.segment_date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : p.segment_date).sort();
  return { effective_from: starts[0] ?? "", effective_until: ends.at(-1) ?? "" };
}

/** Compatibility classification applies only when stored source metadata is absent. */
export function getShiftTimeBasis(shift: {
  time_basis?: "explicit" | "type_default" | "unresolved" | "legacy_unverified";
  hide_time_on_badge?: boolean;
}): "explicit" | "type_default" | "unresolved" | "legacy_unverified" {
  return (
    shift.time_basis ??
    (shift.hide_time_on_badge ? "legacy_unverified" : "explicit")
  );
}

export const availabilityTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone");

const clockSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
    "Enter a valid time such as 09:00.",
  );
const endClockSchema = z
  .string()
  .regex(
    /^(?:([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?|24:00)$/,
    "Enter an end time, or select End of day.",
  );
export const availabilityWindowSchema = z.object({
  start: clockSchema,
  end: endClockSchema,
});
export const availabilityDayInputSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    mode: z.enum(["unavailable", "unrestricted", "windows"]),
    // Four unavailable ranges can leave five available pieces in one day.
    windows: z.array(availabilityWindowSchema).max(5),
    blocked_shift_type_ids: z.array(z.string().uuid().transform(id => id.toLowerCase())).max(64).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.blocked_shift_type_ids && new Set(value.blocked_shift_type_ids).size !== value.blocked_shift_type_ids.length)
      ctx.addIssue({ code: "custom", path: ["blocked_shift_type_ids"], message: "Choose each restricted shift type once." });
    if (value.mode === "windows" && !value.windows.length)
      ctx.addIssue({
        code: "custom",
        path: ["windows"],
        message: "Add at least one available time range",
      });
    if (value.mode !== "windows" && value.windows.length)
      ctx.addIssue({
        code: "custom",
        path: ["windows"],
        message: "Only custom hours accept time ranges",
      });
    const windows = value.windows
      .map((window, index) => ({
        start: clockSeconds(window.start),
        end: clockSeconds(window.end),
        index,
      }))
      .sort((a, b) => a.start - b.start);
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i]!;
      if (window.end <= window.start)
        ctx.addIssue({
          code: "custom",
          path: ["windows", window.index, "end"],
          message: "End must follow start; put next-day hours on the next day",
        });
      if (i > 0 && windows[i - 1]!.end > window.start)
        ctx.addIssue({
          code: "custom",
          path: ["windows", window.index],
          message: "Time ranges cannot overlap",
        });
    }
  });

export const weeklyAvailabilityInputSchema = z
  .object({
    timezone: availabilityTimezoneSchema,
    days: z.array(availabilityDayInputSchema).length(7),
    date_overrides: z.array(availabilityDateOverrideSchema).max(124).optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.days.map((day) => day.day)).size !== 7)
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Each weekday must be provided once",
      });
  });
export type AvailabilityDay = z.infer<typeof availabilityDayInputSchema>;
export type WeeklyAvailability = z.infer<typeof weeklyAvailabilityInputSchema>;

export interface AvailabilityEffectiveVersion {
  id?: string;
  revision: number;
  effective_from: string;
  effective_until: string | null;
  kind?: "weekly" | "temporary";
  replace_version_ids?: readonly string[];
  date_overrides?: readonly AvailabilityDateOverride[];
  timezone?: string;
}

/** A local-calendar pattern preview, not a physical assignment assessment. */
export function availabilityVersionForDate<
  T extends AvailabilityEffectiveVersion,
>(versions: readonly T[], date: string): T | null {
  const active = versions.filter(
    (v) =>
      !v.date_overrides?.length && v.effective_from <= date &&
      (!v.effective_until || date <= v.effective_until),
  );
  const temporary = (v: T) =>
    (v.kind ?? (v.effective_until ? "temporary" : "weekly")) === "temporary";
  return (
    active
      .filter(
        (v) =>
          !v.id ||
          !active.some(
            (r) =>
              r.revision > v.revision && r.replace_version_ids?.includes(v.id!),
          ),
      )
      .sort(
        (a, b) =>
          Number(temporary(b)) - Number(temporary(a)) ||
          b.revision - a.revision,
      )[0] ?? null
  );
}

export function availabilityForDate(
  employee: {
    availability?: readonly AvailabilityDay[] | null;
    availability_versions?: readonly (AvailabilityEffectiveVersion & {
      days: readonly AvailabilityDay[];
    })[];
  },
  date: string,
): readonly AvailabilityDay[] | null {
  if (!employee.availability_versions) return employee.availability ?? null;
  const base = availabilityVersionForDate(employee.availability_versions, date);
  if (!base) return null;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const rule = base.days.find(d => d.day === weekday);
  if (!rule) return null;
  let available = rule.mode === "unrestricted" ? [{ start: 0, end: 86400 }] : rule.windows.map(w => ({ start: clockSeconds(w.start), end: clockSeconds(w.end) }));
  // Calendar previews cannot safely collapse a different zone or a repeated
  // clock occurrence into a weekday rule. The server still assesses UTC spans.
  const overlays = employee.availability_versions.filter(v => v.date_overrides?.length).sort((a, b) => a.revision - b.revision);
  let changed = false;
  for (const version of overlays) {
    for (const piece of version.date_overrides ?? []) {
      const offset = (Date.parse(`${piece.segment_date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
      if (version.timezone !== base.timezone && Math.abs(offset) <= 1) return null;
      const start = offset * 86400 + clockSeconds(piece.start_time ?? "00:00");
      const end = offset * 86400 + clockSeconds(piece.end_time ?? "24:00") + (piece.ends_next_day ? 86400 : 0);
      const clipped = { start: Math.max(0, start), end: Math.min(86400, end) };
      if (clipped.end <= clipped.start) continue;
      if (piece.start_fold || piece.end_fold) return null;
      changed = true;
      available = available.flatMap(interval => subtractAvailabilityIntervals(interval, [clipped]));
      if (piece.mode === "available") available = mergeAvailabilityIntervals([...available, clipped]);
    }
  }
  if (!changed) return base.days;
  const clock = (seconds: number) => `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}${seconds % 60 ? `:${(seconds % 60).toString().padStart(2, "0")}` : ""}`;
  return base.days.map(d => d.day !== weekday ? d : { ...d, mode: available.length ? "windows" as const : "unavailable" as const, windows: available.map(r => ({ start: clock(r.start), end: clock(r.end) })) });
}

export interface AvailabilityInterval {
  start: number;
  end: number;
}
export type AvailabilityCoverage = "full" | "partial" | "none" | "unknown";

export function clockSeconds(clock: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Half-open intervals. Touching ranges form continuous coverage. */
export function mergeAvailabilityIntervals(
  intervals: readonly AvailabilityInterval[],
): AvailabilityInterval[] {
  const merged: AvailabilityInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    if (interval.end <= interval.start) continue;
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

export function subtractAvailabilityIntervals(
  interval: AvailabilityInterval,
  allowed: readonly AvailabilityInterval[],
): AvailabilityInterval[] {
  const gaps: AvailabilityInterval[] = [];
  let cursor = interval.start;
  for (const range of mergeAvailabilityIntervals(allowed)) {
    const start = Math.max(range.start, interval.start);
    const end = Math.min(range.end, interval.end);
    if (end <= cursor || start >= interval.end) continue;
    if (start > cursor) gaps.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < interval.end) gaps.push({ start: cursor, end: interval.end });
  return gaps;
}

/** Convert the user's negative-hour entry into the canonical available ranges. */
export function availableDayFromUnavailableWindows(
  day: number,
  windows: readonly z.infer<typeof availabilityWindowSchema>[],
): AvailabilityDay {
  if (!windows.length) return { day, mode: "unrestricted", windows: [] };
  const validated = availabilityDayInputSchema.parse({
    day,
    mode: "windows",
    windows,
  });
  const available = subtractAvailabilityIntervals(
    { start: 0, end: 86400 },
    validated.windows.map((w) => ({
      start: clockSeconds(w.start),
      end: clockSeconds(w.end),
    })),
  );
  const clock = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const remainder = seconds % 60;
    return `${hours}:${minutes}${remainder ? `:${remainder.toString().padStart(2, "0")}` : ""}`;
  };
  return availabilityDayInputSchema.parse({
    day,
    mode: available.length ? "windows" : "unavailable",
    windows: available.map((range) => ({
      start: clock(range.start),
      end: clock(range.end),
    })),
  });
}

/** Local calendar preview. Caller must supply the availability calendar's weekday.
 * Server assessment converts the location and availability time zones first. */
export function assessWeeklyAvailability(input: {
  days: readonly AvailabilityDay[] | null | undefined;
  nextDays?: readonly AvailabilityDay[] | null;
  weekday: number;
  start: string;
  end: string;
}): { coverage: AvailabilityCoverage; unavailable: AvailabilityInterval[] } {
  if (!input.days) return { coverage: "unknown", unavailable: [] };
  const start = clockSeconds(input.start);
  let end = clockSeconds(input.end);
  if (end <= start) end += 86400;
  const allowed: AvailabilityInterval[] = [];
  for (let offset = 0; offset < (end > 86400 ? 2 : 1); offset++) {
    const selectedDays =
      offset === 1 && "nextDays" in input ? input.nextDays : input.days;
    const day = selectedDays?.find(
      (item) => item.day === (input.weekday + offset) % 7,
    );
    if (!day) return { coverage: "unknown", unavailable: [] };
    const origin = offset * 86400;
    if (day.mode === "unrestricted")
      allowed.push({ start: origin, end: origin + 86400 });
    else if (day.mode === "windows")
      for (const window of day.windows) {
        allowed.push({
          start: origin + clockSeconds(window.start),
          end: origin + clockSeconds(window.end),
        });
      }
  }
  const unavailable = subtractAvailabilityIntervals({ start, end }, allowed);
  const missing = unavailable.reduce(
    (total, range) => total + range.end - range.start,
    0,
  );
  return {
    coverage:
      missing === 0 ? "full" : missing >= end - start ? "none" : "partial",
    unavailable,
  };
}

export function assessEmployeeAvailability(
  employee: Parameters<typeof availabilityForDate>[0],
  date: string,
  start: string,
  end: string,
) {
  const calendar = new Date(`${date}T12:00:00Z`);
  const weekday = calendar.getUTCDay();
  calendar.setUTCDate(calendar.getUTCDate() + 1);
  return assessWeeklyAvailability({
    days: availabilityForDate(employee, date),
    nextDays: availabilityForDate(
      employee,
      calendar.toISOString().slice(0, 10),
    ),
    weekday,
    start,
    end,
  });
}

export const shiftTimeBasisSchema = z.enum([
  "explicit",
  "type_default",
  "unresolved",
  "legacy_unverified",
]);
export type ShiftTimeBasis = z.infer<typeof shiftTimeBasisSchema>;
export const shiftTimeSnapshotSchema = z.object({
  shift_type_id: z.string().uuid(),
  default_revision: z.number().int().positive(),
  start_time: clockSchema,
  end_time: clockSchema,
  timezone: availabilityTimezoneSchema,
});
export type ShiftTimeSnapshot = z.infer<typeof shiftTimeSnapshotSchema>;

export function resolveShiftAssessmentTime(input: {
  time_basis: ShiftTimeBasis;
  start_time?: string | null;
  end_time?: string | null;
  snapshot?: ShiftTimeSnapshot | null;
}): { basis: ShiftTimeBasis; start: string | null; end: string | null } {
  if (
    input.time_basis === "explicit" &&
    input.start_time &&
    input.end_time &&
    input.start_time !== input.end_time
  )
    return { basis: "explicit", start: input.start_time, end: input.end_time };
  if (
    input.time_basis === "type_default" &&
    input.snapshot &&
    input.snapshot.start_time !== input.snapshot.end_time
  )
    return {
      basis: "type_default",
      start: input.snapshot.start_time,
      end: input.snapshot.end_time,
    };
  return {
    basis:
      input.time_basis === "legacy_unverified"
        ? "legacy_unverified"
        : "unresolved",
    start: null,
    end: null,
  };
}

export const availabilityPublicationLockSchema = z.object({
  location_id: z.string().uuid(),
  location_name: z.string(),
  starts_on: z.string().date(),
  ends_on: z.string().date(),
});
export type AvailabilityPublicationLock = z.infer<
  typeof availabilityPublicationLockSchema
>;

/** Inclusive dates. Status is deliberately absent: unpublishing does not remove the lock. */
export function availabilityPeriodIsPublished(
  startsOn: string,
  endsOn: string | null,
  locks: readonly AvailabilityPublicationLock[],
): boolean {
  return locks.some(
    (lock) => startsOn <= lock.ends_on && (!endsOn || endsOn >= lock.starts_on),
  );
}
