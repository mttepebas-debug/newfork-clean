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

  // BL-308: a control that cannot be used says why, to everyone.
  it("describes its trigger before the bubble opens, so a screen reader hears it on arrival", () => {
    renderTooltip();

    expect(screen.getByRole("button", { name: "Location", description: "Besiktas" })).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("can wear another control's look and carry its attributes", () => {
    render(
      <Tooltip unstyled label="Publish" content="Save a draft first." className="publish" aria-disabled="true" data-tone="none">
        Publish
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Publish" });
    expect(trigger.className).toBe("publish");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.getAttribute("data-tone")).toBe("none");
  });

  it("opens under a trigger at the top of the window and stays inside its sides", () => {
    const trigger = renderTooltip();
    const at = (rect: Partial<DOMRect>) => {
      trigger.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, width: 0, ...rect }) as DOMRect;
      fireEvent.mouseEnter(trigger);
      return screen.getByRole("tooltip");
    };

    // Top bar, right edge of a 1024px window: no room above, none to the right.
    const high = at({ top: 8, bottom: 42, left: 980, width: 40 });
    expect(high.dataset.placement).toBe("below");
    expect(high.style.top).toBe("48px");
    expect(high.style.left).toBe(`${window.innerWidth - 128}px`);

    const low = at({ top: 300, bottom: 320, left: 400, width: 20 });
    expect(low.dataset.placement).toBe("above");
    expect(low.style.top).toBe("294px");
    expect(low.style.left).toBe("410px");
  });

  it("opens on keyboard focus and closes on Escape", () => {
    const trigger = renderTooltip();

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
