import { describe, expect, it, beforeEach } from "vitest";

import {
  readStoredScheduleEmployeeSortMode,
  readStoredScheduleUiBoolean,
  writeStoredScheduleEmployeeSortMode,
  writeStoredScheduleUiState,
} from "./scheduleUiStore";

const storageKey = "organizer-schedule-ui";

describe("scheduleUiStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults employee sort mode to alphabetical", () => {
    expect(readStoredScheduleEmployeeSortMode()).toBe("alphabetical");
  });

  it("persists employee sort mode without losing existing UI state", () => {
    writeStoredScheduleUiState({ showClockTimes: false });
    writeStoredScheduleEmployeeSortMode("byJob");

    expect(readStoredScheduleEmployeeSortMode()).toBe("byJob");
    expect(readStoredScheduleUiBoolean("showClockTimes", true)).toBe(false);
  });

  it("reads boolean display toggles with fallback handling", () => {
    expect(readStoredScheduleUiBoolean("showTotalHours", true)).toBe(true);
    writeStoredScheduleUiState({ showTotalHours: false, bad: "nope" });

    expect(readStoredScheduleUiBoolean("showTotalHours", true)).toBe(false);
    expect(readStoredScheduleUiBoolean("bad", true)).toBe(true);
  });

  it("recovers from malformed stored state", () => {
    window.localStorage.setItem(storageKey, "{bad json");

    expect(readStoredScheduleEmployeeSortMode()).toBe("alphabetical");
    expect(readStoredScheduleUiBoolean("showShiftType", true)).toBe(true);

    writeStoredScheduleUiState({ showShiftType: false });
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toEqual({
      state: { showShiftType: false },
    });
  });
});
