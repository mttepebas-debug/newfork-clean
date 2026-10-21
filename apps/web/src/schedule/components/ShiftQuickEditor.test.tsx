import type { ScheduleEditableShift, ScheduleReadModel } from "@newfork/shared/schedule";
import { readFileSync } from "node:fs";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadShiftAvailability } from "../../availability/availability-data";
import { RequestError } from "../../lib/request-error";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";

import { ShiftCard } from "./ShiftCard";
import { ShiftQuickEditor } from "./ShiftQuickEditor";
// CI runs check beside db and e2e on one PC; a dialog closing after Escape took
// 1181 ms there against Testing Library's 1 s default for findBy/waitFor (CI-HIZ-2).
configure({ asyncUtilTimeout: 5000 });
const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("@newfork/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@newfork/ui")>(),
  useToast: () => toast,
}));
vi.mock("../../availability/availability-data", () => ({
  loadShiftAvailability: vi.fn(),
}));
const confirmedAvailability: ShiftAvailabilityAssessment = {
  conflict_severity: "warn",
  coverage: "full",
  operation: "allowed",
  time_basis: "explicit",
  timezone: "America/Los_Angeles",
  assessment_scope: "shift_interval",
  intervals: [],
  available_intervals: [],
  unavailable_intervals: [],
  unknown_intervals: [],
  reasons: [],
  fingerprint: "a".repeat(64),
  policy_revision: 1,
  fold_resolution: null,
  assessment_minutes: 240,
  can_override: true,
};
beforeEach(() => {
  // The window opens in the layout last used; each test starts on Form.
  window.localStorage.clear();
  toast.warning.mockClear();
  toast.error.mockClear();
  vi
    .mocked(loadShiftAvailability)
    .mockReset()
    .mockResolvedValue(confirmedAvailability);
});

const model: ScheduleReadModel = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: {
    time_format: "12h",
  },
  locations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: null,
    },
  ],
  departments: [],
  jobs: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Server",
      color: "#2563eb",
      
      department_id: null,
      system_key: null,
    },
  ],
  referenced_jobs: [],
  referenced_shift_types: [],
  shift_types: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Dinner",
      color: "#7c3aed",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
  ],
  shift_labels: [],
  employees: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      employee_code: "NF-001",
      display_name: "Alex Rivera",
      location_ids: ["22222222-2222-4222-8222-222222222222"],
      job_ids: ["33333333-3333-4333-8333-333333333333"],
      primary_job_id: "33333333-3333-4333-8333-333333333333",
      is_excluded_from_schedule: false,
    },
  ],
  shifts: [],
  closures: [],
  important_dates: [],
};

function dispatchPointerEvent(
  element: Element,
  type: string,
  init: {
    readonly pointerId: number;
    readonly button?: number;
    readonly clientX: number;
    readonly clientY: number;
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
  });
  fireEvent(element, event);
}

describe("ShiftQuickEditor", () => {
  // Bug 24: every refusal read "Availability could not be checked", even when
  // the person or the manager is not at this location.
  it.each([
    [new RequestError("Employee is not assigned to this location", undefined, undefined, 403),
      "Not assigned to this location", "Add them to this location first, or pick someone else."],
    [new RequestError("Not allowed", "authz.out_of_scope", "schedule.edit", 403), "You can't edit this location's schedule", undefined],
    [new RequestError("Something else", undefined, undefined, 400), "Availability could not be checked", "Something else"],
  ])("names why the check was refused: %s", async (error, title, description) => {
    vi.mocked(loadShiftAvailability).mockRejectedValue(error);
    render(<ShiftQuickEditor model={model} state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }} timeFormat="12h" formatTime={value => value} addDays={value => value} scheduleClosureCoversDate={() => false} onClose={vi.fn()} onReload={vi.fn()} onDelete={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(toast.error.mock.calls[0]?.[0]).toBe(title);
    expect((toast.error.mock.calls[0]?.[1] as { description?: string } | undefined)?.description).toBe(description);
  });

  it("uses fresh canonical confirmation instead of a stale cached blocker", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...confirmedAvailability, conflict_severity: "confirm", operation: "warning_requires_override", warning_policy: "confirm", reasons: [{ code: "closed_location", severity: "confirm", definite: true, message: "This location is closed." }] });
    const onSubmit = vi.fn().mockResolvedValue("saved");
    render(<ShiftQuickEditor model={{ ...model, employees: model.employees.map(employee => ({ ...employee, is_excluded_from_schedule: true })) }} state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }} timeFormat="12h" formatTime={value => value} addDays={value => value} scheduleClosureCoversDate={() => false} onClose={vi.fn()} onReload={vi.fn()} onDelete={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });
  describe("closed day under K17 (BL-606)", () => {
    const closed = { code: "closed_location", severity: "confirm" as const, definite: true, message: "This location is closed." };
    const closedDay = (reasons: ShiftAvailabilityAssessment["reasons"] = [closed]) => ({
      ...confirmedAvailability, conflict_severity: "confirm" as const, operation: "warning_requires_override" as const, warning_policy: "confirm" as const, reasons,
    });
    // Each call is one cell: the editor opens, the manager presses Add shift.
    // BL-685: the server's reason says "confirm once" (confirm_scope); the page's settings do not decide.
    const onceClosed = { ...closed, confirm_scope: "edit_session" as const };
    async function addOnClosedDay(rule: "confirm" | "confirm_once", sessionId: string,
      reasons: ShiftAvailabilityAssessment["reasons"] = [rule === "confirm_once" ? onceClosed : closed]) {
      const onSubmit = vi.fn().mockResolvedValue("saved");
      vi.mocked(loadShiftAvailability).mockResolvedValue(closedDay(reasons));
      const view = render(<ShiftQuickEditor model={{ ...model, settings: { ...model.settings, conflict_rules: { approved_time_off: "block", closed_location: "confirm", minimum_travel: "confirm", minimum_rest: "confirm" } } }}
        state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }} sessionId={sessionId}
        timeFormat="12h" formatTime={value => value} addDays={value => value} scheduleClosureCoversDate={() => false}
        onClose={vi.fn()} onReload={vi.fn()} onDelete={vi.fn()} onSubmit={onSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
      await waitFor(() => expect(loadShiftAvailability).toHaveBeenCalled());
      // Asked or saved, whichever comes first: waiting for the question to time out cost 5 s per unasked cell (BL-757).
      await waitFor(() => expect(onSubmit.mock.calls.length > 0 || screen.queryByRole("button", { name: "Place shift" }) !== null).toBe(true));
      const asked = screen.queryByRole("button", { name: "Place shift" }) !== null;
      if (asked) fireEvent.click(screen.getByRole("button", { name: "Place shift" }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
      view.unmount();
      vi.mocked(loadShiftAvailability).mockClear();
      return { asked, payload: onSubmit.mock.calls[0]![0] };
    }
    beforeEach(() => vi.mocked(loadShiftAvailability).mockResolvedValue(closedDay()));

    it("confirm once: asks on the first cell only, and still sends the acceptance", async () => {
      expect((await addOnClosedDay("confirm_once", "editor-once")).asked).toBe(true);
      const second = await addOnClosedDay("confirm_once", "editor-once");
      expect(second.asked).toBe(false);
      expect(second.payload).toMatchObject({ availability_assessment_fingerprint: "a".repeat(64) });
    });
    it("confirm: asks on every cell", async () => {
      expect((await addOnClosedDay("confirm", "editor-each")).asked).toBe(true);
      expect((await addOnClosedDay("confirm", "editor-each")).asked).toBe(true);
    });
    it("confirm once: a new editing session asks again", async () => {
      expect((await addOnClosedDay("confirm_once", "editor-first")).asked).toBe(true);
      expect((await addOnClosedDay("confirm_once", "editor-second")).asked).toBe(true);
    });
    it("confirm once: another confirm reason on the cell still asks", async () => {
      expect((await addOnClosedDay("confirm_once", "editor-rest")).asked).toBe(true);
      expect((await addOnClosedDay("confirm_once", "editor-rest",
        [onceClosed, { code: "minimum_rest", severity: "confirm", definite: true, message: "Not enough rest." }])).asked).toBe(true);
    });
  });
  function renderAssigned(onSubmit = vi.fn().mockResolvedValue("saved")) {
    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
        }}
        timeFormat="12h"
        formatTime={(v) => v}
        addDays={(v) => v}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }
  // The employee's own mark on the shift's hours: only a warning (BL-186).
  const availabilityReason = { code: "availability", message: "The assignment overlaps unavailable hours.", definite: true, severity: "warn" as const };
  // What the server answers when a Conflict handling rule set to Warn or
  // Require confirmation matches (minimum rest here).
  function weekly(level: "warn" | "confirm"): ShiftAvailabilityAssessment {
    return {
      ...confirmedAvailability,
      conflict_severity: level,
      operation: "warning_requires_override",
      warning_policy: level,
      can_override: false,
      reasons: [{ code: "minimum_rest", message: "There is not enough rest time between shifts.", definite: true, severity: level }],
    };
  }
  const weeklyWarning = weekly("warn");

  const noteReason = { code: "note", message: "The assignment overlaps hours a manager noted for this person.", definite: true, severity: "warn" as const };

  // Müsaitlik tercih 3 (2026-10-13) and M12 as of 2026-10-16: the employee's own
  // mark and a manager's note never ask; the shift is written straight away and
  // the page shows the short notice.
  it.each([
    ["the employee's unavailable hours", [availabilityReason]],
    ["a manager's note", [noteReason]],
    ["both together", [availabilityReason, noteReason]],
  ] as const)("saves over %s at once, with no box or note card", async (_label, reasons) => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...confirmedAvailability, has_availability_conflict: true,
      availability_fingerprint: "c".repeat(64), reasons: [...reasons] });
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: /^Manager note for / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Place shift" })).toBeNull();
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("availability_assessment_fingerprint");
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("conflict_override_note");
    // The page says it; the window adds no toast of its own.
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("another rule's confirmation names only that rule, never the employee's mark", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...weekly("confirm"), reasons: [...weekly("confirm").reasons, availabilityReason, noteReason] });
    renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    const sheet = await screen.findByRole("dialog", { name: "Shift conflict" });
    expect([...sheet.querySelectorAll("[role=alert] p")].map((line) => line.textContent)).toEqual([
      "There is not enough rest time between shifts.",
    ]);
  });

  it("keeps the editor open when the rule box is pressed, so Place shift saves", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(weekly("confirm"));
    const onSubmit = vi.fn().mockResolvedValue("saved");
    const onDismiss = vi.fn();
    render(
      <ShiftQuickEditor
        model={model}
        state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }}
        timeFormat="12h" formatTime={(v) => v} addDays={(v) => v} scheduleClosureCoversDate={() => false}
        onClose={vi.fn()} onDismiss={onDismiss} onReload={vi.fn()} onDelete={vi.fn()} onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await screen.findByRole("dialog", { name: "Shift conflict" });
    const place = screen.getByRole("button", { name: "Place shift" });
    dispatchPointerEvent(place, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.click(place);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("spends Escape on the rule box like Cancel, keeping the editor open", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(weekly("confirm"));
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    render(
      <ShiftQuickEditor
        model={model}
        state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }}
        timeFormat="12h" formatTime={(v) => v} addDays={(v) => v} scheduleClosureCoversDate={() => false}
        onClose={onClose} onDismiss={onDismiss} onReload={vi.fn()} onDelete={vi.fn()} onSubmit={vi.fn()}
      />,
    );
    // A real click focuses the button, and a real browser drops focus from it
    // while it is disabled for the check.
    act(() => screen.getByRole("button", { name: "Add shift" }).focus());
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await screen.findByRole("dialog", { name: "Shift conflict" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Focus goes back where the question came from, not to the top of the page.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add shift" }));
  });

  it("moves focus to Cancel when the rule box opens, so a second Enter never places unread", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(weekly("confirm"));
    renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    const box = await screen.findByRole("dialog", { name: "Shift conflict" });
    await waitFor(() => expect(document.activeElement).toBe(within(box).getByRole("button", { name: "Cancel" })));
  });

  it("saves a weekly warn conflict with one toast and no written reason", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(weeklyWarning);
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      "Shift saved with a warning",
      expect.objectContaining({
        dedupeKey: "schedule-quick-editor-availability-warning",
        description: "There is not enough rest time between shifts.",
      }),
    );
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ availability_assessment_fingerprint: weeklyWarning.fingerprint });
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("conflict_override_note");
  });

  it("confirms weekly availability without a reason or duplicate toast and rechecks before saving", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue(weekly("confirm"));
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await screen.findByRole("dialog", { name: "Shift conflict" });
    expect(toast.warning).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Place shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(loadShiftAvailability).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0]![0]).not.toHaveProperty("conflict_override_note");
  });

  it("asks again when the confirmed weekly conflict changed before save", async () => {
    vi.mocked(loadShiftAvailability)
      .mockResolvedValueOnce(weekly("confirm"))
      .mockResolvedValue({ ...weekly("confirm"), fingerprint: "b".repeat(64) });
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place shift" }));
    await waitFor(() => expect(loadShiftAvailability).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Place shift" })).toHaveProperty("disabled", false));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Place shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ availability_assessment_fingerprint: "b".repeat(64) });
  });

  it.each(["override_recorded", "responsibility_retained"] as const)("does not repeat an accepted weekly warning (%s)", async (evidence) => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...weekly("confirm"), [evidence]: true });
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("blocks when the server check blocks, whatever the grid showed", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({
      ...confirmedAvailability,
      conflict_severity: "block",
      warning_policy: "warn",
      operation: "blocked",
      coverage: "none",
      reasons: [
        {
          code: "approved_time_off",
          message: "Approved time off overlaps this assignment.",
          definite: true,
          severity: "block",
        },
      ],
    });
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    expect(
      (await screen.findByRole("dialog", { name: "Shift conflict" }))
        .textContent,
    ).toContain("Approved time off overlaps");
    expect(screen.queryByRole("button", { name: /anyway|Place shift/ })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("does not submit an earlier value when the employee edits during the assessment", async () => {
    let resolve!: (value: ShiftAvailabilityAssessment) => void;
    vi.mocked(loadShiftAvailability).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    fireEvent.click(screen.getByLabelText("Show times on badge"));
    resolve(confirmedAvailability);
    await waitFor(() =>
      expect(screen.queryByText("Checking availability…")).toBeNull(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("opens beside the pointer, inside the screen, and moves by dragging the header", () => {
    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add shift" });
    expect(dialog.style.left).toBe("34px");
    // Its arrow points at the pointer from 72px down; the screen's edge stops it at 8px.
    expect(dialog.style.top).toBe("8px");

    const header = dialog.querySelector("header");
    expect(header).not.toBeNull();

    dispatchPointerEvent(header!, "pointerdown", {
      pointerId: 1,
      button: 0,
      clientX: 34,
      clientY: 32,
    });
    dispatchPointerEvent(header!, "pointermove", {
      pointerId: 1,
      clientX: 54,
      clientY: 62,
    });
    dispatchPointerEvent(header!, "pointerup", {
      pointerId: 1,
      clientX: 54,
      clientY: 62,
    });

    expect(dialog.style.left).toBe("54px");
    expect(dialog.style.top).toBe("38px");
  });

  it("uses a separate dismiss handler for blank clicks and Escape", () => {
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={onClose}
        onDismiss={onDismiss}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenLastCalledWith(document.body);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets non-suppressed outside clicks continue after dismissing", () => {
    const onDismiss = vi.fn();
    const onOutsidePointerDown = vi.fn();
    document.body.addEventListener("pointerdown", onOutsidePointerDown);
    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onDismiss={onDismiss}
        shouldSuppressDismissPointerDown={() => false}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.pointerDown(document.body);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOutsidePointerDown).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("pointerdown", onOutsidePointerDown);
  });

  it("steps back from End to Start's minutes in a 24-hour workspace (BL-199)", () => {
    render(
      <ShiftQuickEditor
        model={model}
        state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }}
        timeFormat="24h"
        formatTime={(value) => value}
        addDays={(value) => value}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const start = screen.getByLabelText("Start time") as HTMLInputElement;
    const end = screen.getByLabelText("End time") as HTMLInputElement;
    end.dataset.autoSelectSegment = "hour";
    act(() => end.focus());
    fireEvent.keyDown(end, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(start);
    expect(start.parentElement?.querySelector('[data-time-segment="period"]')).toBeNull();
    expect(getTimeSegment(start, "minute")?.dataset.active).toBe("true");
    // A second Shift+Tab walks back through Start, not past it.
    fireEvent.keyDown(start, { key: "Tab", shiftKey: true });
    expect(getTimeSegment(start, "hour")?.dataset.active).toBe("true");
    expect(document.activeElement).toBe(start);
  });

  // BL-613: a 24-hour manager types both times and saves without the mouse.
  it("takes start, end and Enter from the keyboard in a 24-hour workspace (BL-613)", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    render(
      <ShiftQuickEditor
        model={model}
        state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }}
        timeFormat="24h"
        formatTime={(value) => value}
        addDays={(value) => value}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const start = screen.getByLabelText("Start time") as HTMLInputElement;
    const end = screen.getByLabelText("End time") as HTMLInputElement;
    act(() => start.focus());

    for (const key of ["1", "4", "3"]) fireEvent.keyDown(start, { key });
    expect(document.activeElement).toBe(start);
    fireEvent.keyDown(start, { key: "0" });
    expect(document.activeElement).toBe(end);
    expect(getTimeSegment(end, "hour")?.dataset.active).toBe("true");

    for (const key of ["2", "2", "1", "5"]) fireEvent.keyDown(end, { key });
    expect(document.activeElement).toBe(end);
    fireEvent.keyDown(end, { key: "Enter" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ start_time: "14:30", end_time: "22:15" }),
      1,
    );
  });

  it("links start and end time keyboard flow like the reference popup", () => {
    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const startInput = screen.getByLabelText("Start time") as HTMLInputElement;
    const endInput = screen.getByLabelText("End time") as HTMLInputElement;

    fireEvent.change(startInput, { target: { value: "930" } });
    fireEvent.keyDown(startInput, { key: "p" });

    expect(document.activeElement).toBe(endInput);
    expect(getTimeSegment(endInput, "hour")?.dataset.active).toBe("true");

    fireEvent.keyDown(endInput, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(startInput);
    expect(getTimeSegment(startInput, "period")?.dataset.active).toBe("true");
  });

  it("submits multiple open shifts and preserves clock times while the badge clock is shown", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);

    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso, days) => {
          const date = new Date(`${iso}T00:00:00.000Z`);
          date.setUTCDate(date.getUTCDate() + days);
          return date.toISOString().slice(0, 10);
        }}
        scheduleClosureCoversDate={(closure, date) => date === closure.closed_date}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    fireEvent.click(screen.getByRole("button", { name: "15m" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 shifts" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: null,
        job_id: model.jobs[0]!.id,
        shift_type_id: null,
        scheduled_date: model.week_start,
        start_time: "16:00",
        end_time: "22:00",
        unpaid_break_minutes: 15,
        hide_time_on_badge: false,
      }),
      3,
    );
  });

  it("preserves assessed clock values when badge clock time is hidden", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);

    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          preset: {
            jobId: model.jobs[0]!.id,
            shiftTypeId: model.shift_types[0]!.id,
            startTime: null,
            endTime: null,
          },
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: model.employees[0]!.id,
        job_id: model.jobs[0]!.id,
        shift_type_id: model.shift_types[0]!.id,
        start_time: "16:00",
        end_time: "22:00",
        hide_time_on_badge: true,
      }),
      1,
    );
  });

  it("keeps an assigned-cell create on the target employee when the first job belongs to another role", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    const hostJob = {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Host",
      color: "#f97316",
      department_id: null,
      system_key: null,
    };
    const serverJob = {
      ...model.jobs[0]!,
    };
    const editorModel: ScheduleReadModel = {
      ...model,
      jobs: [hostJob, serverJob],
      employees: [
        {
          ...model.employees[0]!,
          job_ids: [serverJob.id],
          primary_job_id: serverJob.id,
        },
      ],
    };

    render(
      <ShiftQuickEditor
        model={editorModel}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Employee" })).toBeNull();
    expect(screen.queryByText("Alex Rivera")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: model.employees[0]!.id,
        job_id: serverJob.id,
      }),
      1,
    );
  });

  it("uses reference-style pickers and shift type chips when submitting selected options", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    const secondLocation = {
      ...model.locations[0]!,
      id: "66666666-6666-4666-8666-666666666666",
      name: "Patio",
      sort_order: 1,
    };
    const secondJob = {
      ...model.jobs[0]!,
      id: "77777777-7777-4777-8777-777777777777",
      name: "Bartender",
      sort_order: 1,
    };
    const secondShiftType = {
      ...model.shift_types[0]!,
      id: "88888888-8888-4888-8888-888888888888",
      name: "Lunch",
      sort_order: 1,
      default_start_time: "11:00",
      default_end_time: "15:00",
    };
    const label = {
      id: "99999999-9999-4999-8999-999999999999",
      name: "Opener",
      color: "#f97316",
      sort_order: 0,
    };
    const secondLabel = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Training",
      color: "#2563eb",
      sort_order: 1,
    };
    const editorModel: ScheduleReadModel = {
      ...model,
      locations: [...model.locations, secondLocation],
      jobs: [...model.jobs, secondJob],
      shift_types: [...model.shift_types, secondShiftType],
      shift_labels: [label, secondLabel],
      employees: [
        {
          ...model.employees[0]!,
          location_ids: [model.locations[0]!.id, secondLocation.id],
          job_ids: [model.jobs[0]!.id, secondJob.id],
        },
      ],
    };

    render(
      <ShiftQuickEditor
        model={editorModel}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Location" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Employee" })).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    expect(screen.getByRole("option", { name: "Alex Rivera" })).toBeTruthy();
    // Mert, 2026-10-12: the unassigned choice reads "Open".
    expect(screen.queryByRole("option", { name: "Unassigned" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Open" }));
    expect(screen.queryByText("Main Dining")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Job" }));
    fireEvent.click(screen.getByRole("option", { name: "Bartender" }));

    const dinnerShiftType = screen.getByRole("button", { name: "Dinner" });
    const lunchShiftType = screen.getByRole("button", { name: "Lunch" });
    expect(screen.queryByRole("combobox", { name: "Shift type" })).toBeNull();
    expect(dinnerShiftType.getAttribute("aria-pressed")).toBe("false");
    expect(lunchShiftType.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(lunchShiftType);
    expect(lunchShiftType.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("combobox", { name: "Labels" }));
    fireEvent.click(screen.getByRole("option", { name: "Opener" }));
    expect(
      screen.getByRole("combobox", { name: "Labels" }).getAttribute(
        "aria-expanded",
      ),
    ).toBe("false");
    fireEvent.click(screen.getByRole("combobox", { name: "Labels" }));
    fireEvent.click(screen.getByRole("option", { name: "Training" }));

    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        location_id: model.locations[0]!.id,
        employee_id: null,
        job_id: secondJob.id,
        shift_type_id: secondShiftType.id,
        label_ids: [label.id, secondLabel.id],
        label_names: [label.name, secondLabel.name],
        start_time: "11:00",
        end_time: "15:00",
      }),
      1,
    );
  });

  // ROL-CIFT 2.2: who can be scheduled is the server's answer (the grid lists
  // only people with the employee access); the picker adds no role filter of
  // its own, so a manager who also works is offered like anyone else.
  it("offers every qualified person the server lists, a working manager included", () => {
    const editorModel: ScheduleReadModel = {
      ...model,
      employees: [
        model.employees[0]!,
        {
          ...model.employees[0]!,
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          employee_code: "NF-002",
          display_name: "Dora Manager",
        },
      ],
    };
    render(
      <ShiftQuickEditor
        model={editorModel}
        state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: null, date: model.week_start, x: 24, y: 32 }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: /Alex Rivera/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Dora Manager/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Open/ })).toBeTruthy();
  });

  it("reports whether the manager changed anything", async () => {
    const onDirtyChange = vi.fn();

    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onDirtyChange={onDirtyChange}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: "15m" }));

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  it("names the cell in the header, not as fields, and keeps it in the payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);

    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Location" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Employee" })).toBeNull();
    expect(screen.queryByText("Main Dining")).toBeNull();
    expect(screen.queryByText("Alex Rivera")).toBeNull();
    expect(screen.queryByText("Mon, Aug 17")).toBeNull();
    expect(screen.queryByLabelText("Shift context")).toBeNull();
    expect(screen.queryByDisplayValue(model.week_start)).toBeNull();
    // Who, which day and where, on one line under the title (Mert, 2026-10-12).
    expect(screen.getByText("Alex Rivera · Mon, Aug 17 · Main Dining").id).toBe(
      screen.getByRole("dialog", { name: "Add shift" }).getAttribute("aria-describedby"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        location_id: model.locations[0]!.id,
        employee_id: model.employees[0]!.id,
        scheduled_date: model.week_start,
      }),
      1,
    );
  });

  it("blocks submit when a time field is cleared", () => {
    const onSubmit = vi.fn();

    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "" },
    });

    const addButton = screen.getByRole("button", { name: "Add shift" });
    expect((addButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Enter start and end time.")).toBeTruthy();
    fireEvent.click(addButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks for hours when the shift type has no default hours", async () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    const clockOffShiftType = {
      ...model.shift_types[0]!,
      id: "66666666-6666-4666-8666-666666666666",
      name: "Training",
      default_start_time: null,
      default_end_time: null,
    };

    render(
      <ShiftQuickEditor
        model={{
          ...model,
          shift_types: [...model.shift_types, clockOffShiftType],
        }}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          preset: {
            jobId: model.jobs[0]!.id,
            shiftTypeId: clockOffShiftType.id,
            startTime: null,
            endTime: null,
          },
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter start and end time.",
    );
    // Both boxes are described by the row's note (UI-FIELDMSG-2).
    for (const label of ["Start time", "End time"])
      expect(screen.getByLabelText(label).getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    const addButton = screen.getByRole("button", { name: "Add shift" });
    expect((addButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(addButton);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "13:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "17:00" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          shift_type_id: clockOffShiftType.id,
          time_basis: "explicit",
          start_time: "13:00",
          end_time: "17:00",
          time_snapshot: null,
        }),
        1,
      ),
    );
  });

  it("continues closed-day warnings without a written override reason", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({
      ...confirmedAvailability,
      conflict_severity: "confirm",
      operation: "warning_requires_override",
      warning_policy: "confirm",
      reasons: [{ code: "closed_location", message: "Location or shift type is closed on this date.", definite: true, severity: "confirm" }],
    });
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    const closedModel: ScheduleReadModel = {
      ...model,
      closures: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          location_id: model.locations[0]!.id,
          title: "Private event",
          closed_date: model.week_start,
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
        },
      ],
    };

    render(
      <ShiftQuickEditor
        model={closedModel}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={(closure, date) => date === closure.closed_date}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    const conflictDialog = await screen.findByRole("dialog", {
      name: "Shift conflict",
    });
    const placeShift = screen.getByRole("button", { name: "Place shift" });
    expect(conflictDialog.textContent).toContain("closed on this date");
    expect(placeShift).toHaveProperty("disabled", false);
    fireEvent.click(placeShift);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        conflict_override_note: "Manager acknowledged schedule warning.",
      }),
      1,
    );
  });

  it("keeps hard conflicts disabled without submitting", () => {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);

    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: model.employees[0]!.id,
          date: model.week_start,
          x: 24,
          y: 32,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("End time"), {
      target: { value: "16:00" },
    });

    expect(
      screen.getByText("Start and end time cannot be the same."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add shift" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(
      screen.getByText("Start and end time cannot be the same."),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// Mert, 2026-10-12: one window with two layouts, Form and Timeline.
describe("ShiftQuickEditor layouts", () => {
  const create = { mode: "create" as const, locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start };
  function renderWindow(
    state: Parameters<typeof ShiftQuickEditor>[0]["state"] = create,
    extra: Partial<Parameters<typeof ShiftQuickEditor>[0]> = {},
  ) {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    const onClose = vi.fn();
    const view = render(
      <ShiftQuickEditor
        model={model}
        state={state}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(value) => value}
        scheduleClosureCoversDate={() => false}
        onClose={onClose}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
        {...extra}
      />,
    );
    return { onSubmit, onClose, view };
  }
  const layoutRadio = (name: "Form" | "Timeline") => screen.getByRole("radio", { name });
  const rowLabels = () =>
    [...screen.getByRole("dialog", { name: "Add shift" }).querySelectorAll(".shift-window-label")].map((label) => label.textContent);

  it("opens on Form, switches to Timeline from the header and opens there the next time", () => {
    const first = renderWindow();
    expect(layoutRadio("Form").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("slider", { name: /^Shift time/ })).toBeNull();

    fireEvent.click(layoutRadio("Timeline"));
    expect(layoutRadio("Timeline").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("slider", { name: /^Shift time/ })).toBeTruthy();
    first.view.unmount();

    renderWindow();
    expect(layoutRadio("Timeline").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("slider", { name: /^Shift time/ })).toBeTruthy();
  });

  it("switches with Alt+T and keeps the cursor in the same field", async () => {
    renderWindow();
    const start = screen.getByLabelText("Start time");
    act(() => start.focus());
    fireEvent.keyDown(start, { key: "t", code: "KeyT", altKey: true });
    expect(layoutRadio("Timeline").getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Start time")));
    fireEvent.keyDown(document.activeElement!, { key: "t", code: "KeyT", altKey: true });
    expect(layoutRadio("Form").getAttribute("aria-checked")).toBe("true");
  });

  it("puts Type first in both layouts (Mert, 2026-10-12)", () => {
    renderWindow();
    expect(rowLabels()[0]).toBe("Type");
    fireEvent.click(layoutRadio("Timeline"));
    expect(rowLabels()[0]).toBe("Type");
  });

  it("starts the cursor in the start time", () => {
    renderWindow();
    expect(document.activeElement).toBe(screen.getByLabelText("Start time"));
  });

  it("keeps the Start time and End time names for the time boxes, not the time line's ends", () => {
    renderWindow();
    fireEvent.click(layoutRadio("Timeline"));
    expect(screen.getAllByLabelText("Start time")).toHaveLength(1);
    expect(screen.getAllByLabelText("End time")).toHaveLength(1);
    expect(screen.getByRole("slider", { name: "Shift start" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Shift end" })).toBeTruthy();
  });

  // The cursor starts in Start time; leaving it untouched for a type chip
  // must not count as typing a time, or the type's hours never apply.
  it("applies a shift type's hours when the cursor leaves an untouched start time", () => {
    const lunch = { ...model.shift_types[0]!, id: "88888888-8888-4888-8888-888888888888", name: "Lunch", default_start_time: "11:00", default_end_time: "15:00" };
    renderWindow(create, { model: { ...model, shift_types: [...model.shift_types, lunch] } });
    const chip = screen.getByRole("button", { name: "Lunch" });
    act(() => chip.focus());
    fireEvent.click(chip);
    expect((screen.getByLabelText("Start time") as HTMLInputElement).value).toBe("11:00 AM");
    expect((screen.getByLabelText("End time") as HTMLInputElement).value).toBe("03:00 PM");
  });

  it("shows no Enter mark on the save button (Mert, 2026-10-12)", () => {
    renderWindow();
    expect(screen.getByRole("button", { name: "Add shift" }).textContent).toBe("Add shift");
  });

  it("moves the shift on the time line with the arrow keys and saves with Enter", async () => {
    const { onSubmit } = renderWindow();
    fireEvent.click(layoutRadio("Timeline"));
    const bar = screen.getByRole("slider", { name: /^Shift time/ });
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(bar.getAttribute("aria-valuetext")).toBe("4:15 PM to 10:15 PM");
    fireEvent.keyDown(bar, { key: "ArrowLeft", shiftKey: true });
    expect(bar.getAttribute("aria-valuetext")).toBe("3:15 PM to 9:15 PM");
    fireEvent.keyDown(screen.getByRole("slider", { name: "Shift end" }), { key: "ArrowRight" });
    fireEvent.keyDown(bar, { key: "Enter" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ start_time: "15:15", end_time: "21:30" }), 1);
  });

  it("gives an open shift to the person whose row is pressed on the time line", async () => {
    const { onSubmit } = renderWindow({ ...create, employeeId: null });
    fireEvent.click(layoutRadio("Timeline"));
    const people = screen.getByRole("radiogroup", { name: "Who works this shift" });
    expect(within(people).getByRole("radio", { name: /^Open/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(people).getByRole("radio", { name: /^Alex Rivera/ }));
    expect(within(people).getByRole("radio", { name: /^Alex Rivera/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ employee_id: model.employees[0]!.id });
  });

  it("closes on Enter when nothing on the shift changed", () => {
    const shift: ScheduleEditableShift = {
      id: "77777777-7777-4777-8777-777777777777",
      location_id: model.locations[0]!.id,
      employee_id: model.employees[0]!.id,
      job_id: model.jobs[0]!.id,
      shift_type_id: model.shift_types[0]!.id,
      scheduled_date: model.week_start,
      start_time: "16:00",
      end_time: "22:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
      warning_codes: [],
      revision: 1,
    };
    const { onSubmit, onClose } = renderWindow({ mode: "edit", shift }, { model: { ...model, shifts: [shift] } });
    const end = screen.getByLabelText("End time");
    // Enter on End's last part (AM/PM) is the keyboard's save.
    end.dataset.autoSelectSegment = "period";
    act(() => end.focus());
    fireEvent.keyDown(end, { key: "Enter" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("marks the shift being edited on the grid while its window is open", () => {
    const shift = { id: "77777777-7777-4777-8777-777777777777", start_time: "16:00", end_time: "22:00" } as ScheduleEditableShift;
    const badge = document.createElement("div");
    badge.setAttribute("data-shift-badge", "true");
    badge.setAttribute("data-shift-id", shift.id);
    document.body.append(badge);
    try {
      const { view } = renderWindow({ mode: "edit", shift: { ...shift, location_id: model.locations[0]!.id, employee_id: model.employees[0]!.id, job_id: model.jobs[0]!.id, shift_type_id: null, scheduled_date: model.week_start, crosses_midnight: false, unpaid_break_minutes: 0, hide_time_on_badge: false, label_ids: [], label_names: [], note: "", warning_codes: [], revision: 1 } });
      expect(badge.getAttribute("data-shift-window-target")).toBe("true");
      view.unmount();
      expect(badge.hasAttribute("data-shift-window-target")).toBe(false);
    } finally {
      badge.remove();
    }
  });
});

function getTimeSegment(
  input: HTMLElement,
  segment: "hour" | "minute" | "period",
): HTMLElement | null {
  return (
    input.parentElement?.querySelector(`[data-time-segment="${segment}"]`) ??
    null
  );
}

// A browser's Tab: the key goes to the focused element first; unless it was
// kept (preventDefault), focus moves on to the next tabbable element.
function tabLikeABrowser() {
  const from = document.activeElement as HTMLElement;
  if (!fireEvent.keyDown(from, { key: "Tab" })) return;
  const tabbable = Array.from(
    document.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], [tabindex]"),
  ).filter((element) => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled);
  act(() => tabbable[tabbable.indexOf(from) + 1]?.focus());
}
function describeFocus(): string {
  const active = document.activeElement as HTMLElement;
  if (active instanceof HTMLInputElement && active.type === "checkbox") return "checkbox";
  return active.getAttribute("aria-label") ?? active.textContent?.trim() ?? active.tagName;
}

// BL-199: a manager writes, changes and clears the shift's note here.
describe("ShiftQuickEditor note", () => {
  const noted: ScheduleEditableShift = {
    id: "66666666-6666-4666-8666-666666666666",
    location_id: model.locations[0]!.id,
    employee_id: model.employees[0]!.id,
    job_id: model.jobs[0]!.id,
    shift_type_id: model.shift_types[0]!.id,
    scheduled_date: model.week_start,
    start_time: "16:00",
    end_time: "22:00",
    crosses_midnight: false,
    unpaid_break_minutes: 30,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "Bring the catering order list",
    warning_codes: [],
    revision: 1,
  };
  function renderEditor(
    state: Parameters<typeof ShiftQuickEditor>[0]["state"],
    onSubmit = vi.fn().mockResolvedValue("saved" as const),
  ) {
    render(
      <ShiftQuickEditor
        model={{ ...model, shifts: state.mode === "edit" ? [noted] : [] }}
        state={state}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(value) => value}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }
  const note = () => screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
  const create = { mode: "create" as const, locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start };

  it("writes a new shift's note without the spaces around it", async () => {
    const onSubmit = renderEditor(create);
    expect(note().value).toBe("");
    expect(note()).toHaveProperty("maxLength", 500);
    expect(screen.getByText("500 characters left")).toBeTruthy();
    expect(note().getAttribute("aria-describedby")).toBe(screen.getByText("500 characters left").id);

    fireEvent.change(note(), { target: { value: "  Bring the catering order list \n" } });
    expect(screen.getByText("467 characters left")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0].note).toBe("Bring the catering order list");
  });

  // BL-291: cutting at 500 must not leave half an emoji; the database refuses it.
  it("cuts a note at the limit without splitting an emoji in two", () => {
    renderEditor(create);
    fireEvent.change(note(), { target: { value: `${"a".repeat(499)}😀` } });
    expect(note().value).toBe("a".repeat(499));
    expect(screen.getByText("1 character left")).toBeTruthy();
  });

  it("lets a keyboard user Tab from End time through the break and Job to Note", () => {
    renderEditor({ mode: "edit", shift: noted });
    const path: string[] = [];
    act(() => screen.getByLabelText("End time").focus());
    for (let press = 0; press < 12 && document.activeElement !== note(); press += 1) {
      path.push(describeFocus());
      tabLikeABrowser();
    }
    expect(document.activeElement).toBe(note());
    expect(path).toEqual([
      "End time", "End time", "End time",
      "None", "15m", "30m", "45m", "60m",
      "Job",
    ]);
  });

  it("spends Escape on an open shift note first, keeping the editor and what was typed", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(
        <>
          <ShiftQuickEditor
            model={{ ...model, shifts: [noted] }}
            state={create}
            timeFormat="12h"
            formatTime={(value) => value}
            addDays={(value) => value}
            scheduleClosureCoversDate={() => false}
            onClose={onClose}
            onReload={vi.fn()}
            onDelete={vi.fn()}
            onSubmit={vi.fn()}
          />
          <ShiftCard
            shift={noted}
            job="Server"
            type={model.shift_types[0]}
            showShiftType
            showShiftLabels={false}
            showClockTimes
            showJobColorDot={false}
            rowKey="row-1"
            badgeHeight={48}
            publicationState={null}
          />
        </>,
      );
      fireEvent.change(note(), { target: { value: "Half typed" } });
      // The pointer wanders from the editor onto another shift's note corner.
      const badge = screen.getByRole("button", { name: /has a manager note/ });
      const corner = badge.querySelector("[data-shift-note-marker]")!;
      const pointer = (element: Element, type: string, related: Element | null) => {
        const event = new Event(type, { bubbles: true });
        Object.defineProperties(event, {
          pointerType: { value: "mouse" },
          relatedTarget: { value: related },
          buttons: { value: 0 },
        });
        fireEvent(element, event);
      };
      pointer(badge, "pointerover", null);
      pointer(badge, "pointerout", corner);
      pointer(corner, "pointerover", badge);
      act(() => { vi.advanceTimersByTime(300); });
      expect(document.querySelector(".schedule-shift-note-card")).not.toBeNull();

      act(() => { fireEvent.keyDown(document.body, { key: "Escape" }); });
      expect(document.querySelector(".schedule-shift-note-card")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(note().value).toBe("Half typed");

      // With the note shut, Escape reaches the editor again.
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // The window has no scroll area to bring a list into view (Mert, 2026-10-12):
  // a list with no room below opens upward instead of being cut.
  it("opens a list upward when the room below its box is too small", () => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return new DOMRect(0, window.innerHeight - 40, 200, 32);
    };
    try {
      renderEditor(create);
      fireEvent.click(screen.getByRole("combobox", { name: "Job" }));
      expect(screen.getByRole("listbox", { name: "Job" }).hasAttribute("data-up")).toBe(true);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("takes no more than 500 characters and says none are left", () => {
    renderEditor(create);
    fireEvent.change(note(), { target: { value: "x".repeat(520) } });
    expect(note().value).toHaveLength(500);
    expect(screen.getByText("0 characters left")).toBeTruthy();
    fireEvent.change(note(), { target: { value: "x".repeat(499) } });
    expect(screen.getByText("1 character left")).toBeTruthy();
  });

  it("changes an existing shift's note", async () => {
    const onSubmit = renderEditor({ mode: "edit", shift: noted });
    expect(note().value).toBe("Bring the catering order list");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    fireEvent.change(note(), { target: { value: "Bring the keys" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ note: "Bring the keys", start_time: "16:00" });
  });

  // nf-guvenlik D1: a save that only moves the hours still sends the note the
  // editor opened with; the edit service empties a note the payload leaves out.
  it("keeps the note when only the hours change", async () => {
    const onSubmit = renderEditor({ mode: "edit", shift: noted });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "23:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ end_time: "23:00", note: "Bring the catering order list" });
  });

  it("clears the note when the field is left blank, spaces included", async () => {
    const onSubmit = renderEditor({ mode: "edit", shift: noted });
    fireEvent.change(note(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0].note).toBe("");
  });

  it("takes no note when several open shifts are added at once (user, 2026-09-28)", async () => {
    const onSubmit = renderEditor({ ...create, employeeId: null });
    fireEvent.change(note(), { target: { value: "Patio opens at 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    expect(note().disabled).toBe(true);
    expect(note().value).toBe("");
    expect(screen.getByText("Notes go on one shift at a time.").id).toBe(
      note().getAttribute("aria-describedby"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 3 shifts" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ note: "", employee_id: null }), 3);
  });

  it("gives the typed note back when the count returns to one", () => {
    renderEditor({ ...create, employeeId: null });
    fireEvent.change(note(), { target: { value: "Patio opens at 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease count" }));
    expect(note().disabled).toBe(false);
    expect(note().value).toBe("Patio opens at 5");
  });
});

// G2: the window's fields and buttons, as its stylesheet draws them.
describe("ShiftQuickEditor styles", () => {
  const parse = (file: string) => {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    return {
      text,
      rules: [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
        selector: match[1]!.replace(/\s+/g, " ").trim(),
        body: match[2]!,
      })),
    };
  };
  const windowCss = parse("src/schedule/components/shift-window/shift-window.css");
  const appCss = parse("src/styles.css");
  const bodyOf = (sheet: typeof windowCss, selector: string) =>
    sheet.rules
      .filter((rule) => rule.selector.split(/,\s(?![^(]*\))/).includes(selector))
      .map((rule) => rule.body)
      .join("\n");
  const phone = [...windowCss.text.matchAll(/@media \(max-width: 520px\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1]!.replace(/\s+/g, " "))
    .join("\n");

  // BL-345 (WCAG 1.4.11): a resting chip's edge is the field-edge token, 5.1:1 on white.
  it("draws a resting shift type chip with the field edge, not a faint one", () => {
    expect(bodyOf(windowCss, ".shift-window-chips button")).toContain("border: 1px solid var(--theme-muted)");
  });

  // BL-293 (WCAG 2.1 2.4.7): one visible focus ring everywhere, never hover alone.
  it("never hides the focus ring on a control of the window", () => {
    const hidden = windowCss.rules.filter(
      (rule) => /:focus(-visible)?\b/.test(rule.selector) && /outline:\s*(none|0)/.test(rule.body),
    );
    expect(hidden.map((rule) => rule.selector)).toEqual([]);
    expect(bodyOf(windowCss, '.shift-window :is(button, input, textarea, [role="slider"]):focus-visible')).toContain(
      "outline: 2px solid var(--theme-focus)",
    );
    expect(bodyOf(appCss, ".schedule-save-form :is(input, select):focus-visible")).toContain(
      "outline: 2px solid var(--theme-focus)",
    );
  });

  // BL-290 (WCAG 2.1 1.4.11, KARARLAR UI-09): a field's edge is --theme-muted.
  it("draws every field edge in the form-field border colour", () => {
    for (const selector of [
      ".shift-window .shift-window-time-input input",
      ".shift-window-note textarea",
      ".shift-window .shift-field-select > button",
      ".shift-window .shift-field-stepper",
      ".shift-window-segments",
      ".shift-window-button",
    ]) {
      expect(bodyOf(windowCss, selector), selector).toContain("border: 1px solid var(--theme-muted)");
    }
    expect(bodyOf(appCss, ".schedule-save-form input")).toContain("border: 1px solid var(--theme-muted)");
  });

  // BL-294: iOS zooms into a field under 16px.
  it("sets every field to 16px on a phone", () => {
    expect(phone).toMatch(/\.shift-window :is\(input, textarea\),[^{]*\.schedule-time-input__segments \{ font-size: 16px;/);
  });

  // BL-295: the note grows with what is written, up to its max height.
  it("lets the note field grow with its text", () => {
    expect(bodyOf(windowCss, ".shift-window-note textarea")).toContain("field-sizing: content");
  });

  // Mert, 2026-10-12: no scroll bar ever opens in the window. Only an open
  // list and a note past its max height may scroll their own content.
  it("has no scroll area apart from an open list and a long note", () => {
    const scrolling = windowCss.rules
      .filter((rule) => /overflow(-[xy])?:\s*(auto|scroll)/.test(rule.body))
      .map((rule) => rule.selector);
    expect(scrolling).toEqual([".shift-window-note textarea", ".shift-window .shift-field-list"]);
    expect(bodyOf(windowCss, ".shift-window-track")).toContain("overflow: clip");
  });
});

// 3rd party test #61 (Mert, 2026-10-20): an assigned shift's window offers the
// same people list as an open shift's, the current person chosen, plus
// "Make open shift"; the count is for adding open shifts only.
describe("ShiftQuickEditor reassign", () => {
  const dora = {
    ...model.employees[0]!,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    employee_code: "NF-002",
    display_name: "Dora Lane",
  };
  const shift: ScheduleEditableShift = {
    id: "77777777-7777-4777-8777-777777777777",
    location_id: model.locations[0]!.id,
    employee_id: model.employees[0]!.id,
    job_id: model.jobs[0]!.id,
    shift_type_id: model.shift_types[0]!.id,
    scheduled_date: model.week_start,
    start_time: "16:00",
    end_time: "22:00",
    crosses_midnight: false,
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "",
    warning_codes: [],
    revision: 1,
  };
  // Dora already works eight hours on Tuesday.
  const doraTuesday = {
    ...shift,
    id: "88888888-8888-4888-8888-888888888888",
    employee_id: dora.id,
    scheduled_date: "2026-08-18",
    start_time: "09:00",
    end_time: "17:00",
  };
  const reassignModel = { ...model, employees: [model.employees[0]!, dora], shifts: [shift, doraTuesday] } as ScheduleReadModel;
  function renderEdit(editModel: ScheduleReadModel = reassignModel, editShift: ScheduleEditableShift = shift) {
    const onSubmit = vi.fn().mockResolvedValue("saved" as const);
    render(
      <ShiftQuickEditor
        model={editModel}
        state={{ mode: "edit", shift: editShift }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(value) => value}
        scheduleClosureCoversDate={() => false}
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }
  const dialog = () => screen.getByRole("dialog", { name: "Edit shift" });

  it("lists the qualified people with the current one chosen, and no count", () => {
    renderEdit();
    const picker = screen.getByRole("combobox", { name: "Employee" });
    expect(picker.textContent).toContain("Alex Rivera");
    fireEvent.click(picker);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("Make open shift"),
      expect.stringContaining("Alex Rivera"),
      expect.stringContaining("Dora Lane"),
    ]);
    expect(screen.getByRole("option", { name: /Alex Rivera/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(dialog()).queryByRole("group", { name: /How many/ })).toBeNull();
    expect(within(dialog()).queryByRole("button", { name: /more open shifts|Increase/i })).toBeNull();
  });

  it("gives the shift to someone else, the week line and header following the new person", async () => {
    const onSubmit = renderEdit();
    expect(dialog().textContent).toContain("Week 0h → 6h");
    fireEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    fireEvent.click(screen.getByRole("option", { name: /Dora Lane/ }));
    expect(dialog().textContent).toContain("Week 8h → 14h");
    expect(dialog().textContent).toContain("Dora Lane · Mon, Aug 17 · Main Dining");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ employee_id: dora.id });
  });

  it("makes the shift open", async () => {
    const onSubmit = renderEdit();
    fireEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    fireEvent.click(screen.getByRole("option", { name: /Make open shift/ }));
    expect(dialog().textContent).toContain("Open shift · Mon, Aug 17 · Main Dining");
    expect(dialog().textContent).not.toContain("Week ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ employee_id: null });
  });

  it("keeps a person who no longer qualifies on their shift until the manager picks someone else", () => {
    const moved = { ...model.employees[0]!, is_excluded_from_schedule: true };
    renderEdit({ ...reassignModel, employees: [moved, dora] } as ScheduleReadModel);
    expect(screen.getByRole("combobox", { name: "Employee" }).textContent).toContain("Alex Rivera");
    expect(dialog().textContent).toContain("Alex Rivera · Mon, Aug 17");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });

  it("offers the same people as rows on the time line", async () => {
    const onSubmit = renderEdit();
    fireEvent.click(screen.getByRole("radio", { name: "Timeline" }));
    const people = screen.getByRole("radiogroup", { name: "Who works this shift" });
    expect(within(people).getByRole("radio", { name: /^Alex Rivera/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(people).getByRole("radio", { name: /^Make open shift/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ employee_id: null });
  });
});
