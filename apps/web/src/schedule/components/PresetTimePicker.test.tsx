// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PresetTimePicker } from "./PresetTimePicker";

// PRESET-SAAT (S-183, variant A): Dinner 4:15–11:30 PM primary, 5–11 PM, 6–11:30 PM.
const options = [
  { start: "16:15", end: "23:30", primary: true, note: null },
  { start: "17:00", end: "23:00", primary: false, note: null },
  { start: "18:00", end: "23:30", primary: false, note: "Last for Daniel" },
];

function open() {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  render(
    <PresetTimePicker
      name="Dinner-Barback"
      color="#7c3aed"
      where="Daniel Kim · Wed, Oct 21"
      options={options}
      cell={{ left: 300, top: 200, width: 140, height: 60 }}
      onPick={onPick}
      onCancel={onCancel}
    />,
  );
  return { onPick, onCancel, list: screen.getByRole("dialog", { name: "Time for Dinner-Barback" }) };
}

afterEach(cleanup);

describe("PresetTimePicker", () => {
  it("lists the saved times with the primary first and the dashed card in the cell", () => {
    open();
    const rows = screen.getAllByRole("option");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Primary"),
      expect.stringContaining("6h"),
      expect.stringContaining("Last for Daniel"),
    ]);
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Pick a time…")).toBeTruthy();
  });

  it("places the primary with Enter, another after ↓, a clicked one at once", () => {
    const first = open();
    fireEvent.keyDown(first.list, { key: "Enter" });
    expect(first.onPick).toHaveBeenCalledWith(options[0]);
    cleanup();
    const second = open();
    fireEvent.keyDown(second.list, { key: "ArrowDown" });
    fireEvent.keyDown(second.list, { key: "Enter" });
    expect(second.onPick).toHaveBeenCalledWith(options[1]);
    cleanup();
    const third = open();
    fireEvent.click(screen.getAllByRole("option")[2]!);
    expect(third.onPick).toHaveBeenCalledWith(options[2]);
  });

  it("writes typed hours from Other time and says how to type them when it cannot read them", () => {
    const { onPick, list } = open();
    const other = screen.getByLabelText("Other time");
    fireEvent.change(other, { target: { value: "soon" } });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText("Try 5-11p")).toBeTruthy();
    fireEvent.change(other, { target: { value: "5-10p" } });
    expect(screen.getByText("5–10 PM")).toBeTruthy();
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith({ start: "17:00", end: "22:00" });
  });

  it("writes nothing on Esc or a press outside", () => {
    const first = open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(first.onCancel).toHaveBeenCalledTimes(1);
    expect(first.onPick).not.toHaveBeenCalled();
    cleanup();
    const second = open();
    fireEvent.mouseDown(document.body);
    expect(second.onCancel).toHaveBeenCalledTimes(1);
  });
});
