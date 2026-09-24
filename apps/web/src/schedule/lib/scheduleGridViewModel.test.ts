import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { addDays } from "./scheduleDateTime";
import { createScheduleGridViewModel } from "./scheduleGridViewModel";

const jobs = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Server",
    color: "#2563eb",
    sort_order: 0,
    department_id: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Bar",
    color: "#0f766e",
    sort_order: 1,
    department_id: null,
  },
] as ScheduleReadModel["jobs"];

function employee(
  id: string,
  displayName: string,
  overrides: Partial<ScheduleEmployee> = {},
): ScheduleEmployee {
  return {
    id,
    display_name: displayName,
    employee_code: id.toUpperCase(),
    location_ids: ["33333333-3333-4333-8333-333333333333"],
    job_ids: ["11111111-1111-4111-8111-111111111111"],
    primary_job_id: "11111111-1111-4111-8111-111111111111",
    is_excluded_from_schedule: false,
    ...overrides,
  };
}

function shift(overrides: Partial<ScheduleShift> = {}): ScheduleShift {
  return {
    id: "shift-1",
    location_id: "33333333-3333-4333-8333-333333333333",
    employee_id: "44444444-4444-4444-8444-444444444444",
    job_id: "11111111-1111-4111-8111-111111111111",
    shift_type_id: "55555555-5555-4555-8555-555555555555",
    scheduled_date: "2026-08-17",
    start_time: "09:00",
    end_time: "17:00",
    crosses_midnight: false,
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "",
    warning_codes: [],
    ...overrides,
  };
}

function model(
  overrides: Partial<ScheduleReadModel> = {},
): ScheduleReadModel {
  return {
    workspace_id: "66666666-6666-4666-8666-666666666666",
    week_start: "2026-08-17",
    week_start_day: "monday",
    locations: [],
    departments: [],
    jobs,
    shift_types: [],
    employees: [
      employee("44444444-4444-4444-8444-444444444444", "Alex Morgan"),
      employee("88888888-8888-4888-8888-888888888888", "Jamie Stone", {
        primary_job_id: "22222222-2222-4222-8222-222222222222",
        job_ids: ["22222222-2222-4222-8222-222222222222"],
      }),
    ],
    shifts: [shift()],
    closures: [],
    important_dates: [],
    settings: { time_format: "12h" },
    ...overrides,
  };
}

describe("createScheduleGridViewModel", () => {
  it("filters unscheduled rows and shows unassigned when open shifts exist", () => {
    const view = createScheduleGridViewModel({
      filtered: model({
        shifts: [
          shift(),
          shift({
            id: "77777777-7777-4777-8777-777777777777",
            employee_id: null,
          }),
        ],
      }),
      employeeSortMode: "alphabetical",
      hideUnscheduled: true,
      layout: "separate",
      showPresetShiftBadges: true,
      showRoleSeparators: true,
      showTotalHours: true,
      showUnassignedShifts: true,
      hasEditSession: true,
      addDays,
    });

    expect(view.rows.map((item) => item.id)).toEqual([
      "44444444-4444-4444-8444-444444444444",
    ]);
    expect(view.showUnassignedRow).toBe(true);
    expect(view.showEmployeeGroups).toBe(false);
    expect(view.showShiftTypePresets).toBe(false);
    expect(view.fillerRowCount).toBe(1);
  });

  it("keeps the unassigned row available in edit mode even when empty", () => {
    const view = createScheduleGridViewModel({
      filtered: model({ shifts: [shift()] }),
      employeeSortMode: "alphabetical",
      hideUnscheduled: false,
      layout: "separate",
      showPresetShiftBadges: false,
      showRoleSeparators: false,
      showTotalHours: false,
      showUnassignedShifts: true,
      hasEditSession: true,
      addDays,
    });

    expect(view.showUnassignedRow).toBe(true);
  });

  it("hides the empty unassigned row outside edit mode", () => {
    const view = createScheduleGridViewModel({
      filtered: model({ shifts: [shift()] }),
      employeeSortMode: "alphabetical",
      hideUnscheduled: false,
      layout: "separate",
      showPresetShiftBadges: false,
      showRoleSeparators: false,
      showTotalHours: false,
      showUnassignedShifts: true,
      hasEditSession: false,
      addDays,
    });

    expect(view.showUnassignedRow).toBe(false);
  });

  it("keeps a filler row when no employees exist so the totals row can stay pinned to the bottom", () => {
    const view = createScheduleGridViewModel({
      filtered: model({ employees: [], shifts: [] }),
      employeeSortMode: "alphabetical",
      hideUnscheduled: false,
      layout: "separate",
      showPresetShiftBadges: false,
      showRoleSeparators: false,
      showTotalHours: true,
      showUnassignedShifts: false,
      hasEditSession: false,
      addDays,
    });

    expect(view.rows).toHaveLength(0);
    expect(view.showUnassignedRow).toBe(false);
    expect(view.fillerRowCount).toBe(1);
  });

  it("keeps excluded employees visible when they have a shift in the week", () => {
    const view = createScheduleGridViewModel({
      filtered: model({
        employees: [
          employee("44444444-4444-4444-8444-444444444444", "Alex Morgan", {
            is_excluded_from_schedule: true,
          }),
          employee("88888888-8888-4888-8888-888888888888", "Jamie Stone", {
            is_excluded_from_schedule: true,
          }),
        ],
        shifts: [
          shift({
            employee_id: "44444444-4444-4444-8444-444444444444",
            scheduled_date: "2026-08-20",
          }),
        ],
      }),
      employeeSortMode: "alphabetical",
      hideUnscheduled: false,
      layout: "separate",
      showPresetShiftBadges: false,
      showRoleSeparators: false,
      showTotalHours: false,
      showUnassignedShifts: false,
      hasEditSession: false,
      addDays,
    });

    expect(view.rows.map((item) => item.id)).toEqual([
      "44444444-4444-4444-8444-444444444444",
    ]);
  });

  it("enables job group headers and preset rows only for grouped edit mode", () => {
    const view = createScheduleGridViewModel({
      filtered: model(),
      employeeSortMode: "byJob",
      hideUnscheduled: false,
      layout: "unified",
      showPresetShiftBadges: true,
      showRoleSeparators: true,
      showTotalHours: false,
      showUnassignedShifts: false,
      hasEditSession: true,
      addDays,
    });

    expect(view.showEmployeeGroups).toBe(true);
    expect(view.showEmployeeGroupHeaders).toBe(true);
    expect(view.showShiftTypePresets).toBe(true);
    expect(view.showLocationInBadge).toBe(true);
    expect(view.employeeRowGroups.map((group) => group.job?.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});
