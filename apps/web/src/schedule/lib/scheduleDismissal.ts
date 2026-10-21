export interface ScheduleSearchDismissal {
  readonly search: URLSearchParams;
  readonly clearFocusedShift: boolean;
}

/** The top bar's filters, each one step of the Esc / blank-press cascade. */
const SCHEDULE_FILTER_KEYS = [
  "hideUnscheduled",
  "locations",
  "shiftTypes",
  "jobs",
  "employees",
  // The top bar search (S-228).
  "q",
] as const;
type ScheduleFilterKey = (typeof SCHEDULE_FILTER_KEYS)[number];

/** A shift badge's focus writes these together; they go back together. */
const FOCUSED_SHIFT_KEYS = ["shiftTypes", "jobs", "employees"] as const;

function isScheduleFilterKey(key: string): key is ScheduleFilterKey {
  return (SCHEDULE_FILTER_KEYS as readonly string[]).includes(key);
}

/**
 * Sets or clears one filter so that it becomes the newest one: the address
 * keeps the order filters were applied in, and the cascade undoes the newest
 * first (Mert, 2026-10-12: "filtreleri kademeli bir şekilde iptal eder").
 */
export function withScheduleSearchValue(
  search: URLSearchParams,
  key: string,
  value: string | null,
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete(key);
  if (value) next.set(key, value);
  return next;
}

/** The filter applied last, or null when no top bar filter is on. */
export function newestScheduleFilterKey(
  search: URLSearchParams,
): ScheduleFilterKey | null {
  let newest: ScheduleFilterKey | null = null;
  for (const key of search.keys()) {
    if (!isScheduleFilterKey(key)) continue;
    if (key === "hideUnscheduled" && search.get(key) !== "true") continue;
    newest = key;
  }
  return newest;
}

export function dismissNextScheduleSearchLayer({
  search,
  modelWeekStart,
  currentWeekStart,
  today,
  focusedShift = false,
}: {
  readonly search: URLSearchParams;
  readonly modelWeekStart: string;
  readonly currentWeekStart: string;
  readonly today: string;
  /** A badge is focused: its shift type and job filters are one step. */
  readonly focusedShift?: boolean;
}): ScheduleSearchDismissal | null {
  const next = new URLSearchParams(search);

  const newest = newestScheduleFilterKey(next);
  if (newest) {
    const focusStep =
      focusedShift && (newest === "shiftTypes" || newest === "jobs");
    if (focusStep) FOCUSED_SHIFT_KEYS.forEach((key) => next.delete(key));
    else next.delete(newest);
    // A filter added on top of a focus goes alone; the focus stays.
    return { search: next, clearFocusedShift: focusStep };
  }
  if (next.get("view") === "day") {
    next.set("view", "week");
    return { search: next, clearFocusedShift: false };
  }
  if (modelWeekStart !== currentWeekStart) {
    next.set("date", today);
    next.set("view", "week");
    return { search: next, clearFocusedShift: false };
  }
  return null;
}

export function clearFocusedShiftSearchFilters(
  search: URLSearchParams,
): URLSearchParams | null {
  const next = new URLSearchParams(search);
  const changed = FOCUSED_SHIFT_KEYS.some((key) => next.has(key));

  FOCUSED_SHIFT_KEYS.forEach((key) => next.delete(key));
  return changed ? next : null;
}
