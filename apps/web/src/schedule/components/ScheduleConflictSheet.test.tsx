import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleConflictSheet } from "./ScheduleConflictSheet";

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleConflictSheet", () => {
  it("renders a compact bottom conflict sheet and dismisses it automatically", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ScheduleConflictSheet
        open
        modal={false}
        messages={["This employee is excluded from schedule"]}
        description="This paste was not applied. Review the reason before scheduling the shift."
        contextLabel="Dinner / Server / Alex Rivera / Main Dining / 2026-08-18"
        onDismiss={onDismiss}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Shift conflict" });
    expect(dialog.className).toContain("schedule-conflict-sheet");
    expect(dialog.getAttribute("data-schedule-conflict-toast-content")).toBe(
      "true",
    );
    expect(dialog.getAttribute("data-schedule-conflict-sheet-content")).toBeNull();
    expect(
      screen.queryByText(
        "This paste was not applied. Review the reason before scheduling the shift.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Dinner / Server / Alex Rivera / Main Dining / 2026-08-18",
      ),
    ).toBeNull();
    expect(screen.getByText("This employee is excluded from schedule")).toBeTruthy();
    expect(document.querySelector("[data-schedule-conflict-sheet-content]")).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("supports a decision variant with a controlled override reason", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ScheduleConflictSheet
        open
        messages={["Employee is unavailable for Dinner."]}
        tone="warning"
        requiresOverrideReason
        overrideReason=""
        onOverrideReasonChange={onChange}
        submitLabel="Override and save"
        submitDisabled
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Scheduling rule")).toBeTruthy();
    expect(screen.getByText("Add a manager reason to override.")).toBeTruthy();
    expect(
      screen.getByText(
        "Required for a soft availability override. Minimum 10 characters.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Override and save" })).toHaveProperty(
      "disabled",
      true,
    );
    const reason = screen.getByLabelText("Override reason");
    expect(reason.getAttribute("id")).toBe(
      "schedule-conflict-sheet-override-reason",
    );
    fireEvent.change(reason, {
      target: { value: "Emergency staffing coverage." },
    });
    expect(onChange).toHaveBeenCalledWith("Emergency staffing coverage.");

    fireEvent.submit(screen.getByRole("dialog", { name: "Shift conflict" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
