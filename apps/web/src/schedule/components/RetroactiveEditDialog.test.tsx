import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PastEditFinding } from "../schedule-data";
import { RetroactiveEditDialog } from "./RetroactiveEditDialog";

const finding: PastEditFinding = {
  op_type: "update",
  shift_id: "11111111-1111-4111-8111-111111111111",
  scheduled_date: "2026-08-17",
  location_name: "Main Room",
  employee_name: "Alex Rivera",
  reason: "shift_started",
  severity: "warning",
};

describe("RetroactiveEditDialog", () => {
  it("renders confirm copy and wires save anyway", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <RetroactiveEditDialog
        open
        mode="confirm"
        findings={[finding]}
        messages={["Alex Rivera already started this shift."]}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole("dialog", {
        name: "This changes shifts that already ran",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("img", { hidden: true })).toBeNull();
    expect(document.querySelector(".schedule-retroactive-dialog svg")).toBeNull();
    expect(screen.getByText("Already started")).toBeTruthy();
    expect(
      screen.getByText("Alex Rivera already started this shift."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides confirm action for blocked findings", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <RetroactiveEditDialog
        open
        mode="blocked"
        findings={[
          {
            ...finding,
            reason: "past_week",
            severity: "blocked",
            employee_name: null,
          },
        ]}
        messages={[]}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "These changes cannot be saved" }),
    ).toBeTruthy();
    expect(screen.getByText("Past week")).toBeTruthy();
    expect(
      screen.getByText("An open shift — Main Room on 2026-08-17"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save anyway" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render while closed", () => {
    render(
      <RetroactiveEditDialog
        open={false}
        mode="confirm"
        findings={[finding]}
        messages={[]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
