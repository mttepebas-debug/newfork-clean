import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

// Mert, 2026-10-13: the red edge of a time-off cell is always there, and its
// words are black until the mouse is over them.
describe("schedule time off cell styles", () => {
  it("draws the thin red edge without waiting for the mouse", () => {
    const edge = cssRule('.schedule-cell:where([data-availability-kind="time_off"])');

    expect(edge).toContain("outline: 1px solid color-mix(in srgb, var(--theme-time-off) 55%, transparent)");
    expect(edge).toContain("outline-offset: -1px");
    expect(cssRule('.schedule-cell[data-availability-kind="time_off"]:hover')).toBe("");
  });

  it("lets a dragged shift's frame replace the edge", () => {
    // :where() keeps the edge below every drop colour, wherever it sits.
    expect(cssRule('.schedule-cell[data-drop-status="blocked"]')).toContain("outline: 2px solid var(--theme-danger)");
  });

  it("stays red-pink under the mouse while the schedule is edited", () => {
    expect(cssRule('.schedule-cell[data-editing="true"][data-availability-kind="time_off"]:hover')).toContain(
      "background-color: var(--theme-time-off-soft);",
    );
  });

  it("writes Time off in black and turns it red under the mouse", () => {
    expect(
      cssRule('.schedule-cell[data-availability-kind="time_off"]:not(:has(.schedule-shift-badge))::before'),
    ).toContain("color: var(--theme-text);");
    expect(cssRule('.schedule-cell[data-availability-kind="time_off"]:hover::before')).toContain(
      "color: var(--theme-danger-strong);",
    );
  });
});
