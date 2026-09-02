import { describe, expect, it } from "vitest";

import { resolveScheduleDeleteShiftIds } from "./scheduleDeleteSelection";

describe("resolveScheduleDeleteShiftIds", () => {
  it("uses selected editable shifts before focused shift fallback", () => {
    expect(
      resolveScheduleDeleteShiftIds({
        selectedIds: ["shift-1", "missing"],
        focusedShiftId: "shift-2",
        editableShiftIds: ["shift-1", "shift-2"],
      }),
    ).toEqual(["shift-1"]);
  });

  it("falls back to the focused editable shift when nothing is selected", () => {
    expect(
      resolveScheduleDeleteShiftIds({
        selectedIds: [],
        focusedShiftId: "shift-2",
        editableShiftIds: ["shift-1", "shift-2"],
      }),
    ).toEqual(["shift-2"]);
  });

  it("ignores stale selected and focused ids", () => {
    expect(
      resolveScheduleDeleteShiftIds({
        selectedIds: ["missing"],
        focusedShiftId: "also-missing",
        editableShiftIds: ["shift-1"],
      }),
    ).toEqual([]);
  });
});
