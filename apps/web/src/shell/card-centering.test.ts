import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A page's no-access card, and a page's full "We couldn't load" card, sit in
// the middle of the page area: the space the menus leave, whatever the screen
// (Mert 2026-10-14). jsdom lays nothing out, so the rules themselves are the
// contract; the 1440 and 390 screenshots check the result.
const flat = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const body = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};
// The selector list of the rule that sets this declaration.
const selectorOf = (css: string, declaration: string) => {
  const at = css.indexOf(declaration);
  expect(at, declaration).toBeGreaterThanOrEqual(0);
  return css.slice(css.lastIndexOf("}", at) + 1, css.lastIndexOf("{", at));
};
const areas = ":is(.app-main, .settings-content, .shift-catalog-panel, .account-main)";

describe("no-access card placement", () => {
  const css = flat("src/shell/no-access.css");
  const phone = css.slice(css.indexOf("@media (max-width: 720px)"));

  it("turns the page area into a column so the card's auto margins split the free height", () => {
    const area = body(css, ":is(.app-main, .settings-content):has(> .no-access)");
    expect(area).toMatch(/display: flex/);
    expect(area).toMatch(/flex-direction: column/);
    expect(body(css, `${areas} > .no-access`)).toMatch(/margin: auto/);
  });

  it("stretches the Shift catalog and Account frames down to the area's bottom", () => {
    const frames = selectorOf(css, "flex: 1 0 auto");
    expect(frames).toContain(".shift-catalog-shell > .shift-catalog-panel:has(> .no-access)");
    expect(frames).toContain(".account-content-scroll > .account-main:has(> .no-access)");
  });

  it("keeps no scrollbar stripe that would push the card off-center", () => {
    const gutter = selectorOf(css, "scrollbar-gutter: auto");
    expect(gutter).toContain(".settings-content > .no-access");
    expect(gutter).toContain(".shift-catalog-panel > .no-access");
    expect(gutter).toContain(".account-content-scroll:has(> .account-main > .no-access)");
  });

  it("centers on a phone too, edge to edge inside the gutter", () => {
    expect(body(phone, `${areas} > .no-access`)).toMatch(/margin: auto 0/);
    expect(body(phone, ".account-layout-grid:has(> .account-content-scroll > .account-main > .no-access)")).toMatch(
      /min-height: 100dvh/,
    );
  });
});

describe("full load-error card placement", () => {
  const css = flat("src/shell/load-state.css");

  it("centers the card in what is left of a page that holds it", () => {
    const page = body(css, ":is(.app-main, .settings-content) > :has(> .load-error:not(.inset))");
    expect(page).toMatch(/display: flex/);
    expect(page).toMatch(/min-height: 100%/);
    expect(page).toMatch(/flex-direction: column/);
    expect(body(css, `${areas} > * > .load-error:not(.inset):last-child`)).toMatch(/margin-block: auto/);
  });

  it("never pushes down what follows the card", () => {
    expect(css).not.toMatch(/\.load-error:not\(\.inset\) \{ margin-block: auto/);
  });

  it("evens out the page's own top and bottom space when the card is all there is", () => {
    expect(body(css, ":is(.app-main, .settings-content) > :has(> .load-error:not(.inset):only-child)")).toMatch(
      /padding-block: 24px/,
    );
  });

  it("covers the Shift catalog and Account frames and drops their scrollbar stripe", () => {
    const frames = selectorOf(css, "flex: 1 0 auto");
    expect(frames).toContain(".shift-catalog-shell > .shift-catalog-panel:has(> * > .load-error:not(.inset):last-child)");
    expect(frames).toContain(".account-content-scroll > .account-main:has(> * > .load-error:not(.inset):last-child)");
    // A list under the card keeps the area's bottom space.
    expect(selectorOf(css, "padding-bottom: 0")).not.toMatch(/\.load-error:not\(\.inset\)\)/);
    const gutter = selectorOf(css, "scrollbar-gutter: auto");
    expect(gutter).toContain(".shift-catalog-panel > * > .load-error:not(.inset)");
    expect(gutter).toContain(".account-content-scroll:has(> .account-main > * > .load-error:not(.inset))");
  });

  it("widens Account's column for the card but keeps its header and tabs at the column's width", () => {
    const column = ".account-content-scroll > .account-main:has(> * > .load-error:not(.inset):last-child)";
    expect(body(css, column)).toMatch(/max-width: none/);
    expect(body(css, `${column} > * > :not(.load-error)`)).toMatch(/max-width: 720px/);
  });

  it("leaves a card inside a list, drawer or panel where it is", () => {
    expect(css).not.toMatch(/\.load-error\.inset[^{]*\{[^}]*margin-block: auto/);
  });
});
