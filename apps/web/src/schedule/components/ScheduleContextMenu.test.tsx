import type { ScheduleEditableShift } from "@newfork/shared/schedule";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ScheduleCellContextMenu,
  ScheduleContextMenu,
  type CellContextMenuTarget,
  type ShiftPublicationState,
} from "./ScheduleContextMenu";

const shift: ScheduleEditableShift = {
  id: "33333333-3333-4333-8333-333333333333",
  location_id: "11111111-1111-4111-8111-111111111111",
  employee_id: "22222222-2222-4222-8222-222222222222",
  job_id: "44444444-4444-4444-8444-444444444444",
  shift_type_id: null,
  scheduled_date: "2026-08-17",
  start_time: "09:00",
  end_time: "17:00",
  crosses_midnight: false,
  unpaid_break_minutes: 0,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "",
  warning_codes: [],
  revision: 1,
};

function renderShiftMenu(publicationState: ShiftPublicationState | null) {
  const handlers = {
    onEdit: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
    onUnpublish: vi.fn(),
    onRestore: vi.fn(),
    onDismiss: vi.fn(),
  };

  render(
    <ScheduleContextMenu
      target={{ shiftId: shift.id, x: 10, y: 10 }}
      shifts={[shift]}
      publicationStateForShift={() => publicationState}
      {...handlers}
    />,
  );

  return handlers;
}

describe("ScheduleContextMenu", () => {
  it("shows delete for plain draft shifts", () => {
    renderShiftMenu(null);

    expect(screen.getByRole("menuitem", { name: "Edit shift" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy shift" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete shift" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Unpublish shift" })).toBeNull();
  });

  it("clamps shift menus inside the viewport with the reference estimates", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 220,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 140,
    });
    render(
      <ScheduleContextMenu
        target={{ shiftId: shift.id, x: 300, y: 300 }}
        shifts={[shift]}
        publicationStateForShift={() => null}
        onEdit={vi.fn()}
        onCopy={vi.fn()}
        onDelete={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Shift actions" });
    expect(menu.style.left).toBe("36px");
    expect(menu.style.top).toBe("44px");
  });

  it("uses unpublish for live-backed shifts", () => {
    const handlers = renderShiftMenu("locked");

    fireEvent.mouseDown(screen.getByRole("menuitem", { name: "Unpublish shift" }), {
      button: 0,
    });

    expect(handlers.onUnpublish).toHaveBeenCalledWith(shift.id);
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it("uses restore and hides edit for staged removals", () => {
    const handlers = renderShiftMenu("staged-removed");

    expect(screen.queryByRole("menuitem", { name: "Edit shift" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("menuitem", { name: "Restore shift" }), {
      button: 0,
    });

    expect(handlers.onRestore).toHaveBeenCalledWith(shift.id);
  });
});

describe("ScheduleCellContextMenu", () => {
  it("clamps preset cell menus with the reference dynamic height estimate", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 260,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 180,
    });
    render(
      <ScheduleCellContextMenu
        target={{
          employeeId: null,
          locationId: "11111111-1111-4111-8111-111111111111",
          jobId: "44444444-4444-4444-8444-444444444444",
          date: "2026-08-17",
          x: 300,
          y: 300,
        }}
        canPaste
        presetItems={[
          { id: "lunch", label: "Lunch-Cook", color: "#f97316" },
          { id: "dinner", label: "Dinner-Cook", color: "#7c3aed" },
        ]}
        onPaste={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu", { name: "Cell actions" });
    expect(menu.style.left).toBe("76px");
    expect(menu.style.top).toBe("55px");
  });

  it("renders paste before preset shift choices and respects disabled reasons", () => {
    const target: CellContextMenuTarget = {
      employeeId: "22222222-2222-4222-8222-222222222222",
      locationId: "11111111-1111-4111-8111-111111111111",
      jobId: "44444444-4444-4444-8444-444444444444",
      date: "2026-08-17",
      x: 40,
      y: 60,
    };
    const onPaste = vi.fn();
    const onPresetSelect = vi.fn();

    render(
      <ScheduleCellContextMenu
        target={target}
        canPaste={false}
        presetItems={[
          { id: "lunch", label: "Lunch-Cook", color: "#f97316" },
          {
            id: "dinner",
            label: "Dinner-Cook",
            color: "#7c3aed",
            disabledReason: "Employee is not eligible for this shift type",
          },
        ]}
        onPaste={onPaste}
        onPresetSelect={onPresetSelect}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Paste shift",
      "Lunch-Cook",
      "Dinner-Cook",
    ]);
    expect(
      (screen.getByRole("menuitem", { name: "Paste shift" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.mouseDown(screen.getByRole("menuitem", { name: "Lunch-Cook" }), {
      button: 0,
    });

    const disabledPreset = screen.getByRole("menuitem", { name: "Dinner-Cook" });
    expect(onPaste).not.toHaveBeenCalled();
    expect(onPresetSelect).toHaveBeenCalledWith(target, "lunch");
    expect((disabledPreset as HTMLButtonElement).disabled).toBe(true);
    expect(disabledPreset.getAttribute("title")).toBe(
      "Employee is not eligible for this shift type",
    );
  });

  it("dismisses when clicking outside the menu", () => {
    const onDismiss = vi.fn();
    render(
      <ScheduleCellContextMenu
        target={{
          employeeId: null,
          locationId: "11111111-1111-4111-8111-111111111111",
          jobId: "44444444-4444-4444-8444-444444444444",
          date: "2026-08-17",
          x: 40,
          y: 60,
        }}
        canPaste
        onPaste={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.pointerDown(document.body);

    expect(onDismiss).toHaveBeenCalled();
  });
});
