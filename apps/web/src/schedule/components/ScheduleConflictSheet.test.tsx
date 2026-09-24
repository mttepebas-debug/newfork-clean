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

  it("supports a decision variant that waits for a choice", () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ScheduleConflictSheet
        open
        messages={["Employee is unavailable for Dinner."]}
        tone="warning"
        submitLabel="Place shift"
        submitDisabled
        onSubmit={onSubmit}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("Scheduling rule")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place shift" })).toHaveProperty(
      "disabled",
      true,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.submit(screen.getByRole("dialog", { name: "Shift conflict" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
