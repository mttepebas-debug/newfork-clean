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
});
