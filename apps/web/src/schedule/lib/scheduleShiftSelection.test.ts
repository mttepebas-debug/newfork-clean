import { describe, expect, it } from "vitest";

import { resolveScheduleShiftSelectionIds } from "./scheduleShiftSelection";

describe("resolveScheduleShiftSelectionIds", () => {
  it("replaces the selection for a normal selection gesture", () => {
    expect(
      resolveScheduleShiftSelectionIds({
        currentIds: ["shift-1", "shift-2"],
        focusedShiftId: "shift-1",
        shiftId: "shift-3",
        additive: false,
      }),
    ).toEqual(["shift-3"]);
  });

  it("uses the focused shift as the first multi-select anchor", () => {
    expect(
      resolveScheduleShiftSelectionIds({
        currentIds: [],
        focusedShiftId: "shift-1",
        shiftId: "shift-2",
        additive: true,
      }),
    ).toEqual(["shift-1", "shift-2"]);
  });

  it("toggles an existing multi-selected shift", () => {
    expect(
      resolveScheduleShiftSelectionIds({
        currentIds: ["shift-1", "shift-2"],
        focusedShiftId: "shift-1",
        shiftId: "shift-2",
        additive: true,
      }),
    ).toEqual(["shift-1"]);
  });
});
