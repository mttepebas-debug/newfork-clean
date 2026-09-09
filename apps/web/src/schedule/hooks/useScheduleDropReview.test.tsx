// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";
import type { ScheduleShiftMutationInput } from "@newfork/shared/schedule";
import { useScheduleDropReview } from "./useScheduleDropReview";
import { loadShiftAvailability } from "../../availability/availability-data";

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("@newfork/ui", () => ({ useToast: () => toast }));
vi.mock("../../availability/availability-data", () => ({ loadShiftAvailability: vi.fn() }));
const input = { employee_id: "employee", location_id: "location", scheduled_date: "2035-01-15", start_time: "18:00", end_time: "20:00" } as ScheduleShiftMutationInput;
function assessment(changes: Partial<ShiftAvailabilityAssessment> = {}): ShiftAvailabilityAssessment {
  return { coverage: "partial", operation: "warning_requires_override", time_basis: "explicit", timezone: "UTC", assessment_scope: "shift_interval",
    intervals: [], available_intervals: [], unavailable_intervals: [], unknown_intervals: [],
    reasons: [{ code: "availability", message: "Unavailable hours", definite: true }], fingerprint: "a".repeat(64),
    policy_revision: 1, fold_resolution: null, assessment_minutes: 120, can_override: true, warning_policy: "warn", ...changes };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadShiftAvailability).mockResolvedValue(assessment()); });
afterEach(cleanup);
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
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith("2 shifts overlap unavailable hours.");
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
  it("preserves the legacy server's reason requirement until the schema switch", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(assessment({ warning_policy: undefined }));
    const h = setup(); h.start(); await waitFor(() => expect(h.result.current.review).not.toBeNull());
    await act(async () => h.result.current.confirm()); expect(h.save).not.toHaveBeenCalled();
    act(() => h.result.current.setReason("Employee confirmed this assignment."));
    await act(async () => h.result.current.confirm()); await waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(h.save.mock.calls[0]![0]).toHaveProperty("conflict_override_note", "Employee confirmed this assignment.");
  });
});
