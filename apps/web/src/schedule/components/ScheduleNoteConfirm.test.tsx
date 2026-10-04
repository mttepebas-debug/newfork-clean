// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleNoteConfirm } from "./ScheduleNoteConfirm";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const cell = { locationId: "kadikoy", employeeId: "ayse", date: "2026-10-21" };

function placeEditor(left: number, right: number) {
  const editor = document.createElement("div");
  editor.dataset.shiftQuickEditorContent = "true";
  editor.getBoundingClientRect = () => ({ left, right, top: 100, bottom: 700, width: right - left, height: 600, x: left, y: 100, toJSON: () => ({}) });
  document.body.append(editor);
}

function placeCell() {
  const element = document.createElement("div");
  element.className = "schedule-cell";
  element.dataset.locationId = cell.locationId;
  element.dataset.employeeId = cell.employeeId;
  element.dataset.date = cell.date;
  element.getBoundingClientRect = () => ({ left: 400, top: 200, width: 120, height: 60, bottom: 260, right: 520, x: 400, y: 200, toJSON: () => ({}) });
  document.body.append(element);
}

describe("Manager note card while placing a shift (S2 B, M12)", () => {
  it("shows the note under its cell and places the shift only on Place shift", () => {
    placeCell();
    const onPlace = vi.fn();
    const onCancel = vi.fn();
    render(<ScheduleNoteConfirm cell={cell} when="Wed after 6:00 PM" employeeName="Ayşe Kaya" text="School mornings" onPlace={onPlace} onCancel={onCancel} />);
    const card = screen.getByRole("dialog", { name: "Manager note for Ayşe Kaya" });
    expect(card.textContent).toContain("Manager note · Wed after 6:00 PM");
    expect(card.textContent).toContain("School mornings");
    expect(card.style.left).toBe("460px");
    expect(card.style.top).toBe("268px");
    expect(onPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Place shift" }));
    expect(onPlace).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on Cancel and on Escape, with focus on Cancel and nothing behind hearing Escape", () => {
    placeCell();
    const onCancel = vi.fn();
    render(<ScheduleNoteConfirm cell={cell} when="Wed after 6:00 PM" employeeName="Ayşe Kaya" text="School mornings" onPlace={vi.fn()} onCancel={onCancel} />);
    const behind = vi.fn();
    window.addEventListener("keydown", behind);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    window.removeEventListener("keydown", behind);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(behind).not.toHaveBeenCalled();
  });

  it("says a note covers the hours when it has no words", () => {
    placeCell();
    render(<ScheduleNoteConfirm cell={cell} when="Wed after 6:00 PM" employeeName="Ayşe Kaya" text="" onPlace={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog").textContent).toContain("A manager noted these hours for Ayşe.");
  });

  it("moves beside the open editor instead of covering it", () => {
    placeCell();
    window.innerWidth = 1280;
    // The editor opens right of the cell (from 470px): the card takes the free side, left of it.
    placeEditor(470, 774);
    render(<ScheduleNoteConfirm cell={cell} when="Wed after 6:00 PM" employeeName="Ayşe Kaya" text="" onPlace={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog").style.left).toBe("312px");
    cleanup();
    document.body.innerHTML = "";
    // No room on the left: the right of the editor.
    placeCell();
    placeEditor(200, 600);
    render(<ScheduleNoteConfirm cell={cell} when="Wed after 6:00 PM" employeeName="Ayşe Kaya" text="" onPlace={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog").style.left).toBe("758px");
  });

  it("stays under its cell when the editor leaves no side free, as on a phone", () => {
    placeCell();
    window.innerWidth = 375;
    placeEditor(0, 375);
    render(<ScheduleNoteConfirm cell={cell} when="Wed after 6:00 PM" employeeName="Ayşe Kaya" text="" onPlace={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog").style.left).toBe("215px");
    window.innerWidth = 1024;
  });
});
