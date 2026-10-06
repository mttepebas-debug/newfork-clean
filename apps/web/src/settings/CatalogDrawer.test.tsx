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
