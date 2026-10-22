import { describe, expect, it } from "vitest";
import type { ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";

import {
  buildDisplayScheduleCellState,
  buildScheduleCellState,
  orderScheduleCellShifts,
  scheduleCellStateKey,
} from "./useCellState";
import { isGhostScheduleShift } from "../lib/scheduleShiftMetadata";

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
    referenced_jobs: [],
    referenced_shift_types: [],
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
      },
    ],
    shifts: [...shifts],
    closures: [],
    important_dates: [],
  };
}

describe("buildScheduleCellState", () => {
  it("marks unavailable days from the weekly location/day projection", () => {
    const base = model([]);
    const changed: ScheduleReadModel = { ...base, employees: [{ ...base.employees[0]!,
      weekly_availability: [{ location_id: mainLocationId, location_name: "Main", timezone: "America/Los_Angeles", week_start: base.week_start,
        status: "ready", unavailable_intervals: [{ start_at: "2026-08-18T07:00:00Z", end_at: "2026-08-19T07:00:00Z" }], leave_intervals: [],
        clock_segments: [{ start_at: "2026-08-10T07:00:00Z", end_at: "2026-08-31T07:00:00Z", offset_seconds: -7 * 3600 }],
        days: [{ date: "2026-08-17", has_unavailable: false, all_day: false }, { date: "2026-08-18", has_unavailable: true, all_day: true }],
      }],
    }] };
    const cells = buildScheduleCellState(changed);
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-18", employeeId))?.availabilityMark).toEqual({ kind: "unavailable", windows: [{ from: 0, to: 1440 }] });
    expect(cells.get(scheduleCellStateKey(patioLocationId, "2026-08-18", employeeId))?.availabilityMark).toBeUndefined();
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId))?.availabilityMark).toBeUndefined();
  });
  it.each([
    ["shares its clock", "America/Los_Angeles", { kind: "time_off", ranges: [{ from: 0, to: 1440 }] }],
    ["runs on another clock", "America/New_York", undefined],
  ] as const)("time off reaches a location the person is not assigned to when it %s; unavailable hours do not (KARARLAR §1.1)", (_case, timezone, patioMark) => {
    const base = model([]);
    const changed: ScheduleReadModel = { ...base,
      locations: base.locations.map((location) => (location.id === patioLocationId ? { ...location, timezone } : location)),
      employees: [{ ...base.employees[0]!, location_ids: [mainLocationId],
        weekly_availability: [{ location_id: mainLocationId, location_name: "Main", timezone: "America/Los_Angeles", week_start: base.week_start,
          status: "ready", unavailable_intervals: [{ start_at: "2026-08-18T07:00:00Z", end_at: "2026-08-19T07:00:00Z" }],
          leave_intervals: [{ start_at: "2026-08-19T07:00:00Z", end_at: "2026-08-20T07:00:00Z" }],
          clock_segments: [{ start_at: "2026-08-10T07:00:00Z", end_at: "2026-08-31T07:00:00Z", offset_seconds: -7 * 3600 }],
          days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${17 + index}`, has_unavailable: index === 1, all_day: index === 1 })),
        }],
      }] };
    const cells = buildScheduleCellState(changed);
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-19", employeeId))?.availabilityMark).toEqual({ kind: "time_off", ranges: [{ from: 0, to: 1440 }] });
    expect(cells.get(scheduleCellStateKey(patioLocationId, "2026-08-19", employeeId))?.availabilityMark).toEqual(patioMark);
    expect(cells.get(scheduleCellStateKey(patioLocationId, "2026-08-18", employeeId))?.availabilityMark).toBeUndefined();
    // Hiding availability hides preferences only; time off still spreads.
    expect(buildScheduleCellState(changed, true).get(scheduleCellStateKey(patioLocationId, "2026-08-19", employeeId))?.availabilityMark).toEqual(patioMark);
  });

  it("marks every cell of a closed day", () => {
    const closedModel = {
      ...model([]),
      closures: [
        {
          id: "99999999-9999-4999-8999-999999999991",
          location_id: mainLocationId,
          closed_date: "2026-08-18",
          title: "Renovation",
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
          status: "published",
        },
        {
          id: "99999999-9999-4999-8999-999999999993",
          location_id: patioLocationId,
          closed_date: "2026-08-18",
          title: "Inventory",
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
          // Scheduled: the cell stays open until the post goes out (EKRAN-08).
          status: "scheduled",
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
      state.get(scheduleCellStateKey(patioLocationId, "2026-08-18", employeeId))
        ?.isClosedAllDay ?? false,
    ).toBe(false);
  });

  it("leaves the cell open on short hours; the day header and the editor say them (EKRAN-08)", () => {
    const shortModel = {
      ...model([]),
      closures: [
        {
          id: "99999999-9999-4999-8999-999999999992",
          location_id: mainLocationId,
          closed_date: "2026-08-17",
          title: "Christmas Eve",
          is_all_day: false,
          kind: "short",
          opens: "10:00",
          closes: "15:00",
          status: "published",
        },
      ],
    } satisfies ScheduleReadModel;
    const cell = buildScheduleCellState(shortModel).get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId));

    expect(cell?.isClosedAllDay ?? false).toBe(false);
    expect(cell?.closedTitle ?? null).toBeNull();
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

  it("turns out-of-scope ghost_shifts into read-only ghosts in the person's visible cells", () => {
    const outOfScopeLocationId = "11111111-1111-4111-8111-111111111119";
    const state = buildScheduleCellState({
      ...model([shift({ id: "shift-main", location_id: mainLocationId, start_time: "09:00", end_time: "13:00" })]),
      ghost_shifts: [
        {
          id: "ghost-elsewhere",
          employee_id: employeeId,
          location_id: outOfScopeLocationId,
          location_name: "Besiktas",
          scheduled_date: "2026-08-17",
          start_time: "12:00",
          end_time: "16:00",
          crosses_midnight: false,
          job_id: "33333333-3333-4333-8333-333333333399",
          job_name: "Bartender",
          shift_type_id: "44444444-4444-4444-8444-444444444499",
          shift_type_name: "Late",
          label_ids: ["66666666-6666-4666-8666-666666666699"],
          label_names: ["On call"],
        },
      ],
    });

    for (const locationId of [mainLocationId, patioLocationId]) {
      const cell = state.get(scheduleCellStateKey(locationId, "2026-08-17", employeeId));
      const ghost = cell?.ghostShifts.find((item) => item.id === "ghost-elsewhere");
      expect(ghost).toMatchObject({ ghost: true, ghost_location_name: "Besiktas", start_time: "12:00", end_time: "16:00" });
      expect(isGhostScheduleShift(ghost!)).toBe(true);
      // What the card says travels with the ghost; the note never does.
      expect(ghost).toMatchObject({
        job_id: "33333333-3333-4333-8333-333333333399",
        ghost_job_name: "Bartender",
        shift_type_id: "44444444-4444-4444-8444-444444444499",
        ghost_shift_type_name: "Late",
        label_ids: ["66666666-6666-4666-8666-666666666699"],
        label_names: ["On call"],
        note: "",
      });
    }
    // The real Main Dining shift overlaps the ghost, the same way two real shifts would.
    const mainCell = state.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId));
    expect(mainCell?.hasOverlap).toBe(true);
    expect(mainCell?.conflictingShiftIds.has("shift-main")).toBe(true);
    expect(state.get(scheduleCellStateKey(outOfScopeLocationId, "2026-08-17", employeeId))?.ghostShifts ?? []).toEqual([]);
  });

  it("ignores ghost_shifts whose location is already on the grid", () => {
    const state = buildScheduleCellState({
      ...model([]),
      ghost_shifts: [
        {
          id: "ghost-in-scope",
          employee_id: employeeId,
          location_id: mainLocationId,
          location_name: "Main Dining",
          scheduled_date: "2026-08-17",
          start_time: "09:00",
          end_time: "13:00",
          crosses_midnight: false,
          job_id: "33333333-3333-4333-8333-333333333333",
          job_name: "Server",
          shift_type_id: null,
          shift_type_name: null,
          label_ids: [],
          label_names: [],
        },
      ],
    });

    expect([...state.values()].flatMap((cell) => cell.ghostShifts)).toEqual([]);
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

  // QA 39: a ghost is the person's shift elsewhere, not a conflict. It says
  // "conflicts" only when it really overlaps another shift that day.
  it("marks a ghost as overlapping only when it overlaps another shift", () => {
    const ghostIn = (state: ReturnType<typeof buildScheduleCellState>, locationId: string, id: string) =>
      state.get(scheduleCellStateKey(locationId, "2026-08-17", employeeId))?.ghostShifts.find((item) => item.id === id);

    const apart = buildScheduleCellState(
      model([
        shift({ id: "shift-main", location_id: mainLocationId, start_time: "09:00", end_time: "13:00" }),
        shift({ id: "shift-patio", location_id: patioLocationId, start_time: "14:00", end_time: "18:00" }),
      ]),
    );
    expect(ghostIn(apart, patioLocationId, "shift-main")?.warning_codes).not.toContain("overlap");
    expect(ghostIn(apart, mainLocationId, "shift-patio")?.warning_codes).not.toContain("overlap");

    const alone = buildScheduleCellState(
      model([shift({ id: "shift-main", location_id: mainLocationId, start_time: "09:00", end_time: "13:00" })]),
    );
    expect(ghostIn(alone, patioLocationId, "shift-main")?.warning_codes).not.toContain("overlap");

    const clashing = buildScheduleCellState(
      model([
        shift({ id: "shift-main", location_id: mainLocationId, start_time: "09:00", end_time: "13:00" }),
        shift({ id: "shift-patio", location_id: patioLocationId, start_time: "12:00", end_time: "16:00" }),
      ]),
    );
    expect(ghostIn(clashing, patioLocationId, "shift-main")?.warning_codes).toContain("overlap");
    expect(ghostIn(clashing, mainLocationId, "shift-patio")?.warning_codes).toContain("overlap");
  });

  // Mert, 2026-10-12: a shift removed while editing makes no overlap and no
  // ghost; it is on its way out.
  it("leaves a shift removed while editing out of overlaps and ghosts", () => {
    const removed = {
      ...shift({ id: "shift-removed", location_id: mainLocationId, start_time: "09:00", end_time: "13:00" }),
      source_published_shift_id: "live-1",
      pending_op_type: "delete",
    } as ScheduleShift;
    const state = buildScheduleCellState(
      model([
        removed,
        shift({ id: "shift-new", location_id: mainLocationId, start_time: "10:00", end_time: "14:00" }),
      ]),
    );

    const mainCell = state.get(scheduleCellStateKey(mainLocationId, "2026-08-17", employeeId));
    const patioCell = state.get(scheduleCellStateKey(patioLocationId, "2026-08-17", employeeId));
    expect(mainCell?.hasOverlap ?? false).toBe(false);
    expect(patioCell?.ghostShifts.map((ghost) => ghost.id)).toEqual(["shift-new"]);
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

// Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer marks its days, apart from
// approved time off and only behind the time-off-v2 flag.
describe("time off waiting for an answer", () => {
  const week = (pending: { start_at: string; end_at: string }[], leave: { start_at: string; end_at: string }[] = []) => {
    const base = model([]);
    return { ...base, employees: [{ ...base.employees[0]!, location_ids: [mainLocationId],
      weekly_availability: [{ location_id: mainLocationId, location_name: "Main", timezone: "America/Los_Angeles", week_start: base.week_start,
        status: "ready" as const, unavailable_intervals: [], leave_intervals: leave, pending_leave_intervals: pending,
        clock_segments: [{ start_at: "2026-08-10T07:00:00Z", end_at: "2026-08-31T07:00:00Z", offset_seconds: -7 * 3600 }],
        days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${17 + index}`, has_unavailable: false, all_day: false })),
      }] }] } satisfies ScheduleReadModel;
  };
  const friday = { start_at: "2026-08-21T07:00:00Z", end_at: "2026-08-22T07:00:00Z" };
  const tuesdayMorning = { start_at: "2026-08-18T16:00:00Z", end_at: "2026-08-18T20:00:00Z" };

  it("marks the days asked, at the person's own location only", () => {
    const cells = buildScheduleCellState(week([friday, tuesdayMorning]), false, { pendingTimeOff: true });
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-21", employeeId))?.pendingTimeOff).toEqual([{ from: 0, to: 1440 }]);
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-18", employeeId))?.pendingTimeOff).toEqual([{ from: 540, to: 780 }]);
    expect(cells.get(scheduleCellStateKey(patioLocationId, "2026-08-21", employeeId))?.pendingTimeOff ?? null).toBeNull();
    // A warning, not time off: no red cell, Add shift stays.
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-21", employeeId))?.availabilityMark).toBeNull();
  });

  it("gives way to approved time off the same day", () => {
    const cells = buildScheduleCellState(week([friday], [friday]), false, { pendingTimeOff: true });
    expect(cells.get(scheduleCellStateKey(mainLocationId, "2026-08-21", employeeId))?.pendingTimeOff ?? null).toBeNull();
  });

  it("marks nothing with the flag off, as today", () => {
    expect(buildScheduleCellState(week([friday]))).toEqual(buildScheduleCellState(week([])));
    expect(buildScheduleCellState(week([friday]), false, { pendingTimeOff: false })).toEqual(buildScheduleCellState(week([])));
  });
});
