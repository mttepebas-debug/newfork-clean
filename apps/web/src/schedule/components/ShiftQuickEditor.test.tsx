import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadShiftAvailability } from "../../availability/availability-data";
import type { ShiftAvailabilityAssessment } from "@newfork/shared";

import { ShiftQuickEditor } from "./ShiftQuickEditor";
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
      sort_order: 0,
      department_id: null,
    },
  ],
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
  it("uses fresh canonical confirmation instead of a stale cached blocker", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...confirmedAvailability, conflict_severity: "confirm", operation: "warning_requires_override", warning_policy: "confirm", reasons: [{ code: "closed_location", severity: "confirm", definite: true, message: "This location is closed." }] });
    const onSubmit = vi.fn().mockResolvedValue("saved");
    render(<ShiftQuickEditor model={{ ...model, employees: model.employees.map(employee => ({ ...employee, is_excluded_from_schedule: true })) }} state={{ mode: "create", locationId: model.locations[0]!.id, employeeId: model.employees[0]!.id, date: model.week_start }} timeFormat="12h" formatTime={value => value} addDays={value => value} scheduleClosureCoversDate={() => false} onClose={vi.fn()} onReload={vi.fn()} onDelete={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
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

  it("saves over the employee's unavailable hours without asking (BL-186)", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...confirmedAvailability, has_availability_conflict: true,
      availability_fingerprint: "c".repeat(64), reasons: [availabilityReason] });
    const onSubmit = renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Shift conflict" })).toBeNull();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("leaves availability out of another rule's confirmation (BL-186)", async () => {
    vi.mocked(loadShiftAvailability).mockResolvedValue({ ...weekly("confirm"), reasons: [...weekly("confirm").reasons, availabilityReason] });
    renderAssigned();
    fireEvent.click(screen.getByRole("button", { name: "Add shift" }));
    const sheet = await screen.findByRole("dialog", { name: "Shift conflict" });
    expect(sheet.textContent).toContain("not enough rest time");
    expect(sheet.textContent).not.toContain("unavailable hours");
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
  it("opens immediately to the right of the pointer and moves by dragging the header", () => {
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
    expect(dialog.style.top).toBe("32px");

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
    expect(dialog.style.top).toBe("62px");
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
        scheduleClosureCoversDate={(closure, date) =>
          closure.closed_date <= date &&
          date <= (closure.end_date ?? closure.closed_date)
        }
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    fireEvent.click(screen.getByRole("button", { name: "15m" }));
    expect(screen.queryByText("Note")).toBeNull();
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
      sort_order: 0,
      department_id: null,
    };
    const serverJob = {
      ...model.jobs[0]!,
      sort_order: 1,
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
    fireEvent.click(screen.getByRole("option", { name: "Unassigned" }));
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

  it("reports dirty state without rendering the floating dialog chrome in drawer mode", async () => {
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
        presentation="drawer"
        onClose={vi.fn()}
        onDirtyChange={onDirtyChange}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close editor" })).toBeNull();

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: "15m" }));

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  it("keeps selected cell context out of the compact form while preserving payload context", async () => {
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

  it("keeps unassigned drawer cells compact with count control and no employee picker", () => {
    render(
      <ShiftQuickEditor
        model={model}
        state={{
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: model.week_start,
        }}
        timeFormat="12h"
        formatTime={(value) => value}
        addDays={(iso) => iso}
        scheduleClosureCoversDate={() => false}
        presentation="drawer"
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Employee" })).toBeNull();
    expect(screen.getByLabelText("Shift count")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  it("blocks drawer submit when a time field is cleared", () => {
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
        presentation="drawer"
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
        presentation="drawer"
        onClose={vi.fn()}
        onReload={vi.fn()}
        onDelete={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Enter start and end time.",
    );
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
          end_date: null,
          is_all_day: true,
          shift_type_ids: [],
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
        scheduleClosureCoversDate={(closure, date) =>
          closure.closed_date <= date &&
          date <= (closure.end_date ?? closure.closed_date)
        }
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

function getTimeSegment(
  input: HTMLElement,
  segment: "hour" | "minute" | "period",
): HTMLElement | null {
  return (
    input.parentElement?.querySelector(`[data-time-segment="${segment}"]`) ??
    null
  );
}
