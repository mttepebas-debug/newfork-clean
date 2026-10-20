import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleGridShell } from "./ScheduleGridShell";

function defineScrollBox(
  scroll: HTMLElement,
  {
    clientWidth = 320,
    clientHeight = 520,
    scrollLeft = 0,
    scrollTop = 0,
    scrollWidth = 960,
    scrollHeight = 1200,
  }: {
    readonly clientWidth?: number;
    readonly clientHeight?: number;
    readonly scrollLeft?: number;
    readonly scrollTop?: number;
    readonly scrollWidth?: number;
    readonly scrollHeight?: number;
  } = {},
): () => number {
  let currentScrollLeft = scrollLeft;
  let currentScrollTop = scrollTop;
  Object.defineProperty(scroll, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(scroll, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(scroll, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(scroll, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(scroll, "scrollLeft", {
    configurable: true,
    get: () => currentScrollLeft,
    set: (value) => {
      currentScrollLeft = value;
    },
  });
  Object.defineProperty(scroll, "scrollTop", {
    configurable: true,
    get: () => currentScrollTop,
    set: (value) => {
      currentScrollTop = value;
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
    expect(scroll.style.getPropertyValue("--schedule-filler-height")).toBe(
      "0px",
    );
    expect(scroll.style.getPropertyValue("--schedule-total-bottom-offset")).toBe(
      "0px",
    );
    expect(scroll.getAttribute("data-schedule-filler-state")).toBe("empty");
    expect(screen.getByTestId("grid-body")).toBeTruthy();
    expect(screen.getByTestId("drag-previews")).toBeTruthy();
  });

  it("uses visible-width columns for unified weekly fit mode", () => {
    render(
      <ScheduleGridShell
        columns={7}
        dayColumnMinWidth={220}
        editing
        fitVisibleColumns
        gridRef={createRef<HTMLDivElement>()}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    const grid = screen.getByRole("grid", { name: "Weekly editable schedule" });

    expect(grid.getAttribute("data-schedule-fit-visible-columns")).toBe("true");
    expect(grid.style.gridTemplateColumns).toBe(
      "minmax(144px, 200px) repeat(7, minmax(0, 1fr)) minmax(72px, 120px)",
    );
  });

  it("sizes each separate week to the viewport and scrolls only below the cards' words", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const renderShell = (minimum: number, showTotalHours = true) => (
      <ScheduleGridShell
        columns={14}
        dayColumnMinWidth={minimum}
        editing={false}
        fitWeeklyLocations
        gridRef={gridRef}
        showTotalHours={showTotalHours}
        view="week"
        onClearSelection={vi.fn()}
      >
        <div />
      </ScheduleGridShell>
    );
    const { rerender } = render(renderShell(0));
    const scroll = screen.getByTestId("schedule-grid-scroll");
    const grid = screen.getByTestId("schedule-grid");
    const dayWidth = () =>
      Number.parseFloat(grid.style.getPropertyValue("--schedule-day-column-min"));
    defineScrollBox(scroll, { clientWidth: 1300 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(dayWidth()).toBe(140));

    defineScrollBox(scroll, { clientWidth: 1510 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(dayWidth()).toBe(170));

    // Wide one-line cards wrap instead of pushing the week off screen.
    rerender(renderShell(303));
    expect(dayWidth()).toBe(170);
    expect(grid.style.gridTemplateColumns).toBe("200px repeat(14, 170px) 120px");
    rerender(renderShell(0, false));
    expect(dayWidth()).toBeCloseTo((1510 - 200) / 7);

    // Too narrow for even the shortest readable day: full-width cards scroll.
    rerender(renderShell(303));
    defineScrollBox(scroll, { clientWidth: 800 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(dayWidth()).toBe(303));
    expect(grid.style.gridTemplateColumns).toBe(
      "200px repeat(14, minmax(var(--schedule-day-column-min), 1fr)) 120px",
    );
  });

  it("autoscrolls both grid axes while a shift drag reaches the bottom-right edge", () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={180}
        dragPointer={null}
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
    scroll.getBoundingClientRect = () =>
      ({
        bottom: 520,
        height: 520,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    rerender(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={181}
        dragPointer={{ x: 319, y: 519 }}
        editing
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-testid="grid-body" />
      </ScheduleGridShell>,
    );

    expect(readScrollLeft()).toBe(24);
    expect(scroll.scrollTop).toBe(24);
  });

  it("measures the elastic filler height above the sticky totals row", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={1}
        dayColumnMinWidth={112}
        editing={false}
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-schedule-filler-height-px="true" />
        <div data-schedule-total-hours-row-label="true" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    defineScrollBox(scroll, {
      clientWidth: 520,
      clientHeight: 620,
      scrollWidth: 520,
    });
    scroll.getBoundingClientRect = () =>
      ({
        bottom: 620,
        height: 620,
        left: 0,
        right: 520,
        top: 0,
        width: 520,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const filler = scroll.querySelector<HTMLElement>(
      "[data-schedule-filler-height-px='true']",
    );
    const total = scroll.querySelector<HTMLElement>(
      "[data-schedule-total-hours-row-label='true']",
    );
    filler!.getBoundingClientRect = () =>
      ({
        bottom: 360,
        height: 0,
        left: 0,
        right: 200,
        top: 360,
        width: 200,
        x: 0,
        y: 360,
        toJSON: () => ({}),
      }) as DOMRect;
    total!.getBoundingClientRect = () =>
      ({
        bottom: 400,
        height: 40,
        left: 0,
        right: 200,
        top: 360,
        width: 200,
        x: 0,
        y: 360,
        toJSON: () => ({}),
      }) as DOMRect;

    rerender(
      <ScheduleGridShell
        columns={1}
        dayColumnMinWidth={113}
        editing={false}
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-schedule-filler-height-px="true" />
        <div data-schedule-total-hours-row-label="true" />
      </ScheduleGridShell>,
    );

    await waitFor(() =>
      expect(scroll.style.getPropertyValue("--schedule-filler-height")).toBe(
        "220px",
      ),
    );
    expect(scroll.getAttribute("data-schedule-filler-state")).toBe("active");
    expect(scroll.style.getPropertyValue("--schedule-total-bottom-offset")).toBe(
      "0px",
    );
  });

  it("clamps the filler height to zero when the employee rows already fill the viewport", async () => {
    const gridRef = createRef<HTMLDivElement>();
    const { rerender } = render(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={180}
        editing={false}
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-schedule-filler-height-px="true" />
        <div data-schedule-total-hours-row-label="true" />
      </ScheduleGridShell>,
    );

    const scroll = screen.getByTestId("schedule-grid-scroll");
    defineScrollBox(scroll, {
      clientWidth: 320,
      clientHeight: 420,
      scrollWidth: 960,
    });
    scroll.getBoundingClientRect = () =>
      ({
        bottom: 420,
        height: 420,
        left: 0,
        right: 320,
        top: 0,
        width: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const filler = scroll.querySelector<HTMLElement>(
      "[data-schedule-filler-height-px='true']",
    );
    const total = scroll.querySelector<HTMLElement>(
      "[data-schedule-total-hours-row-label='true']",
    );
    filler!.getBoundingClientRect = () =>
      ({
        bottom: 540,
        height: 0,
        left: 0,
        right: 200,
        top: 540,
        width: 200,
        x: 0,
        y: 540,
        toJSON: () => ({}),
      }) as DOMRect;
    total!.getBoundingClientRect = () =>
      ({
        bottom: 580,
        height: 40,
        left: 0,
        right: 200,
        top: 540,
        width: 200,
        x: 0,
        y: 540,
        toJSON: () => ({}),
      }) as DOMRect;

    rerender(
      <ScheduleGridShell
        columns={8}
        dayColumnMinWidth={181}
        editing={false}
        gridRef={gridRef}
        showTotalHours
        view="week"
        onClearSelection={vi.fn()}
      >
        <div data-schedule-filler-height-px="true" />
        <div data-schedule-total-hours-row-label="true" />
      </ScheduleGridShell>,
    );

    await waitFor(() =>
      expect(scroll.style.getPropertyValue("--schedule-total-bottom-offset")).toBe(
        "17px",
      ),
    );
    expect(scroll.style.getPropertyValue("--schedule-filler-height")).toBe(
      "0px",
    );
    expect(scroll.getAttribute("data-schedule-filler-state")).toBe("empty");
  });

  it("remeasures the filler when a real row grows without resizing the grid shell", async () => {
    const resizeCallbacks = new Map<Element, ResizeObserverCallback>();
    class TestResizeObserver implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element): void {
        resizeCallbacks.set(target, this.callback);
      }

      disconnect(): void {}
      unobserve(target: Element): void {
        resizeCallbacks.delete(target);
      }
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    try {
      const gridRef = createRef<HTMLDivElement>();
      const { rerender } = render(
        <ScheduleGridShell
          columns={1}
          dayColumnMinWidth={112}
          editing
          gridRef={gridRef}
          showTotalHours
          view="week"
          onClearSelection={vi.fn()}
        >
          <div data-schedule-real-row-anchor="true" />
          <div data-schedule-filler-height-px="true" />
          <div data-schedule-total-hours-row-label="true" />
        </ScheduleGridShell>,
      );

      const scroll = screen.getByTestId("schedule-grid-scroll");
      defineScrollBox(scroll, {
        clientWidth: 520,
        clientHeight: 620,
        scrollWidth: 520,
      });
      scroll.getBoundingClientRect = () =>
        ({
          bottom: 620,
          height: 620,
          left: 0,
          right: 520,
          top: 0,
          width: 520,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
      const filler = scroll.querySelector<HTMLElement>(
        "[data-schedule-filler-height-px='true']",
      );
      const total = scroll.querySelector<HTMLElement>(
        "[data-schedule-total-hours-row-label='true']",
      );
      const rowAnchor = scroll.querySelector<HTMLElement>(
        "[data-schedule-real-row-anchor='true']",
      );
      let fillerTop = 360;
      filler!.getBoundingClientRect = () =>
        ({
          bottom: fillerTop,
          height: 0,
          left: 0,
          right: 200,
          top: fillerTop,
          width: 200,
          x: 0,
          y: fillerTop,
          toJSON: () => ({}),
        }) as DOMRect;
      total!.getBoundingClientRect = () =>
        ({
          bottom: 400,
          height: 40,
          left: 0,
          right: 200,
          top: 360,
          width: 200,
          x: 0,
          y: 360,
          toJSON: () => ({}),
        }) as DOMRect;

      rerender(
        <ScheduleGridShell
          columns={1}
          dayColumnMinWidth={113}
          editing
          gridRef={gridRef}
          showTotalHours
          view="week"
          onClearSelection={vi.fn()}
        >
          <div data-schedule-real-row-anchor="true" />
          <div data-schedule-filler-height-px="true" />
          <div data-schedule-total-hours-row-label="true" />
        </ScheduleGridShell>,
      );

      await waitFor(() =>
        expect(scroll.style.getPropertyValue("--schedule-filler-height")).toBe(
          "220px",
        ),
      );

      const onRowResize = resizeCallbacks.get(rowAnchor!);
      expect(onRowResize).toBeTypeOf("function");
      fillerTop = 700;
      act(() => {
        onRowResize!([], {} as ResizeObserver);
      });

      await waitFor(() =>
        expect(scroll.style.getPropertyValue("--schedule-filler-height")).toBe(
          "0px",
        ),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("clears selection only when the blank grid surface is pressed", () => {
    const onClearSelection = vi.fn();

    render(
      <ScheduleGridShell
        columns={1}
        dayColumnMinWidth={112}
        editing={false}
        gridRef={createRef<HTMLDivElement>()}
        published
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
    await waitFor(() =>
      expect(scroll.style.getPropertyValue("--schedule-total-bottom-offset")).toBe(
        "17px",
      ),
    );
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
