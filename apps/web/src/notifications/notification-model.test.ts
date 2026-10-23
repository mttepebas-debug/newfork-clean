import { describe, expect, it } from "vitest";
import { dayGroup, relativeTime, resolutionLabel, rowLook } from "./notification-model";

const now = new Date(2026, 9, 16, 12, 0, 0);
const at = (days: number, hours = 0, minutes = 0) =>
  new Date(2026, 9, 16 - days, 12 - hours, 0 - minutes, 0).toISOString();

describe("relativeTime", () => {
  it("counts minutes and hours today, then names the day", () => {
    expect(relativeTime(at(0, 0, 0), now)).toBe("Just now");
    expect(relativeTime(at(0, 0, 12), now)).toBe("12 min");
    expect(relativeTime(at(0, 3), now)).toBe("3 h");
    expect(relativeTime(at(1), now)).toBe("Yesterday");
    expect(relativeTime(at(3), now)).toBe("Tue");
    expect(relativeTime(at(14), now)).toBe("Oct 2");
    expect(relativeTime(new Date(2025, 11, 30, 9).toISOString(), now)).toBe("Dec 30, 2025");
  });
});

describe("dayGroup", () => {
  it("puts rows under Today, Yesterday or Earlier", () => {
    expect(dayGroup(at(0, 11), now)).toBe("Today");
    expect(dayGroup(at(1), now)).toBe("Yesterday");
    expect(dayGroup(at(4), now)).toBe("Earlier");
  });
});

describe("rowLook", () => {
  it("draws a request waiting for an answer as an approval, whatever its area", () => {
    expect(rowLook({ area: "time_off", topic: "approvals" })).toEqual({ label: "Approvals", icon: "clipboard", tone: "amber" });
    expect(rowLook({ area: "time_off", topic: "time_off" })).toEqual({ label: "Time off", icon: "time-off", tone: "red" });
    expect(rowLook({ area: "announcements", topic: "announcements" }).label).toBe("Announcements");
  });
});

describe("resolutionLabel", () => {
  it("says how it closed, and that the reader closed it", () => {
    const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
    expect(resolutionLabel({ resolution: "approved", resolved_by: "someone-else" }, me)).toBe("Approved");
    expect(resolutionLabel({ resolution: "approved", resolved_by: me }, me)).toBe("You approved");
    expect(resolutionLabel({ resolution: "declined", resolved_by: null }, me)).toBe("Declined");
    expect(resolutionLabel({ resolution: "withdrawn", resolved_by: null }, me)).toBe("Withdrawn");
    expect(resolutionLabel({ resolution: null, resolved_by: null }, me)).toBeNull();
  });
});
