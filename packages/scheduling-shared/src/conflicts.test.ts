import { describe, expect, it } from "vitest";

import { detectConflicts, evaluateScheduleCollision } from "./conflicts.js";
import type { ConflictContext, ConflictInput, ScheduleCollisionShift } from "./types.js";

const baseInput: ConflictInput = {
  employee_id: "e1",
  location_id: "l1",
  shift_type_id: "st1",
  scheduled_date: "2026-05-01", // Friday (UTC)
  start_time: "09:00",
  end_time: "17:00",
};

const emptyCtx: ConflictContext = {
  employeeShifts: [],
  availability: [],
  closedDay: null,
  shiftTypeLabels: new Map(),
};

function makeCtx(overrides: Partial<ConflictContext>): ConflictContext {
  return {
    employeeShifts: [],
    availability: [],
    closedDay: null,
    shiftTypeLabels: new Map(),
    ...overrides,
  };
}

describe("detectConflicts", () => {
  it("returns no warnings for clean input", () => {
    expect(detectConflicts(baseInput, emptyCtx)).toEqual([]);
  });

  it("classifies overlapping assigned shifts as critical non-overrideable conflicts", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "s2",
          scheduled_date: "2026-05-01",
          start_time: "12:00",
          end_time: "20:00",
          crosses_midnight: false,
          shift_type_label: "Lunch",
          location_name: "Second",
        },
      ],
    };

    expect(detectConflicts(baseInput, ctx)[0]).toMatchObject({
      type: "time_overlap",
      severity: "critical",
      overrideable: false,
      requires_override_note: false,
      source: "assigned_shift",
    });
  });

  it("flags time_overlap with another shift on the same date at another location", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "s2",
          scheduled_date: "2026-05-01",
          start_time: "12:00",
          end_time: "20:00",
          crosses_midnight: false,
          shift_type_label: "Lunch",
          location_name: "Second",
        },
      ],
    };
    const w = detectConflicts(baseInput, ctx);
    expect(w).toHaveLength(1);
    expect(w[0]!.type).toBe("time_overlap");
    if (w[0]!.type === "time_overlap") {
      expect(w[0]!.conflicting_shifts).toEqual([
        {
          id: "s2",
          start_time: "12:00",
          end_time: "20:00",
          shift_type_label: "Lunch",
          location_name: "Second",
        },
      ]);
    }
  });

  it("does not use stored default times for clock-off named shifts with different shift types", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "s2",
          scheduled_date: "2026-05-01",
          start_time: "09:00",
          end_time: "17:00",
          crosses_midnight: false,
          shift_type_id: "st2",
          uses_clock_time: false,
          shift_type_label: "Dinner",
          location_name: "Second",
        },
      ],
    };
    const w = detectConflicts({ ...baseInput, uses_clock_time: false }, ctx);
    expect(w).toEqual([]);
  });

  it("flags duplicate named shift type for clock-off named shifts on the same employee date", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "s2",
          scheduled_date: "2026-05-01",
          start_time: "17:00",
          end_time: "22:00",
          crosses_midnight: false,
          shift_type_id: "st1",
          uses_clock_time: false,
          shift_type_label: "Lunch",
          location_name: "Second",
        },
      ],
    };
    const w = detectConflicts({ ...baseInput, uses_clock_time: false }, ctx);
    expect(w).toMatchObject([
      {
        type: "named_shift_duplicate",
        severity: "critical",
        overrideable: false,
        source: "assigned_shift",
        conflicting_shifts: [
          {
            id: "s2",
            shift_type_label: "Lunch",
            location_name: "Second",
          },
        ],
      },
    ]);
  });

  it("flags duplicate named shift type even when the new shift has real clock time", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "s2",
          scheduled_date: "2026-05-01",
          start_time: "17:00",
          end_time: "22:00",
          crosses_midnight: false,
          shift_type_id: "st1",
          uses_clock_time: false,
          shift_type_label: "Lunch",
          location_name: "Second",
        },
      ],
    };
    const w = detectConflicts({ ...baseInput, uses_clock_time: true }, ctx);
    expect(w).toMatchObject([
      {
        type: "named_shift_duplicate",
        severity: "critical",
        overrideable: false,
        source: "assigned_shift",
        conflicting_shifts: [
          {
            id: "s2",
            shift_type_label: "Lunch",
            location_name: "Second",
          },
        ],
      },
    ]);
  });

  it("flags time_overlap across midnight (next day shift)", () => {
    const input: ConflictInput = { ...baseInput, start_time: "22:00", end_time: "02:00" };
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "s2",
          scheduled_date: "2026-05-02",
          start_time: "01:00",
          end_time: "09:00",
          crosses_midnight: false,
          shift_type_label: "Open",
          location_name: "Main",
        },
      ],
    };
    const w = detectConflicts(input, ctx);
    expect(w[0]?.type).toBe("time_overlap");
  });

  it("flags availability bucket=morning when start is morning", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      availability: [
        {
          day_of_week: 5, // Friday
          mode: "bucket",
          bucket: "morning",
          shift_type_id: null,
          is_available: false,
          state: "unavailable",
        },
      ],
    };
    const w = detectConflicts(baseInput, ctx);
    expect(w[0]?.type).toBe("availability");
    expect(w[0]).toMatchObject({
      severity: "soft",
      overrideable: true,
      requires_override_note: true,
      source: "weekly_availability",
    });
  });

  it("uses the availability version effective for the scheduled date", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      availability: [
        {
          day_of_week: 5,
          mode: "bucket",
          bucket: "morning",
          shift_type_id: null,
          is_available: false,
          state: "unavailable",
        },
      ],
      availabilityVersions: [
        {
          id: "v1",
          effective_start_date: "2026-01-01",
          effective_end_date: "2026-05-10",
          rules: [
            {
              day_of_week: 5,
              mode: "bucket",
              bucket: "all_day",
              shift_type_id: null,
              is_available: false,
              state: "unavailable",
            },
          ],
        },
        {
          id: "v2",
          effective_start_date: "2026-05-11",
          effective_end_date: null,
          rules: [],
        },
      ],
    };

    expect(detectConflicts(baseInput, ctx)[0]).toMatchObject({
      type: "availability",
      rule_kind: "all_day",
      availability_version_id: "v1",
    });
    expect(
      detectConflicts({ ...baseInput, scheduled_date: "2026-05-15" }, ctx).some(
        (warning) => warning.type === "availability",
      ),
    ).toBe(false);
  });

  it("flags approved full-day time off as a hard non-overrideable conflict", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      approvedTimeOff: [
        {
          id: "segment-1",
          request_id: "request-1",
          date: "2026-05-01",
          status: "approved",
          full_day: true,
          start_time: null,
          end_time: null,
          reason_category: "vacation",
        },
      ],
    };

    expect(detectConflicts(baseInput, ctx)[0]).toMatchObject({
      type: "time_off",
      severity: "hard",
      overrideable: false,
      requires_override_note: false,
      source: "approved_time_off",
      segment_id: "segment-1",
      reason_category: "vacation",
    });
  });

  it("ignores pending and rejected time off segments for schedule conflicts", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      approvedTimeOff: [
        {
          id: "segment-1",
          request_id: "request-1",
          date: "2026-05-01",
          status: "pending",
          full_day: true,
          start_time: null,
          end_time: null,
          reason_category: "vacation",
        },
        {
          id: "segment-2",
          request_id: "request-2",
          date: "2026-05-01",
          status: "rejected",
          full_day: true,
          start_time: null,
          end_time: null,
          reason_category: "personal",
        },
      ],
    };

    expect(detectConflicts(baseInput, ctx)).toEqual([]);
  });

  it("flags approved custom-time time off only when the shift overlaps the segment", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      approvedTimeOff: [
        {
          id: "segment-1",
          request_id: "request-1",
          date: "2026-05-01",
          status: "approved",
          full_day: false,
          start_time: "14:00",
          end_time: "18:00",
          reason_category: "appointment",
        },
      ],
    };

    expect(detectConflicts({ ...baseInput, start_time: "09:00", end_time: "13:00" }, ctx)).toEqual(
      [],
    );
    expect(detectConflicts(baseInput, ctx)[0]).toMatchObject({
      type: "time_off",
      segment_id: "segment-1",
      start_time: "14:00",
      end_time: "18:00",
    });
  });

  it("still flags all-day unavailability for clock-off named shifts", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      availability: [
        {
          day_of_week: 5,
          mode: "bucket",
          bucket: "all_day",
          shift_type_id: null,
          is_available: false,
          state: "unavailable",
        },
      ],
    };
    const w = detectConflicts({ ...baseInput, uses_clock_time: false }, ctx);
    expect(w[0]).toMatchObject({
      type: "availability",
      rule_kind: "all_day",
      day_of_week: 5,
      severity: "soft",
      overrideable: true,
      source: "weekly_availability",
    });
  });

  it("flags availability time_range when the shift overlaps the unavailable range", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      availability: [
        {
          day_of_week: 5,
          mode: "time_range",
          bucket: null,
          shift_type_id: null,
          is_available: false,
          state: "unavailable",
          start_time: "13:00",
          end_time: "18:00",
          crosses_midnight: false,
        },
      ],
    };
    const w = detectConflicts(baseInput, ctx);
    expect(w[0]).toMatchObject({
      type: "availability",
      rule_kind: "time_range",
      day_of_week: 5,
      start_time: "13:00",
      end_time: "18:00",
    });
  });

  it("flags cross-midnight availability time_range from the previous weekday", () => {
    const input: ConflictInput = {
      ...baseInput,
      scheduled_date: "2026-05-02", // Saturday
      start_time: "01:00",
      end_time: "04:00",
    };
    const ctx: ConflictContext = {
      ...emptyCtx,
      availability: [
        {
          day_of_week: 5,
          mode: "time_range",
          bucket: null,
          shift_type_id: null,
          is_available: false,
          state: "unavailable",
          start_time: "22:00",
          end_time: "02:00",
          crosses_midnight: true,
        },
      ],
    };
    const w = detectConflicts(input, ctx);
    expect(w[0]).toMatchObject({
      type: "availability",
      rule_kind: "time_range",
      day_of_week: 5,
      start_time: "22:00",
      end_time: "02:00",
    });
  });

  it("flags closed_day all_day", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      closedDay: { is_all_day: true, shift_type_ids: [] },
    };
    const w = detectConflicts(baseInput, ctx);
    expect(w[0]).toMatchObject({
      type: "closed_day",
      scope: "all_day",
      severity: "hard",
      overrideable: true,
      source: "closed_day",
    });
  });

  it("flags closed_day per shift type when shift_type matches", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      closedDay: { is_all_day: false, shift_type_ids: ["st1"] },
      shiftTypeLabels: new Map([["st1", "Brunch"]]),
    };
    const w = detectConflicts(baseInput, ctx);
    expect(w[0]).toMatchObject({
      type: "closed_day",
      scope: "shift_type",
      shift_type_label: "Brunch",
    });
  });

  it("excludes self when exclude_shift_id is set (edit case)", () => {
    const ctx: ConflictContext = {
      ...emptyCtx,
      employeeShifts: [
        {
          id: "self",
          scheduled_date: "2026-05-01",
          start_time: "09:00",
          end_time: "17:00",
          crosses_midnight: false,
          shift_type_label: "Same",
          location_name: "Main",
        },
      ],
    };
    const w = detectConflicts({ ...baseInput, exclude_shift_id: "self" }, ctx);
    expect(w).toEqual([]);
  });

  it("limited all-day cell yields soft availability_limited warning", () => {
    const ctx = makeCtx({
      availability: [
        {
          day_of_week: 2,
          mode: "bucket",
          bucket: "all_day",
          shift_type_id: null,
          state: "limited",
          is_available: true,
        },
      ],
    });
    const warnings = detectConflicts(
      {
        employee_id: "e1",
        location_id: "l1",
        shift_type_id: null,
        scheduled_date: "2026-07-07",
        start_time: "09:00",
        end_time: "17:00",
      },
      ctx,
    );
    const w = warnings.find((x) => x.type === "availability_limited");
    expect(w).toBeTruthy();
    expect(w?.severity).toBe("soft");
  });

  it("preferred and available cells yield no warning", () => {
    for (const state of ["preferred", "available"] as const) {
      const ctx = makeCtx({
        availability: [
          {
            day_of_week: 2,
            mode: "bucket",
            bucket: "all_day",
            shift_type_id: null,
            state,
            is_available: true,
          },
        ],
      });
      const warnings = detectConflicts(
        {
          employee_id: "e1",
          location_id: "l1",
          shift_type_id: null,
          scheduled_date: "2026-07-07",
          start_time: "09:00",
          end_time: "17:00",
        },
        ctx,
      );
      expect(
        warnings.some((x) => x.type === "availability_limited" || x.type === "availability"),
      ).toBe(false);
    }
  });
});

const collisionBase: ScheduleCollisionShift = {
  id: "a",
  employee_id: "e1",
  location_id: "l1",
  location_name: "Main",
  shift_type_id: "st1",
  shift_type_label: "Lunch",
  scheduled_date: "2026-05-01",
  start_time: "09:00",
  end_time: "17:00",
  crosses_midnight: false,
};

describe("evaluateScheduleCollision", () => {
  it("returns none for different employees and unassigned shifts", () => {
    expect(
      evaluateScheduleCollision(collisionBase, {
        ...collisionBase,
        id: "b",
        employee_id: "e2",
        location_id: "l2",
      }),
    ).toEqual({ collides: false, reason: null });

    expect(
      evaluateScheduleCollision(collisionBase, {
        ...collisionBase,
        id: "open",
        employee_id: null,
      }),
    ).toEqual({ collides: false, reason: null });
  });

  it("blocks the same employee and same named shift type on the same date regardless of time", () => {
    expect(
      evaluateScheduleCollision(collisionBase, {
        ...collisionBase,
        id: "b",
        location_id: "l2",
        start_time: "18:00",
        end_time: "23:00",
      }),
    ).toMatchObject({
      collides: true,
      reason: "same_named_shift_type",
    });
  });

  it("treats touching clock intervals as a conflict", () => {
    expect(
      evaluateScheduleCollision(collisionBase, {
        ...collisionBase,
        id: "b",
        shift_type_id: "st2",
        start_time: "17:00",
        end_time: "22:00",
      }),
    ).toMatchObject({
      collides: true,
      reason: "time_overlap",
    });
  });

  it("allows a one-minute gap between clock intervals", () => {
    expect(
      evaluateScheduleCollision(collisionBase, {
        ...collisionBase,
        id: "b",
        shift_type_id: "st2",
        start_time: "17:01",
        end_time: "22:00",
      }),
    ).toEqual({ collides: false, reason: null });
  });

  it("compares cross-midnight shifts by absolute interval across adjacent dates", () => {
    expect(
      evaluateScheduleCollision(
        {
          ...collisionBase,
          id: "night",
          shift_type_id: "st-night",
          scheduled_date: "2026-05-03",
          start_time: "22:00",
          end_time: "02:00",
          crosses_midnight: true,
        },
        {
          ...collisionBase,
          id: "morning",
          shift_type_id: "st-morning",
          scheduled_date: "2026-05-04",
          start_time: "02:00",
          end_time: "08:00",
          crosses_midnight: false,
        },
      ),
    ).toMatchObject({
      collides: true,
      reason: "time_overlap",
    });
  });
});
