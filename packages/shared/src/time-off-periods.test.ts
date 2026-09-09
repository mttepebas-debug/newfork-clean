import { describe, expect, it } from "vitest";
import { employeeTimeOffInputSchema } from "./employee-hub";
import { timeOffPeriodInputSchema } from "./time-off";

const location_id = "af990000-0000-4000-8000-000000000003";
const request_id = "af990000-0000-4000-8000-000000000005";
const period = { segment_date: "2035-01-15", start_time: "09:00", end_time: "17:00" };
describe("time-off requested periods", () => {
  it("accepts full days and keeps dates-only clients compatible", () => {
    expect(timeOffPeriodInputSchema.parse({ segment_date: period.segment_date })).toMatchObject({ start_time: null, end_time: null, ends_next_day: false });
    expect(employeeTimeOffInputSchema.safeParse({ location_id, dates: [period.segment_date] }).success).toBe(true);
  });
  it("requires one input representation and an operation key for hourly requests", () => {
    expect(employeeTimeOffInputSchema.safeParse({ location_id, periods: [period] }).success).toBe(false);
    expect(employeeTimeOffInputSchema.safeParse({ location_id, request_id, expected_timezone: "UTC", periods: [period] }).success).toBe(true);
    expect(employeeTimeOffInputSchema.safeParse({ location_id, request_id, expected_timezone: "UTC", dates: [period.segment_date], periods: [period] }).success).toBe(false);
    expect(employeeTimeOffInputSchema.safeParse({ location_id, request_id }).success).toBe(false);
  });
  it("requires explicit overnight and retains exact second precision", () => {
    const overnight = { ...period, start_time: "23:00:01", end_time: "02:00:02" };
    expect(timeOffPeriodInputSchema.safeParse(overnight).success).toBe(false);
    expect(timeOffPeriodInputSchema.parse({ ...overnight, ends_next_day: true }).end_time).toBe("02:00:02");
  });
  it("allows end-of-day and explicit 24-hour periods but rejects longer ones", () => {
    expect(timeOffPeriodInputSchema.safeParse({ ...period, end_time: "24:00" }).success).toBe(true);
    expect(timeOffPeriodInputSchema.safeParse({ ...period, end_time: "09:00", ends_next_day: true }).success).toBe(true);
    expect(timeOffPeriodInputSchema.safeParse({ ...period, ends_next_day: true }).success).toBe(false);
    expect(timeOffPeriodInputSchema.safeParse({ segment_date: period.segment_date, ends_next_day: true }).success).toBe(false);
  });
  it("rejects unfinished or malformed clock pairs", () => {
    for (const patch of [{ start_time: "", end_time: "17:00" }, { start_time: "10:00", end_time: null }, { start_time: "24:00" }, { end_time: "09:00" }])
      expect(timeOffPeriodInputSchema.safeParse({ ...period, ...patch }).success).toBe(false);
  });
  it("rejects more than 31 dates without silently truncating them", () => {
    const periods = Array.from({ length: 32 }, (_, i) => ({ segment_date: new Date(Date.UTC(2035, 0, i + 1)).toISOString().slice(0, 10) }));
    expect(employeeTimeOffInputSchema.safeParse({ location_id, request_id, expected_timezone: "UTC", periods }).success).toBe(false);
  });
});
