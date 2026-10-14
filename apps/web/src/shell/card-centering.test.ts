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

describe("no-access card placement", () => {
  const css = flat("src/shell/no-access.css");

  it("turns the page area into a column so the card's auto margins split the free height", () => {
    const area = body(css, ":is(.app-main, .settings-content):has(> .no-access)");
    expect(area).toMatch(/display: flex/);
    expect(area).toMatch(/flex-direction: column/);
    expect(body(css, ":is(.app-main, .settings-content) > .no-access")).toMatch(/margin: auto/);
  });

  it("keeps no scrollbar stripe that would push the card off-center", () => {
    expect(css).toMatch(/\.app-main:has\(> \.no-access, \.settings-content > \.no-access\), \.settings-content:has\(> \.no-access\) \{ scrollbar-gutter: auto;/);
  });

  it("centers on a phone too, edge to edge inside the gutter", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(body(phone, ":is(.app-main, .settings-content) > .no-access")).toMatch(/margin: auto 0/);
  });
});

describe("full load-error card placement", () => {
  const css = flat("src/shell/load-state.css");

  it("centers the card in what is left of a page that holds it", () => {
    const page = body(css, ":is(.app-main, .settings-content) > :has(> .load-error:not(.inset))");
    expect(page).toMatch(/display: flex/);
    expect(page).toMatch(/min-height: 100%/);
    expect(page).toMatch(/flex-direction: column/);
    expect(body(css, ":is(.app-main, .settings-content) > * > .load-error:not(.inset)")).toMatch(/margin-block: auto/);
  });

  it("evens out the page's own top and bottom space when the card is all there is", () => {
    expect(body(css, ":is(.app-main, .settings-content) > :has(> .load-error:not(.inset):only-child)")).toMatch(/padding-block: 24px/);
  });

  it("leaves a card inside a list, drawer or panel where it is", () => {
    expect(css).not.toMatch(/\.load-error\.inset[^{]*\{[^}]*margin-block: auto/);
  });
});
