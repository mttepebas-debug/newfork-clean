import type { ScheduleShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import type { ScheduleCellState } from "../hooks/useCellState";
import {
  hideReplacedRemovedShifts,
  withoutReplacedRemovedShifts,
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
    pendingTimeOff: null,
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

  // While editing, the grid's own overlap pass is the truth: the server's code
  // still counts a shift removed in this edit.
  it("takes the server's overlap code off a shift the editing grid finds clear", () => {
    const flagged = { ...shift, warning_codes: ["overlap", "availability"] } as unknown as ScheduleShift;
    expect(shiftWithDerivedWarnings(flagged, cellState(["other"]), { editing: true }).warning_codes).toEqual(["availability"]);
    expect(shiftWithDerivedWarnings(flagged, undefined, { editing: true }).warning_codes).toEqual(["availability"]);
    expect(shiftWithDerivedWarnings(flagged, cellState(["shift-1"]), { editing: true }).warning_codes).toEqual(["overlap", "availability"]);
    expect(shiftWithDerivedWarnings(flagged, undefined)).toBe(flagged);
  });
});

// Mert, 2026-10-12: a removed live shift stays behind the shift written in its
// place: the same cell, hours that meet, or the same shift type.
describe("hideReplacedRemovedShifts", () => {
  const cellShift = (id: string, patch: Record<string, unknown> = {}) =>
    ({
      id,
      shift_type_id: "type-lunch",
      scheduled_date: "2026-08-17",
      start_time: "11:00",
      end_time: "16:00",
      warning_codes: [],
      ...patch,
    }) as unknown as ScheduleShift;
  const removed = cellShift("removed", { source_published_shift_id: "live-1", pending_op_type: "delete" });
  const ids = (shifts: readonly ScheduleShift[]) => shifts.map((item) => item.id);

  it("hides a removed shift behind one whose hours meet it", () => {
    const next = cellShift("new", { shift_type_id: "type-dinner", start_time: "15:00", end_time: "22:00" });
    expect(ids(hideReplacedRemovedShifts([removed, next]))).toEqual(["new"]);
  });

  it("hides a removed shift behind one of the same shift type at other hours", () => {
    const next = cellShift("new", { start_time: "17:00", end_time: "22:00" });
    expect(ids(hideReplacedRemovedShifts([removed, next]))).toEqual(["new"]);
  });

  it("hides a removed shift behind one written over its hours across midnight", () => {
    const late = cellShift("removed-late", {
      source_published_shift_id: "live-2", pending_op_type: "delete", shift_type_id: null, start_time: "22:00", end_time: "02:00",
    });
    const next = cellShift("new", { shift_type_id: null, start_time: "23:30", end_time: "03:00" });
    expect(ids(hideReplacedRemovedShifts([late, next]))).toEqual(["new"]);
  });

  it("keeps a removed shift beside live shifts nobody wrote in this edit", () => {
    const untouched = cellShift("open-2", { source_published_shift_id: "live-2", pending_op_type: null, locked: true });
    expect(ids(hideReplacedRemovedShifts([removed, untouched]))).toEqual(["removed", "open-2"]);
    const moved = cellShift("moved", { source_published_shift_id: "live-3", pending_op_type: "update" });
    expect(ids(hideReplacedRemovedShifts([removed, moved]))).toEqual(["moved"]);
  });

  it("leaves hidden removals out of a whole-schedule list, cell by cell", () => {
    const next = cellShift("new", { start_time: "12:00", end_time: "18:00" });
    const elsewhere = cellShift("removed-other-day", {
      source_published_shift_id: "live-4", pending_op_type: "delete", scheduled_date: "2026-08-18",
    });
    expect(ids(withoutReplacedRemovedShifts([removed, elsewhere, next]))).toEqual(["removed-other-day", "new"]);
  });

  it("keeps a removed shift when nothing took its place", () => {
    const other = cellShift("other", { shift_type_id: "type-dinner", start_time: "17:00", end_time: "22:00" });
    expect(ids(hideReplacedRemovedShifts([removed, other]))).toEqual(["removed", "other"]);
    expect(ids(hideReplacedRemovedShifts([removed]))).toEqual(["removed"]);
  });

  it("never hides a removed shift behind another removed one", () => {
    const alsoRemoved = cellShift("removed-2", { source_published_shift_id: "live-3", pending_op_type: "delete" });
    expect(ids(hideReplacedRemovedShifts([removed, alsoRemoved]))).toEqual(["removed", "removed-2"]);
  });
});
