import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  evaluateSchedulePresetDropTarget,
  evaluateScheduleShiftGroupDropTarget,
  evaluateScheduleShiftDropTarget,
  formatScheduleDragShiftLabel,
} from "./useScheduleGridDragControllers";

const locationId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const shiftTypeId = "44444444-4444-4444-8444-444444444444";
const shiftId = "55555555-5555-4555-8555-555555555555";
const secondShiftId = "77777777-7777-4777-8777-777777777779";

const shift: ScheduleEditableShift = {
  id: shiftId,
  revision: 1,
  location_id: locationId,
  employee_id: employeeId,
  job_id: jobId,
  shift_type_id: shiftTypeId,
  scheduled_date: "2026-08-17",
  start_time: "09:00",
  end_time: "17:30",
  crosses_midnight: false,
  unpaid_break_minutes: 30,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "",
  warning_codes: [],
};

const model: ScheduleReadModel = {
  workspace_id: "66666666-6666-4666-8666-666666666666",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: { time_format: "12h", conflict_rules: { approved_time_off: "block", closed_location: "block", minimum_travel: "confirm", minimum_rest: "confirm" } },
  locations: [
    {
      id: locationId,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: null,
    },
  ],
  departments: [],
  jobs: [
    {
      id: jobId,
      name: "Server",
      color: "#2563eb",
      sort_order: 0,
      department_id: null,
      system_key: null,
    },
  ],
  shift_types: [
    {
      id: shiftTypeId,
      name: "Dinner",
      color: "#7c3aed",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
  ],
  employees: [
    {
      id: employeeId,
      employee_code: "A100",
      display_name: "Alex Morgan",
      location_ids: [locationId],
      job_ids: [jobId],
      primary_job_id: jobId,
    },
  ],
  shifts: [shift],
  closures: [],
  important_dates: [],
};
// The employee is unavailable all of Tuesday 2026-08-18 at Main Dining.
const unavailable: ScheduleReadModel = { ...model, employees: model.employees.map(employee => ({ ...employee,
  weekly_availability: [{
    location_id: locationId, location_name: "Main Dining", timezone: "America/Los_Angeles", week_start: model.week_start, status: "ready",
    unavailable_intervals: [{ start_at: "2026-08-18T07:00:00Z", end_at: "2026-08-19T07:00:00Z" }], leave_intervals: [],
    clock_segments: [{ start_at: "2026-08-17T07:00:00Z", end_at: "2026-08-24T07:00:00Z", offset_seconds: -25200 }],
    days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${17 + index}`, has_unavailable: index === 1, all_day: index === 1 })),
  }],
})) };

describe("useScheduleGridDragControllers helpers", () => {
  it("keeps an unavailable preset selectable and colors its drop orange", () => {
    expect(evaluateSchedulePresetDropTarget({ model: unavailable, useDefaultTimesForScheduling: true,
      target: { locationId, employeeId, jobId, shiftTypeId, label: "Dinner", color: "#2563eb", date: "2026-08-18", startTime: "16:00", endTime: "22:00" },
    })).toMatchObject({ allowed: true, targetStatus: "warning" });
  });
  it("marks unavailable hours as an allowed orange drop, not a hard blocker", () => {
    const target = { shiftId, locationId, employeeId, date: "2026-08-18", copy: false };
    expect(evaluateScheduleShiftDropTarget({ model: unavailable, shift, target })).toMatchObject({ allowed: true, targetStatus: "warning" });
    const excluded = { ...unavailable, employees: unavailable.employees.map(employee => ({ ...employee, is_excluded_from_schedule: true })) };
    expect(evaluateScheduleShiftDropTarget({ model: excluded, shift, target })).toMatchObject({ allowed: false, targetStatus: "blocked" });
  });
  it("formats the reference drag preview label", () => {
    expect(formatScheduleDragShiftLabel(model, shift)).toBe(
      "Server, 9:00 AM - 5:30 PM",
    );
    expect(formatScheduleDragShiftLabel(model, undefined)).toBe("Shift");
  });

  it("blocks dropping a moved shift on its current cell", () => {
    expect(
      evaluateScheduleShiftDropTarget({
        model,
        shift,
        target: {
          shiftId,
          locationId,
          employeeId,
          date: "2026-08-17",
          copy: false,
        },
      }),
    ).toEqual({
      allowed: false,
      reason: "Drop on a different cell to move the shift.",
      targetStatus: "blocked",
    });
  });

  it("allows moving the shift to a different date", () => {
    expect(
      evaluateScheduleShiftDropTarget({
        model,
        shift,
        target: {
          shiftId,
          locationId,
          employeeId,
          date: "2026-08-18",
          copy: false,
        },
      }),
    ).toMatchObject({ allowed: true, targetStatus: "warning" });
  });

  it("allows a group target when the projected group is valid", () => {
    const secondShift: ScheduleEditableShift = {
      ...shift,
      id: secondShiftId,
      scheduled_date: "2026-08-18",
    };
    const groupModel = { ...model, shifts: [shift, secondShift] };

    const evaluation = evaluateScheduleShiftGroupDropTarget({
      model: groupModel,
      shifts: [shift, secondShift],
      targets: [
        {
          shiftId,
          locationId,
          employeeId,
          date: "2026-08-18",
          copy: false,
        },
        {
          shiftId: secondShiftId,
          locationId,
          employeeId,
          date: "2026-08-19",
          copy: false,
        },
      ],
    });

    expect(evaluation.allowed).toBe(true);
    expect(evaluation.targetStatus).toBe("warning");
    expect(evaluation.members.map((member) => member.targetStatus)).toEqual([
      "warning",
      "warning",
    ]);
  });

  it("blocks the whole group when one projected member is blocked", () => {
    const secondShift: ScheduleEditableShift = {
      ...shift,
      id: secondShiftId,
      scheduled_date: "2026-08-18",
    };
    const groupModel: ScheduleReadModel = {
      ...model,
      shifts: [shift, secondShift],
      closures: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          location_id: locationId,
          closed_date: "2026-08-19",
          end_date: null,
          title: "Closed",
          is_all_day: true,
          shift_type_ids: [],
        },
      ],
    };

    const evaluation = evaluateScheduleShiftGroupDropTarget({
      model: groupModel,
      shifts: [shift, secondShift],
      targets: [
        {
          shiftId,
          locationId,
          employeeId,
          date: "2026-08-18",
          copy: false,
        },
        {
          shiftId: secondShiftId,
          locationId,
          employeeId,
          date: "2026-08-19",
          copy: false,
        },
      ],
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.targetStatus).toBe("blocked");
    expect(evaluation.reason).toBe(
      "Location is closed: Closed. Requested: Dinner / Server at Main Dining.",
    );
    expect(evaluation.members.map((member) => member.targetStatus)).toEqual([
      "warning",
      "blocked",
    ]);
  });

  it("blocks a group when projected members conflict with each other", () => {
    const secondShift: ScheduleEditableShift = {
      ...shift,
      id: secondShiftId,
      scheduled_date: "2026-08-18",
    };
    const groupModel = { ...model, shifts: [shift, secondShift] };

    const evaluation = evaluateScheduleShiftGroupDropTarget({
      model: groupModel,
      shifts: [shift, secondShift],
      targets: [
        {
          shiftId,
          locationId,
          employeeId,
          date: "2026-08-19",
          copy: false,
        },
        {
          shiftId: secondShiftId,
          locationId,
          employeeId,
          date: "2026-08-19",
          copy: false,
        },
      ],
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.targetStatus).toBe("blocked");
    expect(evaluation.members.every((member) => !member.allowed)).toBe(true);
    expect(evaluation.messages).toEqual([
      "Alex Morgan already has Dinner 09:00-17:30 at Main Dining on 2026-08-19. Requested: Dinner / Server at Main Dining.",
    ]);
  });

  it("maps closed-location preset validation to blocked drop status", () => {
    expect(
      evaluateSchedulePresetDropTarget({
        model: {
          ...model,
          closures: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              location_id: locationId,
              closed_date: "2026-08-19",
              end_date: null,
              title: "Closed",
              is_all_day: true,
              shift_type_ids: [],
            },
          ],
        },
        target: {
          jobId,
          shiftTypeId,
          label: "Dinner-Server",
          color: "#7c3aed",
          startTime: "16:00",
          endTime: "22:00",
          employeeId,
          locationId,
          date: "2026-08-19",
        },
        useDefaultTimesForScheduling: true,
      }),
    ).toEqual({
      allowed: false,
      reason: "Location is closed: Closed. Requested: Dinner / Server at Main Dining.",
      targetStatus: "blocked",
    });
  });
});
