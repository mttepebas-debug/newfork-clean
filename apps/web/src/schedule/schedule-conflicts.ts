import type {
  ScheduleReadModel,
  ScheduleShift,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";

export type ScheduleConflictReason =
  string | { readonly message?: unknown; readonly [key: string]: unknown };

function withPeriod(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const INTERNAL_DETAIL_PATTERN =
  /\b(sql|rls|constraint|stack|route|service|env|provider|supabase|stripe|postgres|request|database|internal|monitor|p2010|23p01)\b|shifts_no_employee_overlap/i;

function safeText(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "";
}

function safeCustomerText(value: unknown): string {
  const text = safeText(value);
  return text && !INTERNAL_DETAIL_PATTERN.test(text) ? text : "";
}

function formatValidationConflictMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  if (INTERNAL_DETAIL_PATTERN.test(trimmed))
    return "Scheduling policy blocks this assignment.";

  const unavailableDuringMatch = /^Employee unavailable during (.+)\.?$/i.exec(
    trimmed,
  );
  if (unavailableDuringMatch?.[1]) {
    return `Employee is unavailable for ${unavailableDuringMatch[1].trim().replace(/[.!?]+$/, "")}.`;
  }

  switch (trimmed) {
    case "Shift type needs default times before it can be used":
      return "This preset needs default times before scheduling.";
    case "Employee already has this named shift":
      return "Employee already has this named shift.";
    case "Employee already has an overlapping shift":
      return "Employee already has an overlapping shift.";
    case "Employee is not assigned to this job":
      return "Employee is not assigned to this job.";
    case "Employee is not assigned to this location":
      return "Employee is not assigned to this location.";
    case "Employee is not eligible for this shift type":
      return "Employee is not eligible for this shift type.";
    case "Open shifts can only be assigned on their original date":
      return "Open shifts can only be assigned on their original date.";
    case "Location is closed all day":
      return "Location is closed all day.";
    case "Location is closed for this shift type":
      return "Location is closed for this shift type.";
    case "Employee is unavailable for this shift type":
      return "Employee is unavailable for this shift type.";
    case "Employee is unavailable at this time":
      return "Employee is unavailable at this time.";
    case "Employee is unavailable all day":
      return "Employee is unavailable all day.";
    case "This employee is excluded from schedule":
      return "This employee is excluded from schedule";
    case "Preset shift is unavailable":
      return "Preset shift is unavailable.";
    case "Shift is already there":
      return "Shift is already in this cell.";
    case "Start and end time cannot be the same":
    case "Start and end time cannot be the same.":
      return "Start and end time cannot be the same.";
    case "Shift not found":
      return "Shift could not be found.";
    case "Employee not found":
      return "Employee could not be found.";
    case "invalid shift reference":
      return "The employee, job, or location assignment is no longer valid. Refresh the schedule and try again.";
    default:
      return withPeriod(trimmed);
  }
}

function formatLooseConflictMessage(
  reason: Record<string, unknown>,
): string | null {
  const message = reason.message;
  if (typeof message !== "string" || message.trim().length === 0) return null;
  const formatted = formatValidationConflictMessage(message);
  return formatted.length > 0 ? formatted : null;
}

function targetEvidence(reason: Record<string, unknown>): string {
  const shiftType = safeCustomerText(reason.shift_type_label);
  const job = safeCustomerText(reason.job_name);
  const location = safeCustomerText(reason.location_name);
  if (!job && !location) return "";
  const details = [shiftType, job].filter(Boolean).join(" / ");
  if (details && location) return ` Requested: ${details} at ${location}.`;
  if (details) return ` Requested: ${details}.`;
  return ` Requested location: ${location}.`;
}

function dateEvidence(reason: Record<string, unknown>): string {
  const date =
    safeCustomerText(reason.date) || safeCustomerText(reason.scheduled_date);
  return date ? ` on ${date}` : "";
}

function employeeSubject(reason: Record<string, unknown>): string {
  return safeCustomerText(reason.employee_name) || "Employee";
}

export function formatScheduleConflictMessage(
  reason: ScheduleConflictReason,
): string {
  if (typeof reason === "string")
    return formatValidationConflictMessage(reason);
  if (!isRecord(reason)) return "Scheduling policy blocks this assignment.";

  const looseMessage = formatLooseConflictMessage(reason);

  if (reason.type === "location_assignment") {
    return `${employeeSubject(reason)} is not assigned to ${
      safeCustomerText(reason.location_name) || "this location"
    }.${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "job_assignment") {
    return `${employeeSubject(reason)} is not assigned to ${
      safeCustomerText(reason.job_name) || "this job"
    }.${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "shift_type_assignment") {
    return `${employeeSubject(reason)} is not eligible for this shift type.${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "employee_excluded") {
    const evidence = targetEvidence(reason);
    return evidence
      ? `This employee is excluded from schedule.${evidence}`.trim()
      : "This employee is excluded from schedule";
  }

  if (
    reason.type === "time_overlap" &&
    Array.isArray(reason.conflicting_shifts)
  ) {
    const details = reason.conflicting_shifts
      .filter(isRecord)
      .map((shift) => {
        const startTime = safeCustomerText(shift.start_time);
        const endTime = safeCustomerText(shift.end_time);
        const shiftType = safeCustomerText(shift.shift_type_label);
        const locationName = safeCustomerText(shift.location_name);
        const range = startTime && endTime ? ` ${startTime}-${endTime}` : "";
        const label = shiftType || "a shift";
        const location = locationName ? ` at ${locationName}` : "";
        return withPeriod(
          `${employeeSubject(reason)} already has ${label}${range}${location}${dateEvidence(reason)}`,
        );
      })
      .join(" ");
    return `${details}${targetEvidence(reason)}`.trim();
  }

  if (
    reason.type === "named_shift_duplicate" &&
    Array.isArray(reason.conflicting_shifts)
  ) {
    const details = reason.conflicting_shifts
      .filter(isRecord)
      .map((shift) => {
        const label =
          safeCustomerText(shift.shift_type_label) ||
          safeCustomerText(reason.shift_type_label) ||
          "this named shift";
        const locationName =
          safeCustomerText(shift.location_name) ||
          safeCustomerText(reason.location_name);
        const location = locationName ? ` at ${locationName}` : "";
        return `${employeeSubject(reason)} already has ${label}${location}${dateEvidence(reason)}.`;
      })
      .join(" ");
    return `${details}${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "named_duplicate") {
    const label =
      safeCustomerText(reason.shift_type_label) || "this named shift";
    return `Employee already has ${label}.${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "availability") {
    if (reason.rule_kind === "shift_type") {
      return `${employeeSubject(reason)} is unavailable for ${
        safeCustomerText(reason.shift_type_label) || "this shift type"
      }${dateEvidence(reason)}.${targetEvidence(reason)}`.trim();
    }
    if (reason.rule_kind === "all_day") {
      return `${employeeSubject(reason)} is unavailable all day${dateEvidence(reason)}.${targetEvidence(reason)}`.trim();
    }
    if (reason.rule_kind === "bucket") {
      return `${employeeSubject(reason)} is unavailable for ${
        safeCustomerText(reason.bucket) || "this period"
      }${dateEvidence(reason)}.${targetEvidence(reason)}`.trim();
    }
    if (reason.rule_kind !== "time_range" && looseMessage) return looseMessage;
    if (reason.rule_kind !== "time_range") {
      return `${employeeSubject(reason)} is unavailable for this shift${dateEvidence(reason)}.${targetEvidence(reason)}`.trim();
    }
    const startTime = safeCustomerText(reason.start_time);
    const endTime = safeCustomerText(reason.end_time);
    if (!startTime || !endTime) {
      return `${employeeSubject(reason)} is unavailable for this shift${dateEvidence(reason)}.${targetEvidence(reason)}`.trim();
    }
    return `${withPeriod(
      `${employeeSubject(reason)} is unavailable ${startTime}-${endTime}${dateEvidence(reason)}`,
    )}${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "time_off") {
    const date = safeCustomerText(reason.date) || "this shift";
    if (reason.full_day) {
      return `Approved time off covers ${date}.${targetEvidence(reason)}`.trim();
    }
    const startTime = safeCustomerText(reason.start_time);
    const endTime = safeCustomerText(reason.end_time);
    return `${withPeriod(
      `Approved time off covers ${date} ${startTime}-${endTime}`.trim(),
    )}${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "named_duplicate") {
    return `Employee already has ${
      safeCustomerText(reason.shift_type_label) || "this named shift"
    }.${targetEvidence(reason)}`.trim();
  }

  if (reason.type === "closed_day") {
    if (reason.scope === "all_day") {
      const closureReason = safeCustomerText(reason.reason);
      const base = closureReason
        ? `Location is closed: ${closureReason}.`
        : "Location is closed all day.";
      return `${base}${targetEvidence(reason)}`.trim();
    }
    return `Location is closed for ${
      safeCustomerText(reason.shift_type_label) || "this shift type"
    }.${targetEvidence(reason)}`.trim();
  }

  return looseMessage ?? "Scheduling policy blocks this assignment.";
}

export function formatScheduleConflictMessages(
  reasons: readonly ScheduleConflictReason[],
): string[] {
  return reasons
    .map((reason) => formatScheduleConflictMessage(reason).trim())
    .filter((message) => message.length > 0);
}

export function evaluateScheduleShiftConflicts(
  model: ScheduleReadModel,
  shifts: readonly ScheduleShift[],
  input: ScheduleShiftMutationInput,
  excludeShiftId: string | null = null,
): ScheduleConflictReason[] {
  if (input.start_time === input.end_time) {
    return ["Start and end time cannot be the same."];
  }
  const context = {
    employee_name:
      model.employees.find((candidate) => candidate.id === input.employee_id)
        ?.display_name ?? null,
    date: input.scheduled_date,
    job_name:
      model.jobs.find((job) => job.id === input.job_id)?.name ?? "Unknown job",
    location_name:
      model.locations.find((location) => location.id === input.location_id)
        ?.name ?? "Unknown location",
    shift_type_label:
      model.shift_types.find(
        (shiftType) => shiftType.id === input.shift_type_id,
      )?.name ?? null,
  };
  const reasons: ScheduleConflictReason[] = [];

  const matchingClosures = model.closures.filter(
    (candidate) =>
      candidate.location_id === input.location_id &&
      scheduleClosureCoversDate(candidate, input.scheduled_date),
  );
  const allDayClosure = matchingClosures.find(
    (candidate) => candidate.is_all_day,
  );
  if (allDayClosure) {
    reasons.push({
      ...context,
      type: "closed_day",
      scope: "all_day",
      reason: allDayClosure.title,
    });
  } else if (
    input.shift_type_id &&
    matchingClosures.some((candidate) =>
      candidate.shift_type_ids.includes(input.shift_type_id!),
    )
  ) {
    reasons.push({
      ...context,
      type: "closed_day",
      scope: "shift_type",
    });
  }

  if (input.employee_id === null) return reasons;
  const employee = model.employees.find(
    (candidate) => candidate.id === input.employee_id,
  );
  if (!employee) return ["Employee not found"];

  if (employee.is_excluded_from_schedule) {
    reasons.push({
      ...context,
      type: "employee_excluded",
    });
  }

  if (!employee.location_ids.includes(input.location_id)) {
    reasons.push({
      ...context,
      type: "location_assignment",
    });
  }
  if (!employee.job_ids.includes(input.job_id)) {
    reasons.push({
      ...context,
      type: "job_assignment",
    });
  }
  if (
    input.shift_type_id &&
    (employee.shift_type_ids ?? []).length > 0 &&
    !employee.shift_type_ids?.includes(input.shift_type_id)
  ) {
    reasons.push({
      ...context,
      type: "shift_type_assignment",
    });
  }

  const availability = employee.availability?.find(
    (day) => day.day === dayOfWeek(input.scheduled_date),
  );
  if (availability?.mode === "unavailable") {
    reasons.push({
      ...context,
      type: "availability",
      rule_kind: "all_day",
    });
  } else if (
    availability?.mode === "windows" &&
    !availability.windows.some((window) =>
      intervalContains(
        window.start,
        window.end,
        input.start_time,
        input.end_time,
      ),
    )
  ) {
    reasons.push({
      ...context,
      type: "availability",
      rule_kind: "time_range",
      start_time: input.start_time,
      end_time: input.end_time,
    });
  }

  const duplicateNamedShift = shifts.find(
    (shift) =>
      shift.id !== excludeShiftId &&
      shift.employee_id === input.employee_id &&
      shift.scheduled_date === input.scheduled_date &&
      input.shift_type_id !== null &&
      shift.shift_type_id === input.shift_type_id,
  );
  if (duplicateNamedShift) {
    reasons.push({
      ...context,
      type: "named_duplicate",
      conflicting_shift_id: duplicateNamedShift.id,
    });
  }

  const overlapping = shifts.filter(
    (shift) =>
      shift.id !== excludeShiftId &&
      shift.employee_id === input.employee_id &&
      !input.hide_time_on_badge &&
      !shift.hide_time_on_badge &&
      absoluteIntervalsOverlap(shift, input),
  );
  if (overlapping.length > 0) {
    reasons.push({
      ...context,
      type: "time_overlap",
      conflicting_shifts: overlapping.map((shift) => ({
        id: shift.id,
        start_time: shift.start_time,
        end_time: shift.end_time,
        shift_type_label:
          model.shift_types.find((type) => type.id === shift.shift_type_id)
            ?.name ?? null,
        location_name:
          model.locations.find((location) => location.id === shift.location_id)
            ?.name ?? "Unknown location",
      })),
    });
  }

  return reasons;
}

function scheduleClosureCoversDate(
  closure: ScheduleReadModel["closures"][number],
  date: string,
): boolean {
  const endDate = closure.end_date ?? closure.closed_date;
  return closure.closed_date <= date && date <= endDate;
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function intervalContains(
  windowStart: string,
  windowEnd: string,
  shiftStart: string,
  shiftEnd: string,
): boolean {
  const window = clockInterval(windowStart, windowEnd, 0);
  const shift = clockInterval(shiftStart, shiftEnd, 0);
  return window.start <= shift.start && window.end >= shift.end;
}

function absoluteIntervalsOverlap(
  shift: ScheduleShift,
  input: ScheduleShiftMutationInput,
): boolean {
  const first = datedInterval(
    shift.scheduled_date,
    shift.start_time,
    shift.end_time,
  );
  const second = datedInterval(
    input.scheduled_date,
    input.start_time,
    input.end_time,
  );
  return first.start < second.end && second.start < first.end;
}

function datedInterval(date: string, start: string, end: string) {
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return clockInterval(start, end, day * 1_440);
}

function clockInterval(start: string, end: string, offset: number) {
  const startMinutes = offset + timeMinutes(start);
  let endMinutes = offset + timeMinutes(end);
  if (endMinutes <= startMinutes) endMinutes += 1_440;
  return { start: startMinutes, end: endMinutes };
}

function timeMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}
