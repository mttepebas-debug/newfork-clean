import { describe, expect, it } from "vitest";
import {
  assessWeeklyAvailability,
  availabilityPeriodIsPublished,
  weeklyAvailabilityInputSchema,
  type AvailabilityDay,
  availabilityForDate,
  availabilityVersionForDate,
  availableDayFromUnavailableWindows,
  assessEmployeeAvailability,
} from "./availability";

const days = (): AvailabilityDay[] =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    mode: "unrestricted",
    windows: [],
  }));

describe("unavailable-hour input", () => {
  it("makes Lunch unavailable when the employee blocks 10am to 5pm", () => {
    const monday = availableDayFromUnavailableWindows(1, [
      { start: "10:00", end: "17:00" },
    ]);
    expect(monday.windows).toEqual([
      { start: "00:00", end: "10:00" },
      { start: "17:00", end: "24:00" },
    ]);
    const week = days().map((day) => (day.day === 1 ? monday : day));
    expect(
      assessWeeklyAvailability({
        days: week,
        weekday: 1,
        start: "12:00",
        end: "16:00",
      }).coverage,
    ).toBe("none");
    expect(
      assessWeeklyAvailability({
        days: week,
        weekday: 1,
        start: "17:00",
        end: "21:00",
      }).coverage,
    ).toBe("full");
  });
  it("preserves all five available pieces around four blocked ranges", () => {
    const result = availableDayFromUnavailableWindows(1, [
      { start: "01:00", end: "02:00" },
      { start: "05:00", end: "06:00" },
      { start: "10:00", end: "11:00" },
      { start: "15:00", end: "16:00" },
    ]);
    expect(result.windows).toHaveLength(5);
    expect(result.windows.at(-1)).toEqual({ start: "16:00", end: "24:00" });
    expect(
      weeklyAvailabilityInputSchema.safeParse({
        timezone: "UTC",
        days: days().map((day) => (day.day === 1 ? result : day)),
      }).success,
    ).toBe(true);
  });
  it("handles full-day, touching and empty exclusions without zero-length pieces", () => {
    expect(
      availableDayFromUnavailableWindows(1, [{ start: "00:00", end: "24:00" }])
        .mode,
    ).toBe("unavailable");
    expect(availableDayFromUnavailableWindows(1, []).mode).toBe("unrestricted");
    expect(
      availableDayFromUnavailableWindows(1, [
        { start: "00:00", end: "10:00" },
        { start: "10:00", end: "24:00" },
      ]).windows,
    ).toEqual([]);
  });
  it("preserves second boundaries and rejects incomplete, overlapping or overnight input", () => {
    expect(
      availableDayFromUnavailableWindows(1, [
        { start: "10:00:30", end: "17:00:45" },
      ]).windows,
    ).toEqual([
      { start: "00:00", end: "10:00:30" },
      { start: "17:00:45", end: "24:00" },
    ]);
    for (const windows of [
      [{ start: "", end: "17:00" }],
      [{ start: "22:00", end: "02:00" }],
      [
        { start: "10:00", end: "15:00" },
        { start: "14:00", end: "17:00" },
      ],
    ])
      expect(() => availableDayFromUnavailableWindows(1, windows)).toThrow();
  });
});
describe("availability input and interval contract", () => {
  it.each([
    { start: "17:00", end: "10:00" },
    { start: "10:00", end: "10:00" },
  ])("rejects reversed/empty windows %j", (window) => {
    const rules = days();
    rules[1] = { day: 1, mode: "windows", windows: [window] };
    expect(
      weeklyAvailabilityInputSchema.safeParse({
        timezone: "America/Los_Angeles",
        days: rules,
      }).success,
    ).toBe(false);
  });
  it("rejects invalid timezone, repeated day, empty windows and overlaps", () => {
    expect(
      weeklyAvailabilityInputSchema.safeParse({
        timezone: "Mars/Olympus",
        days: days(),
      }).success,
    ).toBe(false);
    expect(
      weeklyAvailabilityInputSchema.safeParse({
        timezone: "UTC",
        days: days().map((d) => ({ ...d, day: 1 })),
      }).success,
    ).toBe(false);
    for (const windows of [
      [],
      [
        { start: "09:00", end: "13:00" },
        { start: "12:00", end: "17:00" },
      ],
    ]) {
      const rules = days();
      rules[1] = { day: 1, mode: "windows", windows };
      expect(
        weeklyAvailabilityInputSchema.safeParse({
          timezone: "UTC",
          days: rules,
        }).success,
      ).toBe(false);
    }
  });
  it("allows touching windows and an exact midnight end", () => {
    const rules = days();
    rules[1] = {
      day: 1,
      mode: "windows",
      windows: [
        { start: "12:00", end: "14:00" },
        { start: "14:00", end: "24:00" },
      ],
    };
    expect(
      weeklyAvailabilityInputSchema.safeParse({ timezone: "UTC", days: rules })
        .success,
    ).toBe(true);
    expect(
      assessWeeklyAvailability({
        days: rules,
        weekday: 1,
        start: "12:00",
        end: "16:00",
      }).coverage,
    ).toBe("full");
  });
  it.each([
    ["12:00", "16:00", "none"],
    ["09:00", "10:00", "full"],
    ["09:00", "10:01", "partial"],
    ["17:00", "20:00", "full"],
  ])("10–17 unavailable assesses %s–%s as %s", (start, end, coverage) => {
    const rules = days();
    rules[1] = {
      day: 1,
      mode: "windows",
      windows: [
        { start: "00:00", end: "10:00" },
        { start: "17:00", end: "24:00" },
      ],
    };
    expect(
      assessWeeklyAvailability({ days: rules, weekday: 1, start, end })
        .coverage,
    ).toBe(coverage);
  });
  it("checks next day across a week boundary", () => {
    const rules = days();
    rules[0] = { day: 0, mode: "unavailable", windows: [] };
    expect(
      assessWeeklyAvailability({
        days: rules,
        weekday: 6,
        start: "22:00",
        end: "02:00",
      }),
    ).toEqual({
      coverage: "partial",
      unavailable: [{ start: 86400, end: 93600 }],
    });
  });
  it("does not infer confirmed availability from missing data", () => {
    expect(
      assessWeeklyAvailability({
        days: null,
        weekday: 1,
        start: "12:00",
        end: "16:00",
      }).coverage,
    ).toBe("unknown");
  });
});

describe("published availability period", () => {
  const locks = [
    {
      location_id: "11111111-1111-4111-8111-111111111111",
      location_name: "Main",
      starts_on: "2026-09-14",
      ends_on: "2026-09-20",
    },
  ];
  it("locks a recurring rule that would reach an already published future week", () => {
    expect(availabilityPeriodIsPublished("2026-09-07", null, locks)).toBe(true);
  });
  it("permits an open bounded gap and dates after publication", () => {
    expect(
      availabilityPeriodIsPublished("2026-09-07", "2026-09-13", locks),
    ).toBe(false);
    expect(availabilityPeriodIsPublished("2026-09-21", null, locks)).toBe(
      false,
    );
  });
  it("includes both ends of a published period", () => {
    expect(
      availabilityPeriodIsPublished("2026-09-20", "2026-09-20", locks),
    ).toBe(true);
  });
});

describe("effective availability selection", () => {
  const baseline = days();
  const temporary = days().map((day) => ({
    ...day,
    mode: "unavailable" as const,
  }));
  const employee = {
    availability: baseline,
    availability_versions: [
      {
        revision: 1,
        effective_from: "2026-09-01",
        effective_until: null,
        days: baseline,
      },
      {
        revision: 2,
        effective_from: "2026-09-14",
        effective_until: "2026-09-20",
        days: temporary,
      },
    ],
  };
  it("selects by evaluated date and returns to the applicable baseline", () => {
    expect(availabilityForDate(employee, "2026-09-13")).toEqual(baseline);
    expect(availabilityForDate(employee, "2026-09-14")).toEqual(temporary);
    expect(availabilityForDate(employee, "2026-09-20")).toEqual(temporary);
    expect(availabilityForDate(employee, "2026-09-21")).toEqual(baseline);
    expect(availabilityForDate(employee, "2026-08-31")).toBeNull();
  });
  it("checks both revisions when an overnight shift crosses the effective date", () => {
    expect(
      assessEmployeeAvailability(employee, "2026-09-13", "22:00", "02:00")
        .coverage,
    ).toBe("partial");
  });
  it("keeps a temporary pattern above a newer weekly baseline and reveals that baseline after expiry", () => {
    const versions = [
      ...employee.availability_versions,
      {
        revision: 3,
        effective_from: "2026-09-15",
        effective_until: null,
        days: baseline,
      },
    ];
    expect(availabilityVersionForDate(versions, "2026-09-16")?.revision).toBe(
      2,
    );
    expect(availabilityVersionForDate(versions, "2026-09-21")?.revision).toBe(
      3,
    );
  });
  it("replaces only explicitly named patterns during the replacement dates", () => {
    const versions = [
      {
        ...employee.availability_versions[0]!,
        id: "weekly",
        kind: "weekly" as const,
      },
      {
        ...employee.availability_versions[1]!,
        id: "temporary",
        kind: "temporary" as const,
      },
      {
        revision: 3,
        id: "replacement",
        kind: "weekly" as const,
        effective_from: "2026-09-16",
        effective_until: "2026-09-17",
        days: baseline,
        replace_version_ids: ["temporary"],
      },
    ];
    expect(availabilityVersionForDate(versions, "2026-09-15")?.id).toBe(
      "temporary",
    );
    expect(availabilityVersionForDate(versions, "2026-09-16")?.id).toBe(
      "replacement",
    );
    expect(availabilityVersionForDate(versions, "2026-09-18")?.id).toBe(
      "temporary",
    );
    expect(availabilityVersionForDate(versions, "2026-09-21")?.id).toBe(
      "weekly",
    );
  });
});
