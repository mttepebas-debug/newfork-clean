import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleSaveRecoverySheet } from "./ScheduleSaveRecoverySheet";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

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
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText(/Your changes are still here/)).toBeTruthy();
    expect(
      screen.getByText(/Your edit session is still open/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onKeepEditing).toHaveBeenCalledTimes(1);

    // BL-440: Discard throws the edits away, so it asks twice.
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
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

  // BL-372, BL-440: the sheet shares the Schedule windows' Escape rule. The
  // first Escape on an armed Discard puts it down; the second closes the sheet.
  it("disarms Discard on the first Escape and keeps editing on the second", () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    render(<ScheduleSaveRecoverySheet open onRetry={vi.fn()} onKeepEditing={onKeepEditing} onDiscard={onDiscard} />);

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    // The key's default is taken too: left alone, the browser sends the native
    // dialog a cancel for the same Escape and the sheet closes anyway.
    const escapeLeftToBrowser = fireEvent.keyDown(screen.getByRole("button", { name: "Confirm discard" }), { key: "Escape" });
    expect(escapeLeftToBrowser).toBe(false);
    expect(onKeepEditing).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "Discard" }), { key: "Escape" });
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
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

  it("moves focus to the recovery title, preserves it on refresh, and returns to the trigger", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const props = { onRetry: vi.fn(), onDiscard: vi.fn(), onKeepEditing: vi.fn() };
    const { rerender, unmount } = render(<ScheduleSaveRecoverySheet open {...props} />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Schedule save failed" }));
    const keep = screen.getByRole("button", { name: "Keep editing" });
    keep.focus();
    rerender(<ScheduleSaveRecoverySheet open {...props} onKeepEditing={vi.fn()} canRetry={false} />);
    expect(document.activeElement).toBe(keep);
    expect(screen.getByRole("button", { name: "Retry save" })).toHaveProperty("disabled", true);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("returns to Publish when the save form that opened recovery has closed", () => {
    const unrelated = document.createElement("button");
    unrelated.setAttribute("data-schedule-top-action-trigger", "export");
    const publish = document.createElement("button");
    publish.setAttribute("data-schedule-top-action-trigger", "publish");
    const saveAs = document.createElement("button");
    document.body.append(unrelated, publish, saveAs);
    saveAs.focus();
    const { unmount } = render(<ScheduleSaveRecoverySheet open onRetry={vi.fn()} onDiscard={vi.fn()} onKeepEditing={vi.fn()} />);
    saveAs.remove();
    unmount();
    expect(document.activeElement).toBe(publish);
    unrelated.remove();
    publish.remove();
  });
});
