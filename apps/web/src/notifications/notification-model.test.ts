import { describe, expect, it } from "vitest";
import { notice } from "./notification-fixtures.test-util";
import { dayGroup, decisionFor, relativeTime, resolutionLabel, rowLook } from "./notification-model";

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

describe("decisionFor", () => {
  it("offers an inline decision on an open time off request", () => {
    expect(decisionFor(notice())).toEqual({ kind: "time_off", requestId: "98020000-0000-4000-8000-000000000001" });
    expect(decisionFor(notice({ type: "time_off.decision_reminder" }))?.kind).toBe("time_off");
  });

  it("offers none once it is decided, or for another request", () => {
    expect(decisionFor(notice({ resolved_at: "2026-10-16T17:00:00Z", resolution: "approved" }))).toBeNull();
    expect(decisionFor(notice({ needs_action: false }))).toBeNull();
    expect(decisionFor(notice({ subject_id: null }))).toBeNull();
    expect(decisionFor(notice({ type: "shift_changes.approval_needed", subject_type: "shift_exchange" }))).toBeNull();
  });

  it("offers none on the new time off's card: Review opens it in Requests → Time off (time off rebuild D3)", () => {
    expect(decisionFor(notice({ subject_type: "time_off", url: "/app/schedule/requests?type=time_off&request=98020000-0000-4000-8000-000000000001" }))).toBeNull();
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
