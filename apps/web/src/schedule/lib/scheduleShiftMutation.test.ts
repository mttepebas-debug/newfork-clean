import type { ScheduleShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { toScheduleShiftMutation } from "./scheduleShiftMutation";

const shift = {
  id: "shift-1",
  location_id: "loc-1",
  employee_id: "emp-1",
  job_id: "job-1",
  shift_type_id: "type-1",
  scheduled_date: "2026-08-17",
  start_time: "16:00",
  end_time: "22:00",
  unpaid_break_minutes: 30,
  hide_time_on_badge: false,
  label_ids: ["label-1"],
  label_names: ["Training"],
  note: "Close patio",
} as ScheduleShift;

describe("toScheduleShiftMutation", () => {
  it("maps a schedule shift into the mutation input contract", () => {
    expect(toScheduleShiftMutation(shift)).toEqual({
      location_id: "loc-1",
      employee_id: "emp-1",
      job_id: "job-1",
      shift_type_id: "type-1",
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:00",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: ["label-1"],
      label_names: ["Training"],
      note: "Close patio",
    });
  });

  it("defaults missing label arrays and applies overrides last", () => {
    expect(
      toScheduleShiftMutation(
        { ...shift, label_ids: undefined, label_names: undefined },
        {
          location_id: "loc-2",
          employee_id: null,
          scheduled_date: "2026-08-18",
        },
      ),
    ).toMatchObject({
      location_id: "loc-2",
      employee_id: null,
      scheduled_date: "2026-08-18",
      label_ids: [],
      label_names: [],
    });
  });
});
