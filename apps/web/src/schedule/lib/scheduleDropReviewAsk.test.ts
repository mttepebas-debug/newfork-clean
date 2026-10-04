import { describe, expect, it } from "vitest";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import type { ScheduleEmployee, ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { scheduleDropReviewAsk } from "./scheduleDropReviewAsk";

const loc = "ad425000-0000-4000-8000-000000000006";
const emp = "ad425000-0000-4000-8000-000000000004";
const job = "ad425000-0000-4000-8000-000000000009";
const evening = [{ start_at: "2035-01-16T02:00:00Z", end_at: "2035-01-16T04:00:00Z" }];
const projection: NonNullable<ScheduleEmployee["weekly_availability"]>[number] = {
  location_id: loc, location_name: "West", timezone: "America/Los_Angeles", week_start: "2035-01-15", status: "ready",
  unavailable_intervals: [], note_intervals: evening, manager_notes: ["", "School mornings", "", "", "", "", ""],
  leave_intervals: [], clock_segments: [{ start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-23T08:00:00Z", offset_seconds: -28800 }],
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2035-01-${15 + i}`, has_unavailable: false, all_day: false })),
};
const employee = { id: emp, employee_code: "E-1", display_name: "Ayşe Kaya", location_ids: [loc], job_ids: [job], weekly_availability: [projection] } as ScheduleEmployee;
const model = { employees: [employee] } as unknown as ScheduleReadModel;
const input = { employee_id: emp, location_id: loc, job_id: job, shift_type_id: null, scheduled_date: "2035-01-15", start_time: "18:00", end_time: "20:00", time_basis: "explicit" } as ScheduleShiftMutationInput;
const mark = { code: "availability", message: "The assignment overlaps unavailable hours.", definite: true };
const note = { code: "note", message: "The assignment overlaps hours a manager noted for this person.", definite: true };
const assessed = (...reasons: ShiftAvailabilityAssessment["reasons"]) => ({ reasons } as ShiftAvailabilityAssessment);

describe("what a drop or paste asks before it writes (M8, M12, S2 B)", () => {
  it("a manager's note alone asks with the card under the target cell, in the note's words", () => {
    expect(scheduleDropReviewAsk(model, [input], [assessed(note)])).toEqual({
      kind: "note",
      cell: { locationId: loc, employeeId: emp, date: "2035-01-15" },
      employeeName: "Ayşe Kaya",
      text: "School mornings",
    });
  });

  it("the mark and the note on one shift ask in one box, two lines", () => {
    expect(scheduleDropReviewAsk(model, [input], [assessed(mark, note)])).toEqual({
      kind: "sheet",
      messages: ["The assignment overlaps unavailable hours.", "A manager's note for this day: School mornings."],
    });
  });

  it("another rule joins the same box, and a repeated line shows once", () => {
    const rest = { code: "minimum_rest", message: "There is not enough rest time between shifts.", definite: true };
    expect(scheduleDropReviewAsk(model, [input, input], [assessed(rest, mark), assessed(mark)])).toEqual({
      kind: "sheet",
      messages: ["There is not enough rest time between shifts.", "The assignment overlaps unavailable hours."],
    });
  });
});
