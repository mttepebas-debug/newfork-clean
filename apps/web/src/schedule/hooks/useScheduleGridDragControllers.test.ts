import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  evaluateSchedulePresetDropTarget,
  evaluateScheduleShiftDropTarget,
  formatScheduleDragShiftLabel,
} from "./useScheduleGridDragControllers";

const locationId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const shiftTypeId = "44444444-4444-4444-8444-444444444444";
const shiftId = "55555555-5555-4555-8555-555555555555";

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
  settings: { time_format: "12h" },
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
      availability: Array.from({ length: 7 }, (_, day) => ({
        day,
        mode: "unrestricted" as const,
        windows: [],
      })),
    },
  ],
  shifts: [shift],
  closures: [],
  important_dates: [],
};

describe("useScheduleGridDragControllers helpers", () => {
  it("formats the reference drag preview label", () => {
    expect(formatScheduleDragShiftLabel(model, shift)).toBe(
      "Server, 9a to 5:30p",
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
    ).toEqual({ allowed: true, targetStatus: "allowed" });
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
      reason: "Location is closed all day.",
      targetStatus: "blocked",
    });
  });
});
