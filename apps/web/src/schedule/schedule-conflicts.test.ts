import { describe, expect, it } from "vitest";
import type {
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import {
  assessmentAvailabilityWarnings,
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessage,
  formatScheduleConflictMessages,
} from "./schedule-conflicts";

const locationId = "11000000-0000-4000-8000-000000000001";
const otherLocationId = "11000000-0000-4000-8000-000000000002";
const jobId = "33000000-0000-4000-8000-000000000001";
const otherJobId = "33000000-0000-4000-8000-000000000002";
const shiftTypeId = "22000000-0000-4000-8000-000000000001";
const otherShiftTypeId = "22000000-0000-4000-8000-000000000002";
const employeeId = "44000000-0000-4000-8000-000000000001";

const model = {
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  week_start: "2026-08-16",
  week_start_day: "sunday",
  settings: {
    time_format: "12h",
  },
  locations: [
    {
      id: locationId,
      name: "Dining Room",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "unpublished",
      published_at: null,
    },
    {
      id: otherLocationId,
      name: "Rooftop",
      timezone: "America/Los_Angeles",
      sort_order: 1,
      publication_status: "unpublished",
      published_at: null,
    },
  ],
  departments: [],
  jobs: [
    {
      id: jobId,
      name: "Server",
      color: "#112233",
      
      department_id: null,
      system_key: null,
    },
    {
      id: otherJobId,
      name: "Bartender",
      color: "#223344",
      
      department_id: null,
      system_key: null,
    },
  ],
  shift_types: [
    {
      id: shiftTypeId,
      name: "Dinner",
      color: "#445566",
      default_start_time: "16:00",
      default_end_time: "20:00",
      sort_order: 0,
    },
    {
      id: otherShiftTypeId,
      name: "Lunch",
      color: "#556677",
      default_start_time: "11:00",
      default_end_time: "15:00",
      sort_order: 1,
    },
  ],
  shift_labels: [],
  employees: [
    {
      id: employeeId,
      employee_code: "E-1",
      display_name: "Ada Lovelace",
      location_ids: [locationId],
      job_ids: [jobId],
    },
  ],
  shifts: [
    {
      id: "55000000-0000-4000-8000-000000000001",
      location_id: locationId,
      employee_id: employeeId,
      job_id: jobId,
      shift_type_id: null,
      scheduled_date: "2026-08-19",
      start_time: "09:00",
      end_time: "17:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      note: "",
      warning_codes: [],
    },
  ],
  referenced_jobs: [],
  referenced_shift_types: [],
  closures: [],
  important_dates: [],
} satisfies ScheduleReadModel;

function input(
  patch: Partial<ScheduleShiftMutationInput> = {},
): ScheduleShiftMutationInput {
  return {
    location_id: locationId,
    employee_id: employeeId,
    job_id: jobId,
    shift_type_id: null,
    scheduled_date: "2026-08-19",
    start_time: "16:00",
    end_time: "20:00",
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: [],
    note: "",
    ...patch,
  };
}

describe("schedule conflict port", () => {
  it("blocks explicit and reference-hour overlaps regardless of badge display", () => {
    expect(evaluateScheduleShiftConflicts(model, model.shifts, input({ time_basis: "explicit", hide_time_on_badge: true })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: "time_overlap" })]));
    expect(evaluateScheduleShiftConflicts(model, model.shifts, input({ time_basis: "type_default", hide_time_on_badge: true })))
      .toEqual(expect.arrayContaining([expect.objectContaining({ type: "reference_time_overlap", severity: "block" })]));
  });
  it("does not invent an interval conflict before hours are entered", () => {
    const reasons = evaluateScheduleShiftConflicts(model, [], input({ shift_type_id: shiftTypeId,
      scheduled_date: "2026-08-16", start_time: "", end_time: "" }));
    expect(reasons).toEqual([]);
  });
  it("formats named duplicate summaries returned by the local evaluator", () => {
    expect(
      formatScheduleConflictMessage({
        type: "named_duplicate",
        employee_name: "Ada Lovelace",
        shift_type_label: "Dinner",
        location_name: "Dining Room",
        job_name: "Server",
        date: "2026-08-18",
      }),
    ).toBe("Employee already has Dinner. Requested: Dinner / Server at Dining Room.");
  });

  it("pinpoints overlapping shifts with employee, time, date, and location", () => {
    const messages = formatScheduleConflictMessages(
      evaluateScheduleShiftConflicts(model, model.shifts, input()),
    );
    expect(messages).toContain(
      "Ada Lovelace already has a shift 09:00-17:00 at Dining Room on 2026-08-19. Requested: Server at Dining Room.",
    );
  });

  it("names an archived shift type on the shift it overlaps", () => {
    const archivedTypeId = "22000000-0000-4000-8000-000000000009";
    const withArchived = {
      ...model,
      shifts: [{ ...model.shifts[0]!, shift_type_id: archivedTypeId }],
      referenced_shift_types: [{ id: archivedTypeId, name: "Brunch" }],
    } satisfies ScheduleReadModel;
    expect(formatScheduleConflictMessages(
      evaluateScheduleShiftConflicts(withArchived, withArchived.shifts, input()),
    )).toContain(
      "Ada Lovelace already has Brunch 09:00-17:00 at Dining Room on 2026-08-19. Requested: Server at Dining Room.",
    );
  });

  it("pinpoints location and job assignment blocks independently", () => {
    expect(
      formatScheduleConflictMessages(
        evaluateScheduleShiftConflicts(
          model,
          [],
          input({ location_id: otherLocationId, job_id: otherJobId }),
        ),
      ),
    ).toEqual([
      "Ada Lovelace is not assigned to Rooftop. Requested: Bartender at Rooftop.",
      "Ada Lovelace is not assigned to Bartender. Requested: Bartender at Rooftop.",
    ]);
  });

  it("blocks employees from shift types they are not eligible for", () => {
    const messages = formatScheduleConflictMessages(
      evaluateScheduleShiftConflicts(
        {
          ...model,
          employees: [
            {
              ...model.employees[0]!,
              shift_type_ids: [shiftTypeId],
            },
          ],
        },
        [],
        input({ shift_type_id: otherShiftTypeId }),
      ),
    );

    expect(messages).toContain(
      "Ada Lovelace is not eligible for this shift type. Requested: Lunch / Server at Dining Room.",
    );
  });

  it("blocks employees excluded from schedule", () => {
    const messages = formatScheduleConflictMessages(
      evaluateScheduleShiftConflicts(
        {
          ...model,
          employees: [
            {
              ...model.employees[0]!,
              is_excluded_from_schedule: true,
            },
          ],
        },
        [],
        input(),
      ),
    );

    expect(messages).toContain(
      "This employee is excluded from schedule. Requested: Server at Dining Room.",
    );
  });

  it("asks on a closed day set to confirm once, as a confirmation (K17)", () => {
    const reasons = evaluateScheduleShiftConflicts(
      {
        ...model,
        settings: {
          ...model.settings,
          conflict_rules: {
            approved_time_off: "block", closed_location: "confirm_once", minimum_travel: "confirm", minimum_rest: "confirm",
          },
        },
        closures: [{
          id: "66000000-0000-4000-8000-000000000002", location_id: locationId, closed_date: "2026-08-19",
          title: "Inventory", is_all_day: true, kind: "closed", opens: null, closes: null, status: "published",
        }],
      } as ScheduleReadModel,
      [],
      input({ scheduled_date: "2026-08-19" }),
    );
    expect(reasons).toEqual(expect.arrayContaining([expect.objectContaining({ type: "closed_day", severity: "confirm" })]));
  });

  it("blocks shifts on a closed day", () => {
    const messages = formatScheduleConflictMessages(
      evaluateScheduleShiftConflicts(
        {
          ...model,
          closures: [
            {
              id: "66000000-0000-4000-8000-000000000001",
              location_id: locationId,
              closed_date: "2026-08-19",
              title: "Renovation",
              is_all_day: true,
              kind: "closed",
              opens: null,
              closes: null,
              status: "published",
            },
          ],
        },
        [],
        input({ scheduled_date: "2026-08-19" }),
      ),
    );
    expect(messages).toContain(
      "Location is closed: Renovation. Requested: Server at Dining Room.",
    );
  });

  it("asks for shifts that run past a location's short hours, past midnight too (EKRAN-08)", () => {
    const day = {
      id: "66000000-0000-4000-8000-000000000002",
      location_id: locationId,
      closed_date: "2026-08-19",
      is_all_day: false,
      kind: "short" as const,
    };
    const short = { ...day, title: "Christmas Eve", opens: "10:00", closes: "15:00", status: "published" as const };
    const late = { ...day, title: "Late night", opens: "17:00", closes: "02:00", status: "scheduled" as const };
    const check = (closure: typeof short | typeof late, start_time: string, end_time: string) =>
      formatScheduleConflictMessages(
        evaluateScheduleShiftConflicts(
          { ...model, closures: [closure] },
          [],
          input({ employee_id: null, scheduled_date: "2026-08-19", start_time, end_time }),
        ),
      );

    expect(check(short, "12:00", "18:00")).toEqual([
      "Location has short hours for Christmas Eve: open 10a–3p only. Requested: Server at Dining Room.",
    ]);
    expect(check(short, "10:00", "15:00")).toEqual([]);
    // A scheduled post's hours ask too: the shift would land on them.
    expect(check(late, "18:00", "01:30")).toEqual([]);
    expect(check(late, "16:00", "22:00")).toEqual([
      "Location has short hours for Late night: open 5p–2a only. Requested: Server at Dining Room.",
    ]);
    expect(
      evaluateScheduleShiftConflicts(
        { ...model, closures: [short] },
        [],
        input({ employee_id: null, scheduled_date: "2026-08-20", start_time: "16:00", end_time: "20:00" }),
      ),
    ).toEqual([]);
  });

  it("uses actual overlap instead of treating the same shift type as a conflict", () => {
    const existing = { ...model.shifts[0]!, shift_type_id: shiftTypeId, time_basis: "explicit" as const };
    const conflict = evaluateScheduleShiftConflicts(model, [existing], input({ shift_type_id: shiftTypeId, time_basis: "explicit" }));
    expect(conflict).toEqual(expect.arrayContaining([expect.objectContaining({ type: "time_overlap", severity: "block" })]));
    expect(conflict).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "named_duplicate" })]));
    const separate = evaluateScheduleShiftConflicts(model, [existing], input({ shift_type_id: shiftTypeId, time_basis: "explicit", start_time: "18:00", end_time: "20:00" }));
    expect(separate).not.toEqual(expect.arrayContaining([expect.objectContaining({ severity: "block" })]));
  });
  // Mert, 2026-10-12: a live shift removed while editing is on its way out;
  // a new shift over its hours is no conflict.
  it("never counts a shift removed while editing as an overlap", () => {
    const removed = { ...model.shifts[0]!, source_published_shift_id: "live-1", pending_op_type: "delete" as const };
    expect(evaluateScheduleShiftConflicts(model, [removed], input({ time_basis: "explicit" })))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "time_overlap" })]));
  });
  it("never measures rest or travel time from a shift removed while editing", () => {
    const rested = { ...model, settings: { ...model.settings, minimum_rest_minutes: 600, minimum_travel_minutes: 600 } };
    const earlier = { ...model.shifts[0]!, start_time: "09:00", end_time: "13:00", time_basis: "explicit" as const };
    const neighborTypes = (shifts: Parameters<typeof evaluateScheduleShiftConflicts>[1]) =>
      evaluateScheduleShiftConflicts(rested, shifts, input({ time_basis: "explicit" }))
        .map((reason) => (typeof reason === "string" ? reason : String(reason.type)))
        .filter((type) => ["minimum_rest", "minimum_travel", "assessment_unknown"].includes(type));
    expect(neighborTypes([earlier])).not.toEqual([]);
    const removed = { ...earlier, source_published_shift_id: "live-1", pending_op_type: "delete" as const };
    expect(neighborTypes([removed])).toEqual([]);
  });
  it("blocks zero-length clock ranges before assignment checks", () => {
    expect(
      formatScheduleConflictMessages(
        evaluateScheduleShiftConflicts(
          model,
          [],
          input({
            employee_id: null,
            start_time: "09:00",
            end_time: "09:00",
          }),
        ),
      ),
    ).toEqual(["Start and end time cannot be the same."]);
  });
});

// M8, M12: the server keeps availability and the note out of operation; the
// editor still warns for them on every write.
describe("availability warnings from the server's assessment", () => {
  const interval = { start_at: "2026-08-18T01:00:00Z", end_at: "2026-08-18T03:00:00Z" };
  it("returns the employee's mark and the note as warnings, whatever the operation", () => {
    const warnings = assessmentAvailabilityWarnings({
      operation: "allowed",
      reasons: [
        { code: "availability", message: "The assignment overlaps unavailable hours.", definite: true, severity: "warn", intervals: [interval] },
        { code: "note", message: "The assignment overlaps hours a manager noted for this person.", definite: true, severity: "warn", intervals: [interval] },
        { code: "minimum_rest", message: "There is not enough rest time between shifts.", definite: true, severity: "confirm" },
      ],
    });
    expect(warnings).toEqual([
      expect.objectContaining({ type: "availability", severity: "warn" }),
      expect.objectContaining({ type: "note", severity: "warn" }),
    ]);
    expect(formatScheduleConflictMessages(warnings)).toEqual([
      "The assignment overlaps unavailable hours.",
      "The assignment overlaps hours a manager noted for this person.",
    ]);
  });
  it("is empty without an assessment or without either reason", () => {
    expect(assessmentAvailabilityWarnings(null)).toEqual([]);
    expect(assessmentAvailabilityWarnings({ operation: "allowed", reasons: [] })).toEqual([]);
  });
  it("words approved time off with a readable day and hours (BL-611)", () => {
    expect(formatScheduleConflictMessage({ type: "time_off", date: "2026-10-06", full_day: true }))
      .toBe("Approved time off on Tue, Oct 6.");
    expect(formatScheduleConflictMessage({ type: "time_off", date: "2026-10-06", full_day: false, start_time: "09:00", end_time: "13:00" }))
      .toBe("Approved time off on Tue, Oct 6, 9:00 AM – 1:00 PM.");
    expect(formatScheduleConflictMessage({ type: "time_off", date: "2026-10-06", full_day: false }))
      .toBe("Approved time off on Tue, Oct 6.");
  });
  it("words a note with its text", () => {
    expect(formatScheduleConflictMessage({ type: "note", note: "School mornings" }))
      .toBe("A manager's note for this day: School mornings.");
    expect(formatScheduleConflictMessage({ type: "note", note: "" }))
      .toBe("The assignment overlaps hours a manager noted for this person.");
  });
});
