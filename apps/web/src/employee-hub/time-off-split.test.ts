import { describe, expect, it } from "vitest";
import { formatTimeOffDeadline, resolveTimeOffSplit, timeOffWallParts, timeOffZoneName } from "./time-off-split";
import { inDeviceZone, plain } from "./device-zone.testing";

describe("time-off decision deadline (FB-6.3.8d)", () => {
  it("is written in the request's zone with its name, the same on every device", async () => {
    for (const device of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      await inDeviceZone(device, () => {
        expect(plain(formatTimeOffDeadline("2035-10-09T02:04:00Z", "America/New_York", "12h"))).toBe("Oct 8, 10:04 PM Eastern Time");
        expect(plain(formatTimeOffDeadline("2035-10-09T02:04:00Z", "America/New_York", "24h"))).toBe("Oct 8, 22:04 Eastern Time");
      });
    }
  });
  // S-226 (Mert 2026-10-20): one way everywhere, the zone's name in words.
  it("names a zone in words, as Pacific Time", () => {
    expect(timeOffZoneName("America/New_York")).toBe("Eastern Time");
    expect(timeOffZoneName("America/Los_Angeles")).toBe("Pacific Time");
    expect(timeOffZoneName("UTC")).toBe("UTC");
  });
});

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
