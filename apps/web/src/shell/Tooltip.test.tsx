import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tooltip } from "./Tooltip";

function renderTooltip() {
  render(
    <Tooltip label="Location" content="Besiktas">
      <span aria-hidden="true">pin</span>
    </Tooltip>,
  );
  return screen.getByRole("button", { name: "Location" });
}

// jsdom has no PointerEvent; React reads a leave from the "out" event.
function pointerLeave(element: Element, pointerType: string) {
  const event = new Event("pointerout", { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    relatedTarget: { value: document.body },
  });
  fireEvent(element, event);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Tooltip", () => {
  it("stays open while the pointer moves from the trigger onto the bubble", () => {
    vi.useFakeTimers();
    const trigger = renderTooltip();

    fireEvent.mouseEnter(trigger);
    const bubble = screen.getByRole("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(bubble.id);

    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(bubble);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip").textContent).toBe("Besiktas");

    fireEvent.mouseLeave(bubble);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on a tap and closes on the next tap", () => {
    const trigger = renderTooltip();

    fireEvent.pointerDown(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip").textContent).toBe("Besiktas");

    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  // BL-207: a press dragged off the trigger never clicks; the next keyboard
  // focus must still open the bubble.
  it.each([
    ["dragged off", (trigger: HTMLElement) => pointerLeave(trigger, "mouse")],
    ["cancelled", (trigger: HTMLElement) => fireEvent.pointerCancel(trigger)],
  ])("opens on keyboard focus after a press %s without a click", (_, endPress) => {
    const trigger = renderTooltip();

    fireEvent.pointerDown(trigger);
    endPress(trigger);
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip").textContent).toBe("Besiktas");
  });

  // A finger lifts (pointerup, pointerleave) before the browser focuses and clicks.
  it("still opens on a tap, where the touch leaves before focus and click", () => {
    const trigger = renderTooltip();

    fireEvent.pointerDown(trigger);
    fireEvent.pointerUp(trigger);
    pointerLeave(trigger, "touch");
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip").textContent).toBe("Besiktas");
  });

  it("opens on keyboard focus and closes on Escape", () => {
    const trigger = renderTooltip();

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
