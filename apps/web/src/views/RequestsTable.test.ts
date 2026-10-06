import { describe, expect, it } from "vitest";
import { dateRange, shortDate } from "./RequestsTable";

// K-S10: one date form across Requests; the year only when it is not this year.
describe("Requests dates", () => {
  const now = new Date("2026-10-06T12:00:00");
  it("leaves this year's year out and names another year's", () => {
    expect(shortDate("2026-10-11", {}, now)).toBe("Oct 11");
    expect(shortDate("2027-01-04", {}, now)).toBe("Jan 4, 2027");
  });
  it("names a shift's weekday", () => {
    expect(shortDate("2026-10-12", { weekday: true }, now)).toBe("Mon, Oct 12");
  });
  it("writes a range in one year with the year once, at its end", () => {
    expect(dateRange("2026-10-24", "2026-10-26", now)).toBe("Oct 24 – Oct 26");
    expect(dateRange("2029-04-25", "2029-04-27", now)).toBe("Apr 25 – Apr 27, 2029");
    expect(dateRange("2026-12-30", "2027-01-02", now)).toBe("Dec 30 – Jan 2, 2027");
    expect(dateRange("2026-10-11", "2026-10-11", now)).toBe("Oct 11");
  });
});
