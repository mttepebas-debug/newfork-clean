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

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleAvailabilityCellTip (G14)", () => {
  it("opens on keyboard focus with the person's own hours and the preference line", () => {
    const { anchor } = renderCell({ kind: "unavailable", windows: [{ from: 840, to: 1080, source: "employee" }] });
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

  it("says whose a manager's note is without its text", () => {
    const { anchor } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 960, source: "manager" }] });
    fireEvent.focus(anchor);
    expect(screen.getByRole("tooltip").textContent).toContain(
      "Unavailable until 4:00 PMManager note (only managers see this)",
    );
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
    const { cell, card } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440, source: "employee" }] });
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
    const { cell, add } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440, source: "employee" }] });
    fireEvent.mouseOver(cell);
    fireEvent.mouseOver(add);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip").textContent).toContain("Unavailable all day");
  });

  it("closes when the cell is pressed, so a click or a drag keeps the cell", () => {
    const { cell } = renderCell({ kind: "unavailable", windows: [{ from: 0, to: 1440, source: "employee" }] });
    fireEvent.mouseOver(cell);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(cell);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
