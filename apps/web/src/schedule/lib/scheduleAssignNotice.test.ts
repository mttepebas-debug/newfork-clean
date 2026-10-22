import { describe, expect, it } from "vitest";
import type { ScheduleEmployee, ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { scheduleAssignNotice } from "./scheduleAssignNotice";

type Projection = NonNullable<ScheduleEmployee["weekly_availability"]>[number];

const loc = "ad425000-0000-4000-8000-000000000006";
const emp = "ad425000-0000-4000-8000-000000000004";
const job = "ad425000-0000-4000-8000-000000000009";
// Los Angeles in January: UTC-8 the whole week; Monday is 2035-01-15.
const afterSix = { start_at: "2035-01-16T02:00:00Z", end_at: "2035-01-16T08:00:00Z" };
const allMonday = { start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-16T08:00:00Z" };
const midday = { start_at: "2035-01-15T23:00:00Z", end_at: "2035-01-16T06:00:00Z" };
function projection(overrides: Partial<Projection> = {}): Projection {
  return {
    location_id: loc, location_name: "West", timezone: "America/Los_Angeles", week_start: "2035-01-15", status: "ready",
    unavailable_intervals: [], leave_intervals: [],
    clock_segments: [{ start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-23T08:00:00Z", offset_seconds: -28800 }],
    days: Array.from({ length: 7 }, (_, i) => ({ date: `2035-01-${15 + i}`, has_unavailable: i === 0, all_day: false })),
    ...overrides,
  } as Projection;
}
function modelWith(week: Projection): ScheduleReadModel {
  const employee = { id: emp, employee_code: "E-1", display_name: "Maria Lopez", location_ids: [loc], job_ids: [job], weekly_availability: [week] } as ScheduleEmployee;
  return { employees: [employee], settings: { time_format: "12h" } } as unknown as ScheduleReadModel;
}
const input = { employee_id: emp, location_id: loc, job_id: job, shift_type_id: null, scheduled_date: "2035-01-15",
  start_time: "18:00", end_time: "22:00", time_basis: "explicit", time_timezone: "America/Los_Angeles" } as ScheduleShiftMutationInput;

describe("the short notice after a shift lands on a preference (Müsaitlik tercih 3, M12)", () => {
  it("says nothing when the person is free and no note applies", () => {
    expect(scheduleAssignNotice(modelWith(projection()), [input], "add")).toBeNull();
  });

  it("names the person, the day and the hours they prefer not to work", () => {
    const model = modelWith(projection({ unavailable_intervals: [afterSix] }));
    expect(scheduleAssignNotice(model, [input], "add")).toEqual({
      title: "Shift added to Maria Lopez.",
      lines: ["Maria prefers not to work Mon after 6:00 PM."],
    });
  });

  it("says all day, or both clocks, as the week says it", () => {
    expect(scheduleAssignNotice(modelWith(projection({ unavailable_intervals: [allMonday] })), [input], "add")?.lines)
      .toEqual(["Maria prefers not to work Mon all day."]);
    expect(scheduleAssignNotice(modelWith(projection({ unavailable_intervals: [midday] })), [input], "add")?.lines)
      .toEqual(["Maria prefers not to work Mon 3:00 PM – 10:00 PM."]);
  });

  it("gives a manager's note its own line, cut short when long", () => {
    const long = "Picks up her kids from school every weekday, so evenings after six are really hard for her this term.";
    const model = modelWith(projection({ note_intervals: [afterSix], manager_notes: ["", long, "", "", "", "", ""] }));
    const notice = scheduleAssignNotice(model, [input], "add");
    expect(notice?.lines).toHaveLength(1);
    expect(notice?.lines[0]).toMatch(/^Manager note: Picks up her kids/);
    expect(notice?.lines[0]!.length).toBeLessThanOrEqual(94);
    expect(notice?.lines[0]).toMatch(/…$/);
  });

  it("shows the mark and the note together, the mark first", () => {
    const model = modelWith(projection({ unavailable_intervals: [afterSix], note_intervals: [afterSix], manager_notes: ["", "School run", "", "", "", "", ""] }));
    expect(scheduleAssignNotice(model, [input], "add")?.lines).toEqual([
      "Maria prefers not to work Mon after 6:00 PM.",
      "Manager note: School run",
    ]);
  });

  it("a note with hours but no words still says a note is there", () => {
    const model = modelWith(projection({ note_intervals: [afterSix], manager_notes: ["", "", "", "", "", "", ""] }));
    expect(scheduleAssignNotice(model, [input], "add")?.lines).toEqual(["Manager note for this day."]);
  });

  it("titles a move, a saved edit and several shifts in their own words", () => {
    const model = modelWith(projection({ unavailable_intervals: [afterSix] }));
    expect(scheduleAssignNotice(model, [input], "move")?.title).toBe("Shift moved to Maria Lopez.");
    expect(scheduleAssignNotice(model, [input], "save")?.title).toBe("Shift saved for Maria Lopez.");
    expect(scheduleAssignNotice(model, [input, input, input], "add")?.title).toBe("3 shifts added to Maria Lopez.");
  });

  it("an open shift has nobody to warn about", () => {
    const model = modelWith(projection({ unavailable_intervals: [afterSix] }));
    expect(scheduleAssignNotice(model, [{ ...input, employee_id: null }], "add")).toBeNull();
  });
});

// Time off rebuild D3b (KARARLAR S-239 (9)): a shift on time off waiting for an answer is written at once;
// the same short notice says so, behind the time-off-v2 flag. Nothing is asked.
describe("the short notice on time off waiting for an answer", () => {
  const waitingMonday = { start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-16T08:00:00Z" };
  const waitingMorning = { start_at: "2035-01-15T17:00:00Z", end_at: "2035-01-15T21:00:00Z" };

  it("names the person and the day", () => {
    const model = modelWith(projection({ pending_leave_intervals: [waitingMonday] }));
    expect(scheduleAssignNotice(model, [input], "add", { pendingTimeOff: true })).toEqual({
      title: "Shift added to Maria Lopez.",
      lines: ["Maria has time off waiting for an answer on Mon, Jan 15."],
    });
  });

  it("comes after the preference line", () => {
    const model = modelWith(projection({ unavailable_intervals: [afterSix], pending_leave_intervals: [waitingMonday] }));
    expect(scheduleAssignNotice(model, [input], "add", { pendingTimeOff: true })?.lines).toEqual([
      "Maria prefers not to work Mon after 6:00 PM.",
      "Maria has time off waiting for an answer on Mon, Jan 15.",
    ]);
  });

  it("says nothing when the shift misses the hours asked", () => {
    const model = modelWith(projection({ pending_leave_intervals: [waitingMorning] }));
    expect(scheduleAssignNotice(model, [input], "add", { pendingTimeOff: true })).toBeNull();
    expect(scheduleAssignNotice(model, [{ ...input, start_time: "08:00", end_time: "12:00" }], "add", { pendingTimeOff: true })?.lines)
      .toEqual(["Maria has time off waiting for an answer on Mon, Jan 15."]);
  });

  it("says nothing with the flag off, as today", () => {
    const model = modelWith(projection({ pending_leave_intervals: [waitingMonday] }));
    expect(scheduleAssignNotice(model, [input], "add")).toBeNull();
    expect(scheduleAssignNotice(model, [input], "add", { pendingTimeOff: false })).toBeNull();
  });
});
