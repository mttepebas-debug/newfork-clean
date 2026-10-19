import { describe, expect, it } from "vitest";
import type { ShiftTypeInput } from "@newfork/shared";
import {
  addTimeRow,
  makePrimary,
  removeTimeRow,
  timeRowLength,
  timeRowRefusal,
  timeRowsOf,
  updateTimeRow,
  withTimeRows,
} from "./shift-type-times";

// PRESET-SAAT (S-183): Dinner 4:15–11:30 PM is primary; 5–11 PM and 6–11:30 PM are its options.
const dinner: ShiftTypeInput = {
  name: "Dinner",
  color: "#7B5EA7",
  default_start_time: "16:15",
  default_end_time: "23:30",
  time_options: [
    { start_time: "17:00", end_time: "23:00" },
    { start_time: "18:00", end_time: "23:30" },
  ],
};

describe("shift type time rows", () => {
  it("shows the primary first, then the options", () => {
    expect(timeRowsOf(dinner)).toEqual({
      rows: [
        { start: "16:15", end: "23:30" },
        { start: "17:00", end: "23:00" },
        { start: "18:00", end: "23:30" },
      ],
      primary: 0,
    });
  });

  it("saves another row as primary without moving any row, and the old primary as an option in its place", () => {
    const times = makePrimary(timeRowsOf(dinner), 2);
    expect(times.rows[2]).toEqual({ start: "18:00", end: "23:30" });
    expect(withTimeRows(dinner, times)).toEqual({
      ...dinner,
      default_start_time: "18:00",
      default_end_time: "23:30",
      time_options: [
        { start_time: "16:15", end_time: "23:30" },
        { start_time: "17:00", end_time: "23:00" },
      ],
    });
  });

  it("keeps the last row and hands the primary on when it is removed", () => {
    const one = timeRowsOf({ ...dinner, time_options: [] });
    expect(removeTimeRow(one, 0)).toBe(one);
    expect(removeTimeRow(timeRowsOf(dinner), 0)).toEqual({
      rows: [
        { start: "17:00", end: "23:00" },
        { start: "18:00", end: "23:30" },
      ],
      primary: 0,
    });
    expect(removeTimeRow(makePrimary(timeRowsOf(dinner), 2), 0).primary).toBe(1);
  });

  it("adds empty rows up to nine and keeps Save off until a new row is filled", () => {
    let times = timeRowsOf({ ...dinner, time_options: [] });
    for (let n = 0; n < 12; n += 1) times = addTimeRow(times);
    expect(times.rows).toHaveLength(9);
    expect(timeRowRefusal(times)).toEqual({ row: 1, message: "Enter a start and an end time, or remove this time." });
  });

  it("names the row that repeats another or starts and ends at once", () => {
    const repeat = updateTimeRow(timeRowsOf(dinner), 2, { start: "17:00", end: "23:00" });
    expect(timeRowRefusal(repeat)).toEqual({ row: 2, message: "This time is already in the list." });
    const primaryRepeat = makePrimary(updateTimeRow(timeRowsOf(dinner), 0, { start: "18:00" }), 2);
    expect(timeRowRefusal(primaryRepeat)).toEqual({ row: 0, message: "This time is already in the list." });
    const same = updateTimeRow(timeRowsOf(dinner), 1, { end: "17:00" });
    expect(timeRowRefusal(same)?.row).toBe(1);
    expect(timeRowRefusal(timeRowsOf(dinner))).toBeNull();
  });

  it("says each row's length, past midnight too", () => {
    expect(timeRowLength({ start: "16:15", end: "23:30" })).toBe("7h 15m");
    expect(timeRowLength({ start: "22:00", end: "02:00" })).toBe("4h");
    expect(timeRowLength({ start: "", end: "02:00" })).toBeNull();
  });
});
