import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  applyScheduleShiftTypeDefaults,
  buildScheduleShiftEditorInitialValue,
} from "./shiftEditorState";
import type { ShiftClipboardSnapshot } from "./shiftClipboard";

const model: ScheduleReadModel = {
  workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: { time_format: "12h" },
  locations: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: null,
    },
  ],
  departments: [],
  jobs: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Server",
      color: "#0f766e",
      sort_order: 0,
      department_id: null,
    },
  ],
  shift_types: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Dinner",
      color: "#f97316",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Clock off",
      color: "#64748b",
      sort_order: 1,
      default_start_time: null,
      default_end_time: null,
    },
  ],
  shift_labels: [],
  employees: [],
  shifts: [],
  closures: [],
  important_dates: [],
};

const editShift: ScheduleEditableShift = {
  id: "55555555-5555-4555-8555-555555555555",
  location_id: model.locations[0]!.id,
  employee_id: null,
  job_id: model.jobs[0]!.id,
  shift_type_id: model.shift_types[0]!.id,
  scheduled_date: "2026-08-17",
  start_time: "17:00",
  end_time: "23:00",
  crosses_midnight: false,
  unpaid_break_minutes: 45,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "Keep close",
  warning_codes: [],
  revision: 2,
};

describe("shiftEditorState", () => {
  it("builds edit initial values from the existing shift", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: { mode: "edit", shift: editShift },
        model,
      }),
    ).toEqual(
      expect.objectContaining({
        location_id: model.locations[0]!.id,
        employee_id: null,
        job_id: model.jobs[0]!.id,
        shift_type_id: model.shift_types[0]!.id,
        start_time: "17:00",
        end_time: "23:00",
        unpaid_break_minutes: 45,
        note: "Keep close",
      }),
    );
  });

  it("retargets copied shift snapshots for paste create mode", () => {
    const copy: ShiftClipboardSnapshot = {
      id: "55555555-5555-4555-8555-555555555555",
      source_employee_id: null,
      source_location_id: model.locations[0]!.id,
      location_id: model.locations[0]!.id,
      employee_id: null,
      job_id: model.jobs[0]!.id,
      shift_type_id: model.shift_types[0]!.id,
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:00",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "Copied",
    };

    expect(
      buildScheduleShiftEditorInitialValue({
        state: {
          mode: "create",
          locationId: "66666666-6666-4666-8666-666666666666",
          employeeId: "77777777-7777-4777-8777-777777777777",
          date: "2026-08-19",
          copy,
        },
        model,
      }),
    ).toEqual(
      expect.objectContaining({
        location_id: "66666666-6666-4666-8666-666666666666",
        employee_id: "77777777-7777-4777-8777-777777777777",
        scheduled_date: "2026-08-19",
        start_time: "16:00",
        end_time: "22:00",
        note: "Copied",
      }),
    );
  });

  it("uses preset times when creating from a preset badge", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: {
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: "2026-08-18",
          preset: {
            jobId: model.jobs[0]!.id,
            shiftTypeId: model.shift_types[0]!.id,
            startTime: "11:00",
            endTime: "15:00",
          },
        },
        model,
      }),
    ).toEqual(
      expect.objectContaining({
        job_id: model.jobs[0]!.id,
        shift_type_id: model.shift_types[0]!.id,
        start_time: "11:00",
        end_time: "15:00",
        hide_time_on_badge: false,
      }),
    );
  });

  it("marks preset clock-off shifts as hidden-time badges", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: {
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: "2026-08-18",
          preset: {
            jobId: model.jobs[0]!.id,
            shiftTypeId: model.shift_types[1]!.id,
            startTime: null,
            endTime: null,
          },
        },
        model,
      }).hide_time_on_badge,
    ).toBe(true);
  });

  it("applies selected shift type defaults and clock-off fallback ranges", () => {
    const value: ScheduleShiftMutationInput = {
      location_id: model.locations[0]!.id,
      employee_id: null,
      job_id: model.jobs[0]!.id,
      shift_type_id: null,
      scheduled_date: "2026-08-17",
      start_time: "09:00",
      end_time: "17:00",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
    };

    expect(
      applyScheduleShiftTypeDefaults({
        value,
        shiftType: model.shift_types[0],
        shiftTypeId: model.shift_types[0]!.id,
        clockOffFallbackStartTime: "00:00",
        clockOffFallbackEndTime: "00:01",
      }),
    ).toEqual(
      expect.objectContaining({
        start_time: "16:00",
        end_time: "22:00",
        hide_time_on_badge: false,
      }),
    );

    expect(
      applyScheduleShiftTypeDefaults({
        value,
        shiftType: model.shift_types[1],
        shiftTypeId: model.shift_types[1]!.id,
        clockOffFallbackStartTime: "00:00",
        clockOffFallbackEndTime: "00:01",
      }),
    ).toEqual(
      expect.objectContaining({
        start_time: "00:00",
        end_time: "00:01",
        hide_time_on_badge: true,
      }),
    );
  });
});
