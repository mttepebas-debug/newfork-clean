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
const phone = [...styles.matchAll(/@media \(max-width: 520px\) \{([\s\S]*?)\n\}/g)]
  .map((match) => match[1]!.replace(/\s+/g, " "))
  .join("\n");

const narrow = [...styles.matchAll(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/g)]
  .map((match) => match[1]!.replace(/\s+/g, " "))
  .join("\n");
const narrowRule = (selector: string) =>
  [...narrow.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1]!.split(",").map((part) => part.trim()).includes(selector))
    .map((match) => match[2]!)
    .join("\n");

describe("Schedule edit strip and Settings menu styles (AVAIL-002 C1)", () => {
  // A 375px phone: the strip's buttons wrap to a second row, each label on one line, one height.
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

  // The Settings button sits at the right on a phone; its menu opens leftward and stays on screen.
  it("opens the Settings menu leftward from its button on a phone", () => {
    expect(phone).toMatch(/\.schedule-settings-menu-panel \{[^}]*right: 0;[^}]*\}/);
    expect(phone).toMatch(/\.schedule-settings-menu-panel \{[^}]*left: auto;[^}]*\}/);
  });

  // B5 (AVAIL-002 QA): a scrolling row clips every menu that opens from it,
  // and the action row drawn after it covers the rest; the row wraps instead
  // and sits above the action row.
  it("lets the Settings menu open over the rows below it on a phone", () => {
    expect(narrowRule(".schedule-command-group")).not.toContain("overflow-x: auto");
    expect(narrowRule(".schedule-command-group")).toContain("z-index: 3");
  });
});
