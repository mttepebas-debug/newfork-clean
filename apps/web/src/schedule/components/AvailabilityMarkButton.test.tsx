import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AvailabilityMarkButton } from "./AvailabilityMarkButton";

const lines = ["Marked unavailable Tue, Sep 29 · After 6:00 PM"];
const spotlight = () => document.getElementById("schedule-availability-spotlight");

afterEach(() => {
  document.getElementById("schedule-availability-spotlight")?.remove();
});

describe("AvailabilityMarkButton", () => {
  it("closes its window on any scroll outside it (Mert, 2026-10-09, item 15 B)", () => {
    render(<AvailabilityMarkButton label="Ada: unavailable days" lines={lines} />);
    fireEvent.click(screen.getByRole("button", { name: "Ada: unavailable days" }));
    const window = screen.getByRole("dialog");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tints the person's unavailable days only while the name's window is open (Mert, 2026-10-09, item 1 A)", () => {
    render(<AvailabilityMarkButton label="Ada: unavailable days" lines={lines} spotlightEmployeeId="emp-1" />);
    expect(spotlight()).toBeNull();
    const mark = screen.getByRole("button", { name: "Ada: unavailable days" });
    fireEvent.click(mark);
    expect(spotlight()?.textContent).toContain('.schedule-cell[data-employee-id="emp-1"][data-availability-kind="unavailable"]');
    fireEvent.click(mark);
    expect(spotlight()).toBeNull();
  });

  it("leaves the grid alone for a card's \"!\"", () => {
    render(<AvailabilityMarkButton label="Card: unavailable" lines={lines} />);
    fireEvent.click(screen.getByRole("button", { name: "Card: unavailable" }));
    expect(spotlight()).toBeNull();
  });
});
