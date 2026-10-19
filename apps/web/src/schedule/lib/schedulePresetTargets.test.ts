import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import type { CellContextMenuTarget } from "../components/ScheduleContextMenu";
import {
  buildCellPresetMenuItems,
  formatPresetCreateContext,
  validatePresetCreateTarget,
  validatePresetDrop,
} from "./schedulePresetTargets";
import { withPresetHours } from "./presetTimes";

const model = {
  settings: { time_format: "12h" },
  locations: [{ id: "loc-1", name: "Main Dining" }],
  employees: [
    {
      id: "emp-1",
      display_name: "Alex Rivera",
      location_ids: ["loc-1"],
      job_ids: ["job-1"],
    },
  ],
  jobs: [{ id: "job-1", name: "Server", color: "#f97316" }],
  shift_types: [
    {
      id: "type-1",
      name: "Dinner",
      color: "#2563eb",
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
    {
      id: "type-2",
      name: "Lunch",
      color: "#22c55e",
      default_start_time: "11:00",
      default_end_time: "11:00",
    },
  ],
  closures: [],
  shifts: [],
} as unknown as ScheduleReadModel;

const target = {
  locationId: "loc-1",
  employeeId: "emp-1",
  date: "2026-08-17",
  preset: {
    jobId: "job-1",
    shiftTypeId: "type-1",
    startTime: "16:00",
    endTime: "22:00",
  },
};

describe("schedulePresetTargets", () => {
  // PRESET-SAAT (S-183): Alex already works 3–6 PM. Dinner's primary 4–10 PM
  // overlaps it; its other time 6–11 PM does not. The drop is allowed (a time
  // fits) and each picked time is checked with its own hours.
  it("checks a drop against every saved time and a pick against its own hours", () => {
    const busy = {
      ...model,
      shift_types: [{ ...model.shift_types[0]!, time_options: [{ start_time: "18:00", end_time: "23:00" }] }],
      shifts: [{
        id: "shift-1", employee_id: "emp-1", location_id: "loc-1", job_id: "job-1", shift_type_id: null,
        scheduled_date: "2026-08-17", start_time: "15:00", end_time: "18:00", crosses_midnight: false,
        unpaid_break_minutes: 0, hide_time_on_badge: false, label_ids: [], label_names: [], note: "", warning_codes: [], revision: 1,
      }],
    } as unknown as ScheduleReadModel;
    expect(validatePresetDrop(busy, target).allowed).toBe(true);
    expect(validatePresetCreateTarget(busy, withPresetHours(target, { start: "16:00", end: "22:00" })).allowed).toBe(false);
    expect(validatePresetCreateTarget(busy, withPresetHours(target, { start: "18:00", end: "23:00" })).allowed).toBe(true);
    expect(validatePresetDrop({ ...busy, shift_types: [model.shift_types[0]!] } as ScheduleReadModel, target).allowed).toBe(false);
  });

  it("formats preset create context labels", () => {
    expect(formatPresetCreateContext(model, target)).toBe(
      "Dinner-Server / Alex Rivera / Main Dining / 2026-08-17",
    );
    expect(
      formatPresetCreateContext(model, { ...target, employeeId: null }),
    ).toBe("Dinner-Server / Open shift / Main Dining / 2026-08-17");
  });

  it("warns before preset creation on all-day closures", () => {
    const closedModel = {
      ...model,
      closures: [
        {
          location_id: "loc-1",
          closed_date: "2026-08-17",
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
        },
      ],
    } as unknown as ScheduleReadModel;

    expect(validatePresetCreateTarget(closedModel, target)).toEqual({
      allowed: true,
      warning: "Location is closed all day. Requested: Dinner / Server at Main Dining.",
    });
  });

  it("warns before preset creation when the preset's hours run past short hours (EKRAN-08)", () => {
    const closedModel = {
      ...model,
      closures: [
        {
          location_id: "loc-1",
          closed_date: "2026-08-17",
          title: "Inventory",
          is_all_day: false,
          kind: "short",
          opens: "09:00",
          closes: "15:00",
        },
      ],
    } as unknown as ScheduleReadModel;

    expect(validatePresetCreateTarget(closedModel, target)).toEqual({
      allowed: true,
      warning: "Location has short hours for Inventory: open 9a–3p only. Requested: Dinner / Server at Main Dining.",
    });
    expect(
      validatePresetCreateTarget(
        closedModel,
        { ...target, preset: { ...target.preset, startTime: "09:00", endTime: "15:00" } },
      ),
    ).toEqual({ allowed: true });
  });

  it("blocks preset creation with invalid default times", () => {
    expect(
      validatePresetCreateTarget(
        model,
        {
          ...target,
          preset: {
            ...target.preset,
            startTime: "11:00",
            endTime: "11:00",
          },
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "Start and end time cannot be the same.",
      shortReason: "Check hours",
    });
  });

  it("checks employee assignment before opening a no-default-time preset editor", () => {
    expect(
      validatePresetCreateTarget(
        {
          ...model,
          employees: [
            {
              ...model.employees[0]!,
              job_ids: [],
              shift_type_ids: ["type-1"],
            },
          ],
        },
        {
          ...target,
          preset: {
            jobId: "job-1",
            shiftTypeId: "type-1",
            startTime: null,
            endTime: null,
          },
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "Alex Rivera is not assigned to Server. Requested: Dinner / Server at Main Dining.",
      shortReason: "Not assigned",
    });

    expect(
      validatePresetCreateTarget(
        {
          ...model,
          employees: [
            {
              ...model.employees[0]!,
              shift_type_ids: ["type-2"],
            },
          ],
        },
        {
          ...target,
          preset: {
            jobId: "job-1",
            shiftTypeId: "type-1",
            startTime: null,
            endTime: null,
          },
        },
      ),
    ).toEqual({
      allowed: false,
      reason: "Alex Rivera is not eligible for this shift type. Requested: Dinner / Server at Main Dining.",
      shortReason: "Not assigned",
    });
  });

  it("marks invalid preset context menu items as disabled", () => {
    const menuTarget: CellContextMenuTarget = {
      locationId: "loc-1",
      employeeId: "emp-1",
      jobId: "job-1",
      date: "2026-08-17",
      x: 10,
      y: 20,
    };

    expect(buildCellPresetMenuItems(model, menuTarget)).toEqual([
      {
        id: "type-1",
        label: "Dinner-Server",
        color: "#2563eb",
      },
      {
        id: "type-2",
        label: "Lunch-Server",
        color: "#22c55e",
        disabledReason: "Start and end time cannot be the same.",
      },
    ]);
  });
});
