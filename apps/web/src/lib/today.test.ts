import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { clockIn, todayIn } from "./today";

// Sunday Oct 4, 2026, 11 pm in Los Angeles; UTC already reads Monday Oct 5.
const sundayNightInLosAngeles = new Date("2026-10-05T06:00:00Z");

// BL-277: "today" is the calendar day where the person or the location is.
describe("todayIn", () => {
  it("reads the location's own calendar, not UTC's", () => {
    expect(todayIn("America/Los_Angeles", sundayNightInLosAngeles)).toBe("2026-10-04");
    expect(todayIn("Europe/Istanbul", sundayNightInLosAngeles)).toBe("2026-10-05");
  });

  // The device is set to Los Angeles, so a fallback to UTC would read Monday.
  it("falls back to the device's calendar without a usable zone", () => {
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    const device = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockImplementation(function (this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), timeZone: "America/Los_Angeles" };
      });
    try {
      for (const zone of [undefined, "", "Not/AZone"]) {
        expect(todayIn(zone, sundayNightInLosAngeles), String(zone)).toBe("2026-10-04");
      }
    } finally {
      device.mockRestore();
    }
  });

  // The screens that used to take today from UTC, or from UTC as a fallback.
  it.each([
    "src/employee-hub/EmployeeScheduleBoard.tsx",
    "src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx",
    "src/schedule/components/ScheduleLocationHeader.tsx",
    "src/settings/SignatureTemplatesSettingsPage.tsx",
    "src/employees/EmployeeOnboardingPage.tsx",
    "src/views/EmployeeHubPage.tsx",
    // BL-353: these read the device's calendar by hand.
    "src/schedule/components/ScheduleDayHeaderCells.tsx",
    "src/schedule/components/MiniCalendar.tsx",
    "src/communications/AnnouncementDrawer.tsx",
    // S-226: Schedule and Lineup read the location's today here.
    "src/schedule/hooks/useScheduleQuery.ts",
    "src/dev/EmployeeOnboardingPreview.tsx",
  ])("%s takes today from todayIn", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("todayIn(");
    expect(source).not.toMatch(/(new Date\(\)|\bnow)\.toISOString\(\)\.slice\(0, ?10\)|timeZone: \w+ \?\? "UTC"|new Date\(\)\.toLocaleDateString\("en-CA"\)|today\.getFullYear\(\)/);
  });
});

describe("clockIn", () => {
  it("reads the wall clock in the zone, 24 h", () => {
    const now = new Date("2026-10-14T01:05:00Z");
    expect(clockIn("America/Los_Angeles", now)).toBe("18:05");
    expect(clockIn("America/New_York", now)).toBe("21:05");
  });
});
