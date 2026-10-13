import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/views/announcements-catalog.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// On a phone the list reached neither edge: 46 px on each side, cards squeezed
// their titles (Mert 2026-10-13, "sağa sola dayansın").
describe("Announcements on a phone", () => {
  it("runs the page to both edges with the 16 px gutter", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 720px)"));
    const page = /\.announcements-page\.list-page\.list-page\s*\{([^}]*)\}/.exec(phone)?.[1] ?? "";
    expect(page).toMatch(/margin-inline\s*:\s*0/);
    expect(page).toMatch(/padding-inline\s*:\s*16px/);
    expect(page).toMatch(/width\s*:\s*auto/);
  });
});
