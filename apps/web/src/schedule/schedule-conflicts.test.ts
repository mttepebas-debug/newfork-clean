import { describe, expect, it } from "vitest";
import type {
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import {
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

  it("blocks shifts inside a multi-day all-day closure range", () => {
    const messages = formatScheduleConflictMessages(
      evaluateScheduleShiftConflicts(
        {
          ...model,
          closures: [
            {
              id: "66000000-0000-4000-8000-000000000001",
              location_id: locationId,
              closed_date: "2026-08-18",
              end_date: "2026-08-20",
              title: "Renovation",
              is_all_day: true,
              shift_type_ids: [],
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

  it("blocks shifts for partial closures scoped to the selected shift type", () => {
    const partialClosure = {
      id: "66000000-0000-4000-8000-000000000002",
      location_id: locationId,
      closed_date: "2026-08-19",
      end_date: null,
      title: "No dinner",
      is_all_day: false,
      shift_type_ids: [shiftTypeId],
    };
    expect(
      formatScheduleConflictMessages(
        evaluateScheduleShiftConflicts(
          { ...model, closures: [partialClosure] },
          [],
          input({ employee_id: null, shift_type_id: shiftTypeId }),
        ),
      ),
    ).toContain(
      "Location is closed for Dinner. Requested: Dinner / Server at Dining Room.",
    );
    expect(
      evaluateScheduleShiftConflicts(
        { ...model, closures: [partialClosure] },
        [],
        input({ employee_id: null, shift_type_id: otherShiftTypeId }),
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
