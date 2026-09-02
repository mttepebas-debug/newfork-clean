import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

function cssRuleByPattern(pattern: RegExp): string {
  const match = styles.match(pattern);
  return match?.[1] ?? "";
}

describe("schedule sticky layout styles", () => {
  it("keeps frozen headers fixed while the unassigned row follows its dynamic grid track", () => {
    const scrollRule = cssRule(".schedule-grid-scroll");
    const stickyEmployeeColumnRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\[data-schedule-pinned-cell="employee"\]\s*\{([^}]*)\}/m,
    );
    const stickyEmployeeHeaderRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\.schedule-employee-header\[data-schedule-pinned-cell="employee"\]\s*\{([^}]*)\}/m,
    );
    const topHeaderRule = cssRuleByPattern(
      /\.schedule-grid-corner,\s*\.schedule-location-header,\s*\.schedule-total-header\s*\{([^}]*)\}/m,
    );
    const dayHeaderRule = cssRuleByPattern(
      /\.schedule-employee-header,\s*\.schedule-day-header,\s*\.schedule-total-subheader\s*\{([^}]*)\}/m,
    );
    const unassignedRule = cssRuleByPattern(
      /\.schedule-unassigned-row-cell\[data-unassigned-frozen="true"\]\s*\{([^}]*)\}/m,
    );

    expect(scrollRule).toContain("--schedule-location-header-height: 88px");
    expect(scrollRule).toContain("--schedule-day-header-height: 49px");
    expect(scrollRule).toContain("--schedule-unassigned-sticky-top: calc(");
    expect(scrollRule).toContain("var(--schedule-location-header-height)");
    expect(scrollRule).toContain("var(--schedule-day-header-height)");

    expect(stickyEmployeeColumnRule).toContain("z-index: 4");
    expect(stickyEmployeeHeaderRule).toContain("z-index: 5");
    expect(topHeaderRule).toContain(
      "height: var(--schedule-location-header-height)",
    );
    expect(dayHeaderRule).toContain(
      "height: var(--schedule-day-header-height)",
    );
    expect(unassignedRule).toContain(
      "top: var(--schedule-unassigned-sticky-top)",
    );
    expect(unassignedRule).toContain("z-index: 2");
    expect(unassignedRule).toContain("align-self: stretch");
    expect(unassignedRule).not.toContain(
      "height: var(--schedule-row-min-height, 94px)",
    );
  });

  it("keeps the frozen unassigned row behind the date header while scrolling vertically", () => {
    const dayHeaderRule = cssRuleByPattern(
      /\.schedule-employee-header,\s*\.schedule-day-header,\s*\.schedule-total-subheader\s*\{([^}]*)\}/m,
    );
    const unassignedRule = cssRuleByPattern(
      /\.schedule-unassigned-row-cell\[data-unassigned-frozen="true"\]\s*\{([^}]*)\}/m,
    );
    const unassignedEmployeeRule = cssRule(
      '.schedule-employee-cell.schedule-unassigned-row-cell[data-unassigned-frozen="true"]',
    );
    const unassignedTotalRule = cssRule(
      '.schedule-total-cell.schedule-unassigned-row-cell[data-unassigned-frozen="true"]',
    );

    expect(dayHeaderRule).toContain("z-index: 3");
    expect(unassignedRule).toContain("z-index: 2");
    expect(unassignedEmployeeRule).toContain("z-index: 6");
    expect(unassignedTotalRule).toContain("z-index: 2");
  });

  it("keeps add-shift controls and selected badges behind the frozen unassigned row while scrolling", () => {
    const unassignedRule = cssRuleByPattern(
      /\.schedule-unassigned-row-cell\[data-unassigned-frozen="true"\]\s*\{([^}]*)\}/m,
    );
    const addAnotherRule = cssRuleByPattern(
      /^\.schedule-cell-add-another\s*\{([^}]*)\}/m,
    );
    const activeBadgeRule = cssRuleByPattern(
      /^\.schedule-shift-badge\[data-selected="true"\],\s*\.schedule-shift-badge\[data-focused="true"\]\s*\{([^}]*)\}/m,
    );

    expect(unassignedRule).toContain("z-index: 2");
    expect(addAnotherRule).toContain("z-index: 0");
    expect(activeBadgeRule).toContain("z-index: 1");
  });

  it("preserves the unassigned bottom separator on later location boundaries", () => {
    const boundarySelectorIndex = styles.indexOf(
      '> .schedule-unassigned-row-cell[data-location-boundary="start"]',
    );
    const boundaryUnassignedRule =
      boundarySelectorIndex >= 0
        ? styles.slice(boundarySelectorIndex, boundarySelectorIndex + 220)
        : "";

    expect(boundaryUnassignedRule).toContain("inset 3px 0 #8fa098");
    expect(boundaryUnassignedRule).toContain("inset 0 -2px #d6a23a");
  });

  it("insets preset badges from employee and location separator seams", () => {
    const presetCellRule = cssRule(".schedule-preset-cell");
    const presetLocationEndRule = cssRule(
      '.schedule-preset-cell[data-schedule-preset-location-end="true"]',
    );
    const shiftCellRule = cssRule(".schedule-cell");

    expect(presetCellRule).toContain("padding: 2px 6px");
    expect(presetLocationEndRule).toContain("border-right: 0");
    expect(shiftCellRule).toContain("padding: 6px");
  });

  it("packs preview badges flush without overlapping borders or neighboring badges", () => {
    const previewEmployeeRule = cssRule(
      '.schedule-employee-cell[data-editing="false"]',
    );
    const previewCellRule = cssRule('.schedule-cell[data-editing="false"]');
    const previewBadgeRule = cssRule(
      '.schedule-cell[data-editing="false"] > .schedule-shift-badge',
    );
    const lastBadgeRule = cssRuleByPattern(
      /\.schedule-cell\[data-editing="false"\]\s*>\s*\.schedule-shift-badge:last-child\s*\{([^}]*)\}/m,
    );
    const activeBadgeRule = cssRuleByPattern(
      /\.schedule-cell\[data-editing="false"\]\s*>\s*\.schedule-shift-badge\[data-selected="true"\],\s*\.schedule-cell\[data-editing="false"\]\s*>\s*\.schedule-shift-badge\[data-focused="true"\]\s*\{([^}]*)\}/m,
    );
    const selectionRingRule = cssRule(".schedule-shift-selection-ring");

    expect(previewEmployeeRule).toContain("display: grid");
    expect(previewEmployeeRule).toContain("align-content: center");
    expect(previewEmployeeRule).toContain("padding-block: 0");
    expect(previewCellRule).toContain("padding: 0");
    expect(previewBadgeRule).toContain("margin-bottom: 0");
    expect(previewBadgeRule).toContain("border-top-width: 0");
    expect(previewBadgeRule).toContain("border-right-width: 0");
    expect(previewBadgeRule).toContain("border-radius: 0");
    expect(previewBadgeRule).toContain("padding-top: 2px");
    expect(previewBadgeRule).toContain("padding-bottom: 2px");
    expect(lastBadgeRule).toContain("border-bottom-width: 0");
    expect(activeBadgeRule).toContain("z-index: 0");
    expect(activeBadgeRule).toContain("box-shadow: none");
    expect(selectionRingRule).toContain("display: none");
  });

  it("keeps measured badge content intrinsic and centers it inside the synchronized height", () => {
    const badgeRule = cssRuleByPattern(
      /^\.schedule-shift-badge\s*\{([^}]*)\}/m,
    );
    const contentRule = cssRuleByPattern(
      /^\.schedule-shift-badge \.schedule-shift-badge-content\s*\{([^}]*)\}/m,
    );
    const addAnotherRule = cssRuleByPattern(
      /}\r?\n\.schedule-cell-add-another\s*\{([^}]*)\}/m,
    );

    expect(badgeRule).toContain("display: flex");
    expect(badgeRule).toContain("box-sizing: border-box");
    expect(badgeRule).toContain(
      "height: var(--schedule-row-badge-height, 58px)",
    );
    expect(badgeRule).toContain("flex-direction: column");
    expect(badgeRule).toContain("justify-content: center");
    expect(contentRule).toContain("height: auto");
    expect(contentRule).toContain("flex: 0 0 auto");
    expect(addAnotherRule).toContain("min-height: 22px");
    expect(addAnotherRule).toContain("margin-top: 1px");
  });

  it("keeps topbar dropdown menus above the active filter chip strip", () => {
    const topbarRule = cssRule(".schedule-topbar");
    const dismissLayerRule = cssRule(".schedule-topbar-dismiss-layer");
    const chipStripRule = cssRule(".schedule-filter-command-strip");
    const filterMenuRule = cssRule(".schedule-topbar-filter-menu");

    expect(topbarRule).toContain("z-index: 100");
    expect(dismissLayerRule).toContain("z-index: 99");
    expect(chipStripRule).toContain("z-index: 85");
    expect(filterMenuRule).toContain("z-index: 105");
  });

  it("opens topbar filter menus directly below their trigger", () => {
    const filterMenuRule = cssRule(".schedule-topbar-filter-menu");

    expect(filterMenuRule).toContain("top: calc(100% + 6px)");
    expect(filterMenuRule).not.toContain("top: calc(100% + 48px)");
  });
});
