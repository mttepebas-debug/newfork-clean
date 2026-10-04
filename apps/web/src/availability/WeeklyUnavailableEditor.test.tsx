// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWeeklyPreference } from "@newfork/shared";
import { WeeklyUnavailableEditor } from "./WeeklyUnavailableEditor";

afterEach(cleanup);

// M4, S2 (a): a converted week can hold several hours a day; none is lost.
describe("several unavailable hours a day", () => {
  const week = () => {
    const value = emptyWeeklyPreference("time_range");
    value.days[1]!.ranges = [{ start: "09:00", end: "14:00" }, { start: "17:00", end: "24:00" }];
    return value;
  };
  it("shows every range of the day", () => {
    render(<WeeklyUnavailableEditor value={week()} shiftTypes={[]} readOnly />);
    expect(screen.getByText("09:00 - 14:00")).toBeTruthy();
    expect(screen.getByText("17:00 - 24:00")).toBeTruthy();
  });
  it("edits and removes one range and keeps the other", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={week()} shiftTypes={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours 2" }));
    expect(onChange.mock.calls[0]![0].days[1].ranges).toEqual([{ start: "09:00", end: "14:00" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours" }));
    expect(onChange.mock.calls[1]![0].days[1].ranges).toEqual([{ start: "17:00", end: "24:00" }]);
  });
  it("clears every range when the day turns all day", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={week()} shiftTypes={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Monday all day unavailable" }));
    expect(onChange.mock.calls[0]![0].days[1]).toMatchObject({ all_day: true, ranges: [] });
  });
});
