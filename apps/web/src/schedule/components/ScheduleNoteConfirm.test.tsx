// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleNoteConfirm } from "./ScheduleNoteConfirm";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const cell = { locationId: "kadikoy", employeeId: "ayse", date: "2026-10-21" };

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
    render(<ScheduleNoteConfirm cell={cell} employeeName="Ayşe Kaya" text="School mornings" onPlace={onPlace} onCancel={onCancel} />);
    const card = screen.getByRole("dialog", { name: "Manager note for Ayşe Kaya" });
    expect(card.textContent).toContain("Manager note · Wed, Oct 21");
    expect(card.textContent).toContain("School mornings");
    expect(card.style.left).toBe("460px");
    expect(card.style.top).toBe("268px");
    expect(onPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Place shift" }));
    expect(onPlace).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on Cancel and on Escape", () => {
    placeCell();
    const onCancel = vi.fn();
    render(<ScheduleNoteConfirm cell={cell} employeeName="Ayşe Kaya" text="School mornings" onPlace={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("says a note covers the hours when it has no words", () => {
    placeCell();
    render(<ScheduleNoteConfirm cell={cell} employeeName="Ayşe Kaya" text="" onPlace={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog").textContent).toContain("A manager noted these hours for Ayşe.");
  });
});
