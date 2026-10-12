import { describe, expect, it } from "vitest";
import { clockRange, dateRange, shortDate } from "./RequestsTable";

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
  it("writes a shift's hours with AM or PM on both ends (Mert, 2026-10-12)", () => {
    expect(clockRange("15:30:00", "23:00:00", "12h")).toBe("3:30 PM–11:00 PM");
    expect(clockRange("11:00", "15:00", "12h")).toBe("11:00 AM–3:00 PM");
    expect(clockRange("00:30", "08:00", "12h")).toBe("12:30 AM–8:00 AM");
    expect(clockRange("15:30", "23:00", "24h")).toBe("15:30–23:00");
  });
  // H2 swap review (KARARLAR 2026-10-07): thin spaces around the dash.
  it("spaces the dash when asked, as the swap review does", () => {
    expect(clockRange("15:30", "23:00", "12h", { spaced: true })).toBe("3:30 PM – 11:00 PM");
    expect(clockRange("07:30", "15:00", "12h", { spaced: true })).toBe("7:30 AM – 3:00 PM");
    expect(clockRange("15:30", "23:00", "24h", { spaced: true })).toBe("15:30 – 23:00");
  });
});
