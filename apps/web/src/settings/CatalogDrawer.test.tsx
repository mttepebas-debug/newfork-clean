import { render, screen } from "@testing-library/react";
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
