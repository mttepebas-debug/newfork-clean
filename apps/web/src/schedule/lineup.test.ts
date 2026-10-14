import { describe, expect, it } from "vitest";

import { lineupDay, lineupShiftSpan, lineupWeek, phoneLineupShift } from "./lineup";
import { aisha, chloe, day, dinner, downtown, hannah, host, lunch, maria, model, oldJob, server, cook, shift, uptown } from "./lineup.testing";

// Lineup, read-only first stage (Mert 2026-10-13): the day's live shifts per
// location and shift type, grouped by department and job.

describe("lineupDay", () => {
  it("puts locations and shift types in their catalog order", () => {
    const result = lineupDay(model([]), day);
    expect(result.map((location) => location.name)).toEqual(["Downtown", "Uptown"]);
    expect(result[0]!.shifts.map((s) => [s.name, s.count])).toEqual([["Lunch", 0], ["Dinner", 0]]);
  });

  it("groups the day's people by department, then job, earliest first", () => {
    const result = lineupDay(
      model([
        shift({ employee: hannah, job: server, type: lunch, start: "11:30", end: "16:00", labels: ["Training"] }),
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
        shift({ employee: aisha, job: cook, type: lunch, start: "10:00", end: "16:00" }),
        shift({ employee: chloe, job: host, type: lunch, start: "11:00", end: "16:00" }),
      ]),
      day,
    );
    const lunchShift = result[0]!.shifts[0]!;
    expect(lunchShift.count).toBe(4);
    expect(lunchShift.departments.map((d) => d.name)).toEqual(["Front of House", "Kitchen"]);
    expect(lunchShift.departments[0]!.jobs.map((j) => j.name)).toEqual(["Host", "Server"]);
    expect(lunchShift.departments[0]!.jobs[1]!.rows.map((r) => [r.name, r.startTime, r.labels])).toEqual([
      ["Maria Lopez", "11:00", []],
      ["Hannah Lee", "11:30", ["Training"]],
    ]);
  });

  it("leaves out open shifts, other days and other locations", () => {
    const result = lineupDay(
      model([
        shift({ employee: null, job: server, type: lunch, start: "11:00", end: "16:00" }),
        shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00", date: "2026-10-14" }),
        shift({ employee: hannah, job: server, type: lunch, start: "11:00", end: "16:00", location: uptown }),
      ]),
      day,
    );
    expect(result[0]!.shifts[0]!.count).toBe(0);
    expect(result[1]!.shifts[0]!.count).toBe(1);
  });

  it("keeps shifts without a shift type, and archived jobs by name", () => {
    const result = lineupDay(
      model([shift({ employee: maria, job: oldJob, type: null, start: "09:00", end: "12:00" })]),
      day,
    );
    const none = result[0]!.shifts.at(-1)!;
    expect(none.name).toBe("No shift type");
    expect(none.departments[0]!.name).toBe("Other");
    expect(none.departments[0]!.jobs[0]!.name).toBe("Barback");
  });

  it("filters by location and shift type", () => {
    const result = lineupDay(model([]), day, { locationId: uptown, shiftTypeId: dinner });
    expect(result.map((l) => l.name)).toEqual(["Uptown"]);
    expect(result[0]!.shifts.map((s) => s.name)).toEqual(["Dinner"]);
  });

  it("names a published closed day and short hours, not a scheduled one", () => {
    const closure = (kind: "closed" | "short", location: string, status?: "scheduled") => ({
      id: `80000000-0000-4000-8000-00000000000${kind === "closed" ? 1 : 2}`,
      location_id: location,
      closed_date: day,
      title: kind === "closed" ? "Private event" : "Early close",
      is_all_day: kind === "closed",
      kind,
      opens: kind === "short" ? "11:00" : null,
      closes: kind === "short" ? "20:00" : null,
      status,
    });
    const result = lineupDay(model([], [closure("closed", downtown), closure("short", uptown, "scheduled")]), day);
    expect(result[0]!.closed?.title).toBe("Private event");
    expect(result[1]!.shortHours).toBeNull();
  });
});

describe("lineupWeek", () => {
  it("lists the seven days from the week start", () => {
    expect(lineupWeek("2026-10-12")).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });
});

// Phone Lineup (Mert 2026-10-14): one shift at a time, under tabs.
describe("phoneLineupShift", () => {
  const shifts = lineupDay(
    model([
      shift({ employee: maria, job: server, type: lunch, start: "11:00", end: "16:00" }),
      shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" }),
    ]),
    day,
  )[0]!.shifts;

  it("opens on the chosen shift when there is one", () => {
    expect(phoneLineupShift(shifts, dinner, null)?.name).toBe("Dinner");
  });

  it("today, opens on the first shift still on the floor", () => {
    expect(phoneLineupShift(shifts, "", "10:00")?.name).toBe("Lunch");
    expect(phoneLineupShift(shifts, "", "17:30")?.name).toBe("Dinner");
    // After everyone left, the last shift with people.
    expect(phoneLineupShift(shifts, "", "23:30")?.name).toBe("Dinner");
  });

  it("another day, opens on the first shift with people", () => {
    expect(phoneLineupShift(shifts, "", null)?.name).toBe("Lunch");
    const empty = lineupDay(model([shift({ employee: hannah, job: server, type: dinner, start: "16:00", end: "23:00" })]), day)[0]!.shifts;
    expect(phoneLineupShift(empty, "", null)?.name).toBe("Dinner");
    expect(phoneLineupShift(lineupDay(model([]), day)[0]!.shifts, "", null)?.name).toBe("Lunch");
    expect(phoneLineupShift([], "", null)).toBeNull();
  });

  it("falls back when the chosen shift is not at this location", () => {
    expect(phoneLineupShift(shifts, "nope", null)?.name).toBe("Lunch");
  });
});

describe("lineupShiftSpan", () => {
  it("gives the first start and the last end, past midnight too", () => {
    const [lunchShift] = lineupDay(
      model([
        shift({ employee: maria, job: server, type: lunch, start: "11:30", end: "16:00" }),
        shift({ employee: hannah, job: server, type: lunch, start: "10:00", end: "15:00" }),
        shift({ employee: chloe, job: host, type: lunch, start: "18:00", end: "01:00", crossesMidnight: true }),
      ]),
      day,
    )[0]!.shifts;
    expect(lineupShiftSpan(lunchShift!)).toEqual({ firstIn: "10:00", lastOut: "01:00" });
  });

  it("is empty for a shift no one works", () => {
    expect(lineupShiftSpan(lineupDay(model([]), day)[0]!.shifts[0]!)).toBeNull();
  });
});
