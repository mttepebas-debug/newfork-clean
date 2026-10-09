import type { ScheduleEditableShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";
import { preflightReturnSearch, preflightReturnShift } from "./schedulePreflightReturn";
import { requestErrorText } from "../../lib/request-error";

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}

const shift: ScheduleEditableShift = {
  id: "shift-1", location_id: "loc-1", employee_id: "emp-1", job_id: "job-1", shift_type_id: "type-1",
  scheduled_date: "2026-09-18", start_time: "18:00", end_time: "22:00", crosses_midnight: false,
  unpaid_break_minutes: 0, hide_time_on_badge: false, note: "Unsaved note", warning_codes: [], revision: 3,
};

describe("preflight return", () => {
  it("preserves compatible filters and presentation settings without mutating the URL input", () => {
    const search = new URLSearchParams("mode=preview&locations=loc-1,loc-2&jobs=job-1&employees=emp-1&shiftTypes=type-1&layout=unified&hideUnscheduled=true&date=2026-09-14");
    const before = search.toString();
    const next = preflightReturnSearch(search, shift, "draft-1");
    expect(search.toString()).toBe(before);
    expect(next.get("mode")).toBe("edit");
    expect(next.get("draft")).toBe("draft-1");
    for (const key of ["locations", "jobs", "employees", "shiftTypes", "layout", "hideUnscheduled", "date"]) expect(next.get(key)).toBe(search.get(key));
  });
  it("removes only filters that hide the target", () => {
    const next = preflightReturnSearch(new URLSearchParams("locations=loc-2&jobs=job-1&employees=emp-2&shiftTypes=type-2&layout=separate"), shift, "draft-1");
    for (const key of ["locations", "employees", "shiftTypes"]) expect(next.has(key)).toBe(false);
    expect(next.get("jobs")).toBe("job-1");
    expect(next.get("layout")).toBe("separate");
  });
  it("moves day view to the target date without switching the view", () => {
    const next = preflightReturnSearch(new URLSearchParams("view=day&date=2026-09-14"), shift, "draft-1");
    expect(next.get("view")).toBe("day");
    expect(next.get("date")).toBe(shift.scheduled_date);
  });
  it("reveals a custom shift hidden by a named-type filter", () => {
    expect(preflightReturnSearch(new URLSearchParams("shiftTypes=type-1"), { ...shift, shift_type_id: null }, "draft-1").has("shiftTypes")).toBe(false);
  });
  it("returns the existing dirty shift object without replacing its state", () => {
    const session = { source_draft_id: "draft-1", shifts: [shift] };
    expect(preflightReturnShift(session, "draft-1", [shift.id])).toBe(shift);
    expect(session.shifts[0]!.note).toBe("Unsaved note");
  });
  it("does not replace a different open draft", () => {
    expect(() => preflightReturnShift({ source_draft_id: "draft-2", shifts: [shift] }, "draft-1", [shift.id])).toThrow("Save or close your current draft");
    // BL-395: the sentence reaches the Publish window, not a generic one.
    expect(requestErrorText(thrown(() => preflightReturnShift({ source_draft_id: "draft-2", shifts: [shift] }, "draft-1", [shift.id]))))
      .toBe("Save or close your current draft before opening another draft.");
  });
  it("reports a removed target instead of choosing another shift", () => {
    expect(() => preflightReturnShift({ source_draft_id: "draft-1", shifts: [shift] }, "draft-1", ["deleted-shift"])).toThrow("no longer in the draft");
    expect(requestErrorText(thrown(() => preflightReturnShift({ source_draft_id: "draft-1", shifts: [shift] }, "draft-1", ["deleted-shift"]))))
      .toMatch(/no longer in the draft/);
  });
});
