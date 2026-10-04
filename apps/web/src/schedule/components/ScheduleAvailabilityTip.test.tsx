import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScheduleAvailabilityMark } from "../lib/scheduleAvailabilityMark";
import { ScheduleAvailabilityCellTip } from "./ScheduleAvailabilityTip";

function renderCell(mark: ScheduleAvailabilityMark) {
  render(
    <div data-testid="cell">
      <ScheduleAvailabilityCellTip mark={mark} employeeName="Alex Kim" day="2026-10-20" timeFormat="12h" />
      <button type="button" data-shift-badge="true">Dinner-Server</button>
      <button type="button">Add shift</button>
    </div>,
  );
  return {
    cell: screen.getByTestId("cell"),
    anchor: screen.getByRole("button", { name: /^Alex Kim, Tue, Oct 20/ }),
    card: screen.getByRole("button", { name: "Dinner-Server" }),
    add: screen.getByRole("button", { name: "Add shift" }),
  };
}

// jsdom has no PointerEvent; the listeners read pointerType off the event.
function tap(element: Element) {
  const down = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(down, "pointerType", { value: "touch" });
  fireEvent(element, down);
  // What a phone sends after a tap.
  fireEvent.mouseOver(element);
  fireEvent.mouseDown(element);
  fireEvent.click(element);
  fireEvent.mouseOver(element);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleAvailabilityCellTip (G14)", () => {
  it("opens on keyboard focus with the person's own hours and the preference line", () => {
    const { anchor } = renderCell({ kind: "unavailable", windows: [{ from: 840, to: 1080 }] });
    expect(anchor.getAttribute("aria-label")).toBe("Alex Kim, Tue, Oct 20: Unavailable 2:00 PM – 6:00 PM");
    fireEvent.focus(anchor);
    expect(screen.getByRole("tooltip").textContent).toBe(
      "!Alex Kim · Tue, Oct 20" +
        "Unavailable 2:00 PM – 6:00 PMAlex's own availability" +
        "A preference. You can still schedule Alex.",
    );
    fireEvent.blur(anchor);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("marks approved time off as a block", () => {
    const { anchor } = renderCell({ kind: "time_off", ranges: [{ from: 0, to: 1440 }] });
    fireEvent.focus(anchor);
    expect(screen.getByRole("tooltip").textContent).toBe(
      "×Alex Kim · Tue, Oct 20Approved time off, all dayShifts can't be scheduled on this day.",
    );
  });

  it("opens for the mouse anywhere on the cell but not over a card in it", () => {
    vi.useFakeTimers();
    const { cell, card } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440 }] });
    fireEvent.mouseOver(cell);
    expect(screen.getByRole("tooltip").textContent).toContain("Unavailable all day");

    fireEvent.mouseOver(card);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open over the cell's Add shift, where the manager decides", () => {
    vi.useFakeTimers();
    const { cell, add } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440 }] });
    fireEvent.mouseOver(cell);
    fireEvent.mouseOver(add);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip").textContent).toContain("Unavailable all day");
  });

  it("stays open after a tap and the mouse events a phone sends with it, until a tap elsewhere", () => {
    vi.useFakeTimers();
    const { cell } = renderCell({ kind: "unavailable", windows: [{ from: 840, to: 1080 }] });
    tap(cell);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip").textContent).toContain("Unavailable 2:00 PM – 6:00 PM");

    tap(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on a second tap of the same cell and stays shut on a tap of a card in it", () => {
    const { cell, card } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440 }] });
    tap(cell);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    tap(cell);
    expect(screen.queryByRole("tooltip")).toBeNull();
    tap(card);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("gives a screen reader the text without the decorative mark", () => {
    const { anchor } = renderCell({ kind: "time_off", ranges: [{ from: 0, to: 1440 }] });
    const description = document.getElementById(anchor.getAttribute("aria-describedby")!)!;
    expect(description.textContent).toBe(
      "Alex Kim · Tue, Oct 20Approved time off, all dayShifts can't be scheduled on this day.",
    );
  });

  it("closes when the cell is pressed, so a click or a drag keeps the cell", () => {
    const { cell } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440 }] });
    fireEvent.mouseOver(cell);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(cell);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
