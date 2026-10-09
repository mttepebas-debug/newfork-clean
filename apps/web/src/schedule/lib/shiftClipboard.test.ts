import type { ScheduleEditableShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  applyShiftClipboardSnapshot,
  applyShiftClipboardSnapshotSelection,
  createShiftClipboardSnapshot,
  createShiftClipboardSnapshotSelection,
  getShiftClipboardSnapshots,
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
      time_basis: "explicit",
      time_snapshot: null,
      time_timezone: null,
      label_ids: ["label-1"],
      label_names: ["Training"],
      note: "Patio section",
    });
  });

  it("keeps all selected shift snapshots available for paste mode", () => {
    const snapshot = createShiftClipboardSnapshotSelection([
      editableShift({ id: "shift-1", start_time: "09:00", end_time: "12:00" }),
      editableShift({ id: "shift-2", start_time: "13:00", end_time: "17:00" }),
    ]);

    expect(snapshot).not.toBeNull();
    expect(
      getShiftClipboardSnapshots(snapshot!).map((item) => item.id),
    ).toEqual(["shift-1", "shift-2"]);
    expect(
      getShiftClipboardSnapshots(snapshot!).map((item) =>
        applyShiftClipboardSnapshot(item, {
          locationId: "loc-2",
          employeeId: "emp-2",
          date: "2026-08-18",
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        location_id: "loc-2",
        employee_id: "emp-2",
        scheduled_date: "2026-08-18",
        start_time: "09:00",
        end_time: "12:00",
      }),
      expect.objectContaining({
        location_id: "loc-2",
        employee_id: "emp-2",
        scheduled_date: "2026-08-18",
        start_time: "13:00",
        end_time: "17:00",
      }),
    ]);
  });

  // BL-199: the edit service empties a note the payload leaves out, so every
  // paste has to carry each copied shift's own note along.
  it("pastes a selection with each shift's own note", () => {
    const snapshot = createShiftClipboardSnapshotSelection([
      editableShift({ id: "shift-1", note: "Patio section" }),
      editableShift({ id: "shift-2", scheduled_date: "2026-08-18", note: "Cover the bar at 8" }),
    ]);

    expect(
      applyShiftClipboardSnapshotSelection(snapshot!, {
        locationId: "loc-2",
        employeeId: "emp-2",
        date: "2026-08-24",
      }).map((item) => item.note),
    ).toEqual(["Patio section", "Cover the bar at 8"]);
  });

  it("applies a selected shift group relative to the clicked target date", () => {
    const snapshot = createShiftClipboardSnapshotSelection([
      editableShift({ id: "shift-1", scheduled_date: "2026-08-17" }),
      editableShift({ id: "shift-2", scheduled_date: "2026-08-18" }),
    ]);

    expect(
      applyShiftClipboardSnapshotSelection(snapshot!, {
        locationId: "loc-2",
        employeeId: "emp-2",
        date: "2026-08-24",
      }).map((item) => item.scheduled_date),
    ).toEqual(["2026-08-24", "2026-08-25"]);
  });
});
