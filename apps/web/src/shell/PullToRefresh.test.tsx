import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listScrolled, PULL_READY, PullToRefreshMark, rubber, scrolledAbove, usePullToRefresh } from "./PullToRefresh";

function Page({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const anchor = useRef<HTMLDivElement>(null);
  const { state, pull } = usePullToRefresh(anchor, onRefresh);
  return (
    <main className="app-main" data-testid="area">
      <div ref={anchor}>
        <PullToRefreshMark state={state} pull={pull} />
        <p data-testid="state">{state}</p>
        <div data-own-drag="" data-testid="strip" />
        <div role="dialog" aria-label="Edit employee" data-testid="drawer">
          <p>Drawer</p>
        </div>
        <div data-testid="frame" style={{ overflowY: "auto", height: 50 }}>
          <div data-testid="row" style={{ height: 400 }} />
        </div>
      </div>
    </main>
  );
}

const touch = (target: Element, type: string, y: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX: 100, clientY: y }] });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

afterEach(cleanup);

describe("pull to refresh", () => {
  it("slows the mark down the further it is pulled", () => {
    expect(rubber(0)).toBe(0);
    expect(rubber(400)).toBeLessThan(128);
    expect(rubber(200) - rubber(100)).toBeLessThan(rubber(100) - rubber(0));
  });

  it("refreshes after a pull past the line, and holds back the browser's own pull", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const area = screen.getByTestId("area");
    touch(area, "touchstart", 100);
    const move = touch(area, "touchmove", 100 + 300);
    expect(move.defaultPrevented).toBe(true);
    expect(rubber(300)).toBeGreaterThan(PULL_READY);
    expect(screen.getByTestId("state").textContent).toBe("ready");
    touch(area, "touchend", 400);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state").textContent).toBe("refreshing");
    expect(screen.getByRole("status").textContent).toBe("Refreshing");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByTestId("state").textContent).toBe("idle");
    vi.useRealTimers();
  });

  it("leaves a pull alone when the page is not at its top", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const area = screen.getByTestId("area");
    area.scrollTop = 120;
    touch(area, "touchstart", 100);
    expect(touch(area, "touchmove", 400).defaultPrevented).toBe(false);
    touch(area, "touchend", 400);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("state").textContent).toBe("idle");
  });

  it("lets a short pull go, and leaves drags that start on a strip alone", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const area = screen.getByTestId("area");
    touch(area, "touchstart", 100);
    touch(area, "touchmove", 140);
    touch(area, "touchend", 140);
    expect(onRefresh).not.toHaveBeenCalled();
    const strip = screen.getByTestId("strip");
    touch(strip, "touchstart", 100);
    expect(touch(strip, "touchmove", 400).defaultPrevented).toBe(false);
    touch(strip, "touchend", 400);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("leaves a list scrolled in its own frame to pull its own rows", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const area = screen.getByTestId("area");
    const frame = screen.getByTestId("frame");
    const row = screen.getByTestId("row");
    expect(scrolledAbove(row, area)).toBe(false);
    frame.scrollTop = 80;
    expect(scrolledAbove(row, area)).toBe(true);
    touch(row, "touchstart", 100);
    expect(touch(row, "touchmove", 400).defaultPrevented).toBe(false);
    touch(row, "touchend", 400);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("refreshes only while the page's list is at its top, wherever the pull starts (CALISAN-SCROLL)", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const frame = screen.getByTestId("frame");
    // The heading or the week switch stays put above a list that scrolls in its own frame.
    const fixed = screen.getByTestId("state");
    frame.scrollTop = 80;
    touch(fixed, "touchstart", 100);
    expect(touch(fixed, "touchmove", 400).defaultPrevented).toBe(false);
    touch(fixed, "touchend", 400);
    expect(onRefresh).not.toHaveBeenCalled();
    frame.scrollTop = 0;
    touch(fixed, "touchstart", 100);
    expect(touch(fixed, "touchmove", 400).defaultPrevented).toBe(true);
    touch(fixed, "touchend", 400);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("leaves a drawer's own scroll out of whether the page's list is at its top", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const area = screen.getByTestId("area");
    const drawer = screen.getByTestId("drawer");
    drawer.style.overflowY = "auto";
    drawer.scrollTop = 80;
    expect(listScrolled(area)).toBe(false);
    touch(area, "touchstart", 100);
    expect(touch(area, "touchmove", 400).defaultPrevented).toBe(true);
    touch(area, "touchend", 400);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("is a phone's gesture: a wide screen pulls nothing", () => {
    const original = window.matchMedia;
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    try {
      const onRefresh = vi.fn(() => Promise.resolve());
      render(<Page onRefresh={onRefresh} />);
      const area = screen.getByTestId("area");
      touch(area, "touchstart", 100);
      expect(touch(area, "touchmove", 400).defaultPrevented).toBe(false);
      touch(area, "touchend", 400);
      expect(onRefresh).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });

  it("leaves a pull that starts in a drawer inside the page to the drawer", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Page onRefresh={onRefresh} />);
    const drawer = screen.getByTestId("drawer");
    touch(drawer, "touchstart", 100);
    expect(touch(drawer, "touchmove", 400).defaultPrevented).toBe(false);
    touch(drawer, "touchend", 400);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
