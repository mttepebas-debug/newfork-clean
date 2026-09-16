import { describe, expect, it } from "vitest";
import { availableIanaTimezones, isValidIanaTimezone } from "./timezones";
describe("location IANA timezone", () => {
  it("accepts valid geographic regions and rejects absent, fixed-offset, and invented values", () => {
    for (const zone of ["UTC", "America/Los_Angeles", "Europe/Istanbul", "Asia/Kathmandu", "America/Argentina/Buenos_Aires"]) expect(isValidIanaTimezone(zone)).toBe(true);
    for (const zone of ["", "PST", "-08:00", "America/Invented", "Not a timezone"]) expect(isValidIanaTimezone(zone)).toBe(false);
  });
  it("retains a valid saved alias even if runtime's canonical list differs", () => {
    expect(availableIanaTimezones("US/Pacific")).toContain("US/Pacific");
    expect(availableIanaTimezones("invalid")).not.toContain("invalid");
  });
});
