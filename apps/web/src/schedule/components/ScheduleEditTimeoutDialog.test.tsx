import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleEditTimeoutDialog } from "./ScheduleEditTimeoutDialog";

describe("ScheduleEditTimeoutDialog", () => {
  it("renders the countdown and save/continue actions", () => {
    const onSaveDraft = vi.fn();
    const onContinue = vi.fn();

    render(
      <ScheduleEditTimeoutDialog
        open
        secondsRemaining={150}
        idleMinutes={15}
        countdownSeconds={300}
        isSaving={false}
        error={null}
        onSaveDraft={onSaveDraft}
        onContinue={onContinue}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Keep editing?" });
    // BL-711: the keyboard lands on Continue when the window opens.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "CONTINUE" }));
    expect(dialog.className).toContain("schedule-timeout-dialog");
    expect(screen.getByText("Time left")).toBeTruthy();
    expect(screen.getByText("150")).toBeTruthy();
    expect(screen.getByText("No activity for 15 minutes.")).toBeTruthy();
    // BL-719: the window says what happens when the time runs out (S1).
    expect(
      screen.getByText("When time runs out, your changes are saved as a draft and editing ends."),
    ).toBeTruthy();
    expect(
      dialog.querySelector<HTMLElement>(".schedule-timeout-progress span")?.style
        .width,
    ).toBe("50%");

    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE" }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("does not render while closed", () => {
    render(
      <ScheduleEditTimeoutDialog
        open={false}
        secondsRemaining={9}
        idleMinutes={15}
        countdownSeconds={300}
        isSaving={false}
        error={null}
        onSaveDraft={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows save progress and disables actions while saving", () => {
    const onSaveDraft = vi.fn();
    const onContinue = vi.fn();

    render(
      <ScheduleEditTimeoutDialog
        open
        secondsRemaining={4}
        idleMinutes={15}
        countdownSeconds={300}
        isSaving
        error="Save failed"
        onSaveDraft={onSaveDraft}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Save failed");

    const saveButton = screen.getByRole("button", { name: "SAVING..." });
    const continueButton = screen.getByRole("button", { name: "CONTINUE" });
    expect(saveButton).toHaveProperty("disabled", true);
    expect(continueButton).toHaveProperty("disabled", true);

    fireEvent.click(saveButton);
    fireEvent.click(continueButton);

    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
