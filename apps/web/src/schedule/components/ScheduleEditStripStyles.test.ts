import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1]!.replace(/\s+/g, " ").trim(),
  body: match[2]!,
}));
const bodyOf = (selector: string) =>
  rules
    .filter((rule) => rule.selector.split(/,\s(?![^(]*\))/).includes(selector))
    .map((rule) => rule.body)
    .join("\n");
describe("Schedule edit strip and Settings menu styles (AVAIL-002 C1)", () => {
  // A narrow window: the strip's buttons wrap to a second row, each label on one line, one height.
  // Schedule does not open below 768 px (KARARLAR "Schedule telefonda tamamen kapalı").
  it("wraps the edit strip's buttons instead of their labels", () => {
    expect(bodyOf(".schedule-edit-banner")).toContain("flex-wrap: wrap");
    // The page is a flex column: a strip allowed to shrink would hide its second row under the grid.
    expect(bodyOf(".schedule-edit-banner")).toContain("flex-shrink: 0");
    expect(bodyOf(".schedule-edit-banner button")).toContain("white-space: nowrap");
  });

  // Mert, 2026-10-04: "Availability on" and "Paste mode on" sit on a light green ground, as designed.
  it("tints a pressed strip button with the accent ground, from tokens", () => {
    const pressed = bodyOf('.schedule-edit-banner button[aria-pressed="true"]');
    expect(pressed).toContain("background: var(--theme-accent-soft)");
    expect(pressed).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});
