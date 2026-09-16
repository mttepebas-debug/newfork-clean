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
  it("sizes the grid from the remaining viewport instead of a fixed toolbar offset", () => {
    const pageRule = cssRule(".schedule-page");
    const scrollRule = cssRule(".schedule-grid-scroll");

    expect(pageRule).toContain("display: flex");
    expect(pageRule).toContain("height: 100%");
    expect(pageRule).toContain("min-height: 0");
    expect(pageRule).toContain("flex-direction: column");
    expect(pageRule).toContain("overflow: hidden");
    expect(scrollRule).toContain("flex: 1 1 auto");
    expect(scrollRule).toContain("min-height: 0");
    expect(scrollRule).not.toContain("100dvh - 129px");
  });

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
    const totalColumnRule = cssRule(
      '.schedule-grid-exact > [data-schedule-total-column-cell="true"]',
    );

    expect(scrollRule).toContain("--schedule-location-header-height: 88px");
    expect(scrollRule).toContain("--schedule-day-header-height: 49px");
    expect(scrollRule).toContain("--schedule-filler-height: 0px");
    expect(scrollRule).toContain("--schedule-filler-row-guide-height: 94px");
    expect(scrollRule).toContain("--schedule-total-bottom-offset: 0px");
    expect(scrollRule).toContain("--schedule-unassigned-sticky-top: calc(");
    expect(scrollRule).toContain("var(--schedule-location-header-height)");
    expect(scrollRule).toContain("var(--schedule-day-header-height)");

    expect(stickyEmployeeColumnRule).toContain("z-index: 4");
    expect(stickyEmployeeHeaderRule).toContain("z-index: 12");
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
    expect(totalColumnRule).toContain("position: sticky");
    expect(totalColumnRule).toContain("right: 0");
    expect(totalColumnRule).toContain("z-index: 4");
  });

  it("keeps only the total-hours row frozen at the bottom edge", () => {
    const totalRowRule = cssRuleByPattern(
      /\.schedule-total-row-label,\s*\.schedule-total-day-cell,\s*\.schedule-total-week-cell\s*\{([^}]*)\}/m,
    );
    const bottomRightRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\.schedule-total-week-cell\[data-schedule-total-column-cell="true"\]\s*\{([^}]*)\}/m,
    );
    const shiftCellRule = cssRule(".schedule-cell");

    expect(totalRowRule).toContain("position: sticky");
    expect(totalRowRule).toContain(
      "bottom: var(--schedule-total-bottom-offset)",
    );
    expect(totalRowRule).toContain("z-index: 6");
    expect(bottomRightRule).toContain("z-index: 7");
    expect(shiftCellRule).not.toContain("position: sticky");
  });

  it("keeps drag previews above frozen grid layers without competing with app chrome", () => {
    const totalColumnRule = cssRule(
      '.schedule-grid-exact > [data-schedule-total-column-cell="true"]',
    );
    const bottomRightRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\.schedule-total-week-cell\[data-schedule-total-column-cell="true"\]\s*\{([^}]*)\}/m,
    );
    const horizontalNavRule = cssRule(".schedule-horizontal-nav");
    const shiftDragPreviewRule = cssRule(".schedule-shift-drag-preview");
    const presetDragPreviewRule = cssRule(
      ".schedule-shift-type-preset-drag-preview",
    );

    expect(totalColumnRule).toContain("z-index: 4");
    expect(bottomRightRule).toContain("z-index: 7");
    expect(horizontalNavRule).toContain("z-index: 70");
    expect(shiftDragPreviewRule).toContain("z-index: 90");
    expect(presetDragPreviewRule).toContain("z-index: 90");
  });

  it("uses one measured filler band without leaving a bottom border at zero height", () => {
    const fillerRule = cssRuleByPattern(
      /\.schedule-filler-row-label,\s*\.schedule-filler-cell\s*\{([^}]*)\}/m,
    );
    const totalFillerRule = cssRule(
      ".schedule-total-cell.schedule-filler-cell",
    );
    const activeFillerRule = cssRuleByPattern(
      /\.schedule-grid-scroll\[data-schedule-filler-state="active"\]\s*\.schedule-filler-row-label,\s*\.schedule-grid-scroll\[data-schedule-filler-state="active"\]\s*\.schedule-filler-cell\s*\{([^}]*)\}/m,
    );

    expect(fillerRule).toContain("height: var(--schedule-filler-height)");
    expect(fillerRule).toContain("min-height: 0");
    expect(fillerRule).toContain("box-sizing: border-box");
    expect(fillerRule).toContain("padding: 0");
    expect(fillerRule).toContain("border-bottom-width: 0");
    expect(fillerRule).toContain("background-color: #f7faf8");
    expect(fillerRule).toContain("background-image: linear-gradient(");
    expect(fillerRule).toContain(
      "var(--schedule-filler-row-guide-height)",
    );
    expect(totalFillerRule).toContain("min-height: 0");
    expect(activeFillerRule).toContain("border-bottom-width: 1px");
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

    expect(dayHeaderRule).toContain("z-index: 10");
    expect(unassignedRule).toContain("z-index: 2");
    expect(unassignedEmployeeRule).toContain("z-index: 6");
    expect(unassignedTotalRule).toContain("z-index: 2");
  });

  it("keeps add-shift controls and active badges behind the frozen unassigned row while scrolling", () => {
    const unassignedRule = cssRuleByPattern(
      /\.schedule-unassigned-row-cell\[data-unassigned-frozen="true"\]\s*\{([^}]*)\}/m,
    );
    const activeEditorCellRule = cssRule(
      '.schedule-cell[data-shift-editor-active-cell="true"]',
    );
    const addActionRule = cssRuleByPattern(
      /^\.schedule-cell-add-action\s*\{([^}]*)\}/m,
    );
    const activeBadgeRule = cssRuleByPattern(
      /^\.schedule-shift-badge\[data-selected="true"\],\s*\.schedule-shift-badge\[data-current="true"\]\s*\{([^}]*)\}/m,
    );

    expect(unassignedRule).toContain("z-index: 2");
    expect(activeEditorCellRule).not.toContain("position:");
    expect(addActionRule).toContain("z-index: 1");
    expect(activeBadgeRule).toContain("z-index: 1");
  });

  it("owns the unassigned bottom separator independently from badges and location boundaries", () => {
    const rootRule = cssRule(":root");
    const employeeUnassignedRule = cssRule(
      '.schedule-employee-cell[data-unassigned="true"]',
    );
    const unassignedRowRule = cssRuleByPattern(
      /^\.schedule-unassigned-row-cell\s*\{([^}]*)\}/m,
    );
    const scheduleUnassignedRowRule = cssRule(
      ".schedule-cell.schedule-unassigned-row-cell",
    );
    const boundarySelectorIndex = styles.indexOf(
      '> .schedule-unassigned-row-cell[data-location-boundary="start"]',
    );
    const boundaryUnassignedRule =
      boundarySelectorIndex >= 0
        ? styles.slice(boundarySelectorIndex, boundarySelectorIndex + 220)
        : "";

    const separatorRule = cssRule(".schedule-unassigned-row-cell::before");

    expect(rootRule).toContain("--schedule-unassigned-row-background: #fef3c7");
    expect(employeeUnassignedRule).toContain(
      "background: var(--schedule-unassigned-row-background)",
    );
    expect(unassignedRowRule).toContain(
      "background: var(--schedule-unassigned-row-background)",
    );
    expect(scheduleUnassignedRowRule).toContain(
      "background: var(--schedule-unassigned-row-background)",
    );
    expect(boundaryUnassignedRule).toContain(
      "inset 3px 0 var(--schedule-section-line-color)",
    );
    expect(separatorRule).toContain("z-index: 3");
    expect(separatorRule).toContain(
      "height: var(--schedule-unassigned-line-width)",
    );
    expect(separatorRule).toContain(
      "background: var(--schedule-unassigned-line-color)",
    );
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

  it("packs preview badges compactly while preserving every badge border", () => {
    const previewEmployeeRule = cssRule(
      '.schedule-employee-cell[data-editing="false"]',
    );
    const previewCellRule = cssRule('.schedule-cell[data-editing="false"]');
    const previewBadgeRule = cssRule(
      '.schedule-cell[data-editing="false"] > .schedule-shift-badge',
    );
    const previewGapRule = cssRuleByPattern(
      /\.schedule-cell\[data-editing="false"\]\s*>\s*\.schedule-shift-badge:not\(:last-child\)\s*\{([^}]*)\}/m,
    );
    const activeBadgeRule = cssRuleByPattern(
      /\.schedule-cell\[data-editing="false"\]\s*>\s*\.schedule-shift-badge\[data-selected="true"\],\s*\.schedule-cell\[data-editing="false"\]\s*>\s*\.schedule-shift-badge\[data-current="true"\]\s*\{([^}]*)\}/m,
    );
    const selectionRingRule = cssRule(".schedule-shift-selection-ring");

    expect(previewEmployeeRule).toContain("display: grid");
    expect(previewEmployeeRule).toContain("align-content: center");
    expect(previewEmployeeRule).toContain("padding-block: 0");
    expect(previewCellRule).toContain(
      "padding: var(--schedule-cell-preview-inset)",
    );
    expect(previewCellRule).toContain(
      "padding-bottom: var(--schedule-unassigned-line-width)",
    );
    expect(previewBadgeRule).toContain("padding-top: 4px");
    expect(previewBadgeRule).toContain("padding-bottom: 4px");
    expect(previewBadgeRule).not.toContain("border-top-width: 0");
    expect(previewBadgeRule).not.toContain("border-right-width: 0");
    expect(previewGapRule).toContain(
      "margin-bottom: var(--schedule-badge-preview-gap)",
    );
    expect(activeBadgeRule).toContain("z-index: 0");
    expect(activeBadgeRule).not.toContain("border-color");
    expect(selectionRingRule).toContain("position: absolute");
    expect(selectionRingRule).toContain("inset: 0");
    expect(selectionRingRule).toContain("pointer-events: none");
    expect(selectionRingRule).toContain("box-shadow: inset 0 0 0 2px");
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
    const editCellRule = cssRule('.schedule-cell[data-editing="true"]');
    const emptyAddRule = cssRule(".schedule-cell-add");
    const addActionRule = cssRuleByPattern(
      /^\.schedule-cell-add-action\s*\{([^}]*)\}/m,
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
    expect(addActionRule).toContain("box-sizing: border-box");
    expect(addActionRule).toContain("min-height: 28px");
    expect(addActionRule).toContain("opacity: 0");
    expect(addActionRule).toContain("pointer-events: none");
    expect(emptyAddRule).toContain("inset: 0");
    expect(emptyAddRule).toContain("width: 100%");
    expect(emptyAddRule).toContain("height: 100%");
    expect(emptyAddRule).toContain("min-height: 100%");
    expect(editCellRule).toContain("display: flex");
    expect(editCellRule).toContain("flex-direction: column");
    expect(addAnotherRule).toContain("position: relative");
    expect(addAnotherRule).toContain("width: 100%");
    expect(addAnotherRule).toContain("height: auto");
    expect(addAnotherRule).toContain(
      "min-height: var(--schedule-add-shift-lane-height)",
    );
    expect(addAnotherRule).toContain(
      "flex: 1 1 var(--schedule-add-shift-lane-height)",
    );
  });

  it("keeps later-location separators in location and day header hover states", () => {
    const locationHoverRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\.schedule-location-header\[data-location-boundary="start"\]:hover,\s*\.schedule-grid-exact\s*>\s*\.schedule-location-header\[data-location-boundary="start"\]:focus-visible\s*\{([^}]*)\}/m,
    );
    const dayHoverRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\.schedule-day-header\[data-location-boundary="start"\]\[data-clickable="true"\]:hover,\s*\.schedule-grid-exact\s*>\s*\.schedule-day-header\[data-location-boundary="start"\]\[data-clickable="true"\]:focus-visible\s*\{([^}]*)\}/m,
    );
    const todayRule = cssRuleByPattern(
      /\.schedule-grid-exact\s*>\s*\.schedule-day-header\[data-location-boundary="start"\]\[data-today="true"\]\s*\{([^}]*)\}/m,
    );

    expect(locationHoverRule).toContain(
      "inset 3px 0 var(--schedule-section-line-color)",
    );
    expect(dayHoverRule).toContain(
      "inset 3px 0 var(--schedule-section-line-color)",
    );
    expect(todayRule).toContain(
      "inset 3px 0 var(--schedule-section-line-color)",
    );
  });

  it("keeps badge text hierarchy readable and reserves marker and stack space", () => {
    const contentRule = cssRuleByPattern(
      /^\.schedule-shift-badge \.schedule-shift-badge-content\s*\{([^}]*)\}/m,
    );
    const titleRule = cssRule(".schedule-shift-badge strong");
    const metadataRule = cssRuleByPattern(
      /^\.schedule-shift-badge \.schedule-shift-badge-content > span,\s*\.schedule-shift-badge \.schedule-shift-badge-content > em\s*\{([^}]*)\}/m,
    );
    const stackAndMarkerRule = cssRuleByPattern(
      /^\.schedule-shift-badge\[data-stack-count\]\[data-has-markers="true"\]\s*\.schedule-shift-badge-content\s*\{([^}]*)\}/m,
    );
    const markerRule = cssRule(
      ".schedule-shift-badge .schedule-shift-badge-markers",
    );

    expect(contentRule).toContain("position: relative");
    expect(contentRule).toContain("z-index: 1");
    expect(titleRule).toContain("font-size: 12px");
    expect(titleRule).toContain("font-weight: 750");
    expect(metadataRule).toContain("font-size: 10px");
    expect(metadataRule).toContain("line-height: 1.3");
    expect(contentRule).toContain("align-items: stretch");
    expect(contentRule).toContain("text-align: center");
    for (const rule of [titleRule, metadataRule]) {
      expect(rule).toContain("white-space: normal");
      expect(rule).toContain("overflow-wrap: anywhere");
      expect(rule).not.toContain("ellipsis");
      expect(rule).not.toContain("overflow: hidden");
    }
    expect(stackAndMarkerRule).toContain("padding-right: 70px");
    expect(markerRule).toContain("z-index: 2");
  });

  it("keeps topbar dropdown menus above the active filter chip strip", () => {
    const topbarRule = cssRule(".schedule-topbar");
    const chipStripRule = cssRule(".schedule-filter-command-strip");
    const filterMenuRule = cssRule(".schedule-topbar-filter-menu");
    const employeeDrawerLayerRule = cssRule(".employee-drawer-layer");

    expect(topbarRule).toContain("z-index: 100");
    expect(chipStripRule).toContain("z-index: 85");
    expect(filterMenuRule).toContain("z-index: 105");
    expect(employeeDrawerLayerRule).toContain("z-index: 110");
  });

  it("opens topbar filter menus directly below their trigger", () => {
    const filterMenuRule = cssRule(".schedule-topbar-filter-menu");

    expect(filterMenuRule).toContain("top: calc(100% + 6px)");
    expect(filterMenuRule).not.toContain("top: calc(100% + 48px)");
  });

  it("lets the schedule logo use the header frame while preserving contain fit", () => {
    const cornerRule = cssRule(".schedule-grid-corner");
    const frameRule = cssRule(".schedule-grid-logo-frame");
    const imageRule = cssRule(".schedule-logo-image");
    const focusRule = cssRuleByPattern(
      /^\.schedule-grid-logo-button:focus-visible,\s*\.schedule-logo-button:focus-visible\s*\{([^}]*)\}/m,
    );

    expect(cornerRule).toContain("padding: 2px 3px");
    expect(frameRule).toContain("min-height: 0");
    expect(frameRule).toContain(
      "max-height: calc(var(--schedule-location-header-height) - 4px)",
    );
    expect(imageRule).toContain("width: 100%");
    expect(imageRule).toContain("height: 100%");
    expect(imageRule).toContain("object-fit: contain");
    expect(imageRule).toContain("object-position: center");
    expect(focusRule).toContain("outline: 2px solid var(--schedule-focus-ring-color)");
  });
});
