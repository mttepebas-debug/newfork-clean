import { describe, expect, it } from "vitest";
import { ago, documentNeedsYou, homeUpdates, updateKind } from "./home-data";
import { notice } from "../notifications/notification-fixtures.test-util";

describe("home updates", () => {
  it("draws a published week as a calendar, a decision as a tick or a cross", () => {
    expect(updateKind({ type: "schedule.published", data: {}, title: "Next week is published" })).toBe("cal");
    expect(updateKind({ type: "time_off.decided", data: { outcome: "approved" }, title: "Time off approved" })).toBe("ok");
    expect(updateKind({ type: "time_off.decided", data: { outcome: "denied" }, title: "Time off" })).toBe("no");
    expect(updateKind({ type: "shift_changes.decided", data: {}, title: "Swap with Priya declined" })).toBe("no");
    expect(updateKind({ type: "time_off.decided", data: { outcome: "expired" }, title: "Your time off wasn't answered in time" })).toBe("no");
    expect(updateKind({ type: "time_off.decided", data: { outcome: "revoked" }, title: "Your time off was revoked" })).toBe("no");
  });

  // The feed's topic is the group (my_schedule, time_off …), the type the event: Updates picks by type.
  it("keeps a published week and the person's decided requests, at most three", () => {
    const row = (id: string, type: string, topic: string, url = "/app/employee-hub/schedule") => notice({ id, type, topic, needs_action: false, url });
    const picked = homeUpdates([
      row("1", "schedule.published", "my_schedule"),
      // A decider's copy of someone else's decision (it opens Requests) is not the person's own update.
      row("0", "time_off.decided", "time_off", "/app/schedule/requests?type=time_off"),
      row("2", "announcements.published", "announcements"),
      row("3", "time_off.decided", "time_off"),
      row("4", "shift_changes.decided", "shift_changes"),
      row("5", "schedule.published", "my_schedule"),
    ]);
    expect(picked.map((item) => item.id)).toEqual(["1", "3", "4"]);
    expect(picked[0]).toMatchObject({ kind: "cal", href: "/app/employee-hub/schedule" });
  });

  it("says how long ago the way a phone does", () => {
    const now = new Date("2026-10-16T20:00:00Z");
    expect(ago("2026-10-16T19:59:40Z", now)).toBe("Just now");
    expect(ago("2026-10-16T19:35:00Z", now)).toBe("25m ago");
    expect(ago("2026-10-16T18:00:00Z", now)).toBe("2h ago");
    expect(ago("2026-10-15T18:00:00Z", now)).toBe("Yesterday");
    expect(ago("2026-10-13T18:00:00Z", now)).toBe("3 days ago");
  });
});

describe("documents on Home", () => {
  it("asks for a missing, rejected or expired one, never one in review or closed", () => {
    expect(documentNeedsYou({ kind: "document", status: "missing" })).toBe(true);
    expect(documentNeedsYou({ kind: "document", status: "rejected" })).toBe(true);
    expect(documentNeedsYou({ kind: "document", status: "expired" })).toBe(true);
    expect(documentNeedsYou({ kind: "document", status: "pending_review" })).toBe(false);
    expect(documentNeedsYou({ kind: "document", status: "exempt" })).toBe(false);
    expect(documentNeedsYou({ kind: "acknowledgement", status: "missing" })).toBe(false);
  });

  it("asks for the next one when the server says the approved one runs out soon", () => {
    expect(documentNeedsYou({ kind: "document", status: "completed", expiring_soon: true })).toBe(true);
    expect(documentNeedsYou({ kind: "document", status: "completed", expiring_soon: false })).toBe(false);
    expect(documentNeedsYou({ kind: "document", status: "completed" })).toBe(false);
  });
});
