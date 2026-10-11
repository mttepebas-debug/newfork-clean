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
});
