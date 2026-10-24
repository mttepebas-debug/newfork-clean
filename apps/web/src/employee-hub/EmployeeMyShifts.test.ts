import type { EmployeeHubReadModel } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { mergedWeeks, switchWeeks, weekDays, weekRange } from "./EmployeeMyShifts";

const me = "15000000-0000-4000-8000-000000000001";
const shift = {
  id: "22000000-0000-4000-8000-000000000001",
  location_id: "11000000-0000-4000-8000-000000000001",
  location_name: "Main Dining",
  job_name: "Server",
  scheduled_date: "2026-08-25",
  start_time: "09:00",
  end_time: "17:00",
  note: "",
  employee_id: me,
};
const model = (leave_days: string[] = []): EmployeeHubReadModel => ({
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  settings: { time_format: "12h" },
  employee: { id: me, display_name: "Alex Kim" },
  locations: [],
  shifts: [shift],
  open_shifts: [{ ...shift, id: "22000000-0000-4000-8000-000000000005", scheduled_date: "2026-08-28", employee_id: null }],
  team_shifts: [],
  team: [],
  leave_days,
});

describe("My shifts: what each day says", () => {
  // The read's days off, old and new time off alike (time off rebuild D3, D7).
  it("marks the days the read says are off, the person's shifts and the pool's released shifts", () => {
    const days = weekDays(
      model(["2026-08-26"]),
      "2026-08-24",
      // A released shift in the pool on Aug 28 (QA 38).
      ["2026-08-28"],
    );
    expect(days.filter((day) => day.timeOff).map((day) => day.date)).toEqual(["2026-08-26"]);
    expect(days[1]!.shifts.map((item) => item.id)).toEqual([shift.id]);
    expect(days[4]!.open).toBe(1);
  });

  // Mert 2026-10-24: a week not posted yet keeps its seven days, each saying Not published; a read without the
  // posted days (before the database sends them) counts every day as posted.
  it("marks the days whose week isn't posted", () => {
    const posted = weekDays({ ...model(), posted_days: ["2026-08-24", "2026-08-25"] }, "2026-08-24");
    expect(posted.filter((day) => !day.posted).map((day) => day.date)).toEqual(["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]);
    expect(weekDays(model(), "2026-08-24").every((day) => day.posted)).toBe(true);
  });
});

describe("My shifts: the two weeks asked one by one", () => {
  // Each week is its own read; the days off of the second one are kept too.
  it("keeps both weeks' shifts and days off", () => {
    const week = mergedWeeks([model(["2026-08-26"]), { ...model(["2026-09-02"]), shifts: [{ ...shift, id: "22000000-0000-4000-8000-000000000009", scheduled_date: "2026-09-01" }] }]);
    expect(week?.leave_days).toEqual(["2026-08-26", "2026-09-02"]);
    expect(week?.shifts.map((item) => item.scheduled_date)).toEqual(["2026-08-25", "2026-09-01"]);
    // A week still on its way leaves only its own days out: the switch and the other week stay (variant A).
    expect(mergedWeeks([undefined, model(["2026-08-26"])])?.leave_days).toEqual(["2026-08-26"]);
    expect(mergedWeeks([undefined, undefined])).toBeUndefined();
  });

  it("keeps both weeks' posted days, and none when a read doesn't send them", () => {
    const week = mergedWeeks([{ ...model(), posted_days: ["2026-08-24"] }, { ...model(), posted_days: ["2026-08-31"] }]);
    expect(week?.posted_days).toEqual(["2026-08-24", "2026-08-31"]);
    expect(mergedWeeks([{ ...model(), posted_days: ["2026-08-24"] }, model()])?.posted_days).toBeUndefined();
  });
});

describe("My shifts: the two weeks of the switch", () => {
  it("is This week and Next week, open on the week the address names", () => {
    expect(switchWeeks("2026-08-24", null, "monday")).toEqual({ starts: ["2026-08-24", "2026-08-31"], labels: ["This week", "Next week"], open: 0 });
    expect(switchWeeks("2026-08-24", "2026-09-03", "monday").open).toBe(1);
    expect(switchWeeks("2026-08-24", "not-a-day", "monday").open).toBe(0);
  });

  it("puts a week further on, or back, beside This week under its dates", () => {
    expect(switchWeeks("2026-08-24", "2026-09-16", "monday")).toEqual({ starts: ["2026-08-24", "2026-09-14"], labels: ["This week", "Sep 14 – Sep 20"], open: 1 });
    expect(switchWeeks("2026-08-24", "2026-08-12", "monday")).toEqual({ starts: ["2026-08-10", "2026-08-24"], labels: ["Aug 10 – Aug 16", "This week"], open: 0 });
    // The week just before this one is Last week (week switch variant A, Mert 2026-10-23).
    expect(switchWeeks("2026-08-24", "2026-08-19", "monday")).toEqual({ starts: ["2026-08-17", "2026-08-24"], labels: ["Last week", "This week"], open: 0 });
    expect(switchWeeks("2026-08-23", "2026-09-16", "sunday").starts[1]).toBe("2026-09-13");
    expect(weekRange("2026-10-26")).toBe("Oct 26 – Nov 1");
  });
});
