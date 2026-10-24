import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MiniCalendar, type CalendarMarker } from "./MiniCalendar";

function renderCalendar(
  overrides: Partial<Parameters<typeof MiniCalendar>[0]> = {},
) {
  const props = {
    selectedDate: null,
    weekStartDate: "2026-08-17",
    weekStartDay: "monday" as const,
    markers: [],
    onDayPick: vi.fn(),
    onWeekJump: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof MiniCalendar>[0];

  return {
    ...render(<MiniCalendar {...props} />),
    props,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MiniCalendar", () => {
  it("renders today, the active week band, and day selection with reference classes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));

    renderCalendar({
      selectedDate: "2026-08-18",
      weekStartDate: "2026-08-17",
    });

    expect(screen.getByRole("grid", { name: "August 2026" })).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: "August 18, 2026" }).className,
    ).toContain("selected");
    expect(
      screen.getByRole("gridcell", { name: "August 19, 2026" }).className,
    ).toContain("in-week");
    expect(
      screen
        .getByRole("gridcell", { name: "August 19, 2026" })
        .querySelector(".today-indicator"),
    ).toBeTruthy();
  });

  it("jumps to the row week start using Sunday anchors when configured", () => {
    const onWeekJump = vi.fn();
    renderCalendar({
      weekStartDay: "sunday",
      weekStartDate: "2026-08-16",
      onWeekJump,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Jump to week of August 16" }),
    );

    expect(onWeekJump).toHaveBeenCalledWith("2026-08-16");
  });

  it("keeps keyboard navigation aligned with the focused date and commits with Enter", () => {
    const onDayPick = vi.fn();
    const { container } = renderCalendar({
      selectedDate: "2026-08-17",
      weekStartDate: "2026-08-17",
      onDayPick,
    });

    fireEvent.keyDown(container.querySelector(".mini-calendar")!, {
      key: "ArrowRight",
    });
    fireEvent.keyDown(container.querySelector(".mini-calendar")!, {
      key: "Enter",
    });

    expect(onDayPick).toHaveBeenCalledWith("2026-08-18");
  });

  it("switches month and year through the compact picker controls", () => {
    renderCalendar({
      selectedDate: "2026-08-17",
      weekStartDate: "2026-08-17",
    });

    fireEvent.click(screen.getByRole("button", { name: "Pick month" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Sep" }));
    expect(screen.getByRole("grid", { name: "September 2026" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pick year" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "2027" }));
    expect(screen.getByRole("grid", { name: "September 2027" })).toBeTruthy();
  });

  it("renders closed, ranged important, and annual important markers in visible cells", () => {
    const markers: CalendarMarker[] = [
      {
        date: "2026-08-18",
        endDate: "2026-08-19",
        kind: "important",
        title: "event: Anniversary",
        recurrence: "none",
      },
      {
        date: "2026-08-19",
        endDate: null,
        kind: "closed",
        title: "Private event",
      },
      {
        date: "2025-08-21",
        endDate: "2025-08-21",
        kind: "important",
        title: "holiday: Founders day",
        recurrence: "annual",
      },
    ];

    renderCalendar({
      selectedDate: "2026-08-17",
      weekStartDate: "2026-08-17",
      markers,
    });

    expect(
      screen
        .getByRole("gridcell", { name: "August 18, 2026, event: Anniversary" })
        .querySelector(".date-marker.important"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("gridcell", {
          name: "August 19, 2026, event: Anniversary, Private event",
        })
        .querySelector(".date-marker.closed"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("gridcell", {
          name: "August 21, 2026, holiday: Founders day",
        })
        .querySelector(".date-marker.important"),
    ).toBeTruthy();
  });
  // Time off (Mert 2026-10-23): a range's two ends are selected and the days
  // between share a band; days before minDate cannot be picked.
  it("shows a range's ends and the band between, and refuses days before minDate", () => {
    const onDayPick = vi.fn();
    const onDayHover = vi.fn();
    const { container } = renderCalendar({
      selectedDate: "2026-08-18",
      rangeEnd: "2026-08-21",
      minDate: "2026-08-12",
      weekStartDate: "2026-08-18",
      onWeekJump: undefined,
      onDayPick,
      onDayHover,
    });
    const day = (date: number) =>
      screen.getByRole("gridcell", { name: `August ${date}, 2026` });

    expect([18, 21].map((date) => day(date).className.includes("selected"))).toEqual([true, true]);
    expect(
      [17, 18, 19, 20, 21, 22].map((date) => day(date).className.includes("in-range")),
    ).toEqual([false, false, true, true, false, false]);
    expect((day(11) as HTMLButtonElement).disabled).toBe(true);
    expect((day(12) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.mouseEnter(day(25));
    expect(onDayHover).toHaveBeenLastCalledWith("2026-08-25");
    fireEvent.mouseLeave(screen.getByRole("grid", { name: "August 2026" }));
    expect(onDayHover).toHaveBeenLastCalledWith(null);

    // The keyboard cannot pick a day before minDate either.
    fireEvent.click(day(12));
    onDayPick.mockClear();
    const calendar = container.querySelector(".mini-calendar")!;
    fireEvent.keyDown(calendar, { key: "ArrowLeft" });
    fireEvent.keyDown(calendar, { key: "Enter" });
    expect(onDayPick).not.toHaveBeenCalled();
  });

  // BL-723 (3): jsdom has no :hover, so the cascade is read from the stylesheet.
  // The rule that comes last among equal selectors wins.
  it("keeps the hover effect on the days of the orange week band", () => {
    const styles = readFileSync("src/styles.css", "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (rule) => ({ selector: rule[1]!.trim(), body: rule[2]! }),
    );
    const at = (selector: string) =>
      rules.findIndex((rule) => rule.selector.split(/,\s*/).includes(selector));

    const hover = at(".calendar-day:hover");
    const inWeek = at(".calendar-day.in-week");
    expect(at(".calendar-day.in-range")).toBe(inWeek);
    const selected = at(".calendar-day.selected");
    const selectedHover = at(".calendar-day.selected:hover");
    expect(hover).toBeGreaterThan(-1);
    expect(inWeek).toBeGreaterThan(-1);
    // The band's day takes the same hover as every other day.
    expect(hover).toBeGreaterThan(inWeek);
    // The selected day keeps its own colour and shows hover with a thicker ring.
    expect(selected).toBeGreaterThan(hover);
    expect(selectedHover).toBeGreaterThan(selected);
    expect(rules[selectedHover]!.body).toContain("box-shadow");
  });
});
