import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { dateInZone } from "../lib/today";
import {
  nextShift,
  shiftInstant,
  shiftState,
} from "./dashboard-model";

const shift: EmployeeHubShift = {
  id: "one",
  location_id: "west",
  location_name: "West",
  employee_id: "employee",
  job_name: "Server",
  note: "",
  scheduled_date: "2026-09-06",
  start_time: "22:00",
  end_time: "02:00",
};
const model: EmployeeHubReadModel = {
  workspace_id: "workspace",
  employee: { id: "employee", display_name: "Alex" },
  locations: [
    { id: "west", name: "West", timezone: "America/Los_Angeles" },
    { id: "east", name: "East", timezone: "America/New_York" },
  ],
  settings: { time_format: "12h" },
  shifts: [shift],
  open_shifts: [],
  team_shifts: [],
  team: [],
  leave_days: [],
};
describe("employee dashboard time model", () => {
  it("keeps an overnight shift visible after midnight until its local end", () => {
    const now = new Date("2026-09-07T08:30:00Z");
    expect(dateInZone(now, "America/Los_Angeles")).toBe("2026-09-07");
    expect(shiftState(shift, now, "America/Los_Angeles").state).toBe(
      "scheduled_now",
    );
    expect(nextShift(model, now)?.id).toBe("one");
    expect(nextShift(model, new Date("2026-09-07T09:00:00Z"))).toBeNull();
  });
  it("does not select an already finished shift merely because it is first", () => {
    const next = { ...shift, id: "next", scheduled_date: "2026-09-08" };
    expect(
      nextShift(
        { ...model, shifts: [shift, next] },
        new Date("2026-09-07T12:00:00Z"),
      )?.id,
    ).toBe("next");
  });
  it("orders shifts by their location time zones, not wall clock strings", () => {
    const west = { ...shift, start_time: "09:00", end_time: "17:00" };
    const east = {
      ...west,
      id: "east-shift",
      location_id: "east",
      start_time: "10:00",
    };
    expect(
      nextShift(
        { ...model, shifts: [west, east] },
        new Date("2026-09-06T10:00:00Z"),
      )?.id,
    ).toBe("east-shift");
  });
  it("uses the date at the shift location when the device is on another day", () => {
    const now = new Date("2026-09-07T01:00:00Z");
    expect(shiftState(shift, now, "America/Los_Angeles").today).toBe(
      "2026-09-06",
    );
    expect(shiftState(shift, now, "America/Los_Angeles").state).toBe(
      "upcoming",
    );
  });
  it("resolves the UTC offset across seasonal clock changes", () => {
    expect(
      new Date(
        shiftInstant(
          { ...shift, scheduled_date: "2026-11-02", start_time: "09:00" },
          model,
        ),
      ).toISOString(),
    ).toBe("2026-11-02T17:00:00.000Z");
    expect(
      new Date(
        shiftInstant({ ...shift, start_time: "09:00" }, model),
      ).toISOString(),
    ).toBe("2026-09-06T16:00:00.000Z");
  });
});
