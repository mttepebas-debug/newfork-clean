import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import type { CellContextMenuTarget } from "../components/ScheduleContextMenu";
import {
  buildCellPresetMenuItems,
  formatPresetCreateContext,
  validatePresetCreateTarget,
} from "./schedulePresetTargets";

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
          end_date: null,
          is_all_day: true,
          shift_type_ids: [],
        },
      ],
    } as unknown as ScheduleReadModel;

    expect(validatePresetCreateTarget(closedModel, target, true)).toEqual({
      allowed: true,
      warning: "Location is closed all day. Requested: Dinner / Server at Main Dining.",
    });
  });

  it("warns before preset creation on partial closure for the shift type", () => {
    const closedModel = {
      ...model,
      closures: [
        {
          location_id: "loc-1",
          closed_date: "2026-08-17",
          end_date: null,
          is_all_day: false,
          shift_type_ids: ["type-1"],
        },
      ],
    } as unknown as ScheduleReadModel;

    expect(validatePresetCreateTarget(closedModel, target, true)).toEqual({
      allowed: true,
      warning: "Location is closed for Dinner. Requested: Dinner / Server at Main Dining.",
    });
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
        true,
      ),
    ).toEqual({
      allowed: false,
      reason: "Start and end time cannot be the same.",
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
        false,
      ),
    ).toEqual({
      allowed: false,
      reason: "Alex Rivera is not assigned to Server. Requested: Dinner / Server at Main Dining.",
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
        false,
      ),
    ).toEqual({
      allowed: false,
      reason: "Alex Rivera is not eligible for this shift type. Requested: Dinner / Server at Main Dining.",
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

    expect(buildCellPresetMenuItems(model, menuTarget, true)).toEqual([
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
