import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useDialogFocus } from "./useDialogFocus";

function Window({ onClose }: { readonly onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref);
  return (
    <section ref={ref} role="dialog" aria-modal="true" aria-label="Window">
      <button type="button" onClick={onClose}>Close</button>
      <button type="button" disabled>Off</button>
      <button type="button" data-dialog-autofocus>Continue</button>
    </section>
  );
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open ? <Window onClose={() => setOpen(false)} /> : null}
    </>
  );
}

// BL-711: a Schedule window takes the keyboard when it opens, keeps Tab inside,
// and gives focus back to what opened it.
describe("useDialogFocus", () => {
  it("moves focus in, keeps Tab inside, and returns focus on close", () => {
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const close = screen.getByRole("button", { name: "Close" });
    const next = screen.getByRole("button", { name: "Continue" });
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(next, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);

    fireEvent.click(close);
    expect(document.activeElement).toBe(opener);
  });

  // The Templates window folds its departments under "Only some departments".
  it("lets Tab leave a folded section's summary, and skips what the fold hides", () => {
    function Folded() {
      const ref = useRef<HTMLElement>(null);
      useDialogFocus(ref);
      return (
        <section ref={ref} role="dialog" aria-label="Folded">
          <button type="button">First</button>
          <details>
            <summary>Only some departments</summary>
            <input type="checkbox" aria-label="Hidden choice" />
          </details>
        </section>
      );
    }
    render(<Folded />);
    const first = screen.getByRole("button", { name: "First" });
    const summary = screen.getByText("Only some departments");

    summary.focus();
    // Not the last stop: the browser moves on by itself.
    expect(fireEvent.keyDown(summary, { key: "Tab", shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(summary);

    // Folded away, the checkbox is no stop: Shift+Tab from the start wraps to the summary.
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(summary);
    fireEvent.keyDown(summary, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("leaves Tab to a window opened on top of it", () => {
    function Stacked() {
      const ref = useRef<HTMLElement>(null);
      useDialogFocus(ref);
      return (
        <section ref={ref} role="dialog" aria-label="Under">
          <button type="button">Under button</button>
          <div role="alertdialog" aria-label="On top">
            <button type="button">Top button</button>
          </div>
        </section>
      );
    }
    render(<Stacked />);
    const top = screen.getByRole("button", { name: "Top button" });
    top.focus();

    expect(fireEvent.keyDown(top, { key: "Tab" })).toBe(true);
    expect(document.activeElement).toBe(top);
  });

  it("holds the keyboard on a window with nothing to focus", () => {
    function Empty() {
      const ref = useRef<HTMLElement>(null);
      useDialogFocus(ref);
      return <section ref={ref} role="dialog" aria-label="Empty">Saving…</section>;
    }
    render(<Empty />);
    const dialog = screen.getByRole("dialog", { name: "Empty" });

    expect(document.activeElement).toBe(dialog);
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
  });
});
