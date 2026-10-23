import { describe, expect, it } from "vitest";
import { timeOffDeadlineAt, timeOffZoneName } from "./time-off-split";
import { inDeviceZone, plain } from "./device-zone.testing";

describe("a deadline in its zone (FB-6.3.8d)", () => {
  it("is written in the request's zone, the same on every device", async () => {
    for (const device of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      await inDeviceZone(device, () => {
        expect(plain(timeOffDeadlineAt("2035-10-09T02:04:00Z", "America/New_York", "12h"))).toBe("Oct 8, 10:04 PM");
        expect(plain(timeOffDeadlineAt("2035-10-09T02:04:00Z", "America/New_York", "24h"))).toBe("Oct 8, 22:04");
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
