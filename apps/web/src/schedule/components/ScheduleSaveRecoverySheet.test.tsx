import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleSaveRecoverySheet } from "./ScheduleSaveRecoverySheet";

describe("ScheduleSaveRecoverySheet", () => {
  it("renders recovery copy and wires retry, keep editing, and discard actions", () => {
    const onRetry = vi.fn();
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();

    render(
      <ScheduleSaveRecoverySheet
        open
        onRetry={onRetry}
        onKeepEditing={onKeepEditing}
        onDiscard={onDiscard}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Schedule save failed" });
    expect(dialog.className).toContain("schedule-save-recovery-sheet");
    expect(screen.getByText(/Your changes are still here/)).toBeTruthy();
    expect(
      screen.getByText(/Organizer kept the current edit session open/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("disables discard and retry while requested", () => {
    render(
      <ScheduleSaveRecoverySheet
        open
        isRetrying
        canDiscard={false}
        onRetry={vi.fn()}
        onKeepEditing={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Saving..." })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Discard" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps editing on Escape or backdrop click", () => {
    const onKeepEditing = vi.fn();
    render(
      <ScheduleSaveRecoverySheet
        open
        onRetry={vi.fn()}
        onKeepEditing={onKeepEditing}
        onDiscard={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(
      screen.getByTestId("schedule-save-recovery-backdrop"),
    );
    fireEvent.click(screen.getByTestId("schedule-save-recovery-backdrop"));

    expect(onKeepEditing).toHaveBeenCalledTimes(2);
  });

  it("does not render while closed", () => {
    render(
      <ScheduleSaveRecoverySheet
        open={false}
        onRetry={vi.fn()}
        onKeepEditing={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
