import { describe, expect, it } from "vitest";
import { ago, updateKind } from "./home-data";

describe("home updates", () => {
  it("draws a published week as a calendar, a decision as a tick or a cross", () => {
    expect(updateKind({ topic: "schedule.published", data: {}, title: "Next week is published" })).toBe("cal");
    expect(updateKind({ topic: "time_off.decided", data: { outcome: "approved" }, title: "Time off approved" })).toBe("ok");
    expect(updateKind({ topic: "time_off.decided", data: { outcome: "denied" }, title: "Time off" })).toBe("no");
    expect(updateKind({ topic: "shift_changes.decided", data: {}, title: "Swap with Priya declined" })).toBe("no");
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
