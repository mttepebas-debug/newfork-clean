import type { EmployeeHubReadModel } from "@newfork/shared";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeWeekStrip } from "./HomeWeekStrip";
import type { HomeDay } from "./home-model";

const model = { settings: { time_format: "12h" } } as EmployeeHubReadModel;
const week: HomeDay[] = ["10", "11", "12", "13", "14", "15", "16"].map((day, index) => ({
  date: `2026-10-${day}`,
  weekday: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][index]!,
  day: Number(day),
  shifts: [],
  hours: 0,
  timeOff: false,
  open: 0,
}));

// jsdom has no PointerEvent or Touch: a mouse event under the pointer's name, and a cancelable touchmove
// carrying where the finger is.
const pointer = (target: Element, type: string, clientX: number, clientY = 100) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  act(() => void target.dispatchEvent(event));
};
const touchMove = (target: Element, clientX: number, clientY: number) => {
  const event = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: [{ clientX, clientY }] });
  act(() => void target.dispatchEvent(event));
  return event;
};

describe("HomeWeekStrip on a touch screen", () => {
  afterEach(() => vi.useRealTimers());

  // Mert 2026-10-24: pressing a day and sliding the finger moved the page on an iPhone instead of the preview.
  // The strip lets the page pan up and down (touch-action: pan-y), so Safari scrolled on the slide's slightest
  // vertical part and cancelled the gesture. Once the strip owns the gesture, it keeps the touch from scrolling.
  it("keeps a held day's slide from scrolling the page", () => {
    vi.useFakeTimers();
    const { container } = render(
      <MemoryRouter>
        <HomeWeekStrip model={model} week={week} today="2026-10-10" />
      </MemoryRouter>,
    );
    const strip = container.querySelector(".dl-wk")!;
    pointer(strip.children[1]!, "pointerdown", 60);
    act(() => void vi.advanceTimersByTime(400));
    expect(container.querySelector(".dl-wk.is-scrubbing")).not.toBeNull();
    expect(touchMove(strip, 80, 108).defaultPrevented).toBe(true);
  });

  it("keeps a sideways slide from scrolling the page, and leaves an upward swipe to it", () => {
    const { container } = render(
      <MemoryRouter>
        <HomeWeekStrip model={model} week={week} today="2026-10-10" />
      </MemoryRouter>,
    );
    const strip = container.querySelector(".dl-wk")!;
    pointer(strip.children[1]!, "pointerdown", 60);
    expect(touchMove(strip, 72, 103).defaultPrevented).toBe(true);
    pointer(strip, "pointerup", 72);

    pointer(strip.children[1]!, "pointerdown", 60);
    expect(touchMove(strip, 62, 80).defaultPrevented).toBe(false);
  });
});
