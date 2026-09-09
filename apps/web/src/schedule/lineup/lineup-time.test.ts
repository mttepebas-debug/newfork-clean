import { describe, expect, it } from "vitest";
import {
  formatLineupInterval,
  labelLineupInterval,
  lineupDateWindow,
  parseLineupDate,
} from "./lineup-time";
describe("Line Up local interval labels", () => {
  it("validates deep-link calendar dates without normalizing nonexistent days", () => {
    expect(parseLineupDate("2032-02-29")).toBe("2032-02-29");
    for (const value of [
      "2030-02-29",
      "2030-02-31",
      "2030-13-01",
      "2030-1-7",
      "0000-01-01",
      null,
    ]) {
      expect(parseLineupDate(value)).toBeNull();
    }
  });
  it("keeps the local evening plan in the employee query after UTC midnight", () => {
    expect(
      lineupDateWindow(new Date("2026-09-07T03:30:00Z"), [
        "America/Los_Angeles",
      ]),
    ).toEqual({ from: "2026-09-06", to: "2026-10-18" });
  });
  it("covers both local days for employees assigned across timezones", () => {
    expect(
      lineupDateWindow(new Date("2026-09-07T03:30:00Z"), [
        "America/Los_Angeles",
        "Asia/Tokyo",
      ]),
    ).toEqual({ from: "2026-09-06", to: "2026-10-19" });
  });
  it("marks a segment that starts on the next local day", () => {
    expect(
      formatLineupInterval(
        {
          start_time: "00:30",
          end_time: "01:30",
          placement_start_at: "2030-02-05T08:30:00Z",
          placement_end_at: "2030-02-05T09:30:00Z",
        },
        "24h",
        "2030-02-04",
        "America/Los_Angeles",
      ),
    ).toBe("2030-02-05 · 00:30–01:30");
  });
  it("uses the location timezone rather than the UTC date", () => {
    expect(
      labelLineupInterval(
        {
          start_time: "22:00",
          end_time: "23:00",
          placement_start_at: "2030-02-05T06:00:00Z",
          placement_end_at: "2030-02-05T07:00:00Z",
        },
        "10p–11p",
        "2030-02-04",
        "America/Los_Angeles",
      ),
    ).toBe("10p–11p");
  });
  it("labels overnight source shifts even without placement metadata", () => {
    expect(
      formatLineupInterval(
        { start_time: "22:00", end_time: "02:00" },
        "24h",
        "2030-02-04",
        "America/Los_Angeles",
      ),
    ).toBe("22:00–02:00 (+1 day)");
  });
});
