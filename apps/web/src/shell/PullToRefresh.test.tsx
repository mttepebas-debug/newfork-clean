import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PULL_READY, PullToRefreshMark, rubber, usePullToRefresh } from "./PullToRefresh";

function Page({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const anchor = useRef<HTMLDivElement>(null);
  const { state, pull } = usePullToRefresh(anchor, onRefresh);
  return (
    <main className="app-main" data-testid="area">
      <div ref={anchor}>
        <PullToRefreshMark state={state} pull={pull} />
        <p data-testid="state">{state}</p>
        <div data-own-drag="" data-testid="strip" />
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
});
