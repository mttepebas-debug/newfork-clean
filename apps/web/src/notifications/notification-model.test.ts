import type { NotificationArea } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { arrivalLabel, arrivalTitle, isNewNotice, resolutionLabel, rowLines, rowLook } from "./notification-model";
import { notice } from "./notification-fixtures.test-util";

const now = new Date(2026, 9, 16, 12, 0, 0);
const at = (days: number, hours = 0, minutes = 0) =>
  new Date(2026, 9, 16 - days, 12 - hours, 0 - minutes, 0).toISOString();
const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

// S-251 (2026-10-23): the short time at the right of a row's second line: "5m" today, the day once it
// turns, a date after a week.
describe("arrivalLabel", () => {
  it("says how long ago today, then the day, then the date", () => {
    expect(arrivalLabel(at(0, 0, 0), now)).toBe("now");
    expect(arrivalLabel(at(0, 0, 12), now)).toBe("12m");
    expect(arrivalLabel(at(0, 3), now)).toBe("3h");
    expect(arrivalLabel(new Date(2026, 9, 15, 16, 12).toISOString(), now)).toBe("Yesterday");
    expect(arrivalLabel(new Date(2026, 9, 13, 9, 30).toISOString(), now)).toBe("Tue");
    expect(arrivalLabel(at(14), now)).toBe("Oct 2");
    expect(arrivalLabel(new Date(2025, 11, 30, 9).toISOString(), now)).toBe("Dec 30, 2025");
  });

  it("never says a time in the future", () => {
    expect(arrivalLabel(new Date(2026, 9, 16, 12, 0, 30).toISOString(), now)).toBe("now");
  });
});

describe("arrivalTitle", () => {
  it("is the full day, clock time and zone for the hover", () => {
    expect(arrivalTitle(new Date(2026, 9, 15, 16, 12).toISOString())).toMatch(/^Thursday, October 15, 2026 at 4:12 PM \S/);
  });

  it("writes the clock the way the person reads times", () => {
    expect(arrivalTitle(new Date(2026, 9, 15, 16, 12).toISOString(), "24h")).toMatch(/^Thursday, October 15, 2026 at 16:12 \S/);
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

// S-251, S-258, S-261: a row's tile is the kind of thing it is about, the same icons Requests uses; a
// decision shows its outcome. A request waiting for the reader's decision is amber.
describe("rowLook", () => {
  const look = (type: string, area: NotificationArea, topic: string, data: Record<string, unknown> = {}) =>
    rowLook(notice({ type, area, topic, data }));

  it("draws time off and its cancellation as a crossed-out day, amber while it waits on the reader", () => {
    expect(look("time_off.requested", "time_off", "approvals")).toEqual({ icon: "time-off", tone: "amber" });
    expect(look("time_off.requested", "time_off", "approvals", { kind: "cancel" })).toEqual({ icon: "time-off", tone: "amber" });
    expect(look("time_off.decision_reminder", "time_off", "approvals")).toEqual({ icon: "time-off", tone: "amber" });
    expect(look("time_off.shortened", "time_off", "time_off")).toEqual({ icon: "time-off", tone: "red" });
  });

  it("draws a shift change by its kind: a swap, a pickup or open shift, a cover sent to a manager", () => {
    expect(look("shift_changes.approval_needed", "shift_changes", "approvals", { kind: "swap", audience: "direct" })).toEqual({ icon: "swap", tone: "amber" });
    expect(look("shift_changes.approval_needed", "shift_changes", "approvals", { kind: "cover", audience: "eligible_pool" })).toEqual({ icon: "pickup", tone: "amber" });
    expect(look("shift_changes.approval_reminder", "shift_changes", "approvals", { kind: "cover", audience: "direct" })).toEqual({ icon: "cover", tone: "amber" });
    expect(look("shift_changes.swap_offered", "shift_changes", "shift_changes", { kind: "swap", audience: "direct" }).icon).toBe("swap");
    expect(look("shift_changes.open_shift_available", "shift_changes", "open_shifts", { kind: "cover", audience: "eligible_pool" })).toEqual({ icon: "pickup", tone: "green" });
    expect(look("shift_changes.open_shift_available", "shift_changes", "open_shifts").icon).toBe("pickup");
  });

  // S-261 (Mert 2026-10-24, "Soru işareti olarak 3. Seçeneği kullan"): a shift someone asks YOU to take.
  it("draws a cover asked of the reader as a question", () => {
    expect(look("shift_changes.cover_asked", "shift_changes", "shift_changes", { kind: "cover", audience: "direct" }).icon).toBe("asked");
  });

  it("draws a decision by how it went", () => {
    expect(look("time_off.decided", "time_off", "time_off", { outcome: "approved" })).toEqual({ icon: "approved", tone: "green" });
    expect(look("time_off.decided", "time_off", "time_off", { outcome: "declined" })).toEqual({ icon: "declined", tone: "red" });
    expect(look("time_off.decided", "time_off", "time_off", { outcome: "revoked" })).toEqual({ icon: "revoked", tone: "slate" });
    expect(look("time_off.decided", "time_off", "time_off", { outcome: "expired" })).toEqual({ icon: "expired", tone: "slate" });
    expect(look("shift_changes.decided", "shift_changes", "shift_changes", { kind: "swap", outcome: "approved" })).toEqual({ icon: "approved", tone: "green" });
    expect(look("documents.decided", "documents", "documents", { outcome: "declined" })).toEqual({ icon: "declined", tone: "red" });
    // An answer with no outcome it can draw keeps its kind.
    expect(look("time_off.decided", "time_off", "time_off").icon).toBe("time-off");
  });

  it("draws people, documents and the schedule by what happened", () => {
    expect(look("people.joined", "people", "team")).toEqual({ icon: "joined", tone: "blue" });
    expect(look("people.onboarding_review_needed", "people", "approvals")).toEqual({ icon: "joined", tone: "amber" });
    expect(look("people.preferred_name_requested", "people", "approvals")).toEqual({ icon: "name", tone: "amber" });
    expect(look("people.no_location", "people", "needs_attention").icon).toBe("no-location");
    expect(look("people.ownership_transfer_requested", "people", "workspace").icon).toBe("owner");
    expect(look("people.ownership_transfer_answered", "people", "workspace", { outcome: "declined" }).icon).toBe("owner");
    expect(look("documents.review_needed", "documents", "approvals")).toEqual({ icon: "file", tone: "amber" });
    expect(look("documents.expiring", "documents", "documents")).toEqual({ icon: "file", tone: "blue" });
    expect(look("schedule.published", "schedule", "my_schedule")).toEqual({ icon: "published", tone: "green" });
    expect(look("schedule.shifts_unassigned", "schedule", "needs_attention")).toEqual({ icon: "calendar", tone: "green" });
  });

  it("keeps the area's icon for everything else", () => {
    expect(look("announcements.published", "announcements", "announcements")).toEqual({ icon: "megaphone", tone: "slate" });
    expect(look("account.password_changed", "account", "account")).toEqual({ icon: "shield", tone: "slate" });
    expect(look("workspace.closure_scheduled", "workspace", "workspace")).toEqual({ icon: "building", tone: "slate" });
    expect(look("lineup.shared", "lineup", "my_schedule")).toEqual({ icon: "clipboard", tone: "green" });
    expect(look("people.role_changed", "people", "workspace")).toEqual({ icon: "users", tone: "blue" });
  });
});

describe("resolutionLabel", () => {
  it("says how it closed, and that the reader closed it", () => {
    expect(resolutionLabel({ resolution: "approved", resolved_by: "someone-else" }, me)).toBe("Approved");
    expect(resolutionLabel({ resolution: "approved", resolved_by: me }, me)).toBe("You approved");
    expect(resolutionLabel({ resolution: "declined", resolved_by: null }, me)).toBe("Declined");
    expect(resolutionLabel({ resolution: "withdrawn", resolved_by: null }, me)).toBe("Withdrawn");
    expect(resolutionLabel({ resolution: "completed", resolved_by: null }, me)).toBe("Done");
    expect(resolutionLabel({ resolution: null, resolved_by: null }, me)).toBeNull();
  });

  // S-247 (3): everyone who got the card reads who closed it.
  it("names whoever else closed it", () => {
    expect(resolutionLabel({ resolution: "approved", resolved_by: "someone-else", resolved_by_name: "Maria L." }, me)).toBe("Approved by Maria L.");
    expect(resolutionLabel({ resolution: "declined", resolved_by: "someone-else", resolved_by_name: "Maria L." }, me)).toBe("Declined by Maria L.");
    expect(resolutionLabel({ resolution: "approved", resolved_by: me, resolved_by_name: "Ayse P." }, me)).toBe("You approved");
    expect(resolutionLabel({ resolution: "withdrawn", resolved_by: "someone-else", resolved_by_name: "Ali P." }, me)).toBe("Withdrawn by Ali P.");
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, resolved_by_name: null, type: "time_off.requested" }, me)).toBe("Not decided in time");
  });

  // S-258: a revoked time off reads like the other decisions.
  it("says who revoked it", () => {
    expect(resolutionLabel({ resolution: "revoked", resolved_by: me, resolved_by_name: "Ayse P." }, me)).toBe("You revoked");
    expect(resolutionLabel({ resolution: "revoked", resolved_by: "someone-else", resolved_by_name: "Deniz P." }, me)).toBe("Revoked by Deniz P.");
    expect(resolutionLabel({ resolution: "revoked", resolved_by: null }, me)).toBe("Revoked");
  });

  // A request nobody decided in time is one thing; a shift whose day passed or an offer that ran out is another.
  it("says expired plainly for what is not a request waiting on a decision", () => {
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, type: "shift_changes.approval_needed" }, me)).toBe("Not decided in time");
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, type: "schedule.shifts_unassigned" }, me)).toBe("Expired");
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, type: "people.ownership_transfer_requested" }, me)).toBe("Expired");
    expect(resolutionLabel({ resolution: "restored", resolved_by: null, type: "documents.access_changed" }, me)).toBe("Restored");
  });

  // Variant A (frame.js resA): a document that ran out says nothing about it; its own line says what it is.
  it("says nothing on a document that ran out", () => {
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, type: "documents.due_soon" }, me)).toBeNull();
    expect(resolutionLabel({ resolution: "expired", resolved_by: null, type: "documents.expiring" }, me)).toBeNull();
  });

  it("says what the person did on cards they answered themselves", () => {
    expect(resolutionLabel({ resolution: "applied", resolved_by: me }, me)).toBe("You applied");
    expect(resolutionLabel({ resolution: "taken", resolved_by: null }, me)).toBe("Taken");
    expect(resolutionLabel({ resolution: "submitted", resolved_by: me }, me)).toBe("You handed it in");
    expect(resolutionLabel({ resolution: "acknowledged", resolved_by: me }, me)).toBe("You acknowledged");
  });
});

// S-251: every row is two lines; the second is the body, or once the card closed, how it closed (no time:
// the time at its right stays the arrival).
describe("rowLines", () => {
  it("is the title, then the body", () => {
    expect(rowLines(notice(), me)).toEqual({ first: "Time off request from Tom Becker", second: "Wed, Oct 21 · Jury duty summons.", closed: false });
  });

  it("keeps an empty second line when there is no body", () => {
    expect(rowLines(notice({ body: null }), me)).toEqual({ first: "Time off request from Tom Becker", second: "", closed: false });
  });

  it("says how a closed card closed instead of its body, without a time", () => {
    const closed = notice({ resolved_at: at(0, 0, 2), resolution: "approved", resolved_by: me });
    expect(rowLines(closed, me)).toEqual({ first: "Time off request from Tom Becker", second: "You approved", closed: true });
    expect(rowLines(notice({ resolved_at: at(0, 1), resolution: "approved", resolved_by: "someone-else", resolved_by_name: "Deniz P." }), me).second).toBe("Approved by Deniz P.");
  });

  it("keeps the body of a document that ran out", () => {
    const ran = notice({ type: "documents.due_soon", area: "documents", body: "Food handler card", resolved_at: at(0, 1), resolution: "expired" });
    expect(rowLines(ran, me)).toEqual({ first: "Time off request from Tom Becker", second: "Food handler card", closed: false });
  });
});
