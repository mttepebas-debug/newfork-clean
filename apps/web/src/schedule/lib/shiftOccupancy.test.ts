import type { ScheduleShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  findScheduleShiftOccupancyConflict,
  findShiftOccupancyConflict,
  shiftConflictsNamedDuplicate,
  shiftConflictsOccupancy,
} from "./shiftOccupancy";

function makeShift(overrides: Partial<ScheduleShift> = {}): ScheduleShift {
  return {
    id: "existing-lunch",
    location_id: "loc-1",
    employee_id: "emp-1",
    shift_type_id: "shift-lunch",
    job_id: "job-server",
    scheduled_date: "2026-05-04",
    start_time: "11:00",
    end_time: "15:00",
    crosses_midnight: false,
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "",
    warning_codes: [],
    ...overrides,
  };
}

describe("shift occupancy validation", () => {
  it("uses explicit hours independently of their badge visibility", () => {
    const shift = makeShift({ time_basis: "explicit", hide_time_on_badge: true });
    expect(findScheduleShiftOccupancyConflict([shift], { ...shift, shift_type_id: null,
      start_time: "12:00", end_time: "14:00" })?.kind).toBe("time_overlap");
  });
  it("blocks duplicate named shift types even when saved clock time is hidden", () => {
    const existing = makeShift({
      location_id: "loc-2",
      hide_time_on_badge: true,
    });

    expect(
      shiftConflictsNamedDuplicate(existing, {
        date: "2026-05-04",
        shiftTypeId: "shift-lunch",
      }),
    ).toBe(true);
    expect(
      shiftConflictsOccupancy(existing, {
        employeeId: "emp-1",
        date: "2026-05-04",
        shiftTypeId: "shift-lunch",
        startTime: "17:00",
        endTime: "22:00",
        usesClockTime: true,
      }),
    ).toBe(true);
  });

  it("ignores hidden fallback times for different clock-off named shift types", () => {
    const existing = makeShift({
      shift_type_id: "shift-breakfast",
      hide_time_on_badge: true,
    });

    expect(
      shiftConflictsOccupancy(existing, {
        employeeId: "emp-1",
        date: "2026-05-04",
        shiftTypeId: "shift-lunch",
        startTime: "11:00",
        endTime: "15:00",
        usesClockTime: false,
      }),
    ).toBe(false);
  });

  it("only uses overlapping clock times when both shifts use real clock time", () => {
    const hiddenDefault = makeShift({
      id: "hidden-default",
      shift_type_id: "shift-breakfast",
      hide_time_on_badge: true,
    });
    const realClock = makeShift({
      id: "real-clock",
      shift_type_id: "shift-breakfast",
    });

    const target = {
      employeeId: "emp-1",
      date: "2026-05-04",
      shiftTypeId: "shift-lunch",
      startTime: "12:00",
      endTime: "14:00",
      usesClockTime: true,
    };

    expect(shiftConflictsOccupancy(hiddenDefault, target)).toBe(false);
    expect(findShiftOccupancyConflict(realClock, target)).toEqual({
      kind: "time_overlap",
      shift: realClock,
    });
  });

  it("adapts a quick editor payload into an occupancy conflict target", () => {
    const existing = makeShift();

    expect(
      findScheduleShiftOccupancyConflict([existing], {
        location_id: "loc-2",
        employee_id: "emp-1",
        job_id: "job-server",
        shift_type_id: "shift-lunch",
        scheduled_date: "2026-05-04",
        start_time: "17:00",
        end_time: "22:00",
        unpaid_break_minutes: 30,
        hide_time_on_badge: true,
        label_ids: [],
        label_names: [],
        note: "",
      }),
    ).toEqual({ kind: "named_duplicate", shift: existing });
  });
});
