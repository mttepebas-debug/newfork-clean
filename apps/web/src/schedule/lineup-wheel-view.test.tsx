import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LineupDayPicker, LineupLocationSelect, LineupShiftTabs } from "./lineup-wheel-view";

// The Lineup's day picker, shared by the manager's phone Lineup and the employee's Lineup (Mert 2026-10-17).

configure({ asyncUtilTimeout: 5000 });

const reduce = window.matchMedia;
const ratio = window.devicePixelRatio;
beforeEach(() => {
  // Reduced motion: the wheel jumps instead of spinning, so a test sees where it stops at once.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = reduce;
  Object.defineProperty(window, "devicePixelRatio", { value: ratio, configurable: true });
});

function Picker({ start = "2026-10-14" }: { readonly start?: string }) {
  const [date, setDate] = useState(start);
  return (
    <>
      <LineupDayPicker date={date} today="2026-10-14" onDate={setDate}>
        <span>beside</span>
      </LineupDayPicker>
      <p data-testid="day">{date}</p>
    </>
  );
}

const wheel = () => screen.getByRole("group", { name: "Day. Swipe or use the arrow keys." });

describe("LineupDayPicker", () => {
  it("shows the date row, what sits beside it and the wheel, the day pressed", () => {
    render(<Picker />);
    expect(screen.getByRole("group", { name: "Day" }).parentElement!.textContent).toContain("beside");
    const day = within(wheel()).getByRole("button", { name: "Wednesday, October 14, 2026" });
    expect(day.getAttribute("aria-pressed")).toBe("true");
    expect(day.tabIndex).toBe(0);
    expect(screen.getByRole("button", { name: "Wed, Oct 14" }).getAttribute("data-other-day")).toBeNull();
  });

  it("steps with ‹ ›, turns to a tapped day, and the amber date brings today back", async () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(screen.getByTestId("day").textContent).toBe("2026-10-15"));
    const label = screen.getByRole("button", { name: "Thu, Oct 15" });
    expect(label.getAttribute("data-other-day")).toBe("true");
    fireEvent.click(label);
    await waitFor(() => expect(screen.getByTestId("day").textContent).toBe("2026-10-14"));
    fireEvent.click(within(wheel()).getByRole("button", { name: "Friday, October 16, 2026" }), { detail: 0 });
    await waitFor(() => expect(screen.getByTestId("day").textContent).toBe("2026-10-16"));
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(screen.getByTestId("day").textContent).toBe("2026-10-15"));
  });

  it("turns with the arrow keys and keeps the focus on the day", async () => {
    render(<Picker />);
    fireEvent.keyDown(wheel(), { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByTestId("day").textContent).toBe("2026-10-13"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tuesday, October 13, 2026");
  });

  // Mert 2026-10-21: turning the wheel only looks at other days; a day opens when it is tapped.
  it("turns without opening the day it stops on, and opens a day only when it is tapped", async () => {
    const box = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 390 });
    try {
      render(<Picker />);
      const strip = wheel();
      const before = (strip.firstElementChild as HTMLElement).style.transform;
      // A finger drags the wheel two days along.
      fireEvent.pointerDown(strip, { button: 0, clientX: 300, pointerId: 1 });
      fireEvent.pointerMove(strip, { clientX: 200, pointerId: 1 });
      fireEvent.pointerMove(strip, { clientX: 180, pointerId: 1 });
      fireEvent.pointerUp(strip, { clientX: 180, pointerId: 1 });
      // A touchpad swipe the same.
      fireEvent.wheel(strip, { deltaX: 120 });
      await new Promise((done) => setTimeout(done, 400));
      expect((strip.firstElementChild as HTMLElement).style.transform).not.toBe(before);
      expect(screen.getByTestId("day").textContent).toBe("2026-10-14");
      expect(within(strip).getByRole("button", { name: "Wednesday, October 14, 2026" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "Wed, Oct 14" })).toBeTruthy();
      // A tap on a day opens it.
      const friday = within(strip).getByRole("button", { name: "Friday, October 16, 2026" });
      fireEvent.pointerDown(friday, { button: 0, clientX: 250, pointerId: 2 });
      fireEvent.pointerUp(friday, { clientX: 250, pointerId: 2 });
      await waitFor(() => expect(screen.getByTestId("day").textContent).toBe("2026-10-16"));
    } finally {
      if (box) Object.defineProperty(HTMLElement.prototype, "clientWidth", box);
    }
  });

  // Mert 2026-10-17 ("çözünürlüğü düşük gibi"): a stopped strip sits on whole device pixels with a 2D move.
  it("rests the strip on whole device pixels", () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    const box = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 390 });
    try {
      render(<Picker />);
      const transform = (wheel().firstElementChild as HTMLElement).style.transform;
      const x = Number(/^translateX\((-?[\d.]+)px\)$/.exec(transform)?.[1]);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isInteger(x * 2)).toBe(true);
    } finally {
      if (box) Object.defineProperty(HTMLElement.prototype, "clientWidth", box);
    }
  });

  // Mert 2026-10-21: the desktop's narrow wheel shows fewer days than seven; the day still sits in its middle.
  it("puts the day in the middle of the strip however many days it shows", () => {
    const box = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
    try {
      for (const days of [3, 5, 7]) {
        const { unmount } = render(<LineupDayPicker date="2026-10-14" today="2026-10-14" onDate={() => undefined} days={days} />);
        const track = wheel().firstElementChild as HTMLElement;
        const x = Number(/^translateX\((-?[\d.]+)px\)$/.exec(track.style.transform)?.[1]);
        const cell = 300 / days;
        const at = [...track.children].findIndex((child) => child.getAttribute("aria-pressed") === "true");
        // The pressed day's middle is the strip's middle.
        expect(x + at * cell + cell / 2).toBeCloseTo(150, 0);
        unmount();
      }
    } finally {
      if (box) Object.defineProperty(HTMLElement.prototype, "clientWidth", box);
    }
  });
});

// Mert 2026-10-21: on the desktop the chosen day sits in the middle of the screen, not of the wheel's own box.
describe("LineupDayPicker on the screen's middle", () => {
  it("puts the day under the screen's middle, inside the wheel", () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const rect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this === document.documentElement ? 1000 : 600;
      },
    });
    // The wheel from 300 to 900 px on a 1000 px screen: the screen's middle is 200 px into it.
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const box = this.classList.contains("lineup-wheel") ? { left: 300, width: 600 } : { left: 0, width: 600 / 15 };
      return { ...box, top: 0, right: box.left + box.width, bottom: 46, height: 46, x: box.left, y: 0, toJSON: () => box } as DOMRect;
    };
    try {
      render(<LineupDayPicker date="2026-10-14" today="2026-10-14" onDate={() => undefined} days={15} middle="screen" />);
      const track = wheel().firstElementChild as HTMLElement;
      const x = Number(/^translateX\((-?[\d.]+)px\)$/.exec(track.style.transform)?.[1]);
      const at = [...track.children].findIndex((child) => child.getAttribute("aria-pressed") === "true");
      expect(x + at * 40 + 20).toBeCloseTo(200, 0);
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      HTMLElement.prototype.getBoundingClientRect = rect;
    }
  });
});

describe("LineupShiftTabs", () => {
  it("draws one tab per shift with its head count, the chosen one pressed", () => {
    const chosen: string[] = [];
    render(
      <LineupShiftTabs
        shifts={[
          { key: "lunch", name: "Lunch", color: "#5b4bd6", count: 1 },
          { key: "dinner", name: "Dinner", color: null, count: 0 },
        ]}
        chosen="lunch"
        onChoose={(key) => chosen.push(key)}
      />,
    );
    const group = screen.getByRole("group", { name: "Shifts" });
    const [lunch, dinner] = within(group).getAllByRole("button");
    expect(lunch!.getAttribute("aria-label")).toBe("Lunch, 1 person");
    expect(lunch!.getAttribute("aria-pressed")).toBe("true");
    expect(lunch!.className).toBe("active");
    expect(dinner!.getAttribute("aria-label")).toBe("Dinner, no one");
    fireEvent.click(dinner!);
    expect(chosen).toEqual(["dinner"]);
  });
});

describe("LineupLocationSelect", () => {
  it("lists the locations; nothing without one", () => {
    const { rerender } = render(
      <LineupLocationSelect loading={false} locations={[{ id: "a", name: "Downtown" }]} value="a" onChange={() => undefined} />,
    );
    expect((screen.getByRole("combobox", { name: "Location" }) as HTMLSelectElement).value).toBe("a");
    rerender(<LineupLocationSelect loading={false} locations={[]} value="" onChange={() => undefined} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  // Mert 2026-10-17 (~9:10 AM): with more than one location the list starts with All locations, its value "".
  it("starts with All locations when there is more than one, and gives it back as an empty value", () => {
    const picked: string[] = [];
    const places = [{ id: "a", name: "Downtown" }, { id: "b", name: "Uptown" }];
    const { rerender } = render(
      <LineupLocationSelect loading={false} locations={places} value="" allLabel="All locations" onChange={(id) => picked.push(id)} />,
    );
    const select = screen.getByRole("combobox", { name: "Location" }) as HTMLSelectElement;
    expect([...select.options].map((option) => [option.value, option.text])).toEqual([["", "All locations"], ["a", "Downtown"], ["b", "Uptown"]]);
    expect(select.value).toBe("");
    fireEvent.change(select, { target: { value: "b" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(picked).toEqual(["b", ""]);
    // One location: no All locations.
    rerender(<LineupLocationSelect loading={false} locations={places.slice(0, 1)} value="a" allLabel="All locations" onChange={() => undefined} />);
    expect([...(screen.getByRole("combobox", { name: "Location" }) as HTMLSelectElement).options].map((option) => option.text)).toEqual(["Downtown"]);
  });

  // The select is not the desktop's location card: its text sits in the middle of the box (no card padding).
  it("is its own control, not a location card", () => {
    render(<LineupLocationSelect loading={false} locations={[{ id: "a", name: "Downtown" }]} value="a" onChange={() => undefined} />);
    const select = screen.getByRole("combobox", { name: "Location" });
    expect(select.classList.contains("lineup-location")).toBe(false);
    expect(select.classList.contains("lineup-location-select")).toBe(true);
  });
});
