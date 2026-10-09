export interface ScheduleSearchDismissal {
  readonly search: URLSearchParams;
  readonly clearFocusedShift: boolean;
}

export function dismissNextScheduleSearchLayer({
  search,
  modelWeekStart,
  currentWeekStart,
  today,
}: {
  readonly search: URLSearchParams;
  readonly modelWeekStart: string;
  readonly currentWeekStart: string;
  readonly today: string;
}): ScheduleSearchDismissal | null {
  const next = new URLSearchParams(search);

  if (next.get("hideUnscheduled") === "true") {
    next.delete("hideUnscheduled");
    return { search: next, clearFocusedShift: false };
  }
  if (next.has("shiftTypes") || next.has("jobs") || next.has("employees")) {
    ["shiftTypes", "jobs", "employees"].forEach((key) => next.delete(key));
    return { search: next, clearFocusedShift: true };
  }
  if (next.has("locations")) {
    next.delete("locations");
    return { search: next, clearFocusedShift: false };
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
  const keys = ["shiftTypes", "jobs", "employees"] as const;
  const changed = keys.some((key) => next.has(key));

  keys.forEach((key) => next.delete(key));
  return changed ? next : null;
}
