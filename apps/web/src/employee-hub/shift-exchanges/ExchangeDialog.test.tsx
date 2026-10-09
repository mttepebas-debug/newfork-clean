import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExchangeDialog } from "./ShiftExchangeHub";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("Exchange dialog keyboard boundary", () => {
  it("wraps Tab in both directions and skips disabled actions", () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    render(<ExchangeDialog title="Review transfer" onClose={vi.fn()}>
      <textarea aria-label="Private note" />
      <button type="button">Confirm transfer</button>
      <button type="button" disabled>Unavailable action</button>
    </ExchangeDialog>);
    const close = screen.getByRole("button", { name: "Close dialog", hidden: true });
    const confirm = screen.getByRole("button", { name: "Confirm transfer", hidden: true });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });
});
