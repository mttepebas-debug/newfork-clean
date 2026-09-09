import type { ScheduleShift } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  buildScheduleHourTotalValue,
  formatHourTotal,
  formatHourTotalValue,
  shiftMinutes,
} from "./scheduleHourTotals";

function shift(overrides: Partial<ScheduleShift> = {}): ScheduleShift {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    location_id: "22222222-2222-4222-8222-222222222222",
    employee_id: "33333333-3333-4333-8333-333333333333",
    job_id: "44444444-4444-4444-8444-444444444444",
    shift_type_id: "55555555-5555-4555-8555-555555555555",
    scheduled_date: "2026-08-17",
    start_time: "16:00",
    end_time: "22:30",
    crosses_midnight: false,
    unpaid_break_minutes: 30,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "",
    warning_codes: [],
    ...overrides,
  };
}

describe("scheduleHourTotals", () => {
  it("marks references as estimates and excludes unknown legacy hours", () => {
    const shifts = [shift({ time_basis: "type_default" }), shift({ time_basis: "legacy_unverified", hide_time_on_badge: true }),
      shift({ time_basis: "unresolved", start_time: "", end_time: "" })];
    expect(formatHourTotalValue(buildScheduleHourTotalValue(shifts, shifts))).toBe("~6h · 2 need hours");
    expect(shiftMinutes(shifts[1]!)).toBe(0);
  });
  it("deducts unpaid breaks and handles overnight shifts", () => {
    expect(shiftMinutes(shift())).toBe(360);
    expect(
      shiftMinutes(
        shift({
          start_time: "22:00",
          end_time: "02:30",
          crosses_midnight: true,
          unpaid_break_minutes: 15,
        }),
      ),
    ).toBe(255);
  });

  it("formats zero, minute-only, whole-hour, and mixed totals", () => {
    expect(formatHourTotal(0)).toBe("0h");
    expect(formatHourTotal(45)).toBe("45m");
    expect(formatHourTotal(120)).toBe("2h");
    expect(formatHourTotal(390)).toBe("6h 30m");
  });

  it("keeps hidden filtered totals as a comparison", () => {
    const visible = [shift({ id: "visible", end_time: "20:00" })];
    const all = [...visible, shift({ id: "hidden", start_time: "20:00" })];

    const total = buildScheduleHourTotalValue(visible, all);

    expect(total).toEqual({ visibleMinutes: 210, totalMinutes: 330 });
    expect(formatHourTotalValue(total)).toBe("3h 30m / 5h 30m");
  });

  it("uses visible minutes when total minutes do not exceed visible minutes", () => {
    const total = buildScheduleHourTotalValue([shift()], []);

    expect(total).toEqual({ visibleMinutes: 360, totalMinutes: 360 });
    expect(formatHourTotalValue(total)).toBe("6h");
  });
});
