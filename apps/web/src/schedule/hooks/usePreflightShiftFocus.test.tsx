import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreflightShiftFocus } from "./usePreflightShiftFocus";

const scroll = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
function Harness({ ready = true }: { ready?: boolean }) {
  const [target, setTarget] = useState<string | null>("shift-1");
  usePreflightShiftFocus(target, ready, setTarget);
  return <button data-shift-id="shift-1">Dinner</button>;
}
beforeEach(() => {
  vi.useFakeTimers();
  scroll.mockClear();
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => window.setTimeout(() => callback(0), 0));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
});
afterEach(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("preflight shift focus", () => {
  it("scrolls and focuses the shift without clicking it, then removes the temporary highlight", () => {
    render(<Harness />);
    const target = screen.getByRole("button", { name: "Dinner" });
    const click = vi.fn();
    target.addEventListener("click", click);
    act(() => vi.advanceTimersByTime(1));
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "center", inline: "center" });
    expect(document.activeElement).toBe(target);
    expect(target.classList.contains("schedule-preflight-target")).toBe(true);
    expect(click).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1800));
    expect(target.classList.contains("schedule-preflight-target")).toBe(false);
  });
  it("waits for the edit grid before trying to focus a target", () => {
    const view = render(<Harness ready={false} />);
    act(() => vi.advanceTimersByTime(100));
    expect(scroll).not.toHaveBeenCalled();
    view.rerender(<Harness ready />);
    act(() => vi.advanceTimersByTime(1));
    expect(scroll).toHaveBeenCalledTimes(1);
  });
  it("uses instant scrolling when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<Harness />);
    act(() => vi.advanceTimersByTime(1));
    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "center", inline: "center" });
  });
  it("cancels the pending animation frame on unmount", () => {
    const view = render(<Harness />);
    view.unmount();
    act(() => vi.advanceTimersByTime(2000));
    expect(scroll).not.toHaveBeenCalled();
  });
});
