import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  arcPoint,
  arcSegments,
  countdown,
  managerOnFloor,
  daySlot,
  homeWeek,
  minutesOf,
} from "./home-model";

const zone = "America/Los_Angeles";
const base: EmployeeHubShift = {
  id: "10000000-0000-4000-8000-000000000001",
  location_id: "20000000-0000-4000-8000-000000000001",
  location_name: "Mission St",
  employee_id: "30000000-0000-4000-8000-000000000001",
  job_name: "Server",
  note: "",
  scheduled_date: "2026-10-16",
  start_time: "16:00",
  end_time: "23:00",
};
const mate = (name: string, patch: Partial<EmployeeHubShift> = {}): EmployeeHubShift => ({
  ...base,
  id: `40000000-0000-4000-8000-${String(name.length).padStart(12, "0")}${name}`.slice(0, 36),
  employee_id: null,
  employee_name: name,
  ...patch,
});
const model = (patch: Partial<EmployeeHubReadModel> = {}): EmployeeHubReadModel => ({
  workspace_id: "50000000-0000-4000-8000-000000000001",
  employee: { id: base.employee_id!, display_name: "Ali Rivera" },
  locations: [{ id: base.location_id, name: "Mission St", timezone: zone }],
  settings: { time_format: "12h" },
  shifts: [base],
  open_shifts: [],
  team_shifts: [],
  team: [],
  leave_days: [],
  ...patch,
});

describe("home model", () => {
  it("reads a wall time as minutes after midnight", () => {
    expect(minutesOf("16:30")).toBe(990);
    expect(minutesOf("00:00:00")).toBe(0);
  });

  it("names the part of the day the sky follows", () => {
    expect(daySlot(8 * 60)).toBe("morning");
    expect(daySlot(13 * 60)).toBe("afternoon");
    expect(daySlot(18 * 60 + 20)).toBe("evening");
    expect(daySlot(23 * 60 + 40)).toBe("night");
    expect(daySlot(3 * 60)).toBe("night");
  });

  it("counts down in hours and minutes, then days", () => {
    expect(countdown(25 * 60_000)).toBe("25m");
    expect(countdown(2 * 3_600_000)).toBe("2h");
    expect(countdown(2 * 3_600_000 + 15 * 60_000)).toBe("2h 15m");
    expect(countdown(26 * 3_600_000)).toBe("1 day");
    expect(countdown(50 * 3_600_000)).toBe("2 days");
    expect(countdown(-5)).toBe("0m");
  });

  it("puts a shift on the 6 AM – midnight arc, an overnight one to its end", () => {
    expect(arcSegments([{ start_time: "16:00", end_time: "23:00" }])).toEqual([{ from: 10 / 18, to: 17 / 18 }]);
    expect(arcSegments([{ start_time: "22:00", end_time: "02:00" }])).toEqual([{ from: 16 / 18, to: 1 }]);
    expect(arcSegments([{ start_time: "04:00", end_time: "07:00" }])).toEqual([{ from: 0, to: 1 / 18 }]);
    const [x0, y0] = arcPoint(0);
    const [xm, ym] = arcPoint(0.5);
    expect(x0).toBeCloseTo(12);
    expect(xm).toBeCloseTo(179);
    expect(ym).toBeLessThan(y0);
  });

  it("names a manager on the floor only when one works the same place and time", () => {
    const team = [
      mate("Mina Park", { start_time: "15:00", end_time: "23:00", job_name: "Manager", is_management: true }),
      mate("Priya Shah"),
    ];
    expect(managerOnFloor(model({ team_shifts: team }), base)?.name).toBe("Mina Park");
    expect(managerOnFloor(model({ team_shifts: [team[1]!] }), base)).toBeNull();
    const morning = mate("Tom Becker", { start_time: "07:00", end_time: "12:00", is_management: true });
    expect(managerOnFloor(model({ team_shifts: [morning] }), base)).toBeNull();
    // Her earlier shift that day is not a Management one; her Management shift still counts.
    const two = [mate("Mina Park", { start_time: "12:00", end_time: "17:00" }), { ...team[0]!, id: "40000000-0000-4000-8000-000000000099" }];
    expect(managerOnFloor(model({ team_shifts: two }), base)?.name).toBe("Mina Park");
  });

  it("builds seven days from today with hours, time off and open shifts", () => {
    const m = model({
      shifts: [base, { ...base, id: "60000000-0000-4000-8000-000000000001", scheduled_date: "2026-10-17", start_time: "11:00", end_time: "17:00" }],
      open_shifts: [{ ...base, id: "70000000-0000-4000-8000-000000000001", employee_id: null, scheduled_date: "2026-10-18" }],
      leave_days: ["2026-10-19"],
    });
    // QA 38: the unassigned shift on Oct 18 alone is no open shift for an employee.
    expect(homeWeek(m, "2026-10-16")[2]!.open).toBe(0);
    // A released shift in the pool that day is.
    const week = homeWeek(m, "2026-10-16", ["2026-10-18"]);
    expect(week).toHaveLength(7);
    expect(week.map((day) => day.date)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(week[0]!.hours).toBe(7);
    expect(week[1]!.hours).toBe(6);
    expect(week[2]!.open).toBe(1);
    expect(week[3]!.timeOff).toBe(true);
    expect(week[0]!.weekday).toBe("Fri");
  });

  it("marks time off from the server's leave days (time off rebuild D3)", () => {
    const week = homeWeek(model({ leave_days: ["2026-10-17", "2026-10-22"] }), "2026-10-16");
    expect(week.filter((day) => day.timeOff).map((day) => day.date)).toEqual(["2026-10-17", "2026-10-22"]);
  });
});
