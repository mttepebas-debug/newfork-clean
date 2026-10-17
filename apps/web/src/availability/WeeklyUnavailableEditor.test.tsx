// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWeeklyPreference } from "@newfork/shared";
import { WeeklyUnavailableEditor } from "./WeeklyUnavailableEditor";

afterEach(cleanup);

// Hours only, one range a day (Mert 2026-10-16: "yalnız saat", "kural da 1'e insin").
describe("a day's unavailable hours", () => {
  const week = () => {
    const value = emptyWeeklyPreference();
    value.days[1]!.ranges = [{ start: "17:00", end: "24:00" }];
    return value;
  };
  it("shows the day's range", () => {
    render(<WeeklyUnavailableEditor value={week()} readOnly />);
    expect(screen.getByText("17:00 – 24:00")).toBeTruthy();
  });
  it("removes the range", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={week()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours" }));
    expect(onChange.mock.calls[0]![0].days[1].ranges).toEqual([]);
  });
  it("clears the range when the day turns all day", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={week()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Monday all day unavailable" }));
    expect(onChange.mock.calls[0]![0].days[1]).toEqual({ day: 1, all_day: true, ranges: [] });
  });
  it("has no shift type choices", () => {
    render(<WeeklyUnavailableEditor value={week()} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Shift default hours" })).toBeNull();
    expect(screen.queryByText("No shift types available")).toBeNull();
  });
});

describe("adding hours to a day", () => {
  it("adds no second range once the day has one", () => {
    const value = emptyWeeklyPreference();
    value.days[1]!.ranges = [{ start: "09:00", end: "14:00" }];
    render(<WeeklyUnavailableEditor value={value} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add hours on Monday" })).toBeNull();
  });
  it("adds the first range on an empty day", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={emptyWeeklyPreference()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add hours on Monday" }));
    expect(onChange.mock.calls[0]![0].days[1].ranges).toEqual([{ start: "09:00", end: "17:00" }]);
  });
  it("offers hours on the other days", () => {
    const value = emptyWeeklyPreference();
    value.days[1]!.ranges = [{ start: "17:00", end: "24:00" }];
    render(<WeeklyUnavailableEditor value={value} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add hours on Monday" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add hours on Wednesday" })).toBeTruthy();
  });
});

// WCAG 2.4.3: focus never falls to the page when a range comes or goes.
describe("focus while editing hours", () => {
  function Editor() {
    const [value, setValue] = useState(() => {
      const week = emptyWeeklyPreference();
      week.days[1]!.ranges = [{ start: "09:00", end: "14:00" }];
      return week;
    });
    return <WeeklyUnavailableEditor value={value} onChange={setValue} />;
  }
  it("moves to Add hours once the range is removed", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add hours on Monday" }));
  });
  it("moves to the new range's start after Add hours", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Add hours on Monday" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Monday unavailable start" }));
  });
});
