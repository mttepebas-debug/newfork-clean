import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldNote, fieldNoteId } from "./FieldNote";
import { WindowAlert } from "./WindowAlert";

// A message under a field, or at the foot of a window, never moves or squeezes
// anything (Mert 2026-10-17, UI-FIELDMSG). jsdom lays nothing out, so the CSS
// rules are the contract here; the Playwright measurements check the result.
const flat = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const body = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

describe("FieldNote", () => {
  it("keeps a one-line room even with nothing to say", () => {
    const { container } = render(<FieldNote id="f" />);
    const room = container.querySelector(".field-note-room");
    expect(room).toBeTruthy();
    expect(room!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the help, then the error in the help's place", () => {
    const { rerender } = render(<FieldNote id="f" help="Shown on the schedule." />);
    expect(document.getElementById("f-help")!.textContent).toBe("Shown on the schedule.");
    expect(fieldNoteId("f", null, "Shown on the schedule.")).toBe("f-help");

    rerender(<FieldNote id="f" help="Shown on the schedule." error="Enter a name." />);
    const alert = screen.getByRole("alert");
    expect(alert.id).toBe("f-error");
    expect(alert.textContent).toBe("Enter a name.");
    // The help keeps its room but is no longer shown nor read.
    expect(document.getElementById("f-help")).toBeNull();
    const hiddenHelp = document.querySelector(".field-note-hidden");
    expect(hiddenHelp?.textContent).toBe("Shown on the schedule.");
    expect(hiddenHelp?.getAttribute("aria-hidden")).toBe("true");
    expect(fieldNoteId("f", "Enter a name.", "Shown on the schedule.")).toBe("f-error");
  });

  it("puts a long error's whole text in its title and cuts it to one line", () => {
    const long = "Use US letters only: replace ç, ğ, ı, İ, ö, ş and ü with c, g, i, I, o, s and u.";
    render(<FieldNote id="f" error={long} />);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("title")).toBe(long);
    expect(alert.classList.contains("is-one-line")).toBe(true);
  });

  it("keeps two lines for a whole form's error and cuts it after them", () => {
    const { container } = render(<FieldNote id="f" lines={2} error="The server said no." />);
    expect(container.querySelector(".field-note-room br")).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert.classList.contains("is-two-lines")).toBe(true);
    expect(alert.getAttribute("title")).toBe("The server said no.");
    const css = flat("src/shell/field-note.css");
    expect(body(css, ".field-note > small.is-two-lines")).toMatch(/-webkit-line-clamp: 2/);
  });

  it("lets an error wrap only inside a kept reserve", () => {
    render(<FieldNote id="f" error="Too long" reserve="The longest thing it can say" />);
    expect(screen.getByRole("alert").classList.contains("is-one-line")).toBe(false);
  });

  it("stacks every line in one grid cell and cuts the one-line error with an ellipsis", () => {
    const css = flat("src/shell/field-note.css");
    expect(body(css, ".field-note")).toMatch(/display: grid/);
    expect(body(css, ".field-note > small")).toMatch(/grid-area: 1 \/ 1/);
    const oneLine = body(css, ".field-note > small.is-one-line");
    expect(oneLine).toMatch(/white-space: nowrap/);
    expect(oneLine).toMatch(/text-overflow: ellipsis/);
    expect(oneLine).toMatch(/overflow: hidden/);
  });
});

describe("WindowAlert", () => {
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
    expect(body(css, ".window-alert-slot > .window-alert")).toMatch(/bottom: 0/);
  });

  it("sits over the body's bottom edge, out of the flow, on its anchor", () => {
    const css = flat("src/shell/window-alert.css");
    const band = body(css, ".window-alert");
    expect(band).toMatch(/position: absolute/);
    expect(band).toMatch(/bottom: 100%/);
    expect(band).toMatch(/var\(--theme-/);
    expect(band).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(css).toMatch(/:where\(:has\(> \.window-alert\)\) \{ position: relative; \}/);
  });
});
