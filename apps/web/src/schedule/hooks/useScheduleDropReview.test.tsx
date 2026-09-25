// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import type { ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useScheduleDropReview } from "./useScheduleDropReview";
import { loadShiftAvailability } from "../../availability/availability-data";
import { ScheduleRequestError } from "../schedule-data";
import { createOptimisticPendingOp } from "./optimisticScheduleCache";
import { buildEffectiveShifts } from "./useEffectiveShifts";

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("@newfork/ui", () => ({ useToast: () => toast }));
vi.mock("../../availability/availability-data", () => ({ loadShiftAvailability: vi.fn() }));
const input = { employee_id: "employee", location_id: "location", scheduled_date: "2035-01-15", start_time: "18:00", end_time: "20:00" } as ScheduleShiftMutationInput;
function assessment(changes: Partial<ShiftAvailabilityAssessment> = {}): ShiftAvailabilityAssessment {
  return { conflict_severity: "warn", coverage: "partial", operation: "warning_requires_override", time_basis: "explicit", timezone: "UTC", assessment_scope: "shift_interval",
    intervals: [], available_intervals: [], unavailable_intervals: [], unknown_intervals: [],
    reasons: [{ code: "availability", message: "Unavailable hours", definite: true }], fingerprint: "a".repeat(64),
    policy_revision: 1, fold_resolution: null, assessment_minutes: 120, can_override: true, warning_policy: "warn", ...changes };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadShiftAvailability).mockResolvedValue(assessment()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function setup() {
  const save = vi.fn().mockResolvedValue(true);
  const hook = renderHook(({ revision }) => useScheduleDropReview("workspace", "session", revision), { initialProps: { revision: 1 } });
  const start = (shiftId?: string) => act(() => hook.result.current.start({ input, shiftId, save }));
  return { ...hook, save, start };
}
describe("Schedule drop assessment", () => {
  it("checks every pasted shift and saves once with a single warning", async () => {
    const h = setup();
    const inputs = [input, { ...input, scheduled_date: "2035-01-16" }];
    act(() => h.result.current.startBatch({ inputs, save: h.save }));
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(loadShiftAvailability).toHaveBeenCalledTimes(2);
    expect(h.save.mock.calls[0]![0]).toEqual(inputs.map(value => ({ ...value, availability_assessment_fingerprint: "a".repeat(64) })));
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      "Shifts saved with warnings",
      expect.objectContaining({
        dedupeKey: "schedule-drop-availability-warning",
        description: "Unavailable hours",
      }),
    );
  });
  it("does not save an earlier allowed item when a later item is blocked", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValueOnce(assessment({ operation: "allowed" }))
      .mockResolvedValueOnce(assessment({ operation: "blocked" }));
    const h = setup();
    act(() => h.result.current.startBatch({ inputs: [input, input], save: h.save }));
    await waitFor(() => expect(h.result.current.review?.blocked).toBe(true));
    expect(h.save).not.toHaveBeenCalled();
    act(() => h.result.current.dismiss()); expect(h.save).not.toHaveBeenCalled();
  });
  it("rechecks the entire batch and asks again if its second conflict changed", async () => {
    const a = assessment({ warning_policy: "confirm" });
    const b = assessment({ warning_policy: "confirm", fingerprint: "b".repeat(64) });
    vi.mocked(loadShiftAvailability).mockResolvedValueOnce(a).mockResolvedValueOnce(a)
      .mockResolvedValueOnce(a).mockResolvedValueOnce(b).mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const h = setup();
    act(() => h.result.current.startBatch({ inputs: [input, input], save: h.save }));
    await waitFor(() => expect(h.result.current.review?.warningCount).toBe(2));
    await act(async () => h.result.current.confirm());
    expect(h.save).not.toHaveBeenCalled();
    await act(async () => h.result.current.confirm());
    expect(h.save).toHaveBeenCalledOnce(); expect(loadShiftAvailability).toHaveBeenCalledTimes(6);
    expect(toast.warning).not.toHaveBeenCalled();
  });
  it("never saves part of a batch when a later check fails", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValueOnce(assessment()).mockRejectedValueOnce(new Error("Offline"));
    const h = setup();
    act(() => h.result.current.startBatch({ inputs: [input, input], save: h.save }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(h.save).not.toHaveBeenCalled(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("checks a move, saves its current fingerprint and emits only one warn toast", async () => {
    const h = setup(); h.start("shift");
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(loadShiftAvailability).toHaveBeenCalledWith("workspace", input, "shift", "session");
    expect(h.save).toHaveBeenCalledWith({ ...input, availability_assessment_fingerprint: "a".repeat(64) });
    expect(toast.warning).toHaveBeenCalledOnce(); expect(h.result.current.review).toBeNull();
  });
  it("checks a copy without inheriting its source assignment identity", async () => {
    const h = setup(); h.start();
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(loadShiftAvailability).toHaveBeenCalledWith("workspace", input, undefined, "session");
  });
  it("asks once under confirm policy and rechecks before saving without a reason", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ warning_policy: "confirm" }));
    const h = setup(); h.start("shift");
    await waitFor(() => expect(h.result.current.review).not.toBeNull());
    expect(h.save).not.toHaveBeenCalled(); expect(toast.warning).not.toHaveBeenCalled();
    await act(async () => h.result.current.confirm());
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(loadShiftAvailability).toHaveBeenCalledTimes(2);
    expect(h.save.mock.calls[0]![0]).not.toHaveProperty("conflict_override_note");
  });
  it("requires a fresh decision when the conflict changes before confirmation", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValueOnce(assessment({ warning_policy: "confirm" }))
      .mockResolvedValue(assessment({ warning_policy: "confirm", fingerprint: "b".repeat(64) }));
    const h = setup(); h.start(); await waitFor(() => expect(h.result.current.review).not.toBeNull());
    await act(async () => h.result.current.confirm());
    expect(h.save).not.toHaveBeenCalled();
    expect(h.result.current.review?.assessment.fingerprint).toBe("b".repeat(64));
    await act(async () => h.result.current.confirm());
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
  });
  it.each(["blocked", "verification_required"] as const)("does not save %s assessments", async operation => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ operation }));
    const h = setup(); h.start(); await waitFor(() => expect(h.result.current.review?.blocked).toBe(true));
    act(() => h.result.current.confirm()); expect(h.save).not.toHaveBeenCalled();
  });
  it("reuses stored acceptance without warning or confirmation", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ warning_policy: "confirm", override_recorded: true }));
    const h = setup(); h.start("shift"); await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(h.result.current.review).toBeNull(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("does not turn a check failure into availability or save anything", async () => {
    vi.mocked(loadShiftAvailability).mockRejectedValue(new Error("Connection lost"));
    const h = setup(); h.start(); await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(h.save).not.toHaveBeenCalled(); expect(h.result.current.pending).toBe(false);
  });
  it("does not warn after a failed mutation already handled by the page", async () => {
    const h = setup(); h.save.mockResolvedValue(false); h.start();
    await waitFor(() => expect(h.result.current.pending).toBe(false));
    expect(h.save).toHaveBeenCalledOnce(); expect(toast.warning).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
  });
  it("discards late assessments after session changes", async () => {
    let resolve!: (value: ShiftAvailabilityAssessment) => void;
    vi.mocked(loadShiftAvailability).mockReturnValue(new Promise(done => { resolve = done; }));
    const h = setup(); h.start(); h.rerender({ revision: 2 });
    await act(async () => resolve(assessment()));
    expect(h.save).not.toHaveBeenCalled(); expect(h.result.current.review).toBeNull();
  });
  it("never saves a late assessment after unmount", async () => {
    let resolve!: (value: ShiftAvailabilityAssessment) => void;
    vi.mocked(loadShiftAvailability).mockReturnValue(new Promise(done => { resolve = done; }));
    const h = setup(); h.start(); h.unmount();
    await act(async () => resolve(assessment()));
    expect(h.save).not.toHaveBeenCalled(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("cancels without saving and prevents duplicate drop requests", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ warning_policy: "confirm" }));
    const h = setup(); h.start(); h.start();
    await waitFor(() => expect(h.result.current.review).not.toBeNull());
    expect(loadShiftAvailability).toHaveBeenCalledOnce();
    act(() => h.result.current.dismiss()); expect(h.result.current.review).toBeNull(); expect(h.save).not.toHaveBeenCalled();
  });
});

describe("Schedule optimistic fast path", () => {
  const shiftInput: ScheduleShiftMutationInput = { ...input, job_id: "job", shift_type_id: null, note: "", unpaid_break_minutes: 0, hide_time_on_badge: false, label_ids: [], label_names: [] };
  const reviewRequired = () => new ScheduleRequestError("Review the current availability assessment before saving", 409, { status: "availability_review_required" });
  function fastSetup(copy = false) {
    const h = setup();
    const optimisticOp = createOptimisticPendingOp({ locationId: "location", weekStart: "2035-01-15", opType: copy ? "create" : "update",
      targetShiftId: copy ? null : "shift", draftId: null, payload: shiftInput, actorUserId: "actor" });
    const start = () => act(() => h.result.current.start({ input: shiftInput, shiftId: copy ? undefined : "shift", save: h.save, optimisticOp }));
    return { ...h, start, optimisticOp };
  }
  it.each([false, true])("projects immediately and saves without assessment (copy=%s)", async copy => {
    const h = fastSetup(copy);
    let resolve!: (saved: boolean) => void;
    h.save.mockImplementation(() => new Promise(done => { resolve = done; }));
    h.start();
    expect(h.save).toHaveBeenCalledExactlyOnceWith(shiftInput);
    expect(loadShiftAvailability).not.toHaveBeenCalled();
    const source = { ...shiftInput, id: "shift", scheduled_date: "2035-01-14", crosses_midnight: false, warning_codes: [] };
    const projected = buildEffectiveShifts([source], h.result.current.optimisticOps);
    expect(projected).toHaveLength(copy ? 2 : 1);
    expect(projected.at(-1)?.scheduled_date).toBe(input.scheduled_date);
    expect(h.result.current.savingState).toBeNull();
    await act(async () => resolve(true));
    expect(h.result.current.optimisticOps).toEqual([]);
    expect(h.result.current.pending).toBe(false);
  });
  it.each([
    new ScheduleRequestError("Edit session is stale", 409, { code: "40001" }),
    new ScheduleRequestError("Employee already has an overlapping shift", 422, { code: "23514" }),
    new ScheduleRequestError("Schedule location access denied", 403, { code: "42501" }),
    new Error("Connection lost"),
  ])("rolls back without assessment or retry on %s", async error => {
    const h = fastSetup(); h.save.mockRejectedValue(error); h.start();
    await waitFor(() => expect(h.result.current.pending).toBe(false));
    expect(h.save).toHaveBeenCalledOnce();
    expect(loadShiftAvailability).not.toHaveBeenCalled();
    expect(h.result.current.optimisticOps).toEqual([]);
    expect(toast.error).toHaveBeenCalledOnce();
  });
  it("retains the optimistic target for confirmation and cancels without a second save", async () => {
    const h = fastSetup(); h.save.mockRejectedValueOnce(reviewRequired());
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ warning_policy: "confirm" }));
    h.start();
    await waitFor(() => expect(h.result.current.review).not.toBeNull());
    expect(h.result.current.optimisticOps).toEqual([h.optimisticOp]);
    expect(toast.error).not.toHaveBeenCalled();
    act(() => h.result.current.dismiss());
    expect(h.result.current.optimisticOps).toEqual([]);
    expect(h.save).toHaveBeenCalledOnce();
  });
  it("revalidates confirmation, then saves its fingerprint without typed reason", async () => {
    const h = fastSetup(true); h.save.mockRejectedValueOnce(reviewRequired());
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ warning_policy: "confirm" }));
    h.start(); await waitFor(() => expect(h.result.current.review).not.toBeNull());
    await act(async () => h.result.current.confirm());
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(loadShiftAvailability).toHaveBeenCalledTimes(2);
    expect(h.save).toHaveBeenLastCalledWith({ ...shiftInput, availability_assessment_fingerprint: "a".repeat(64) });
    expect(h.result.current.optimisticOps).toEqual([]);
  });
  it("auto-saves warn policy after review with one warning", async () => {
    const h = fastSetup(); h.save.mockRejectedValueOnce(reviewRequired()); h.start();
    await waitFor(() => expect(h.result.current.pending).toBe(false));
    expect(h.save).toHaveBeenCalledTimes(2); expect(toast.warning).toHaveBeenCalledOnce();
    expect(h.result.current.review).toBeNull(); expect(h.result.current.optimisticOps).toEqual([]);
  });
  it("keeps the warning when its own successful save advances the revision", async () => {
    const h = fastSetup();
    h.save.mockRejectedValueOnce(reviewRequired()).mockImplementationOnce(async () => {
      h.rerender({ revision: 2 });
      return true;
    });
    h.start();
    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
    expect(h.result.current.optimisticOps).toEqual([]);
  });
  it("does not show a late save warning after unmount", async () => {
    const h = fastSetup();
    h.save.mockRejectedValueOnce(reviewRequired()).mockImplementationOnce(async () => {
      h.unmount();
      return true;
    });
    h.start();
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(toast.warning).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
  });
  it("rolls back when review discovers a block", async () => {
    const h = fastSetup(); h.save.mockRejectedValueOnce(reviewRequired());
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ operation: "blocked" }));
    h.start(); await waitFor(() => expect(h.result.current.review?.blocked).toBe(true));
    expect(h.result.current.optimisticOps).toEqual([]); expect(h.save).toHaveBeenCalledOnce();
  });
  it("shows feedback at 600ms and 5s and removes timers on completion", async () => {
    vi.useFakeTimers();
    const h = fastSetup(); let resolve!: (saved: boolean) => void;
    h.save.mockImplementation(() => new Promise(done => { resolve = done; })); h.start();
    act(() => vi.advanceTimersByTime(599)); expect(h.result.current.savingState).toBeNull();
    act(() => vi.advanceTimersByTime(1)); expect(h.result.current.savingState).toBe("saving");
    act(() => vi.advanceTimersByTime(4400)); expect(h.result.current.savingState).toBe("delayed");
    await act(async () => resolve(true)); expect(h.result.current.savingState).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not assess a late rejection after the edit context changes", async () => {
    const h = fastSetup(); let reject!: (error: Error) => void;
    h.save.mockImplementation(() => new Promise((_, fail) => { reject = fail; })); h.start();
    h.rerender({ revision: 2 });
    await act(async () => reject(reviewRequired()));
    expect(loadShiftAvailability).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled();
    expect(h.result.current.optimisticOps).toEqual([]);
  });
});
