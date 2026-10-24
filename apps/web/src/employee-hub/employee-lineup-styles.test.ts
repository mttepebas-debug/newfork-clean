import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/employee-hub/employee-lineup.css", "utf8");

function mediaBlock(query: string): string {
  const start = styles.indexOf(`@media ${query} {`);
  if (start < 0) return "";
  let depth = 0;
  for (let index = styles.indexOf("{", start); index < styles.length; index += 1) {
    if (styles[index] === "{") depth += 1;
    if (styles[index] === "}" && --depth === 0) return styles.slice(start, index + 1);
  }
  return "";
}

// Mert 2026-10-23: on a desktop everything under My shifts · Team schedule · Lineup stands in the middle of the
// page, as on the manager's Lineup; the page tabs stay where they are.
describe("employee lineup styles", () => {
  it("centres the day and the lineup on a desktop page", () => {
    const desktop = mediaBlock("(min-width: 721px)");

    expect(desktop).toMatch(
      /\.employee-lineup-page > :is\(\.employee-lineup-day, \.employee-lineup\)\s*\{[^}]*margin-inline: auto;/,
    );
  });

  // Mert 2026-10-23: centred on the whole screen like My shifts (employee-my-shifts.css), so going from My shifts
  // to Lineup the page doesn't move sideways; the 560 px column keeps inside the page box where the screen is narrow.
  it("centres the day and the lineup on the whole screen in a held page, like My shifts", () => {
    const desktop = mediaBlock("(min-width: 721px)");

    expect(desktop).toContain(
      '.app-shell[data-content-held="true"] > .app-main > .employee-hub-page > .employee-lineup-page > :is(.employee-lineup-day, .employee-lineup) {\n' +
        "    margin-left: clamp(0px, 50vw - var(--app-sidebar-width) - var(--app-page-gutter-start) - 280px, 100% - 560px);",
    );
  });
});
