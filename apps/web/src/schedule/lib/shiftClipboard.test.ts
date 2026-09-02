import type { ScheduleEditableShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  applyShiftClipboardSnapshot,
  createShiftClipboardSnapshot,
} from "./shiftClipboard";

function editableShift(
  overrides: Partial<ScheduleEditableShift> = {},
): ScheduleEditableShift {
  return {
    id: "shift-1",
    location_id: "loc-1",
    employee_id: "emp-1",
    job_id: "job-1",
    shift_type_id: "type-1",
    scheduled_date: "2026-08-17",
    start_time: "16:00",
    end_time: "22:30",
    crosses_midnight: false,
    unpaid_break_minutes: 30,
    hide_time_on_badge: false,
    label_ids: ["label-1"],
    label_names: ["Training"],
    note: "Patio section",
    warning_codes: [],
    revision: 1,
    ...overrides,
  };
}

describe("shiftClipboard", () => {
  it("stores a detached schedule shift snapshot without revision state", () => {
    const snapshot = createShiftClipboardSnapshot(editableShift());

    expect(snapshot).toMatchObject({
      id: "shift-1",
      source_employee_id: "emp-1",
      source_location_id: "loc-1",
      job_id: "job-1",
      shift_type_id: "type-1",
      start_time: "16:00",
      end_time: "22:30",
      unpaid_break_minutes: 30,
      label_ids: ["label-1"],
      label_names: ["Training"],
      note: "Patio section",
    });
    expect("revision" in snapshot).toBe(false);
  });

  it("applies the copied shift to a new cell while preserving shift details", () => {
    const snapshot = createShiftClipboardSnapshot(editableShift());

    expect(
      applyShiftClipboardSnapshot(snapshot, {
        locationId: "loc-2",
        employeeId: "emp-2",
        date: "2026-08-18",
      }),
    ).toEqual({
      location_id: "loc-2",
      employee_id: "emp-2",
      job_id: "job-1",
      shift_type_id: "type-1",
      scheduled_date: "2026-08-18",
      start_time: "16:00",
      end_time: "22:30",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: ["label-1"],
      label_names: ["Training"],
      note: "Patio section",
    });
  });
});
