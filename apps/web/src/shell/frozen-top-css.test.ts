import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every screen keeps its heading and tabs in place (Mert 2026-10-16). jsdom
// lays nothing out, so these read the sheets and the wiring; the scrolling
// itself is e2e/flows/frozen-header.spec.ts.
const sheet = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ruleBody = (css: string, head: (selector: string) => boolean) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => head(selector!.replace(/\s+/g, " ").trim()))
    .map(([, , body]) => body)
    .join(";");

describe("frozen top", () => {
  const css = sheet("src/shell/frozen-top.css");

  it("sticks each piece where it rests, only in a window at least 560 px tall", () => {
    expect(css).toMatch(/@media \(min-height: 560px\)/);
    const piece = ruleBody(css, (head) => head === "[data-frozen-piece][data-frozen-piece]");
    expect(piece).toMatch(/position\s*:\s*sticky/);
    expect(piece).toMatch(/top\s*:\s*var\(--frozen-top/);
    // a piece that folds must not be what the browser anchors the scroll to
    expect(piece).toMatch(/overflow-anchor\s*:\s*none/);
  });

  it("folds the heading only on a phone", () => {
    expect(css).toMatch(/@media \(max-width: 720px\) and \(min-height: 560px\)/);
    // The folded box itself: one 19 px line, the heading line 47 px down (MOBIL-BASLIK).
    const top = sheet("src/shell/phone-page-top.css");
    expect(top).toMatch(/@media \(max-width: 720px\) and \(min-height: 560px\)/);
    expect(ruleBody(top, (head) => head.includes("[data-frozen-folded]") && head.endsWith("h1"))).toMatch(
      /font-size\s*:\s*19px/,
    );
    expect(ruleBody(top, (head) => head.includes("[data-frozen-folded]") && head.endsWith("[data-frozen-piece]"))).toMatch(
      /--page-line\s*:\s*47px/,
    );
    // The title stays on one line, open and folded (the folded rule sets only its size).
    const title = ruleBody(top, (head) => head.endsWith("> :has(h1) h1") && !head.includes("[data-frozen-folded]"));
    expect(title).toMatch(/white-space\s*:\s*nowrap/);
    expect(title).toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(ruleBody(top, (head) => head.includes("[data-frozen-folded]") && head.endsWith("h1"))).not.toMatch(/white-space/);
  });

  it("keeps the page its length while folded, so the content does not jump", () => {
    expect(ruleBody(css, (head) => head.includes('[data-frozen-folded="page"]'))).toMatch(
      /margin-bottom\s*:\s*var\(--frozen-fold-mb/,
    );
  });

  it.each([
    ["src/shell/AppShell.tsx", 'className="app-main" ref={setMain}'],
    ["src/settings/SettingsLayout.tsx", 'className="settings-content" ref={setContent}'],
    ["src/account/AccountLayout.tsx", 'className="account-content-scroll" ref={contentBox}'],
  ])("runs in every scrolling area (%s)", (file, area) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("useFrozenTop(");
    expect(source).toContain(area);
  });

  // Schedule rules' hidden legend and radios lengthened .app-main on a phone,
  // so the Settings menu row scrolled away with the page.
  it("holds what Settings' pages place absolutely", () => {
    expect(ruleBody(sheet("src/styles.css"), (head) => head === ".settings-content")).toMatch(
      /position\s*:\s*relative/,
    );
  });

  it("scrolls only the grid on Employee Hub → Schedule", () => {
    const board = sheet("src/employee-hub/employee-schedule-board.css");
    expect(ruleBody(board, (head) => head === ".employee-hub-page:has(> .employee-schedule-board)")).toMatch(
      /height\s*:\s*100%/,
    );
    const grid = ruleBody(board, (head) => head === ".employee-schedule-board > .schedule-grid-scroll");
    expect(grid).toMatch(/min-height\s*:\s*0/);
    expect(grid).toMatch(/flex\s*:\s*0 1 auto/);
  });
});
