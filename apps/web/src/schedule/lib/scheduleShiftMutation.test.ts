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
  it("retains reference evidence when a drag changes only the employee or date", () => {
    const source: ScheduleShift = { ...shift, time_basis: "type_default", time_timezone: "America/Los_Angeles",
      time_snapshot: { shift_type_id: "type-1", default_revision: 2, start_time: "16:00", end_time: "22:00", timezone: "America/Los_Angeles" } };
    const mutation = toScheduleShiftMutation(source, { employee_id: "emp-2", scheduled_date: "2026-08-18" });
    expect(mutation.time_basis).toBe("type_default");
    expect(mutation.time_snapshot).toEqual(source.time_snapshot);
  });
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

  // BL-199: a drag (move or copy) saves this mapping (SchedulePage onMove /
  // onCopyMove), and the edit service empties a note the payload leaves out.
  it("keeps the note when a shift is dragged to another person, day or location", () => {
    expect(
      toScheduleShiftMutation(shift, {
        location_id: "loc-2",
        employee_id: "emp-2",
        scheduled_date: "2026-08-18",
      }).note,
    ).toBe("Close patio");
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
