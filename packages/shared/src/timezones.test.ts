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
describe("scheduled export IANA timezone (BL-272)", () => {
  it("refuses to save a scheduled export in a time zone that does not exist", async () => {
    const { createScheduleExportScheduleInputSchema, updateScheduleExportScheduleInputSchema } = await import("./index");
    const input = {
      name: "Monday managers",
      preset_id: "89000000-0000-4000-8000-000000000001",
      recipients: ["manager@example.test"],
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      day_of_week: 1,
      send_hour: 8,
      timezone: "America/Los_Angeles",
    };
    expect(createScheduleExportScheduleInputSchema.safeParse(input).success).toBe(true);
    expect(createScheduleExportScheduleInputSchema.safeParse({ ...input, timezone: "Mars/Olympus_Mons" }).success).toBe(false);
    expect(updateScheduleExportScheduleInputSchema.safeParse({ timezone: "Mars/Olympus_Mons" }).success).toBe(false);
  });
});
