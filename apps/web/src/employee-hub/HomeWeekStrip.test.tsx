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
  posted: true,
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

describe("HomeWeekStrip's days", () => {
  const shift = (id: string, start: string, end: string, color: string | null) => ({
    id,
    location_id: "20000000-0000-4000-8000-000000000001",
    location_name: "Main Dining",
    job_name: "Server",
    note: "",
    employee_id: null,
    scheduled_date: "2026-10-13",
    start_time: start,
    end_time: end,
    shift_type_color: color,
  });

  // Mert 2026-10-24: no hours in the box; a line per shift in its type's colour, as long as the shift, earliest
  // on top; a day off says Off, a day not posted yet shows a dashed line.
  it("draws a line per shift, earliest on top, and tells a day off from one not posted", () => {
    const days = week.map((day) => ({ ...day }));
    days[3] = { ...days[3]!, shifts: [shift("a", "11:00", "15:00", "#3b82f6"), shift("b", "17:00", "23:00", null)] };
    days[4] = { ...days[4]!, posted: false };
    const { container } = render(
      <MemoryRouter>
        <HomeWeekStrip model={model} week={days} today="2026-10-10" />
      </MemoryRouter>,
    );
    const boxes = container.querySelectorAll(".dl-wk-d");
    const lines = boxes[3]!.querySelectorAll<HTMLElement>(".dl-wk-line");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.style.getPropertyValue("--c")).toBe("#3b82f6");
    expect(lines[1]!.style.getPropertyValue("--c")).toBe("");
    expect(Number(lines[0]!.style.getPropertyValue("--w"))).toBeLessThan(Number(lines[1]!.style.getPropertyValue("--w")));
    expect(boxes[3]!.textContent).toBe("Tue13");
    expect(boxes[1]!.textContent).toBe("Sun11Off");
    expect(boxes[4]!.querySelector(".dl-wk-line.is-unposted")).not.toBeNull();
    expect(boxes[4]!.textContent).toBe("Wed14");
    expect(boxes[4]!.getAttribute("aria-label")).toMatch(/schedule not posted yet/);
  });
});
