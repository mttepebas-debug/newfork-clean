import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Availability keeps its heading, tabs, filters and day headings in place;
// only the people scroll, inside the table frame (Mert 2026-10-13).
describe("Availability frozen heading", () => {
  const css = readFileSync("src/availability/weekly-team.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const media = "@media (min-height: 560px) {";
  const start = css.indexOf(media);
  const block = start < 0 ? "" : css.slice(start + media.length);
  const body = (selector: string) =>
    [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, head]) => head!.trim() === selector)
      .map(([, , rule]) => rule!)
      .join(";");

  it("fills the main area so the page itself never scrolls", () => {
    const page = body(".availability-page.weekly-team-page");
    expect(page).toMatch(/display\s*:\s*flex/);
    expect(page).toMatch(/flex-direction\s*:\s*column/);
    expect(page).toMatch(/height\s*:\s*100%/);
  });

  it("scrolls the list inside the table frame", () => {
    const frame = body(".availability-page.weekly-team-page > .weekly-team-scroll");
    expect(frame).toMatch(/overflow\s*:\s*auto/);
    expect(frame).toMatch(/min-height\s*:\s*0/);
    expect(frame).toMatch(/flex\s*:\s*0 1 auto/);
  });

  it("pins the day headings to the top of the frame", () => {
    const heading = body(".weekly-team-table thead th");
    expect(heading).toMatch(/position\s*:\s*sticky/);
    expect(heading).toMatch(/top\s*:\s*0/);
  });
});
