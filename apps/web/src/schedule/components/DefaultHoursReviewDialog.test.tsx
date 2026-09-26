// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleDefaultHoursPreview, ScheduleEditSession, ScheduleReadModel } from "@newfork/shared/schedule";
import { DefaultHoursReviewDialog } from "./DefaultHoursReviewDialog";
import { applyScheduleDefaultHours, previewScheduleDefaultHours } from "../schedule-data";
vi.mock("../schedule-data", () => ({ applyScheduleDefaultHours: vi.fn(), previewScheduleDefaultHours: vi.fn() }));
const id = "afa70000-0000-4000-8000-000000000001", explicitId = "afa70000-0000-4000-8000-000000000002";
const session = { id, revision: 3, week_start: "2035-01-15", shifts: [{ id, time_basis: "type_default", shift_type_id: id, scheduled_date: "2035-01-15", location_id: id },
  { id: explicitId, time_basis: "explicit", shift_type_id: id, scheduled_date: "2035-01-15", location_id: id }] } as ScheduleEditSession;
const model = { settings: { time_format: "24h" }, shift_types: [{ id, name: "Lunch" }], employees: [], locations: [{ id, name: "Main" }] } as unknown as ScheduleReadModel;
const reference = { start_time: "12:00", end_time: "16:00", time_basis: "type_default" as const, time_timezone: "UTC", time_snapshot: { default_revision: 1 } };
function preview(): ScheduleDefaultHoursPreview {
  return { session_id: id, session_revision: 3, starts_on: "2035-01-15", ends_on: "2035-01-21", fingerprint: "a".repeat(64), changed_count: 1, blocked_count: 0,
    shifts: [{ shift_id: id, shift_revision: 1, scheduled_date: "2035-01-15", location_id: id, location_name: "Main", shift_type_name: "Lunch", employee_name: "Open shift",
      before: reference, after: { ...reference, start_time: "11:00", end_time: "17:00", time_snapshot: { default_revision: 2 } }, before_assessment: null, after_assessment: null,
      reason: null, will_change: true, can_apply: true, current_default_revision: 2, before_overlap_count: 0, after_overlap_count: 0 }] };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(previewScheduleDefaultHours).mockResolvedValue(preview()); vi.mocked(applyScheduleDefaultHours).mockResolvedValue({ ...session, revision: 4 }); });
afterEach(cleanup);
function setup() {
  const onApplied = vi.fn(), onClose = vi.fn();
  const view = (value = session) => <DefaultHoursReviewDialog workspaceId={id} session={value} model={model} onApplied={onApplied} onClose={onClose} />;
  return { ...render(view()), view, onApplied, onClose };
}
async function review() { fireEvent.click(screen.getByRole("button", { name: "Review 1 shift" })); await screen.findByText("11:00 – 17:00 · UTC"); }
function weeklyPreview(policy: "warn" | "confirm", accepted = false): ScheduleDefaultHoursPreview {
  const value = preview();
  value.shifts[0]!.after_assessment = {
    conflict_severity: policy, coverage: "partial", operation: "warning_requires_override", time_basis: "type_default", timezone: "UTC",
    assessment_scope: "shift_interval", intervals: [], available_intervals: [], unavailable_intervals: [], unknown_intervals: [],
    reasons: [{ code: "availability", message: "The assignment overlaps unavailable hours.", definite: true }],
    fingerprint: "b".repeat(64), policy_revision: 1, fold_resolution: null, assessment_minutes: 360, can_override: true,
    warning_policy: policy, has_availability_conflict: true, override_recorded: accepted,
  };
  return value;
}
describe("default-hours batch review", () => {
  it.each(["warn", "confirm"] as const)("uses a single reason-free %s action for weekly conflicts", async policy => {
    vi.mocked(previewScheduleDefaultHours).mockResolvedValue(weeklyPreview(policy));
    const ui = setup(); await review();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: policy === "confirm" ? /^Confirm availability and apply/ : /^Apply 1 change/ }));
    await waitFor(() => expect(ui.onApplied).toHaveBeenCalled());
    expect(applyScheduleDefaultHours).toHaveBeenCalledWith(id, id, expect.objectContaining({
      confirm_availability: policy === "confirm", fingerprint: "a".repeat(64),
    }));
  });
  it("does not ask again for a retained weekly acceptance", async () => {
    vi.mocked(previewScheduleDefaultHours).mockResolvedValue(weeklyPreview("confirm", true));
    setup(); await review();
    expect(screen.queryByRole("button", { name: /^Confirm availability/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Apply 1 change/ }).hasAttribute("disabled")).toBe(false);
  });
  it("reviews only reference shifts and requires review before applying", async () => {
    const ui = setup();
    expect(screen.queryByRole("button", { name: /Apply .*changes/ })).toBeNull();
    await review();
    expect(previewScheduleDefaultHours).toHaveBeenCalledWith(id, id, { expected_session_revision: 3, starts_on: "2035-01-15", ends_on: "2035-01-21", shift_ids: [id] });
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change to edit session" }));
    await waitFor(() => expect(ui.onApplied).toHaveBeenCalledWith({ ...session, revision: 4 }));
    expect(ui.onClose).toHaveBeenCalledOnce();
  });
  it("invalidates an existing review when session state refreshes", async () => {
    const ui = setup(); await review();
    ui.rerender(ui.view({ ...session, revision: 4 }));
    expect(screen.getByText(/This review is out of date/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Apply 1 change/ }).hasAttribute("disabled")).toBe(true);
  });
  it("blocks an overlap outright: the reason shows, no acknowledgment box, apply stays off", async () => {
    const value = preview(); value.blocked_count = 1; value.shifts[0]!.can_apply = false; value.shifts[0]!.reason = "Overlaps Close 17:30–19:00"; value.shifts[0]!.after_overlap_count = 1;
    vi.mocked(previewScheduleDefaultHours).mockResolvedValue(value);
    setup(); await review();
    expect(screen.getByText("Overlaps Close 17:30–19:00")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /overlap/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Apply 1 change/ }).hasAttribute("disabled")).toBe(true);
  });
  it("never sends an overlap acknowledgment with the apply command", async () => {
    setup(); await review(); fireEvent.click(screen.getByRole("button", { name: /Apply 1 change/ }));
    await waitFor(() => expect(applyScheduleDefaultHours).toHaveBeenCalledOnce());
    expect(vi.mocked(applyScheduleDefaultHours).mock.calls[0]![2]).not.toHaveProperty("acknowledge_reference_overlaps");
  });
  it("keeps the same retry key after an uncertain apply response", async () => {
    vi.mocked(applyScheduleDefaultHours).mockRejectedValueOnce(new Error("Connection lost"));
    setup(); await review(); fireEvent.click(screen.getByRole("button", { name: /Apply 1 change/ }));
    await screen.findByText("Connection lost");
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 change/ }));
    await waitFor(() => expect(applyScheduleDefaultHours).toHaveBeenCalledTimes(2));
    expect(vi.mocked(applyScheduleDefaultHours).mock.calls[0]![2].idempotency_key).toBe(vi.mocked(applyScheduleDefaultHours).mock.calls[1]![2].idempotency_key);
  });
  it("does not revive a late response after session revision changes", async () => {
    let resolve!: (value: ScheduleDefaultHoursPreview) => void;
    vi.mocked(previewScheduleDefaultHours).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const ui = setup(); fireEvent.click(screen.getByRole("button", { name: "Review 1 shift" }));
    ui.rerender(ui.view({ ...session, revision: 4 })); resolve(preview());
    await waitFor(() => expect(screen.queryByText("Reviewing…")).toBeNull());
    expect(screen.queryByRole("button", { name: /Apply 1 change/ })).toBeNull();
  });
  it("shows only a plain line, never raw validation text, when the range has no shifts", () => {
    setup(); fireEvent.change(screen.getByLabelText("Shift type"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2035-01-16" } });
    expect(screen.getByText("No saved reference-hour shifts in this range.")).toBeTruthy();
    expect(screen.queryByText(/expected array|Too small/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Review 0 shifts" }).hasAttribute("disabled")).toBe(true);
  });
  it("contains keyboard focus and closes on Escape", () => {
    const ui = setup();
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Review 1 shift" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(ui.onClose).toHaveBeenCalledOnce();
  });
  it("contains Schedule shortcuts and keeps focus inside while every control is disabled", async () => {
    const shortcut = vi.fn(); window.addEventListener("keydown", shortcut); window.addEventListener("paste", shortcut);
    let resolve!: (value: ScheduleDefaultHoursPreview) => void;
    vi.mocked(previewScheduleDefaultHours).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    try {
      setup();
      fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Delete" });
      fireEvent.paste(screen.getByRole("button", { name: "Close" }));
      expect(shortcut).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Review 1 shift" }));
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("dialog")));
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(screen.getByRole("dialog"));
      resolve(preview()); await screen.findByText("11:00 – 17:00 · UTC");
    } finally { window.removeEventListener("keydown", shortcut); window.removeEventListener("paste", shortcut); }
  });
});
