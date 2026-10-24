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

  // Mert 2026-10-23, A: the middle of the room right of the open menu, the same on My shifts (employee-my-shifts.css),
  // so going from My shifts to Lineup the page doesn't move sideways; the menu folding moves nothing (the page is
  // held); the column keeps inside the page box where the screen is narrow.
  const centre =
    "margin-left: clamp(0px, 50vw - var(--app-sidebar-width) / 2 - var(--app-page-gutter-start) - 350px, 100% - 700px);";

  it("centres the day and the lineup on the room right of the open menu in a held page", () => {
    const desktop = mediaBlock("(min-width: 721px)");

    expect(desktop).toContain(
      '.app-shell[data-content-held="true"] > .app-main > .employee-hub-page > .employee-lineup-page > :is(.employee-lineup-day, .employee-lineup) {\n' +
        `    ${centre}`,
    );
  });

  it("centres My shifts on the same line", () => {
    const myShifts = readFileSync("src/employee-hub/employee-my-shifts.css", "utf8");

    expect(myShifts).toContain(
      '.app-shell[data-content-held="true"] > .app-main > .employee-hub-page > .ems {\n' + `    ${centre}`,
    );
  });

  // Mert 2026-10-23 ("1- olsun"): the column is as wide as My shifts', 700 px, so their edges meet too.
  it.each([".employee-lineup-day", ".employee-lineup", ".employee-lineup-calm"])(
    "makes %s as wide as My shifts",
    (selector) => {
      const rule = styles.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";

      expect(rule).toContain("max-width: 700px;");
    },
  );
});
