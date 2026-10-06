import { describe, expect, it } from "vitest";
import { timeOffPeriodInputSchema } from "./time-off";

const period = { segment_date: "2035-01-15", start_time: "09:00", end_time: "17:00" };
describe("time-off requested periods", () => {
  it("accepts full days", () => {
    expect(timeOffPeriodInputSchema.parse({ segment_date: period.segment_date })).toMatchObject({ start_time: null, end_time: null, ends_next_day: false });
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
});
