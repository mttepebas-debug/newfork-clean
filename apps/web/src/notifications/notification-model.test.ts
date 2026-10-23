import { describe, expect, it } from "vitest";
import { arrivalLabel, arrivalTitle, isNewNotice, resolutionLabel, resolvedLine, rowLook } from "./notification-model";

const now = new Date(2026, 9, 16, 12, 0, 0);
const at = (days: number, hours = 0, minutes = 0) =>
  new Date(2026, 9, 16 - days, 12 - hours, 0 - minutes, 0).toISOString();

// S-247 (2026-10-23): "5m ago" today, a clock time once the day turns, a date after a week.
describe("arrivalLabel", () => {
  it("says how long ago today, then the day and its clock time, then the date", () => {
    expect(arrivalLabel(at(0, 0, 0), now)).toBe("Just now");
    expect(arrivalLabel(at(0, 0, 12), now)).toBe("12m ago");
    expect(arrivalLabel(at(0, 3), now)).toBe("3h ago");
    expect(arrivalLabel(new Date(2026, 9, 15, 16, 12).toISOString(), now)).toBe("Yesterday 4:12 PM");
    expect(arrivalLabel(new Date(2026, 9, 13, 9, 30).toISOString(), now)).toBe("Tue 9:30 AM");
    expect(arrivalLabel(at(14), now)).toBe("Oct 2");
    expect(arrivalLabel(new Date(2025, 11, 30, 9).toISOString(), now)).toBe("Dec 30, 2025");
  });

  it("writes the clock the way the person reads times", () => {
    expect(arrivalLabel(new Date(2026, 9, 15, 16, 12).toISOString(), now, "24h")).toBe("Yesterday 16:12");
  });

  it("never says a time in the future", () => {
    expect(arrivalLabel(new Date(2026, 9, 16, 12, 0, 30).toISOString(), now)).toBe("Just now");
  });
});

describe("arrivalTitle", () => {
  it("is the full day, clock time and zone for the hover", () => {
    expect(arrivalTitle(new Date(2026, 9, 15, 16, 12).toISOString())).toMatch(/^Thursday, October 15, 2026 at 4:12 PM \S/);
  });
});

// S-247 (2): "New" is what came since the list was last opened; it stays New while the list is open.
describe("isNewNotice", () => {
  it("is a notice not yet seen, or one this opening of the list already counted as new", () => {
    const fresh = new Set(["b"]);
    expect(isNewNotice({ id: "a", seen_at: null }, fresh)).toBe(true);
    expect(isNewNotice({ id: "b", seen_at: "2026-10-16T12:00:00Z" }, fresh)).toBe(true);
    expect(isNewNotice({ id: "c", seen_at: "2026-10-16T12:00:00Z" }, fresh)).toBe(false);
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
    expect(resolutionLabel({ resolution: "completed", resolved_by: null }, me)).toBe("Done");
    expect(resolutionLabel({ resolution: null, resolved_by: null }, me)).toBeNull();
  });

  // S-247 (3): everyone who got the card reads who closed it.
  it("names whoever else closed it", () => {
    const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
    expect(resolutionLabel({ resolution: "approved", resolved_by: "someone-else", resolved_by_name: "Maria Lopez" }, me)).toBe("Approved by Maria Lopez");
    expect(resolutionLabel({ resolution: "declined", resolved_by: "someone-else", resolved_by_name: "Maria Lopez" }, me)).toBe("Declined by Maria Lopez");
    expect(resolutionLabel({ resolution: "approved", resolved_by: me, resolved_by_name: "Ayse Person" }, me)).toBe("You approved");
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, resolved_by_name: null }, me)).toBe("Not decided in time");
  });

  it("says what the person did on cards they answered themselves", () => {
    const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
    expect(resolutionLabel({ resolution: "applied", resolved_by: me }, me)).toBe("You applied");
    expect(resolutionLabel({ resolution: "taken", resolved_by: null }, me)).toBe("Taken");
    expect(resolutionLabel({ resolution: "submitted", resolved_by: me }, me)).toBe("You handed it in");
    expect(resolutionLabel({ resolution: "acknowledged", resolved_by: me }, me)).toBe("You acknowledged");
  });
});

describe("resolvedLine", () => {
  it("adds when it closed to how it closed", () => {
    const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
    expect(resolvedLine({ resolution: "approved", resolved_by: me, resolved_at: at(0, 0, 2) }, me, now)).toBe("You approved · 2m ago");
    expect(resolvedLine({ resolution: null, resolved_by: null, resolved_at: null }, me, now)).toBeNull();
  });
});
