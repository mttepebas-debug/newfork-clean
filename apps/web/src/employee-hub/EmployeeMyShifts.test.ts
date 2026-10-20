import type { EmployeeHubReadModel } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { switchWeeks, weekDays, weekRange } from "./EmployeeMyShifts";

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
type Request = EmployeeHubReadModel["requests"][number];
const timeOff = (id: number, date: string, extra: Partial<Request> = {}, period: Partial<NonNullable<Request["periods"]>[number]> = {}): Request => ({
  id: `98200000-0000-4000-8000-00000000000${id}`,
  kind: "time_off",
  status: "approved",
  title: "Time off",
  detail: "",
  revision: 1,
  created_at: "2026-08-18T12:00:00Z",
  can_cancel: false,
  periods: [{ id: `98210000-0000-4000-8000-00000000000${id}`, segment_date: date, start_time: null, end_time: null, status: "approved", ...period }],
  ...extra,
});
const model = (requests: Request[]): EmployeeHubReadModel => ({
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  settings: { time_format: "12h" },
  employee: { id: me, display_name: "Alex Kim" },
  locations: [],
  shifts: [shift],
  open_shifts: [{ ...shift, id: "22000000-0000-4000-8000-000000000005", scheduled_date: "2026-08-28", employee_id: null }],
  team_shifts: [],
  requests,
  team: [],
});

describe("My shifts: what each day says", () => {
  it("marks approved time off, and not leave that was taken back, a cancellation's own request, or a day cancelled whole", () => {
    const days = weekDays(
      model([
        timeOff(1, "2026-08-26"),
        timeOff(2, "2026-08-27", { status: "revoked" }),
        timeOff(3, "2026-08-29", { request_type: "time_off_cancellation" }),
        timeOff(4, "2026-08-30", {}, { cancelled_intervals: [{ start_at: "2026-08-30T07:00:00Z", end_at: "2026-08-31T07:00:00Z" }], effective_intervals: [] }),
        timeOff(5, "2026-08-24", { status: "pending" }, { status: "pending" }),
      ]),
      "2026-08-24",
      // A released shift in the pool on Aug 28 (QA 38).
      ["2026-08-28"],
    );
    const off = Object.fromEntries(days.map((day) => [day.date, day.timeOff]));
    expect(off).toEqual({
      "2026-08-24": false,
      "2026-08-25": false,
      "2026-08-26": true,
      "2026-08-27": false,
      "2026-08-28": false,
      "2026-08-29": false,
      "2026-08-30": false,
    });
    expect(days[1]!.shifts.map((item) => item.id)).toEqual([shift.id]);
    expect(days[4]!.open).toBe(1);
  });

  it("keeps a day partly left after a cancellation as time off", () => {
    const [day] = weekDays(
      model([timeOff(6, "2026-08-24", {}, { cancelled_intervals: [{ start_at: "2026-08-24T16:00:00Z", end_at: "2026-08-24T20:00:00Z" }], effective_intervals: [{ start_at: "2026-08-24T20:00:00Z", end_at: "2026-08-25T07:00:00Z" }] })]),
      "2026-08-24",
    );
    expect(day!.timeOff).toBe(true);
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
    expect(switchWeeks("2026-08-23", "2026-09-16", "sunday").starts[1]).toBe("2026-09-13");
    expect(weekRange("2026-10-26")).toBe("Oct 26 – Nov 1");
  });
});
