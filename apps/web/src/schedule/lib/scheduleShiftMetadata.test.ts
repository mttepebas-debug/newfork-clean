import type { ScheduleShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import type { ScheduleCellState } from "../hooks/useCellState";
import {
  isGhostScheduleShift,
  publicationStateForShift,
  shiftWithDerivedWarnings,
} from "./scheduleShiftMetadata";

const shift = {
  id: "shift-1",
  warning_codes: [],
} as unknown as ScheduleShift;

function cellState(conflictingShiftIds: readonly string[]): ScheduleCellState {
  return {
    ghostShifts: [],
    conflictingShiftIds: new Set(conflictingShiftIds),
    hasOverlap: conflictingShiftIds.length > 0,
    isClosedAllDay: false,
    closedTitle: null,
    availabilityMark: null,
  };
}

describe("scheduleShiftMetadata", () => {
  it("maps live-backed shifts to publication states", () => {
    expect(
      publicationStateForShift({
        ...shift,
        source_published_shift_id: "published-1",
      }),
    ).toBe("locked");
    expect(
      publicationStateForShift({
        ...shift,
        source_published_shift_id: "published-1",
        pending_op_type: "update",
      }),
    ).toBe("unlocked-modified");
    expect(
      publicationStateForShift({
        ...shift,
        source_published_shift_id: "published-1",
        pending_op_type: "delete",
      }),
    ).toBe("staged-removed");
    expect(publicationStateForShift(shift)).toBeNull();
  });

  it("treats either ghost marker as a ghost shift", () => {
    expect(
      isGhostScheduleShift({ ...shift, ghost: true } as unknown as ScheduleShift),
    ).toBe(true);
    expect(
      isGhostScheduleShift({
        ...shift,
        is_ghost: true,
      } as unknown as ScheduleShift),
    ).toBe(true);
    expect(isGhostScheduleShift(shift)).toBe(false);
  });

  it("adds derived overlap warnings once", () => {
    expect(
      shiftWithDerivedWarnings(shift, cellState(["shift-1"])).warning_codes,
    ).toEqual(["overlap"]);
    expect(
      shiftWithDerivedWarnings(
        { ...shift, warning_codes: ["overlap"] },
        cellState(["shift-1"]),
      ).warning_codes,
    ).toEqual(["overlap"]);
    expect(
      shiftWithDerivedWarnings(shift, cellState(["other"])),
    ).toBe(shift);
  });
});
