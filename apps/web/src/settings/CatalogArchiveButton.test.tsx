// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatalogArchiveButton, CatalogRowMenu } from "./CatalogRowMenu";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderMenu(archived: boolean, onToggle = vi.fn()) {
  render(
    <CatalogRowMenu name="Prep">
      <CatalogArchiveButton archived={archived} name="Prep" onToggle={onToggle} />
    </CatalogRowMenu>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions for Prep" }));
  return onToggle;
}

describe("CatalogArchiveButton (BL-595)", () => {
  it("archives on the second click and keeps the menu open after the first", () => {
    const onToggle = renderMenu(false);
    const details = document.querySelector("details")!;
    details.setAttribute("open", "");
    fireEvent.click(screen.getByRole("button", { name: "Archive Prep" }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(details.hasAttribute("open")).toBe(true);
    const confirm = screen.getByRole("button", { name: "Confirm archive Prep" });
    expect(confirm.dataset.confirming).toBe("true");
    fireEvent.click(confirm);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("treats a double click as one gesture", () => {
    const onToggle = renderMenu(false);
    const button = screen.getByRole("button", { name: "Archive Prep" });
    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("disarms on Escape and after a pause", () => {
    vi.useFakeTimers();
    const onToggle = renderMenu(false);
    fireEvent.click(screen.getByRole("button", { name: "Archive Prep" }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Confirm archive Prep" }),
      { key: "Escape" },
    );
    expect(screen.getByRole("button", { name: "Archive Prep" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive Prep" }));
    act(() => vi.advanceTimersByTime(3300));
    expect(screen.getByRole("button", { name: "Archive Prep" })).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("restores on one click", () => {
    const onToggle = renderMenu(true);
    fireEvent.click(screen.getByRole("button", { name: "Restore Prep" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
