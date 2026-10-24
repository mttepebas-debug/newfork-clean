import { fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { TOAST_LAYER_ATTRIBUTE } from "../shell/toastLayer";
import { CatalogDrawer } from "./CatalogDrawer";

// jsdom keeps `inert` as a property only, so walk up and read it.
function inert(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.inert) return true;
  }
  return false;
}

describe("CatalogDrawer", () => {
  it("leaves the toast layer live while the rest of the page goes inert (BL-515)", () => {
    render(
      <>
        <button type="button">Page button</button>
        {createPortal(
          <div {...{ [TOAST_LAYER_ATTRIBUTE]: "" }}>
            <button type="button">Undo</button>
          </div>,
          document.body,
        )}
        <CatalogDrawer label="Time off request" onClose={vi.fn()}>
          <button type="button">Deny</button>
        </CatalogDrawer>
      </>,
    );

    expect(inert(screen.getByText("Undo"))).toBe(false);
    expect(inert(screen.getByText("Page button"))).toBe(true);
  });
});

describe("CatalogDrawer keyboard (BL-960)", () => {
  // jsdom lays nothing out; give every element a box so it counts as shown.
  function withLayout() {
    return vi
      .spyOn(HTMLElement.prototype, "getClientRects")
      .mockReturnValue([{}] as unknown as DOMRectList);
  }

  function renderPicker() {
    render(
      <CatalogDrawer label="Important date" onClose={vi.fn()}>
        <input aria-label="Title" />
        <details>
          <summary aria-label="Select locations">All locations</summary>
          <label>
            <input type="checkbox" /> Downtown
          </label>
        </details>
        <input aria-label="Starts" />
        <button type="button">Save</button>
      </CatalogDrawer>,
    );
  }

  it("lets Tab leave a summary for the next field instead of wrapping to the top", () => {
    const layout = withLayout();
    renderPicker();
    const summary = screen.getByLabelText("Select locations");
    summary.focus();

    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    summary.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(summary);
    layout.mockRestore();
  });

  it("lets Shift+Tab leave a summary for the field before it", () => {
    const layout = withLayout();
    renderPicker();
    const summary = screen.getByLabelText("Select locations");
    summary.focus();

    const back = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    summary.dispatchEvent(back);

    expect(back.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(summary);
    layout.mockRestore();
  });

  it("still wraps from Save to Title, skipping what a closed picker folds away", () => {
    const layout = withLayout();
    renderPicker();
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();

    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    save.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));

    const back = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    screen.getByLabelText("Title").dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(save);
    layout.mockRestore();
  });

  it("does not count a closed picker's options as the last stop", () => {
    const layout = withLayout();
    render(
      <CatalogDrawer label="Important date" onClose={vi.fn()}>
        <input aria-label="Title" />
        <details>
          <summary aria-label="Select locations">All locations</summary>
          <input type="checkbox" aria-label="Downtown" />
        </details>
      </CatalogDrawer>,
    );
    const summary = screen.getByLabelText("Select locations");
    summary.focus();

    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    summary.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
    layout.mockRestore();
  });
});

// Documents (K1, A2 Tur 6): the double click that opened the drawer must not close it on the dim.
describe("CatalogDrawer backdrop grace", () => {
  function dim() {
    return document.querySelector<HTMLElement>(".catalog-drawer-backdrop")!;
  }
  it("closes on the dim at once when no grace is asked for", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const onClose = vi.fn();
    render(
      <CatalogDrawer label="Review time off" onClose={onClose}>
        <button type="button">Approve</button>
      </CatalogDrawer>,
    );
    fireEvent.pointerDown(dim());
    expect(onClose).toHaveBeenCalledOnce();
    now.mockRestore();
  });
  it("ignores the dim for the grace after opening, then closes on it", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const onClose = vi.fn();
    render(
      <CatalogDrawer label="Maria Lopez · Food Handler Card" onClose={onClose} backdropGrace={500}>
        <button type="button">Save</button>
      </CatalogDrawer>,
    );
    now.mockReturnValue(1200);
    fireEvent.pointerDown(dim());
    now.mockReturnValue(1499);
    fireEvent.pointerDown(dim());
    expect(onClose).not.toHaveBeenCalled();
    now.mockReturnValue(1500);
    fireEvent.pointerDown(dim());
    expect(onClose).toHaveBeenCalledOnce();
    now.mockRestore();
  });
  it("never closes on a press inside the drawer", () => {
    const onClose = vi.fn();
    render(
      <CatalogDrawer label="Maria Lopez · Food Handler Card" onClose={onClose} backdropGrace={500}>
        <button type="button">Save</button>
      </CatalogDrawer>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Save" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// Documents (K1 fix pass): closed on its press, the dim is gone before a touch tap fires its click, which then
// lands on whatever lay under the dim (the top bar's workspace switcher, the Employee drawer's X). Opted in, the dim
// closes on its own click instead: the press only arms it, so the tap's click still meets the dim.
describe("CatalogDrawer closing on the dim's click", () => {
  function dim() {
    return document.querySelector<HTMLElement>(".catalog-drawer-backdrop")!;
  }
  function renderDrawer(extra: { busy?: boolean; backdropGrace?: number } = {}) {
    const onClose = vi.fn();
    render(
      <CatalogDrawer label="Maria Lopez · Food Handler Card" onClose={onClose} closeOnDimClick {...extra}>
        <button type="button">Save</button>
      </CatalogDrawer>,
    );
    return onClose;
  }
  it("stays open through the press and closes on the click", () => {
    const onClose = renderDrawer();
    const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    dim().dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dim());
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("never closes on a click that was not pressed on the dim (a drag out of the drawer)", () => {
    const onClose = renderDrawer();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(dim());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dim());
    expect(onClose).not.toHaveBeenCalled();
  });
  it("keeps the grace and the busy refusal on the click", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    try {
      const onClose = renderDrawer({ backdropGrace: 500 });
      now.mockReturnValue(1200);
      fireEvent.pointerDown(dim());
      fireEvent.click(dim());
      expect(onClose).not.toHaveBeenCalled();
      now.mockReturnValue(1500);
      fireEvent.pointerDown(dim());
      fireEvent.click(dim());
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      now.mockRestore();
    }
  });
  it("refuses while busy", () => {
    const onClose = renderDrawer({ busy: true });
    fireEvent.pointerDown(dim());
    fireEvent.click(dim());
    expect(onClose).not.toHaveBeenCalled();
  });
  it("leaves other drawers closing on the press", () => {
    const onClose = vi.fn();
    render(
      <CatalogDrawer label="Review time off" onClose={onClose}>
        <button type="button">Approve</button>
      </CatalogDrawer>,
    );
    fireEvent.pointerDown(dim());
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(dim());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
