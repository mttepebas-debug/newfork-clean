import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleDeleteSelectionDialog } from "./ScheduleDeleteSelectionDialog";

function renderDialog() {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ScheduleDeleteSelectionDialog open count={3} onCancel={onCancel} onConfirm={onConfirm} />,
  );
  return { onCancel, onConfirm };
}

describe("ScheduleDeleteSelectionDialog", () => {
  it("keeps the shifts on Escape", () => {
    const { onCancel, onConfirm } = renderDialog();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("deletes on Enter pressed from the grid, after the Delete key", () => {
    const { onConfirm } = renderDialog();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("leaves Enter on Keep shifts to that button: nothing is deleted (BL-706)", () => {
    const { onConfirm } = renderDialog();
    const keep = screen.getByRole("button", { name: "Keep shifts" });
    keep.focus();
    fireEvent.keyDown(keep, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
