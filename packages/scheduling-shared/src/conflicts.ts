import { intervalsOverlap, timeToBucket, toInterval } from "./minutes.js";
import type {
  AvailabilityRule,
  AvailabilityVersion,
  CollisionResult,
  ConflictContext,
  ConflictInput,
  ConflictWarning,
  ScheduleCollisionRules,
  ScheduleCollisionShift,
} from "./types.js";

function crossesMidnight(start: string, end: string): boolean {
  return end <= start;
}

function parseTimeMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid time string: ${JSON.stringify(value)}`);
  }
  if (hours! < 0 || hours! > 23 || minutes! < 0 || minutes! > 59) {
    throw new Error(`Time out of range: ${JSON.stringify(value)}`);
  }
  return hours! * 60 + minutes!;
}

function dateToDayIndex(value: string): number {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid date string: ${JSON.stringify(value)}`);
  }
  return Math.round(parsed / 86_400_000);
}

function absoluteInterval(shift: ScheduleCollisionShift): { start: number; end: number } {
  const base = dateToDayIndex(shift.scheduled_date) * 1440;
  const start = base + parseTimeMinutes(shift.start_time);
  const shiftCrossesMidnight =
    shift.crosses_midnight ?? crossesMidnight(shift.start_time, shift.end_time);
  const end = base + (shiftCrossesMidnight ? 1440 : 0) + parseTimeMinutes(shift.end_time);
  return { start, end };
}

function previousDow(day: number): number {
  return day === 0 ? 6 : day - 1;
}

function nextDow(day: number): number {
  return day === 6 ? 0 : day + 1;
}

export function evaluateScheduleCollision(
  a: ScheduleCollisionShift,
  b: ScheduleCollisionShift,
  rules: ScheduleCollisionRules = {},
): CollisionResult {
  if (!a.employee_id || !b.employee_id || a.employee_id !== b.employee_id) {
    return { collides: false, reason: null };
  }

  const duplicateNamedShiftType = rules.duplicateNamedShiftType ?? true;
  if (
    duplicateNamedShiftType &&
    a.shift_type_id &&
    b.shift_type_id &&
    a.shift_type_id === b.shift_type_id &&
    a.scheduled_date === b.scheduled_date
  ) {
    return { collides: true, reason: "same_named_shift_type" };
  }

  const first = absoluteInterval(a);
  const second = absoluteInterval(b);
  const touchingIntervalsConflict = rules.touchingIntervalsConflict ?? true;
  const overlaps = touchingIntervalsConflict
    ? first.start <= second.end && second.start <= first.end
    : first.start < second.end && second.start < first.end;

  return overlaps ? { collides: true, reason: "time_overlap" } : { collides: false, reason: null };
}

const assignedShiftPolicy = {
  severity: "critical",
  overrideable: false,
  requires_override_note: false,
  source: "assigned_shift",
} as const;

const weeklyAvailabilityPolicy = {
  severity: "soft",
  overrideable: true,
  requires_override_note: true,
  source: "weekly_availability",
} as const;

const approvedTimeOffPolicy = {
  severity: "hard",
  overrideable: false,
  requires_override_note: false,
  source: "approved_time_off",
} as const;

const closedDayPolicy = {
  severity: "hard",
  overrideable: true,
  requires_override_note: true,
  source: "closed_day",
} as const;

function availabilityPolicy(versionId: string | undefined) {
  return versionId
    ? { ...weeklyAvailabilityPolicy, availability_version_id: versionId }
    : weeklyAvailabilityPolicy;
}

const limitedAvailabilityPolicy = {
  severity: "soft",
  overrideable: true,
  requires_override_note: true,
  source: "weekly_availability",
} as const;

function daysBetween(a: string, b: string): number {
  const aTime = Date.parse(`${a}T00:00:00.000Z`);
  const bTime = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((aTime - bTime) / 86_400_000);
}

function availabilityForDate(
  ctx: ConflictContext,
  scheduledDate: string,
): { rules: readonly AvailabilityRule[]; versionId?: string } {
  if (!ctx.availabilityVersions) {
    return { rules: ctx.availability };
  }

  const version = [...ctx.availabilityVersions]
    .filter((candidate: AvailabilityVersion) => {
      if (candidate.effective_start_date > scheduledDate) return false;
      if (candidate.effective_end_date && candidate.effective_end_date < scheduledDate)
        return false;
      return true;
    })
    .sort((a, b) => b.effective_start_date.localeCompare(a.effective_start_date))[0];

  return version ? { rules: version.rules, versionId: version.id } : { rules: [] };
}

export function detectConflicts(input: ConflictInput, ctx: ConflictContext): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const newCM = crossesMidnight(input.start_time, input.end_time);
  const newInterval = toInterval(input.start_time, input.end_time, newCM, 0);
  const inputUsesClockTime = input.uses_clock_time ?? true;

  // 1. Employee occupancy conflicts
  if (input.employee_id) {
    const namedDuplicateIds = new Set<string>();
    if (input.shift_type_id) {
      const conflicting = ctx.employeeShifts
        .filter((c) => {
          if (input.exclude_shift_id && c.id === input.exclude_shift_id) return false;
          return (
            c.scheduled_date === input.scheduled_date && c.shift_type_id === input.shift_type_id
          );
        })
        .map((c) => {
          namedDuplicateIds.add(c.id);
          return {
            id: c.id,
            shift_type_label: c.shift_type_label,
            location_name: c.location_name,
          };
        });

      if (conflicting.length > 0) {
        warnings.push({
          type: "named_shift_duplicate",
          conflicting_shifts: conflicting,
          ...assignedShiftPolicy,
        });
      }
    }

    if (inputUsesClockTime) {
      const conflicting: {
        id: string;
        start_time: string;
        end_time: string;
        shift_type_label: string | null;
        location_name: string;
      }[] = [];

      for (const c of ctx.employeeShifts) {
        if (namedDuplicateIds.has(c.id)) continue;
        if ((c.uses_clock_time ?? true) !== true) continue;
        if (input.exclude_shift_id && c.id === input.exclude_shift_id) continue;
        let dateDelta: number;
        if (c.scheduled_date < input.scheduled_date) dateDelta = -1;
        else if (c.scheduled_date > input.scheduled_date) dateDelta = 1;
        else dateDelta = 0;
        const cInt = toInterval(c.start_time, c.end_time, c.crosses_midnight, dateDelta);
        if (intervalsOverlap(newInterval, cInt)) {
          conflicting.push({
            id: c.id,
            start_time: c.start_time,
            end_time: c.end_time,
            shift_type_label: c.shift_type_label,
            location_name: c.location_name,
          });
        }
      }
      if (conflicting.length > 0) {
        warnings.push({
          type: "time_overlap",
          conflicting_shifts: conflicting,
          ...assignedShiftPolicy,
        });
      }
    }
  }

  // 2. Approved time off
  if (input.employee_id) {
    for (const segment of ctx.approvedTimeOff ?? []) {
      if (segment.status !== "approved") continue;
      const dateDelta = daysBetween(segment.date, input.scheduled_date);
      if (dateDelta < -1 || dateDelta > 1) continue;

      if (segment.full_day) {
        if (dateDelta === 0 || (newCM && dateDelta === 1)) {
          warnings.push({
            type: "time_off",
            segment_id: segment.id,
            request_id: segment.request_id,
            date: segment.date,
            full_day: true,
            start_time: null,
            end_time: null,
            reason_category: segment.reason_category ?? null,
            ...approvedTimeOffPolicy,
          });
        }
        continue;
      }

      if (!inputUsesClockTime) continue;
      if (!segment.start_time || !segment.end_time) continue;
      const segmentCrossesMidnight = crossesMidnight(segment.start_time, segment.end_time);
      const segmentInterval = toInterval(
        segment.start_time,
        segment.end_time,
        segmentCrossesMidnight,
        dateDelta,
      );
      if (!intervalsOverlap(newInterval, segmentInterval)) continue;

      warnings.push({
        type: "time_off",
        segment_id: segment.id,
        request_id: segment.request_id,
        date: segment.date,
        full_day: false,
        start_time: segment.start_time,
        end_time: segment.end_time,
        reason_category: segment.reason_category ?? null,
        ...approvedTimeOffPolicy,
      });
    }
  }

  // 3. Availability
  if (input.employee_id) {
    const dayOfWeek = new Date(`${input.scheduled_date}T12:00:00.000Z`).getUTCDay();
    const startBucket = timeToBucket(input.start_time);
    const effectiveAvailability = availabilityForDate(ctx, input.scheduled_date);
    for (const row of effectiveAvailability.rules) {
      // preferred/available never conflict; only limited (soft) and unavailable (existing).
      if (row.state === "preferred" || row.state === "available") continue;
      const isLimited = row.state === "limited";
      const warnType = isLimited ? "availability_limited" : "availability";
      const policy = isLimited
        ? limitedAvailabilityPolicy
        : availabilityPolicy(effectiveAvailability.versionId);
      if (row.mode === "shift_type") {
        if (row.day_of_week !== dayOfWeek) continue;
        if (row.shift_type_id && row.shift_type_id === input.shift_type_id) {
          const label = ctx.shiftTypeLabels.get(row.shift_type_id);
          warnings.push(
            label !== undefined
              ? {
                  type: warnType,
                  rule_kind: "shift_type",
                  shift_type_label: label,
                  day_of_week: dayOfWeek,
                  ...policy,
                }
              : {
                  type: warnType,
                  rule_kind: "shift_type",
                  day_of_week: dayOfWeek,
                  ...policy,
                },
          );
          break;
        }
      } else if (row.mode === "time_range") {
        if (!inputUsesClockTime) continue;
        if (!row.start_time || !row.end_time) continue;

        const rowCrossesMidnight =
          row.crosses_midnight ?? crossesMidnight(row.start_time, row.end_time);
        const deltas: number[] = [];
        if (row.day_of_week === dayOfWeek) deltas.push(0);
        if (rowCrossesMidnight && row.day_of_week === previousDow(dayOfWeek)) deltas.push(-1);
        if (newCM && row.day_of_week === nextDow(dayOfWeek)) deltas.push(1);

        for (const delta of deltas) {
          const unavailable = toInterval(row.start_time, row.end_time, rowCrossesMidnight, delta);
          if (!intervalsOverlap(newInterval, unavailable)) continue;

          warnings.push({
            type: warnType,
            rule_kind: "time_range",
            start_time: row.start_time,
            end_time: row.end_time,
            day_of_week: row.day_of_week,
            ...policy,
          });
          break;
        }
        if (
          warnings.some(
            (warning) => warning.type === "availability" || warning.type === "availability_limited",
          )
        )
          break;
      } else {
        if (row.day_of_week !== dayOfWeek) continue;
        if (row.bucket === "all_day") {
          warnings.push({
            type: warnType,
            rule_kind: "all_day",
            day_of_week: dayOfWeek,
            ...policy,
          });
          break;
        }
        if (!inputUsesClockTime) continue;
        if (row.bucket === startBucket) {
          warnings.push({
            type: warnType,
            rule_kind: "bucket",
            bucket: startBucket,
            day_of_week: dayOfWeek,
            ...policy,
          });
          break;
        }
      }
    }
  }

  // 4. Closed day
  if (ctx.closedDay) {
    if (ctx.closedDay.is_all_day) {
      const w: ConflictWarning =
        ctx.closedDay.reason !== undefined
          ? {
              type: "closed_day",
              scope: "all_day",
              reason: ctx.closedDay.reason,
              ...closedDayPolicy,
            }
          : { type: "closed_day", scope: "all_day", ...closedDayPolicy };
      warnings.push(w);
    } else if (input.shift_type_id && ctx.closedDay.shift_type_ids.includes(input.shift_type_id)) {
      const label = ctx.shiftTypeLabels.get(input.shift_type_id);
      const base: ConflictWarning = {
        type: "closed_day",
        scope: "shift_type",
        ...closedDayPolicy,
      };
      const withLabel = label !== undefined ? { ...base, shift_type_label: label } : base;
      const final =
        ctx.closedDay.reason !== undefined
          ? { ...withLabel, reason: ctx.closedDay.reason }
          : withLabel;
      warnings.push(final);
    }
  }

  return warnings;
}
