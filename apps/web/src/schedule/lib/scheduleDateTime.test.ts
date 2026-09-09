import { describe, expect, it } from "vitest";

import {
  addDays,
  currentWeekStart,
  formatDateNumber,
  formatDay,
  formatDayNumber,
  formatPeriod,
  formatTime,
} from "./scheduleDateTime";

describe("scheduleDateTime", () => {
  it("adds days using UTC noon to avoid timezone drift", () => {
    expect(addDays("2026-08-17", 6)).toBe("2026-08-23");
    expect(addDays("2026-08-17", -1)).toBe("2026-08-16");
  });

  it("calculates current week start for sunday and monday starts", () => {
    expect(currentWeekStart("2026-08-19", "sunday")).toBe("2026-08-16");
    expect(currentWeekStart("2026-08-19", "monday")).toBe("2026-08-17");
  });

  it("formats day header labels", () => {
    expect(formatDay("2026-08-17")).toBe("Mon");
    expect(formatDateNumber("2026-08-17")).toBe("Aug 17");
    expect(formatDayNumber("2026-08-17")).toBe("17");
  });

  it("formats schedule period labels", () => {
    expect(formatPeriod("2026-08-17", "2026-08-17", "day")).toBe(
      "Monday, August 17, 2026",
    );
    expect(formatPeriod("2026-08-17", "2026-08-17", "week")).toBe(
      "Aug 17 – Aug 23, 2026",
    );
  });

  it("formats compact schedule times", () => {
    expect(formatTime("09:00")).toBe("9a");
    expect(formatTime("13:30")).toBe("1:30p");
    expect(formatTime("00:15")).toBe("12:15a");
    expect(formatTime("17:00", "12h", "long")).toBe("5:00 PM");
    expect(formatTime("00:15", "24h")).toBe("00:15");
    expect(formatTime("23:45", "24h")).toBe("23:45");
  });

  it("keeps week-start math stable across timezone-sensitive dates", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(currentWeekStart("2026-03-08", "sunday")).toBe("2026-03-08");
    expect(currentWeekStart("2026-03-08", "monday")).toBe("2026-03-02");
  });
});
