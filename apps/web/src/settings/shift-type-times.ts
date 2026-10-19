// PRESET-SAAT (KARARLAR S-183, variant A): the Edit shift type drawer shows a
// type's hours as rows, one of them primary. The primary row is saved as the
// type's default hours, the others, in their on-screen order, as its time
// options. Rows keep their place when another becomes primary, so nothing
// jumps while the drawer is open; reopened, the primary comes first.
import {
  SAME_START_END_TIME_MESSAGE,
  SHIFT_TYPE_TIME_OPTIONS_MAX,
  shiftTypeTimesRefusal,
  type ShiftTypeInput,
} from "@newfork/shared";

export interface TimeRow {
  readonly start: string;
  readonly end: string;
}

export interface TimeRows {
  readonly rows: readonly TimeRow[];
  readonly primary: number;
}

export const SHIFT_TYPE_TIME_ROWS_MAX = SHIFT_TYPE_TIME_OPTIONS_MAX + 1;

export function timeRowsOf(
  type: Pick<ShiftTypeInput, "default_start_time" | "default_end_time" | "time_options">,
): TimeRows {
  return {
    rows: [
      { start: type.default_start_time ?? "", end: type.default_end_time ?? "" },
      ...(type.time_options ?? []).map((option) => ({ start: option.start_time, end: option.end_time })),
    ],
    primary: 0,
  };
}

/** The draft the rows stand for: primary → default hours, the rest → time options. */
export function withTimeRows<T extends ShiftTypeInput>(draft: T, times: TimeRows): T {
  const primary = times.rows[times.primary] ?? { start: "", end: "" };
  return {
    ...draft,
    default_start_time: primary.start || null,
    default_end_time: primary.end || null,
    time_options: times.rows
      .filter((_, index) => index !== times.primary)
      .map((row) => ({ start_time: row.start, end_time: row.end })),
  };
}

export function makePrimary(times: TimeRows, index: number): TimeRows {
  return index >= 0 && index < times.rows.length ? { ...times, primary: index } : times;
}

export function addTimeRow(times: TimeRows): TimeRows {
  if (times.rows.length >= SHIFT_TYPE_TIME_ROWS_MAX) return times;
  return { ...times, rows: [...times.rows, { start: "", end: "" }] };
}

/** The last row stays; removing the primary hands it to the first row left. */
export function removeTimeRow(times: TimeRows, index: number): TimeRows {
  if (times.rows.length <= 1 || index < 0 || index >= times.rows.length) return times;
  const rows = times.rows.filter((_, at) => at !== index);
  const primary = index === times.primary ? 0 : times.primary > index ? times.primary - 1 : times.primary;
  return { rows, primary };
}

export function updateTimeRow(times: TimeRows, index: number, patch: Partial<TimeRow>): TimeRows {
  return { ...times, rows: times.rows.map((row, at) => (at === index ? { ...row, ...patch } : row)) };
}

/** The first row that keeps Save off, and why: incomplete, equal hours or a repeat. */
export function timeRowRefusal(times: TimeRows): { readonly row: number; readonly message: string } | null {
  const incomplete = times.rows.findIndex((row) => !row.start || !row.end);
  if (incomplete >= 0) return { row: incomplete, message: "Enter a start and an end time, or remove this time." };
  const primary = times.rows[times.primary]!;
  if (primary.start === primary.end) return { row: times.primary, message: SAME_START_END_TIME_MESSAGE };
  const refusal = shiftTypeTimesRefusal(withTimeRows({ name: "", color: "#000000", default_start_time: null, default_end_time: null, time_options: [] }, times));
  if (!refusal) return null;
  // Option k is the k-th row other than the primary.
  const row = refusal.index < times.primary ? refusal.index : refusal.index + 1;
  return { row, message: refusal.message };
}

/** "7h 15m" between two clock times; an end before the start runs past midnight. */
export function timeRowLength(row: TimeRow): string | null {
  if (!row.start || !row.end || row.start === row.end) return null;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const total = (minutes(row.end) - minutes(row.start) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
