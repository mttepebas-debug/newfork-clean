import { describe, expect, it } from "vitest";
import type { ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";

import {
  buildDisplayScheduleCellState,
  buildScheduleCellState,
  orderScheduleCellShifts,
  scheduleCellStateKey,
} from "./useCellState";

const employeeId = "55555555-5555-4555-8555-555555555555";
const mainLocationId = "11111111-1111-4111-8111-111111111111";
const patioLocationId = "11111111-1111-4111-8111-111111111112";

function shift(overrides: Partial<ScheduleShift> & Pick<ScheduleShift, "id" | "location_id">): ScheduleShift {
  return {
    employee_id: employeeId,
    job_id: "33333333-3333-4333-8333-333333333333",
    shift_type_id: "44444444-4444-4444-8444-444444444444",
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

function model(shifts: readonly ScheduleShift[]): ScheduleReadModel {
  return {
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    week_start: "2026-08-17",
    week_start_day: "monday",
    settings: { time_format: "12h" },
    locations: [
      {
        id: mainLocationId,
        name: "Main Dining",
        timezone: "America/Los_Angeles",
        sort_order: 0,
        publication_status: "published",
        published_at: null,
      },
      {
        id: patioLocationId,
        name: "Patio",
        timezone: "America/Los_Angeles",
        sort_order: 1,
        publication_status: "published",
        published_at: null,
      },
    ],
    departments: [],
    jobs: [],
    shift_types: [],
    shift_labels: [],
    employees: [
      {
        id: employeeId,
        employee_code: "NF-001",
        display_name: "Alex Rivera",
        location_ids: [mainLocationId, patioLocationId],
        job_ids: ["33333333-3333-4333-8333-333333333333"],
        primary_job_id: "33333333-3333-4333-8333-333333333333",
        availability: null,
      },
    ],
    shifts: [...shifts],
    closures: [],
    important_dates: [],
  };
}

describe("buildScheduleCellState", () => {
  it("uses weekly location/day projections and ignores the old recurring baseline", () => {
    const base = model([]);
    const changed: ScheduleReadModel = { ...base, employees: [{ ...base.employees[0]!,
      availability: [{ day: 1, mode: "unavailable", windows: [] }],
      weekly_availability: [{ location_id: mainLocationId, location_name: "Main", timezone: "America/Los_Angeles", week_start: base.week_start,
        status: "ready", unavailable_intervals: [], leave_intervals: [], clock_segments: [], days: [{ date: "2026-08-18", has_unavailable: true, all_day: true }],
      }],
    }] };
    const cells = buildScheduleCellState(changed);
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-18", employeeId))?.hasUnavailability).toBe(true);
    expect(cells.get(scheduleCellStateKey(patioLocationId, "2026-08-18", employeeId))?.hasUnavailability).toBeUndefined();
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId))?.hasUnavailability).toBeUndefined();
  });
  it("marks every cell in a multi-day all-day closure range", () => {
    const closedModel = {
      ...model([]),
      closures: [
        {
          id: "99999999-9999-4999-8999-999999999991",
          location_id: mainLocationId,
          closed_date: "2026-08-17",
          end_date: "2026-08-19",
          title: "Renovation",
          is_all_day: true,
          shift_type_ids: [],
        },
      ],
    } satisfies ScheduleReadModel;
    const state = buildScheduleCellState(closedModel);

    expect(
      state.get(scheduleCellStateKey(mainLocationId, "2026-08-18", employeeId))
        ?.isClosedAllDay,
    ).toBe(true);
    expect(
      state.get(scheduleCellStateKey(mainLocationId, "2026-08-18", null))
        ?.closedTitle,
    ).toBe("Renovation");
    expect(
      state.get(scheduleCellStateKey(patioLocationId, "2026-08-18", employeeId)),
    ).toBeUndefined();
  });

  it("marks partial closed shift type ids without closing the whole cell", () => {
    const partialClosedModel = {
      ...model([]),
      closures: [
        {
          id: "99999999-9999-4999-8999-999999999992",
          location_id: mainLocationId,
          closed_date: "2026-08-17",
          end_date: null,
          title: "No dinner service",
          is_all_day: false,
          shift_type_ids: ["44444444-4444-4444-8444-444444444444"],
        },
      ],
    } satisfies ScheduleReadModel;
    const state = buildScheduleCellState(partialClosedModel);
    const cell = state.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId));

    expect(cell?.isClosedAllDay).toBe(false);
    expect(cell?.closedShiftTypeIds).toEqual([
      "44444444-4444-4444-8444-444444444444",
    ]);
  });

  it("marks employee cells with all-day unavailable availability rules", () => {
    const unavailableModel = {
      ...model([]),
      employees: [
        {
          ...model([]).employees[0]!,
          availability: [
            { day: 0, mode: "unrestricted", windows: [] },
            { day: 1, mode: "unavailable", windows: [] },
            { day: 2, mode: "unrestricted", windows: [] },
            { day: 3, mode: "unrestricted", windows: [] },
            { day: 4, mode: "unrestricted", windows: [] },
            { day: 5, mode: "unrestricted", windows: [] },
            { day: 6, mode: "unrestricted", windows: [] },
          ],
        },
      ],
    } satisfies ScheduleReadModel;
    const state = buildScheduleCellState(unavailableModel);

    expect(
      state.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId))
        ?.hasUnavailability,
    ).toBe(true);
    expect(
      state.get(scheduleCellStateKey(patioLocationId, "2026-08-17", employeeId))
        ?.hasUnavailability,
    ).toBe(true);
    expect(
      state.get(scheduleCellStateKey(mainLocationId, "2026-08-18", employeeId)),
    ).toBeUndefined();
  });

  it("marks employee cells with restricted availability windows", () => {
    const restrictedModel = {
      ...model([]),
      employees: [
        {
          ...model([]).employees[0]!,
          availability: [
            { day: 0, mode: "unrestricted", windows: [] },
            { day: 1, mode: "unrestricted", windows: [] },
            { day: 2, mode: "windows", windows: [{ start: "09:00", end: "15:00" }] },
            { day: 3, mode: "unrestricted", windows: [] },
            { day: 4, mode: "unrestricted", windows: [] },
            { day: 5, mode: "unrestricted", windows: [] },
            { day: 6, mode: "unrestricted", windows: [] },
          ],
        },
      ],
    } satisfies ScheduleReadModel;
    const state = buildScheduleCellState(restrictedModel);

    expect(
      state.get(scheduleCellStateKey(mainLocationId, "2026-08-18", employeeId))
        ?.hasUnavailability,
    ).toBe(true);
    expect(
      state.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId)),
    ).toBeUndefined();
  });

  it("adds same-day other-location employee shifts as ghost badges", () => {
    const state = buildScheduleCellState(
      model([shift({ id: "shift-main", location_id: mainLocationId })]),
    );

    const patioCell = state.get(
      scheduleCellStateKey(patioLocationId, "2026-08-17", employeeId),
    );
    expect(patioCell?.ghostShifts.map((item) => item.id)).toEqual(["shift-main"]);
    expect(patioCell?.ghostShifts[0]).toMatchObject({
      ghost: true,
      ghost_location_name: "Main Dining",
    });
  });

  it("marks overlapping same-employee shifts across locations", () => {
    const state = buildScheduleCellState(
      model([
        shift({ id: "shift-main", location_id: mainLocationId, start_time: "09:00", end_time: "13:00" }),
        shift({ id: "shift-patio", location_id: patioLocationId, start_time: "12:00", end_time: "16:00" }),
      ]),
    );

    const mainCell = state.get(
      scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId),
    );
    const patioCell = state.get(
      scheduleCellStateKey(patioLocationId, "2026-08-17", employeeId),
    );
    expect(mainCell?.hasOverlap).toBe(true);
    expect(patioCell?.hasOverlap).toBe(true);
    expect(mainCell?.conflictingShiftIds.has("shift-main")).toBe(true);
    expect(patioCell?.conflictingShiftIds.has("shift-patio")).toBe(true);
  });

  it("merges source location cell state into unified display cells", () => {
    const state = buildScheduleCellState(
      model([
        shift({
          id: "shift-main",
          location_id: mainLocationId,
          start_time: "09:00",
          end_time: "13:00",
        }),
        shift({
          id: "shift-patio",
          location_id: patioLocationId,
          start_time: "12:00",
          end_time: "16:00",
        }),
      ]),
    );
    const display = buildDisplayScheduleCellState({
      sourceState: state,
      locationGroups: [
        {
          id: "unified",
          name: "Main Dining + Patio",
          timezone: "",
          sort_order: 0,
          publication_status: "published",
          published_at: null,
          sourceIds: [mainLocationId, patioLocationId],
          sourceNames: [
            { id: mainLocationId, name: "Main Dining" },
            { id: patioLocationId, name: "Patio" },
          ],
        },
      ],
    });

    const unifiedCell = display.get(
      scheduleCellStateKey("unified", "2026-08-17", employeeId),
    );
    expect(unifiedCell?.hasOverlap).toBe(true);
    expect([...unifiedCell!.conflictingShiftIds].sort()).toEqual([
      "shift-main",
      "shift-patio",
    ]);
  });
});

describe("orderScheduleCellShifts", () => {
  it("orders real and ghost badges by visible start time, then real before ghost", () => {
    const earlyType = "44444444-4444-4444-8444-444444444441";
    const lateType = "44444444-4444-4444-8444-444444444442";
    const realEarly = shift({
      id: "real-early",
      location_id: mainLocationId,
      shift_type_id: earlyType,
      start_time: "12:00",
    });
    const ghostEarly = shift({
      id: "ghost-early",
      location_id: patioLocationId,
      shift_type_id: earlyType,
      start_time: "09:00",
    });
    const realLateType = shift({
      id: "real-late-type",
      location_id: mainLocationId,
      shift_type_id: lateType,
      start_time: "08:00",
    });
    const matchingGhost = shift({
      id: "ghost-matching",
      location_id: patioLocationId,
      shift_type_id: earlyType,
      start_time: "12:00",
    });

    expect(
      orderScheduleCellShifts(
        [realLateType, realEarly],
        [matchingGhost, ghostEarly],
        [
          {
            id: earlyType,
            name: "Lunch",
            color: "#0ea5e9",
            default_start_time: "09:00",
            default_end_time: "17:00",
            sort_order: 0,
          },
          {
            id: lateType,
            name: "Dinner",
            color: "#f97316",
            default_start_time: "08:00",
            default_end_time: "12:00",
            sort_order: 1,
          },
        ],
      ).map((item) => item.id),
    ).toEqual(["real-late-type", "ghost-early", "real-early", "ghost-matching"]);
  });

  it("uses shift type default times for hidden-time badges before deterministic fallback", () => {
    const breakfastType = "44444444-4444-4444-8444-444444444443";
    const untimedType = "44444444-4444-4444-8444-444444444444";
    const hiddenWithDefault = shift({
      id: "hidden-default",
      location_id: mainLocationId,
      shift_type_id: breakfastType,
      start_time: "23:00",
      hide_time_on_badge: true,
    });
    const visibleShift = shift({
      id: "visible-late",
      location_id: mainLocationId,
      shift_type_id: untimedType,
      start_time: "10:00",
    });
    const hiddenWithoutDefault = shift({
      id: "hidden-fallback",
      location_id: mainLocationId,
      shift_type_id: untimedType,
      start_time: "07:00",
      hide_time_on_badge: true,
    });

    expect(
      orderScheduleCellShifts(
        [hiddenWithoutDefault, hiddenWithDefault, visibleShift],
        [],
        [
          {
            id: breakfastType,
            name: "Breakfast",
            color: "#0ea5e9",
            default_start_time: "06:00",
            default_end_time: "11:00",
            sort_order: 1,
          },
          {
            id: untimedType,
            name: "Untimed",
            color: "#f97316",
            default_start_time: null,
            default_end_time: null,
            sort_order: 0,
          },
        ],
      ).map((item) => item.id),
    ).toEqual(["hidden-default", "visible-late", "hidden-fallback"]);
  });
});
