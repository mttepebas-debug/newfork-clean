import { describe, expect, it } from "vitest";
import type { ScheduleReadModel } from "@newfork/shared/schedule";

import type { PresetCreateTarget } from "../components/SchedulePresetRows";
import {
  parsePresetRange,
  presetDropInput,
  presetDuration,
  presetHoursOfType,
  presetShortRange,
  presetTimeOptions,
} from "./presetTimes";

// PRESET-SAAT (S-183): Dinner 4:15–11:30 PM primary, 5–11 PM and 6–11:30 PM more; Lunch only 11:30–3:30.
const model = {
  locations: [{ id: "loc", name: "Downtown", timezone: "America/Los_Angeles" }],
  shift_types: [
    { id: "dinner", name: "Dinner", color: "#7c3aed", sort_order: 0, default_start_time: "16:15", default_end_time: "23:30", default_revision: 3,
      time_options: [{ start_time: "17:00", end_time: "23:00" }, { start_time: "18:00", end_time: "23:30" }] },
    { id: "lunch", name: "Lunch", color: "#d97706", sort_order: 1, default_start_time: "11:30", default_end_time: "15:30" },
  ],
  employees: [{ id: "daniel", display_name: "Daniel Kim" }],
  shifts: [
    { employee_id: "daniel", shift_type_id: "dinner", job_id: "barback", scheduled_date: "2026-10-19", start_time: "18:00:00", end_time: "23:30:00" },
  ],
} as unknown as ScheduleReadModel;

const target = (shiftTypeId: string): PresetCreateTarget => ({
  locationId: "loc",
  employeeId: "daniel",
  date: "2026-10-21",
  preset: { jobId: "barback", shiftTypeId, startTime: null, endTime: null },
});

describe("preset times", () => {
  it("offers the type's saved times, primary first, and marks the person's last one", () => {
    expect(presetTimeOptions(model, target("dinner"))).toEqual([
      { start: "16:15", end: "23:30", primary: true, note: null },
      { start: "17:00", end: "23:00", primary: false, note: null },
      { start: "18:00", end: "23:30", primary: false, note: "Last for Daniel" },
    ]);
    expect(presetHoursOfType(model.shift_types[1])).toEqual([{ start: "11:30", end: "15:30" }]);
  });

  it("writes the picked time shown on the card; the primary follows the type's default", () => {
    const primary = presetDropInput(model, target("dinner"), { start: "16:15", end: "23:30" });
    expect(primary).toMatchObject({ start_time: "16:15", end_time: "23:30", hide_time_on_badge: false, time_basis: "type_default" });
    expect(primary.time_snapshot).toMatchObject({ shift_type_id: "dinner", default_revision: 3, timezone: "America/Los_Angeles" });
    const other = presetDropInput(model, target("dinner"), { start: "17:00", end: "23:00" });
    expect(other).toMatchObject({ start_time: "17:00", end_time: "23:00", hide_time_on_badge: false, time_basis: "explicit", time_snapshot: null });
  });

  it("reads short hours a manager types", () => {
    expect(parsePresetRange("5-11p")).toEqual({ start: "17:00", end: "23:00" });
    expect(parsePresetRange("4-10p")).toEqual({ start: "16:00", end: "22:00" });
    expect(parsePresetRange("10-4")).toEqual({ start: "10:00", end: "16:00" });
    expect(parsePresetRange("530p-11")).toEqual({ start: "17:30", end: "23:00" });
    expect(parsePresetRange("16:00-22:00")).toEqual({ start: "16:00", end: "22:00" });
    expect(parsePresetRange("5pm to 11pm")).toEqual({ start: "17:00", end: "23:00" });
    expect(parsePresetRange("soon")).toBeNull();
    expect(parsePresetRange("5-5p")).toEqual({ start: "05:00", end: "17:00" });
    expect(parsePresetRange("5p-5p")).toBeNull();
  });

  it("says a time short and long", () => {
    expect(presetShortRange({ start: "16:15", end: "23:30" })).toBe("4:15–11:30 PM");
    expect(presetShortRange({ start: "11:00", end: "16:00" })).toBe("11 AM–4 PM");
    expect(presetDuration({ start: "22:00", end: "02:00" })).toBe("4h");
    expect(presetDuration({ start: "16:15", end: "23:30" })).toBe("7h 15m");
  });
});
