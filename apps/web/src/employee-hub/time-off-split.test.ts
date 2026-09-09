import { describe, expect, it } from "vitest";
import { resolveTimeOffSplit, timeOffWallParts } from "./time-off-split";

describe("time-off split clocks", () => {
  it("resolves the request zone without the browser zone and preserves seconds", () => {
    expect(resolveTimeOffSplit("2035-01-15", "12:30:01", "America/New_York")).toBe("2035-01-15T17:30:01.000Z");
    expect(timeOffWallParts("2035-01-16T05:00:00Z", "America/New_York")).toEqual({ date: "2035-01-16", clock: "00:00:00" });
  });
  it("rejects incomplete clocks, normalized invalid dates and nonexistent DST clocks", () => {
    expect(() => resolveTimeOffSplit("2035-01-15", "12:", "UTC")).toThrow();
    expect(() => resolveTimeOffSplit("2035-02-31", "12:00", "UTC")).toThrow();
    expect(() => resolveTimeOffSplit("2026-03-08", "02:30", "America/New_York")).toThrow(/does not exist/);
  });
  it("distinguishes both occurrences of repeated clock hours", () => {
    expect(() => resolveTimeOffSplit("2026-11-01", "01:30", "America/New_York")).toThrow(/repeats/);
    expect(resolveTimeOffSplit("2026-11-01", "01:30", "America/New_York", "earlier")).toBe("2026-11-01T05:30:00.000Z");
    expect(resolveTimeOffSplit("2026-11-01", "01:30", "America/New_York", "later")).toBe("2026-11-01T06:30:00.000Z");
  });
  it("handles a half-hour fold", () => {
    expect(resolveTimeOffSplit("2026-04-05", "01:45", "Australia/Lord_Howe", "earlier")).toBe("2026-04-04T14:45:00.000Z");
    expect(resolveTimeOffSplit("2026-04-05", "01:45", "Australia/Lord_Howe", "later")).toBe("2026-04-04T15:15:00.000Z");
  });
});
