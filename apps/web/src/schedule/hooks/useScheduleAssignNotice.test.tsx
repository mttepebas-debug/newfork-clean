// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleEmployee, ScheduleReadModel, ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useScheduleAssignNotice } from "./useScheduleAssignNotice";

const toast = vi.hoisted(() => ({ action: vi.fn(), info: vi.fn() }));
vi.mock("@newfork/ui", () => ({ useToast: () => toast }));

const loc = "ad425000-0000-4000-8000-000000000006";
const emp = "ad425000-0000-4000-8000-000000000004";
const projection = {
  location_id: loc, location_name: "West", timezone: "America/Los_Angeles", week_start: "2035-01-15", status: "ready",
  unavailable_intervals: [{ start_at: "2035-01-16T02:00:00Z", end_at: "2035-01-16T08:00:00Z" }], leave_intervals: [],
  clock_segments: [{ start_at: "2035-01-15T08:00:00Z", end_at: "2035-01-23T08:00:00Z", offset_seconds: -28800 }],
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2035-01-${15 + i}`, has_unavailable: i === 0, all_day: false })),
};
const model = {
  employees: [{ id: emp, display_name: "Maria Lopez", location_ids: [loc], job_ids: [], weekly_availability: [projection] } as unknown as ScheduleEmployee],
  settings: { time_format: "12h" },
} as unknown as ScheduleReadModel;
const input = { employee_id: emp, location_id: loc, scheduled_date: "2035-01-15", start_time: "18:00", end_time: "22:00",
  time_basis: "explicit", time_timezone: "America/Los_Angeles" } as ScheduleShiftMutationInput;
const session = (revision: number) => ({ id: "session", revision }) as never;

beforeEach(() => vi.clearAllMocks());

describe("the notice after a shift lands on a preference", () => {
  it("shows one warning toast with Undo for five seconds; Undo takes the write back", () => {
    const undo = vi.fn();
    const { result } = renderHook(() => useScheduleAssignNotice(model, 4, undo));
    expect(result.current([input], "add", session(4))).toBe(true);
    expect(toast.action).toHaveBeenCalledExactlyOnceWith("Shift added to Maria Lopez.", expect.objectContaining({
      actionLabel: "Undo", tone: "warning", durationMs: 5_000,
      description: "Maria prefers not to work Mon after 6:00 PM.",
    }));
    toast.action.mock.calls[0]![1].onAction();
    expect(undo).toHaveBeenCalledOnce();
  });

  it("Undo does not take back a later edit", () => {
    const undo = vi.fn();
    const { result, rerender } = renderHook(({ revision }) => useScheduleAssignNotice(model, revision, undo), { initialProps: { revision: 4 } });
    result.current([input], "add", session(4));
    rerender({ revision: 5 });
    toast.action.mock.calls[0]![1].onAction();
    expect(undo).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledOnce();
  });

  it("stays quiet when the person is free or the write failed", () => {
    const { result } = renderHook(() => useScheduleAssignNotice(model, 4, vi.fn()));
    expect(result.current([{ ...input, start_time: "09:00", end_time: "12:00" }], "add", session(4))).toBe(false);
    expect(result.current([input], "add", null)).toBe(false);
    expect(toast.action).not.toHaveBeenCalled();
  });
});
