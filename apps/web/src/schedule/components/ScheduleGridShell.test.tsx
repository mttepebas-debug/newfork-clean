import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleGridShell } from "./ScheduleGridShell";

function defineScrollBox(
  scroll: HTMLElement,
  {
    clientWidth = 320,
    scrollLeft = 0,
    scrollWidth = 960,
  }: {
    readonly clientWidth?: number;
    readonly scrollLeft?: number;
    readonly scrollWidth?: number;
  } = {},
): () => number {
  let currentScrollLeft = scrollLeft;
  Object.defineProperty(scroll, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(scroll, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(scroll, "scrollLeft", {
    configurable: true,
    get: () => currentScrollLeft,
    set: (value) => {
      currentScrollLeft = value;
    },
  });
  return () => currentScrollLeft;
}

function firePointerDownWithPosition(
  target: HTMLElement,
  {
    button = 0,
    clientX,
    pointerId = 1,
  }: {
    readonly button?: number;
    readonly clientX: number;
    readonly pointerId?: number;
  },
): void {
  const event = new Event("pointerdown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    button: { value: button },
    clientX: { value: clientX },
    pointerId: { value: pointerId },
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("ScheduleGridShell", () => {
  it("renders the reference scroll and grid shell", () => {
    render(
      <ScheduleGridShell
        columns={3}
        dayColumnMinWidth={148}
        editing
        gridRef={createRef<HTMLDivElement>()}
        showTotalHours
        view="week"
        overlays={<div data-testid="drag-previews" />}
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    const grid = screen.getByRole("grid", { name: "Weekly editable schedule" });

    expect(scroll.className).toBe("schedule-grid-scroll");
    expect(screen.getByTestId("schedule-grid")).toBe(grid);
    expect(grid.className).toBe("schedule-grid-exact");
    expect(grid.style.getPropertyValue("--schedule-day-column-min")).toBe(
      "148px",
    );
    expect(grid.style.gridTemplateColumns).toBe(
      "200px repeat(3, minmax(var(--schedule-day-column-min), 1fr)) 120px",
    );
    expect(screen.getByTestId("grid-body")).toBeTruthy();
    expect(screen.getByTestId("drag-previews")).toBeTruthy();
  });

  it("clears selection only when the blank grid surface is pressed", () => {
    const onClearSelection = vi.fn();

    render(
      <ScheduleGridShell
        columns={1}
        dayColumnMinWidth={112}
        editing={false}
        gridRef={createRef<HTMLDivElement>()}
        showTotalHours={false}
        view="day"
        onClearSelection={onClearSelection}
      >
        <button type="button">Shift</button>
      </ScheduleGridShell>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Shift" }));
    expect(onClearSelection).not.toHaveBeenCalled();

    fireEvent.pointerDown(
      screen.getByRole("grid", { name: "Daily published schedule" }),
    );
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("renders and syncs the reference-style horizontal navigation on overflow", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={180}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    defineScrollBox(scroll);
    rerender(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={181}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const nav = await screen.findByRole("navigation", {
      name: "Schedule horizontal navigation",
    });
    const track = screen.getByRole("scrollbar", {
      name: "Scroll schedule horizontally",
    });
    expect(nav.getAttribute("data-schedule-horizontal-nav")).toBe("true");
    expect(track.getAttribute("aria-orientation")).toBe("horizontal");
    expect(track.getAttribute("aria-valuemax")).toBe("640");
    expect(track.getAttribute("aria-valuenow")).toBe("0");
    expect(
      document.querySelector("[data-schedule-horizontal-nav-spacer]"),
    ).toBeNull();

    scroll.scrollLeft = 128;
    fireEvent.scroll(scroll);

    await waitFor(() =>
      expect(track.getAttribute("aria-valuenow")).toBe("128"),
    );
    expect(
      document.querySelector<HTMLElement>(
        "[data-schedule-horizontal-nav-thumb]",
      )?.style.transform,
    ).not.toBe("");
  });

  it("scrolls the schedule from the horizontal navigation keyboard and wheel controls", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={180}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    const readScrollLeft = defineScrollBox(scroll);
    rerender(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={181}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const track = await screen.findByRole("scrollbar", {
      name: "Scroll schedule horizontally",
    });

    fireEvent.keyDown(track, { key: "ArrowRight" });
    await waitFor(() => expect(readScrollLeft()).toBe(48));
    expect(track.getAttribute("aria-valuenow")).toBe("48");

    fireEvent.keyDown(track, { key: "End" });
    await waitFor(() => expect(readScrollLeft()).toBe(640));
    expect(track.getAttribute("aria-valuenow")).toBe("640");

    fireEvent.keyDown(track, { key: "Home" });
    await waitFor(() => expect(readScrollLeft()).toBe(0));
    expect(track.getAttribute("aria-valuenow")).toBe("0");

    fireEvent.wheel(track, { deltaY: 120 });
    await waitFor(() => expect(readScrollLeft()).toBe(120));
    expect(track.getAttribute("aria-valuenow")).toBe("120");
  });

  it("pages the schedule when the horizontal navigation track is pressed", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={180}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    const readScrollLeft = defineScrollBox(scroll);
    rerender(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={181}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const track = await screen.findByRole("scrollbar", {
      name: "Scroll schedule horizontally",
    });
    Object.defineProperty(track, "clientWidth", {
      configurable: true,
      value: 320,
    });
    track.getBoundingClientRect = () =>
      ({
        bottom: 20,
        height: 20,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    firePointerDownWithPosition(track, {
      clientX: 300,
    });

    await waitFor(() => expect(readScrollLeft()).toBe(272));
    expect(track.getAttribute("aria-valuenow")).toBe("272");
  });

  it("omits the reference-style horizontal navigation when the grid does not overflow", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={1}
        dayColumnMinWidth={112}
        editing
        gridRef={gridRef}
        showTotalHours={false}
        view="day"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    Object.defineProperty(scroll, "clientWidth", {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(scroll, "scrollWidth", {
      configurable: true,
      value: 960,
    });
    rerender(
      <ScheduleGridShell
        columns={1}
        dayColumnMinWidth={113}
        editing
        gridRef={gridRef}
        showTotalHours={false}
        view="day"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("navigation", {
          name: "Schedule horizontal navigation",
        }),
      ).toBeNull(),
    );
  });
});
