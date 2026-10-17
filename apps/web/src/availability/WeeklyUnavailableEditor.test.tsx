// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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
    expect(screen.getByText("09:00 – 14:00")).toBeTruthy();
    expect(screen.getByText("17:00 – 24:00")).toBeTruthy();
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

// "Add hours" adds the day's one range (Mert 2026-10-16, "kural da 1'e insin").
describe("adding hours to a day", () => {
  it("adds no second range once the day has one", () => {
    const value = emptyWeeklyPreference("time_range");
    value.days[1]!.ranges = [{ start: "09:00", end: "14:00" }];
    render(<WeeklyUnavailableEditor value={value} shiftTypes={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add hours on Monday" })).toBeNull();
  });
  it("adds the first range on an empty day", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={emptyWeeklyPreference("time_range")} shiftTypes={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add hours on Monday" }));
    expect(onChange.mock.calls[0]![0].days[1].ranges).toEqual([{ start: "09:00", end: "17:00" }]);
  });
  it("offers hours again once the day's range is removed", () => {
    const value = emptyWeeklyPreference("time_range");
    value.days[1]!.ranges = [{ start: "17:00", end: "24:00" }];
    render(<WeeklyUnavailableEditor value={value} shiftTypes={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add hours on Monday" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add hours on Wednesday" })).toBeTruthy();
  });
});

// M3, D6: marking every type the day can take turns the day all day.
describe("all day by itself", () => {
  const type = (id: number, name: string, selectable = true) => ({
    id: `ab920000-0000-4000-8000-00000000000${id}`, name, start_time: "09:00", end_time: "17:00", archived: !selectable, selectable });
  const types = [type(1, "Lunch"), type(2, "Dinner"), type(3, "Late", false)];
  it("turns all day on when the last selectable type is marked", () => {
    const value = emptyWeeklyPreference("shift_type");
    value.days[1]!.shift_type_ids = [types[0]!.id];
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={value} shiftTypes={types} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Monday Dinner unavailable" }));
    expect(onChange.mock.calls[0]![0].days[1]).toMatchObject({ all_day: true, shift_type_ids: [], ranges: [] });
  });
  it("leaves the day alone while a selectable type is still open", () => {
    const onChange = vi.fn();
    render(<WeeklyUnavailableEditor value={emptyWeeklyPreference("shift_type")} shiftTypes={types} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Monday Lunch unavailable" }));
    expect(onChange.mock.calls[0]![0].days[1]).toMatchObject({ all_day: false, shift_type_ids: [types[0]!.id] });
  });
});

// WCAG 2.4.3: focus never falls to the page when a range comes or goes.
describe("focus while editing hours", () => {
  function Editor() {
    const [value, setValue] = useState(() => {
      const week = emptyWeeklyPreference("time_range");
      week.days[1]!.ranges = [{ start: "09:00", end: "14:00" }, { start: "17:00", end: "20:00" }];
      return week;
    });
    return <WeeklyUnavailableEditor value={value} shiftTypes={[]} onChange={setValue} />;
  }
  it("moves to the neighbouring remove button, then to Add hours", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours 2" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove Monday hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add hours on Monday" }));
  });
  it("moves to the new range's start after Add hours", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Monday hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Add hours on Monday" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Monday unavailable start" }));
  });
});
