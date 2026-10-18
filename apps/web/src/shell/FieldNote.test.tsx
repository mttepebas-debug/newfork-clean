import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FieldNote, fieldNoteId } from "./FieldNote";
import { WindowAlert } from "./WindowAlert";

// Mert 2026-10-18 (UI-FIELDMSG-2, replacing S-139's kept line): a field's short
// error goes right under it and a window's general or long error in the
// window's band; no room is kept while there is nothing to say; a message is
// always said whole, never cut with "…". jsdom lays nothing out, so the CSS
// rules are the contract here; the Playwright measurements check the result.
const flat = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const body = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

describe("FieldNote", () => {
  it("takes no room at all with nothing to say", () => {
    const { container } = render(<FieldNote id="f" />);
    // Nothing rendered: the empty note adds zero height under its field.
    expect(container.childElementCount).toBe(0);
    expect(container.innerHTML).toBe("");
    const { container: blank } = render(<FieldNote id="g" help="" error={null} />);
    expect(blank.innerHTML).toBe("");
  });

  it("says the help, then the error in the help's place", () => {
    const { rerender } = render(<FieldNote id="f" help="Shown on the schedule." />);
    expect(document.getElementById("f-help")!.textContent).toBe("Shown on the schedule.");
    expect(fieldNoteId("f", null, "Shown on the schedule.")).toBe("f-help");

    rerender(<FieldNote id="f" help="Shown on the schedule." error="Enter a name." />);
    const alert = screen.getByRole("alert");
    expect(alert.id).toBe("f-error");
    expect(alert.textContent).toBe("Enter a name.");
    // The help is gone, not kept unseen for its room.
    expect(document.getElementById("f-help")).toBeNull();
    expect(document.body.textContent).not.toContain("Shown on the schedule.");
    expect(document.querySelector("[aria-hidden='true']")).toBeNull();
    expect(fieldNoteId("f", "Enter a name.", "Shown on the schedule.")).toBe("f-error");
  });

  it("says a long error whole: no cut class, no title-only text", () => {
    const long = "Use US letters only: replace ç, ğ, ı, İ, ö, ş and ü with c, g, i, I, o, s and u.";
    render(<FieldNote id="f" error={long} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(long);
    expect(alert.getAttribute("title")).toBeNull();
    expect(alert.className).not.toMatch(/is-one-line|is-two-lines|field-note-room|field-note-hidden/);
  });

  it("wraps and never cuts in its CSS", () => {
    const css = flat("src/shell/field-note.css");
    expect(css).not.toMatch(/text-overflow|line-clamp|white-space: nowrap|field-note-room|visibility: hidden/);
    expect(body(css, ".field-note > small")).toMatch(/overflow-wrap: anywhere/);
  });
});

describe("WindowAlert", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says nothing while there is nothing to say", () => {
    const { container } = render(<WindowAlert message={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("is an alert band with its text", () => {
    render(<WindowAlert message="We couldn't publish this lineup." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("We couldn't publish this lineup.");
    expect(alert.classList.contains("window-alert")).toBe(true);
  });

  it("says a held state politely while there is no error, and the error over it", () => {
    const { rerender } = render(<WindowAlert message={null} status="Pick a location first." />);
    expect(screen.getByRole("status").textContent).toBe("Pick a location first.");
    rerender(<WindowAlert message="Couldn't save." status="Pick a location first." />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Couldn't save.");
  });

  it("keeps a zero-height slot between body and footer, said or not", () => {
    const { container, rerender } = render(<WindowAlert message={null} between />);
    const slot = container.querySelector(".window-alert-slot");
    expect(slot).toBeTruthy();
    expect(slot!.childElementCount).toBe(0);
    rerender(<WindowAlert message="Couldn't save." between />);
    expect(container.querySelector(".window-alert-slot > .window-alert")?.textContent).toBe("Couldn't save.");
    const css = flat("src/shell/window-alert.css");
    expect(body(css, ".window-alert-slot")).toMatch(/height: 0/);
    expect(body(css, ".window-alert-slot > .window-alert[role]")).toMatch(/bottom: 0/);
  });

  it("sits over the body's bottom edge, full width, wrapping, never cut", () => {
    const css = flat("src/shell/window-alert.css");
    const band = body(css, ".window-alert[role]");
    expect(band).toMatch(/position: absolute/);
    expect(band).toMatch(/bottom: 100%/);
    expect(band).toMatch(/left: 0/);
    expect(band).toMatch(/right: 0/);
    expect(band).toMatch(/white-space: normal/);
    expect(band).not.toMatch(/text-overflow: ellipsis|line-clamp/);
    expect(band).toMatch(/var\(--theme-/);
    expect(band).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(css).toMatch(/:where\(:has\(> \.window-alert\)\) \{ position: relative; \}/);
  });

  function bandHeight(height: number) {
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("window-alert") ? ({ height } as DOMRect) : real.call(this);
    });
  }

  it("gives a scrolling body room below its last control, and takes it back", () => {
    bandHeight(40);
    const window = (message: string | null) => (
      <section>
        <div data-testid="body" style={{ overflowY: "auto", paddingBottom: "12px" }}>
          <textarea aria-label="Reason" />
        </div>
        <footer>
          <WindowAlert message={message} />
        </footer>
      </section>
    );
    const { rerender, getByTestId } = render(window(null));
    const scroller = getByTestId("body");
    expect(scroller.style.paddingBottom).toBe("12px");
    rerender(window("This swap couldn't be accepted."));
    expect(scroller.style.paddingBottom).toBe("52px");
    expect(scroller.style.scrollPaddingBottom).toBe("40px");
    rerender(window(null));
    expect(scroller.style.paddingBottom).toBe("12px");
    expect(scroller.style.scrollPaddingBottom).toBe("");
  });

  it("grows a short window whose body doesn't scroll, between or in the footer", () => {
    bandHeight(30);
    const window = (message: string | null) => (
      <section>
        <button type="button" data-testid="last" style={{ marginBottom: "4px" }}>
          Ask staff to acknowledge
        </button>
        <WindowAlert between message={message} />
        <footer>Publish</footer>
      </section>
    );
    const { rerender, getByTestId } = render(window("We couldn't publish this lineup."));
    const last = getByTestId("last");
    expect(last.style.marginBottom).toBe("34px");
    expect(last.style.paddingBottom).toBe("");
    rerender(window(null));
    expect(last.style.marginBottom).toBe("4px");
  });
});
