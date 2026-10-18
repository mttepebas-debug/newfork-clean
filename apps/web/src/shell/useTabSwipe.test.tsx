import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDGE_BAND, swipeStep, useTabSwipe } from "./useTabSwipe";

// KARARLAR §1.5 (Mert 2026-10-17): on a phone, a sideways swipe on a tabbed page's content moves to the
// next or previous tab and stops at the ends. jsdom has no real touch, so these send the touch events a
// finger sends; e2e/flows/tab-swipe.spec.ts swipes a real touch screen in Chrome.
const TABS = ["one", "two", "three"] as const;

function Page({ onSelect }: { onSelect?: (tab: string) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("one");
  const swipe = useTabSwipe({
    tabs: TABS,
    active: tab,
    onSelect: (next) => {
      onSelect?.(next);
      setTab(next);
    },
  });
  return (
    <section ref={swipe.root} data-testid="page">
      <div role="tablist" aria-label="Pages" ref={swipe.tabs}>
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {key}
          </button>
        ))}
      </div>
      <div role="tabpanel" data-testid="panel">
        <p data-testid="text">Panel {tab}</p>
        <input aria-label="Name" />
        <input aria-label="Start" type="date" />
        <select aria-label="Requested time" />
        <div role="group" aria-label="Day" data-testid="wheel" />
        <div role="dialog" aria-label="Sheet" data-testid="sheet" />
      </div>
    </section>
  );
}

let now = 0;
function swipe(target: Element, from: [number, number], to: [number, number], ms = 200) {
  fireEvent.touchStart(target, { touches: [{ clientX: from[0], clientY: from[1] }] });
  fireEvent.touchMove(target, { touches: [{ clientX: to[0], clientY: to[1] }] });
  now += ms;
  fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: to[0], clientY: to[1] }] });
}
const selected = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")!.textContent;

describe("the swipe itself", () => {
  it("is a quick, mostly sideways move longer than 56 px", () => {
    expect(swipeStep(-80, 10, 200)).toBe(1);
    expect(swipeStep(80, -10, 200)).toBe(-1);
    expect(swipeStep(-50, 0, 200)).toBe(0);
    expect(swipeStep(-80, 60, 200)).toBe(0);
    expect(swipeStep(-80, 0, 1000)).toBe(0);
  });
});

describe("a tabbed page on a phone", () => {
  const phone = (matches: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width") ? matches : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    phone(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("moves to the next tab on a swipe left and back on a swipe right", () => {
    render(<Page />);
    swipe(screen.getByTestId("text"), [300, 400], [200, 410]);
    expect(selected()).toBe("two");
    swipe(screen.getByTestId("text"), [300, 400], [200, 410]);
    expect(selected()).toBe("three");
    swipe(screen.getByTestId("text"), [100, 400], [220, 400]);
    expect(selected()).toBe("two");
  });

  it("stops at the ends instead of going round", () => {
    const onSelect = vi.fn();
    render(<Page onSelect={onSelect} />);
    swipe(screen.getByTestId("text"), [100, 400], [220, 400]);
    expect(selected()).toBe("one");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("leaves a scroll, a slow drag and a short nudge alone", () => {
    render(<Page />);
    swipe(screen.getByTestId("text"), [300, 400], [260, 200]);
    swipe(screen.getByTestId("text"), [300, 400], [200, 400], 1200);
    swipe(screen.getByTestId("text"), [300, 400], [270, 400]);
    expect(selected()).toBe("one");
  });

  it("leaves what moves sideways on its own: the tabs, a text box, a group like the day wheel, a sheet", () => {
    render(<Page />);
    for (const target of [screen.getAllByRole("tab")[0]!, screen.getByLabelText("Name"), screen.getByTestId("wheel"), screen.getByTestId("sheet")])
      swipe(target, [300, 400], [150, 400]);
    expect(selected()).toBe("one");
  });

  it("still changes the tab across a date or a choice box, which have no caret to drag", () => {
    render(<Page />);
    swipe(screen.getByLabelText("Start"), [300, 400], [150, 400]);
    expect(selected()).toBe("two");
    swipe(screen.getByLabelText("Requested time"), [300, 400], [150, 400]);
    expect(selected()).toBe("three");
  });

  it("leaves a strip that scrolls sideways", () => {
    render(<Page />);
    const strip = screen.getByTestId("text");
    strip.style.overflowX = "auto";
    Object.defineProperty(strip, "scrollWidth", { configurable: true, value: 600 });
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 300 });
    swipe(strip, [300, 400], [150, 400]);
    expect(selected()).toBe("one");
  });

  it("ignores two fingers", () => {
    render(<Page />);
    const text = screen.getByTestId("text");
    fireEvent.touchStart(text, { touches: [{ clientX: 300, clientY: 400 }, { clientX: 320, clientY: 420 }] });
    fireEvent.touchEnd(text, { touches: [], changedTouches: [{ clientX: 150, clientY: 400 }] });
    expect(selected()).toBe("one");
  });

  it("does nothing on a computer", () => {
    phone(false);
    render(<Page />);
    swipe(screen.getByTestId("text"), [300, 400], [150, 400]);
    expect(selected()).toBe("one");
  });

  // Mert 2026-10-17: the browser's swipe back from the screen's edge is off on these pages. iOS Safari only
  // gives way when the touch that starts in the edge band is cancelled; a tap on a control there still works.
  it("keeps the browser's edge swipe back off, but not a tap on a control", () => {
    render(<Page />);
    const edge = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [{ clientX: EDGE_BAND - 4, clientY: 400 } as Touch] });
    screen.getByTestId("text").dispatchEvent(edge);
    expect(edge.defaultPrevented).toBe(true);
    const right = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [{ clientX: window.innerWidth - 4, clientY: 400 } as Touch] });
    screen.getByTestId("text").dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true);
    const middle = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [{ clientX: 200, clientY: 400 } as Touch] });
    screen.getByTestId("text").dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
    const onTab = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [{ clientX: 4, clientY: 400 } as Touch] });
    screen.getAllByRole("tab")[0]!.dispatchEvent(onTab);
    expect(onTab.defaultPrevented).toBe(false);
    expect(document.documentElement.style.overscrollBehaviorX).toBe("none");
  });

  it("gives the edge back when the page goes", () => {
    const { unmount } = render(<Page />);
    unmount();
    const edge = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [{ clientX: 4, clientY: 400 } as Touch] });
    document.body.dispatchEvent(edge);
    expect(edge.defaultPrevented).toBe(false);
    expect(document.documentElement.style.overscrollBehaviorX).toBe("");
  });

  it("slides the new tab in from the side it came from", () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    render(<Page />);
    swipe(screen.getByTestId("text"), [300, 400], [200, 400]);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(screen.getByTestId("panel"));
    expect(animate.mock.calls[0]![0][0].transform).toBe("translateX(26px)");
    swipe(screen.getByTestId("text"), [100, 400], [220, 400]);
    expect(animate.mock.calls[1]![0][0].transform).toBe("translateX(-26px)");
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });
});

// S-152 (Mert 2026-10-17, D): the open tab's line slides to the tab opened. The hook puts where it is on the
// tab row (--tab-line-x, --tab-line-w, data-tab-line); phone-page-tabs.css draws it on a page's own strips.
describe("the open tab's line", () => {
  const BOXES: Record<string, { left: number; width: number }> = { one: { left: 16, width: 60 }, two: { left: 76, width: 50 }, three: { left: 126, width: 70 } };
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const box = this.getAttribute("role") === "tab" ? BOXES[this.textContent ?? ""] : undefined;
      return { left: box?.left ?? 4, width: box?.width ?? 382, top: 0, height: 44, right: 0, bottom: 44, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const row = () => screen.getByRole("tablist");

  it("sits under the open tab and moves with it", () => {
    render(<Page />);
    expect(row().dataset.tabLine).toBe("");
    expect(row().style.getPropertyValue("--tab-line-x")).toBe("12px");
    expect(row().style.getPropertyValue("--tab-line-w")).toBe("60px");
    fireEvent.click(screen.getByRole("tab", { name: "three" }));
    expect(row().style.getPropertyValue("--tab-line-x")).toBe("122px");
    expect(row().style.getPropertyValue("--tab-line-w")).toBe("70px");
  });

  it("starts a new tab row's line where the last row's was, so it slides across (Schedule → Lineup)", () => {
    function Rows() {
      const [tab, setTab] = useState<(typeof TABS)[number]>("one");
      const swipe = useTabSwipe({ tabs: TABS, active: tab, onSelect: setTab });
      return (
        <section ref={swipe.root}>
          <div key={tab} role="tablist" aria-label="Pages" ref={swipe.tabs}>
            {TABS.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {key}
              </button>
            ))}
          </div>
        </section>
      );
    }
    const xs = new Map<CSSStyleDeclaration, string[]>();
    const set = CSSStyleDeclaration.prototype.setProperty;
    vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation(function (this: CSSStyleDeclaration, name, value, priority) {
      if (name === "--tab-line-x") xs.set(this, [...(xs.get(this) ?? []), String(value)]);
      return set.call(this, name, value, priority);
    });
    render(<Rows />);
    const first = row();
    fireEvent.click(screen.getByRole("tab", { name: "two" }));
    expect(row()).not.toBe(first);
    // the new row's line first stands where the old one was, then goes to the open tab
    expect(xs.get(row().style)?.slice(0, 2)).toEqual(["12px", "72px"]);
    expect(row().style.getPropertyValue("--tab-line-x")).toBe("72px");
  });

  it("finds a tab row that comes after the page has loaded (Schedule, Shift hub)", () => {
    function Later({ loaded }: { loaded: boolean }) {
      const swipe = useTabSwipe({ tabs: TABS, active: "two", onSelect: () => undefined });
      return (
        <section ref={swipe.root}>
          {loaded ? (
            <div role="tablist" aria-label="Pages" ref={swipe.tabs}>
              {TABS.map((key) => (
                <button key={key} type="button" role="tab" aria-selected={key === "two"}>
                  {key}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      );
    }
    const { rerender } = render(<Later loaded={false} />);
    rerender(<Later loaded />);
    expect(row().dataset.tabLine).toBe("");
    expect(row().style.getPropertyValue("--tab-line-x")).toBe("72px");
  });

  it("leaves a computer's tab row alone", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    render(<Page />);
    expect(row().dataset.tabLine).toBeUndefined();
  });
});
