import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeepScrollThroughDrag } from "./useKeepScrollThroughDrag";

function Harness({ active }: { readonly active: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useKeepScrollThroughDrag({ active, gridRef });
  return (
    <div className="schedule-grid-scroll" data-testid="scroll">
      <div ref={gridRef} />
    </div>
  );
}

describe("useKeepScrollThroughDrag", () => {
  it("brings the grid back to where the drag started once the hidden rows return", () => {
    const { rerender } = render(<Harness active={false} />);
    const scroll = screen.getByTestId("scroll");
    scroll.scrollTop = 400;
    scroll.scrollLeft = 120;
    fireEvent.scroll(scroll);

    rerender(<Harness active />);
    // The rows that cannot take the shift leave: the list is shorter and the
    // browser pulls the scroll up; the drag also scrolls sideways.
    scroll.scrollTop = 0;
    scroll.scrollLeft = 300;
    fireEvent.scroll(scroll);

    rerender(<Harness active={false} />);
    expect(scroll.scrollTop).toBe(400);
    expect(scroll.scrollLeft).toBe(300);
  });

  it("leaves the grid alone when no drag happened", () => {
    const { rerender } = render(<Harness active={false} />);
    const scroll = screen.getByTestId("scroll");
    scroll.scrollTop = 250;
    fireEvent.scroll(scroll);
    scroll.scrollTop = 90;
    fireEvent.scroll(scroll);

    rerender(<Harness active={false} />);
    expect(scroll.scrollTop).toBe(90);
  });
});

// Mert, 2026-10-13: picking a shift up must not move it. People who cannot
// take it leave the list, so the grid shortens; the card stays under the
// mouse, and the days keep their widths, until the drop.
function GrabHarness({ active }: { readonly active: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const { grab } = useKeepScrollThroughDrag({ active, gridRef });
  return (
    <div className="schedule-grid-scroll" data-testid="scroll">
      <div ref={gridRef} data-testid="grid">
        <div className="schedule-drag-hold-space" data-testid="space" />
        <button type="button" data-testid="card" onPointerDown={(event) => grab(event.currentTarget)} />
      </div>
    </div>
  );
}

// The real grid: React writes its columns as an inline style.
function ReactColumnsHarness({ active }: { readonly active: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const { grab } = useKeepScrollThroughDrag({ active, gridRef });
  return (
    <div className="schedule-grid-scroll" data-testid="scroll">
      <div ref={gridRef} data-testid="grid" style={{ gridTemplateColumns: "200px repeat(2, 150px)" }}>
        <div className="schedule-drag-hold-space" data-testid="space" />
        <button type="button" data-testid="card" onPointerDown={(event) => grab(event.currentTarget)} />
      </div>
    </div>
  );
}

function placeCard(top: number, left = 500) {
  vi.spyOn(screen.getByTestId("card"), "getBoundingClientRect").mockReturnValue(
    { top, left, right: left + 120, bottom: top + 40, width: 120, height: 40, x: left, y: top, toJSON: () => ({}) } as DOMRect,
  );
}

// The space kept above and below the rows while a card is held.
function held() {
  return {
    above: Number.parseFloat(screen.getByTestId("space").style.height) || 0,
    below: Number.parseFloat(screen.getByTestId("grid").style.paddingBottom) || 0,
  };
}

function sizeScroll(scrollHeight: number, clientHeight: number) {
  const scroll = screen.getByTestId("scroll");
  Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(scroll, "clientHeight", { configurable: true, value: clientHeight });
}

describe("useKeepScrollThroughDrag holding the picked-up card", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scrolls back down when the shorter grid pulled the card away from the mouse", () => {
    const { rerender } = render(<GrabHarness active={false} />);
    const scroll = screen.getByTestId("scroll");
    sizeScroll(3000, 800);
    scroll.scrollTop = 139;
    fireEvent.scroll(scroll);
    placeCard(476);
    fireEvent.pointerDown(screen.getByTestId("card"));

    // The rows leave: the browser clamps the scroll to the top and the card
    // drops 139 pixels; the grid is now only 900 tall.
    sizeScroll(900, 800);
    scroll.scrollTop = 0;
    placeCard(615);
    rerender(<GrabHarness active />);

    expect(scroll.scrollTop).toBe(139);
    // 39 more pixels below the rows let the grid scroll that far.
    expect(screen.getByTestId("grid").style.paddingBottom).toBe("39px");
    expect(held().above).toBe(0);
  });

  it("fills the space above when the rows over the card left", () => {
    const { rerender } = render(<GrabHarness active={false} />);
    const scroll = screen.getByTestId("scroll");
    sizeScroll(3000, 800);
    scroll.scrollTop = 100;
    fireEvent.scroll(scroll);
    placeCard(300);
    fireEvent.pointerDown(screen.getByTestId("card"));

    // Five rows above the card left: it rose 140 pixels, more than the grid
    // can scroll up.
    sizeScroll(1200, 800);
    placeCard(160);
    rerender(<GrabHarness active />);

    expect(scroll.scrollTop).toBe(0);
    expect(held().above).toBe(40);
  });

  it("keeps each day's width from when the card was picked up, and lets go after the drop", () => {
    const { rerender } = render(<GrabHarness active={false} />);
    const scroll = screen.getByTestId("scroll");
    const grid = screen.getByTestId("grid");
    sizeScroll(3000, 800);
    scroll.scrollTop = 220;
    fireEvent.scroll(scroll);
    placeCard(300);
    const style = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element === grid ? ({ gridTemplateColumns: "240px 151px 162px" } as CSSStyleDeclaration) : style(element, pseudo));
    fireEvent.pointerDown(screen.getByTestId("card"));

    rerender(<GrabHarness active />);
    expect(grid.dataset.scheduleDragHold).toBe("true");
    expect(grid.style.getPropertyValue("grid-template-columns")).toBe("240px 151px 162px");

    scroll.scrollTop = 40;
    rerender(<GrabHarness active={false} />);
    expect(grid.dataset.scheduleDragHold).toBeUndefined();
    expect(grid.style.getPropertyValue("grid-template-columns")).toBe("");
    expect(screen.getByTestId("space").style.height).toBe("");
    expect(grid.style.paddingBottom).toBe("");
    expect(scroll.scrollTop).toBe(220);
  });

  // Mert, 2026-10-21: after a drag the grid came apart (days wrapped onto
  // new lines) until a reload. The grid's own columns are React's; the drop
  // took them away and React, seeing no change, never wrote them back.
  it("gives the grid its own columns back after the drop", () => {
    const { rerender } = render(<ReactColumnsHarness active={false} />);
    const grid = screen.getByTestId("grid");
    sizeScroll(3000, 800);
    placeCard(300);
    const style = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element === grid ? ({ gridTemplateColumns: "240px 151px 162px" } as CSSStyleDeclaration) : style(element, pseudo));
    fireEvent.pointerDown(screen.getByTestId("card"));

    rerender(<ReactColumnsHarness active />);
    expect(grid.style.getPropertyValue("grid-template-columns")).toBe("240px 151px 162px");

    rerender(<ReactColumnsHarness active={false} />);
    expect(grid.dataset.scheduleDragHold).toBeUndefined();
    expect(grid.style.getPropertyValue("grid-template-columns")).toBe("200px repeat(2, 150px)");
    expect(grid.style.getPropertyPriority("grid-template-columns")).toBe("");
  });

  it("does nothing when no card was picked up", () => {
    const { rerender } = render(<GrabHarness active={false} />);
    const scroll = screen.getByTestId("scroll");
    scroll.scrollTop = 80;
    fireEvent.scroll(scroll);
    rerender(<GrabHarness active />);
    expect(scroll.scrollTop).toBe(80);
    expect(screen.getByTestId("grid").dataset.scheduleDragHold).toBeUndefined();
  });
});

// Mert, 2026-10-20 (atama-surukle B): at the drop the rows come back and the
// cell the shift landed in stays where it is on screen.
function DropHarness({ active }: { readonly active: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const { grab } = useKeepScrollThroughDrag({ active, gridRef });
  return (
    <div className="schedule-grid-scroll" data-testid="scroll">
      <div ref={gridRef} data-testid="grid">
        <div className="schedule-drag-hold-space" data-testid="space" />
        <button type="button" data-testid="card" onPointerDown={(event) => grab(event.currentTarget)} />
        <div data-testid="cell" data-drop-cell="true" />
      </div>
    </div>
  );
}

describe("useKeepScrollThroughDrag at the drop", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the cell the shift landed in where it was while the rows come back", () => {
    const { rerender } = render(<DropHarness active={false} />);
    const scroll = screen.getByTestId("scroll");
    const cell = screen.getByTestId("cell");
    sizeScroll(3000, 800);
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    placeCard(200);
    fireEvent.pointerDown(screen.getByTestId("card"));
    rerender(<DropHarness active />);

    const at = (top: number) => vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(
      { top, left: 300, right: 420, bottom: top + 60, width: 120, height: 60, x: 300, y: top, toJSON: () => ({}) } as DOMRect);
    at(500);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => cell) });
    fireEvent.pointerUp(window, { clientX: 330, clientY: 520 });
    // Four rows of 60 come back above it.
    at(740);
    rerender(<DropHarness active={false} />);
    expect(scroll.scrollTop).toBe(240);
  });
});
