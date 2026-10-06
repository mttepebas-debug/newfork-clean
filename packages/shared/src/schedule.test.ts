import { describe, expect, it } from "vitest";

import { importantDateCoversDate } from "./schedule";

const today = "2026-10-02";
const once = { starts_on: "2026-08-18", ends_on: "2026-08-19", recurrence: "none" };
const yearly = (starts_on: string, ends_on = starts_on) => ({ starts_on, ends_on, recurrence: "annual" });

// The Schedule's day strip and its closed days (public.schedule_closures) read
// important dates by one rule (KK-92 d).
describe("importantDateCoversDate", () => {
  it("covers a one-time date's own days only", () => {
    expect(importantDateCoversDate(once, "2026-08-19", today)).toBe(true);
    expect(importantDateCoversDate(once, "2027-08-19", today)).toBe(false);
  });

  it("covers a yearly date on its day every year", () => {
    expect(importantDateCoversDate(yearly("2025-07-04"), "2026-07-04", today)).toBe(true);
    expect(importantDateCoversDate(yearly("2025-07-04"), "2026-07-05", today)).toBe(false);
  });

  it("covers a yearly range across New Year", () => {
    expect(importantDateCoversDate(yearly("2025-12-31", "2026-01-02"), "2027-01-01", today)).toBe(true);
    expect(importantDateCoversDate(yearly("2025-12-31", "2026-01-02"), "2027-01-03", today)).toBe(false);
  });

  it("puts 29 February on 28 February in a year without it", () => {
    expect(importantDateCoversDate(yearly("2024-02-29"), "2027-02-28", today)).toBe(true);
    expect(importantDateCoversDate(yearly("2024-02-29"), "2027-03-01", today)).toBe(false);
    expect(importantDateCoversDate(yearly("2024-02-29"), "2028-02-29", today)).toBe(true);
    expect(importantDateCoversDate(yearly("2024-02-29"), "2028-02-28", today)).toBe(false);
  });

  it("covers the years the closed days cover: from its first year to two years ahead", () => {
    expect(importantDateCoversDate(yearly("2026-12-25"), "2025-12-25", today)).toBe(false);
    expect(importantDateCoversDate(yearly("2026-12-25"), "2028-12-25", today)).toBe(true);
    expect(importantDateCoversDate(yearly("2026-12-25"), "2029-12-25", today)).toBe(false);
  });
});
