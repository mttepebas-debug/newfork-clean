// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatalogRowMenu } from "./CatalogRowMenu";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The row menu is pinned to the window so a scrolling list frame never hides
// it and the frozen toolbar never covers it (Settings → Documents e2e).
function openMenuAt(top: number, windowHeight = 800) {
  render(
    <CatalogRowMenu name="Handbook">
      <button type="button">Publish</button>
      <button type="button">Archive</button>
    </CatalogRowMenu>,
  );
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(windowHeight);
  const summary = screen.getByRole("button", { name: "Actions for Handbook" });
  vi.spyOn(summary, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 32,
    left: 900,
    right: 932,
    width: 32,
    height: 32,
    x: 900,
    y: top,
    toJSON: () => ({}),
  });
  const popover = document.querySelector<HTMLElement>(".job-menu-popover")!;
  vi.spyOn(popover, "offsetHeight", "get").mockReturnValue(80);
  fireEvent.click(summary);
  return { details: document.querySelector("details")!, popover };
}

describe("CatalogRowMenu", () => {
  it("opens below its button, pinned to the window", () => {
    const { details, popover } = openMenuAt(200);
    expect(details.open).toBe(true);
    expect(popover.style.position).toBe("fixed");
    expect(popover.style.top).toBe("234px");
  });

  it("opens above its button when the window has no room below", () => {
    const { popover } = openMenuAt(740);
    expect(popover.style.top).toBe(`${740 - 2 - 80}px`);
  });

  it("closes when the list scrolls, but not when the menu itself scrolls", () => {
    const { details, popover } = openMenuAt(200);
    fireEvent.scroll(popover);
    expect(details.open).toBe(true);
    fireEvent.scroll(document);
    expect(details.open).toBe(false);
  });

  it("closes when the window resizes", () => {
    const { details } = openMenuAt(200);
    fireEvent(window, new Event("resize"));
    expect(details.open).toBe(false);
  });

  it("closes from its button like before", () => {
    const { details } = openMenuAt(200);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Handbook" }));
    expect(details.open).toBe(false);
  });
});
