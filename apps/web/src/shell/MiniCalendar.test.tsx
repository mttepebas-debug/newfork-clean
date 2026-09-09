import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniCalendar } from "./MiniCalendar";

afterEach(() => {
  vi.useRealTimers();
});

describe("MiniCalendar", () => {
  it("preserves day, week, month, today, and marker interactions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));
    const onDayPick = vi.fn();
    const onWeekJump = vi.fn();

    render(
      <MiniCalendar
        selectedDate="2026-08-17"
        weekStartDate="2026-08-17"
        markers={[{ date: "2026-08-18", kind: "closed", title: "Closed" }]}
        onDayPick={onDayPick}
        onWeekJump={onWeekJump}
      />,
    );

    expect(screen.getByRole("grid", { name: "August 2026" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("gridcell", { name: "August 18, 2026, Closed" }),
    );
    expect(onDayPick).toHaveBeenCalledWith("2026-08-18");

    fireEvent.click(
      screen.getByRole("button", { name: "Jump to week of August 17" }),
    );
    expect(onWeekJump).toHaveBeenCalledWith("2026-08-17");

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("grid", { name: "September 2026" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onDayPick).toHaveBeenLastCalledWith("2026-08-17");
  });

  it("uses Sunday week anchors when the schedule setting starts weeks on Sunday", () => {
    const onWeekJump = vi.fn();

    render(
      <MiniCalendar
        selectedDate="2026-08-16"
        weekStartDate="2026-08-16"
        weekStartDay="sunday"
        onDayPick={vi.fn()}
        onWeekJump={onWeekJump}
      />,
    );

    expect(screen.getAllByText("S")[0]).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Jump to week of August 16" }),
    );
    expect(onWeekJump).toHaveBeenCalledWith("2026-08-16");
  });
});
