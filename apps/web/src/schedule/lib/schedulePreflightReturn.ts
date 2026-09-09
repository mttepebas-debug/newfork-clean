import type { ScheduleEditSession, ScheduleShift } from "@newfork/shared/schedule";

export function preflightReturnSearch(search: URLSearchParams, shift: ScheduleShift, draftId: string): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set("mode", "edit");
  next.set("draft", draftId);
  if (next.get("view") === "day") next.set("date", shift.scheduled_date);
  for (const [key, target] of [
    ["locations", shift.location_id], ["jobs", shift.job_id],
    ["employees", shift.employee_id], ["shiftTypes", shift.shift_type_id],
  ] as const) {
    const selected = next.get(key)?.split(",").filter(Boolean) ?? [];
    if (selected.length && (!target || !selected.includes(target))) next.delete(key);
  }
  return next;
}

export function preflightReturnShift(session: Pick<ScheduleEditSession, "source_draft_id" | "shifts">, draftId: string, shiftIds: readonly string[]) {
  if (session.source_draft_id !== draftId) {
    throw new Error("Save or close your current draft before opening another draft.");
  }
  const shift = session.shifts.find((item) => shiftIds.includes(item.id));
  if (!shift) throw new Error("This shift is no longer in the draft. Refresh the pre-flight check.");
  return shift;
}
