import type { PersonalTimeFormat } from "@newfork/shared";

export type TimeFormat = "12h" | "24h";

/**
 * The format a person types times in: their own 12h/24h choice from
 * Account → Preferences, or the workspace's Schedule setting when they left
 * it on "System" (BL-055).
 */
export function resolveTimeInputFormat(
  personal: PersonalTimeFormat | null | undefined,
  workspace: TimeFormat,
): TimeFormat {
  return personal === "12h" || personal === "24h" ? personal : workspace;
}

export type TimePeriod = "AM" | "PM";

export interface ParseTimeInputOptions {
  readonly timeFormat: TimeFormat;
  readonly activePeriod?: TimePeriod;
}

export interface ParsedTimeInput {
  readonly canonical: string;
  readonly period: TimePeriod;
  readonly shouldAutoAdvance: boolean;
}

interface TimeParts {
  readonly hour: number;
  readonly minute: number;
  readonly digitCount: number;
  readonly hasColon: boolean;
  readonly hasPeriod: boolean;
  readonly isBareHour: boolean;
}

const PERIOD_PATTERN = /\s*([ap])(?:\.?\s*m\.?)?\s*$/i;
const TIME_DRAFT_ALLOWED_PATTERN = /^[\d: apm.]*$/i;

export function formatCanonicalTime(
  value: string | null | undefined,
  timeFormat: TimeFormat,
): string {
  if (!value) return "";
  const minutes = parseCanonicalTimeToMinutes(value);
  if (minutes === null) return value;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (timeFormat === "24h") {
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  const period: TimePeriod = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${pad2(displayHour)}:${pad2(minute)} ${period}`;
}

export function formatTimeRange(start: string, end: string, timeFormat: TimeFormat): string {
  return `${formatCanonicalTime(start, timeFormat)}–${formatCanonicalTime(end, timeFormat)}`;
}

export function parseCanonicalTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function getPeriodFromCanonical(value: string | null | undefined): TimePeriod {
  if (!value) return "AM";
  const minutes = parseCanonicalTimeToMinutes(value);
  if (minutes === null) return "AM";
  return minutes >= 12 * 60 ? "PM" : "AM";
}

export function getTimeInputPlaceholder(timeFormat: TimeFormat, period: TimePeriod = "AM"): string {
  return timeFormat === "24h" ? "17:30" : `09:00 ${period}`;
}

export function isTimeDraftTextAllowed(value: string, timeFormat: TimeFormat): boolean {
  if (value === "") return true;
  if (!TIME_DRAFT_ALLOWED_PATTERN.test(value)) return false;
  const normalized = normalizeDraftText(value);
  if (!normalized) return true;
  if ((normalized.match(/:/g) ?? []).length > 1) return false;

  const suffix = extractPeriodSuffix(normalized);
  const withoutPeriod = suffix ? normalized.replace(PERIOD_PATTERN, "").trim() : normalized;
  const digits = withoutPeriod.replace(/\D/g, "");
  if (digits.length > 4) return false;
  if (!digits && withoutPeriod.includes(":")) return true;

  if (withoutPeriod.includes(":")) {
    return isColonDraftAllowed(withoutPeriod, timeFormat, !!suffix);
  }
  return isCompactDraftAllowed(digits, timeFormat, !!suffix);
}

export function parseTimeInputValue(
  value: string,
  options: ParseTimeInputOptions,
): ParsedTimeInput | null {
  const raw = normalizeDraftText(value);
  if (!raw) return null;
  const periodSuffix = extractPeriodSuffix(raw);
  const periodFromSuffix = periodSuffix === "a" ? "AM" : periodSuffix === "p" ? "PM" : null;
  const withoutPeriod = periodSuffix ? raw.replace(PERIOD_PATTERN, "").trim() : raw;
  const parts = parseTimeParts(withoutPeriod, !!periodFromSuffix);
  if (!parts) return null;

  const period = resolvePeriod(
    parts,
    options.timeFormat,
    options.activePeriod ?? "AM",
    periodFromSuffix,
  );
  if (periodFromSuffix && (parts.hour < 1 || parts.hour > 12)) return null;
  if (parts.hour < 0 || parts.hour > 23 || parts.minute < 0 || parts.minute > 59) return null;

  const canonicalHour = periodFromSuffix
    ? toCanonicalHour(parts.hour, period)
    : shouldApplyActivePeriod(parts, options.timeFormat)
      ? toCanonicalHour(parts.hour, period)
      : parts.hour;

  if (canonicalHour < 0 || canonicalHour > 23) return null;

  return {
    canonical: `${pad2(canonicalHour)}:${pad2(parts.minute)}`,
    period: canonicalHour >= 12 ? "PM" : "AM",
    shouldAutoAdvance: shouldAutoAdvance(parts),
  };
}

export function normalizeTimeInputOnCommit(
  value: string,
  options: ParseTimeInputOptions,
): string | null {
  const parsed = parseTimeInputValue(value, options);
  return parsed?.canonical ?? null;
}

function normalizeDraftText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function extractPeriodSuffix(value: string): "a" | "p" | null {
  const match = PERIOD_PATTERN.exec(value);
  if (!match) return null;
  return match[1]!.toLowerCase() === "a" ? "a" : "p";
}

function parseTimeParts(value: string, hasPeriod: boolean): TimeParts | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return null;
    return {
      hour: Number(match[1]),
      minute: Number(match[2]),
      digitCount: `${match[1]}${match[2]}`.length,
      hasColon: true,
      hasPeriod,
      isBareHour: false,
    };
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!/^\d{1,4}$/.test(digits)) return null;
  if (digits.length <= 2) {
    const numeric = Number(digits);
    if (digits.length === 2 && numeric > 23 && Number(digits[1]) <= 5) {
      return {
        hour: Number(digits[0]),
        minute: Number(digits[1]) * 10,
        digitCount: digits.length,
        hasColon: false,
        hasPeriod,
        isBareHour: false,
      };
    }
    return {
      hour: numeric,
      minute: 0,
      digitCount: digits.length,
      hasColon: false,
      hasPeriod,
      isBareHour: true,
    };
  }
  if (digits.length === 3) {
    return {
      hour: Number(digits.slice(0, 1)),
      minute: Number(digits.slice(1)),
      digitCount: digits.length,
      hasColon: false,
      hasPeriod,
      isBareHour: false,
    };
  }
  return {
    hour: Number(digits.slice(0, 2)),
    minute: Number(digits.slice(2)),
    digitCount: digits.length,
    hasColon: false,
    hasPeriod,
    isBareHour: false,
  };
}

function resolvePeriod(
  parts: TimeParts,
  timeFormat: TimeFormat,
  activePeriod: TimePeriod,
  periodFromSuffix: TimePeriod | null,
): TimePeriod {
  if (periodFromSuffix) return periodFromSuffix;
  if (timeFormat === "12h" && parts.isBareHour && parts.hour >= 1 && parts.hour <= 12) {
    return activePeriod;
  }
  return parts.hour >= 12 ? "PM" : "AM";
}

function shouldApplyActivePeriod(parts: TimeParts, timeFormat: TimeFormat): boolean {
  return timeFormat === "12h" && parts.isBareHour && parts.hour >= 1 && parts.hour <= 12;
}

function toCanonicalHour(hour: number, period: TimePeriod): number {
  if (period === "AM") return hour % 12;
  return hour === 12 ? 12 : hour + 12;
}

function shouldAutoAdvance(parts: TimeParts): boolean {
  if (parts.hasPeriod) return true;
  if (parts.hasColon) return true;
  if (parts.digitCount >= 3) return true;
  return parts.hour >= 13;
}

function isColonDraftAllowed(value: string, timeFormat: TimeFormat, hasPeriod: boolean): boolean {
  const match = /^(\d{0,2})(?::(\d{0,2})?)?$/.exec(value);
  if (!match) return false;
  const hourText = match[1] ?? "";
  const minuteText = match[2] ?? "";
  if (hourText.length === 2) {
    const hour = Number(hourText);
    const maxHour = timeFormat === "12h" && hasPeriod ? 12 : 23;
    const minHour = timeFormat === "12h" && hasPeriod ? 1 : 0;
    if (hour < minHour || hour > maxHour) return false;
  }
  if (minuteText.length > 0 && Number(minuteText[0]) > 5) return false;
  if (minuteText.length === 2 && Number(minuteText) > 59) return false;
  return true;
}

function isCompactDraftAllowed(
  digits: string,
  timeFormat: TimeFormat,
  hasPeriod: boolean,
): boolean {
  if (!digits) return true;
  if (!/^\d{1,4}$/.test(digits)) return false;
  if (hasPeriod) {
    const hour = digits.length <= 2 ? Number(digits) : Number(digits.slice(0, -2));
    const minute = digits.length <= 2 ? 0 : Number(digits.slice(-2));
    return hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59;
  }
  if (digits.length <= 2) {
    const hour = Number(digits);
    if (hour >= 0 && hour <= 23) return true;
    return digits.length === 2 && Number(digits[0]) >= 1 && Number(digits[1]) <= 5;
  }
  if (digits.length === 3) {
    const minute = Number(digits.slice(1));
    return minute >= 0 && minute <= 59;
  }
  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2));
  const maxHour = timeFormat === "24h" ? 23 : 23;
  return hour >= 0 && hour <= maxHour && minute >= 0 && minute <= 59;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
