import { describe, expect, it } from "vitest";

import {
  closeScheduleMenu,
  escapeAttributeValue,
  isBlankScheduleDismissTarget,
  isMatchingScheduleLocationHeaderTarget,
  isScheduleEditFocusedShiftBlankDismissTarget,
  isScheduleEditBannerBlankTarget,
  isScheduleInteractionSurface,
  isSchedulePreviewFocusedShiftBlankDismissTarget,
  isScheduleSurfaceTarget,
  isSuppressedScheduleClickTarget,
  isTextEditingTarget,
} from "./scheduleInteractionTargets";

describe("scheduleInteractionTargets", () => {
  it("preserves grid focus and filters when a nonmodal export sidebar is clicked", () => {
    document.body.innerHTML = '<aside><section data-schedule-export-v2><p id="export-copy">Output options</p></section></aside>';
    const target = document.getElementById("export-copy")!;
    expect(isScheduleInteractionSurface(target)).toBe(true);
    expect(isBlankScheduleDismissTarget(target)).toBe(false);
    expect(isSchedulePreviewFocusedShiftBlankDismissTarget(target)).toBe(false);
  });
  it("escapes attribute values used by badge measurement selectors", () => {
    expect(escapeAttributeValue('role"server')).toBe('role\\"server');
    expect(escapeAttributeValue("role\\server")).toBe("role\\\\server");
  });

  it("detects text editing targets", () => {
    document.body.innerHTML = `
      <div>
        <input id="input" />
        <textarea id="textarea"></textarea>
        <select id="select"></select>
        <div id="editable" contenteditable="true"></div>
        <button id="button"></button>
      </div>
    `;

    expect(isTextEditingTarget(document.getElementById("input"))).toBe(true);
    expect(isTextEditingTarget(document.getElementById("textarea"))).toBe(true);
    expect(isTextEditingTarget(document.getElementById("select"))).toBe(true);
    expect(isTextEditingTarget(document.getElementById("editable"))).toBe(true);
    expect(isTextEditingTarget(document.getElementById("button"))).toBe(false);
  });

  it("treats the broad schedule content surface as dismissible", () => {
    document.body.innerHTML = `
      <section class="schedule-page">
        <div id="blank"></div>
        <button id="button"></button>
        <button id="employee-trigger" data-schedule-employee-card-trigger="true"></button>
        <div id="cell" class="schedule-cell"></div>
        <button id="paste-button" class="schedule-cell-paste"></button>
        <div id="badge" data-shift-badge="true"></div>
        <div id="preset-cell" data-schedule-preset-cell="true">
          <button id="preset-chip" data-schedule-preset-chip="true"></button>
        </div>
        <div id="day-header" data-schedule-day-header-content="true"></div>
        <div id="location-header" data-schedule-location-filter-ids="loc-1"></div>
        <div data-schedule-top-bar><button id="topbar-button"></button></div>
        <div data-schedule-filter-command-strip><button id="filter-chip"></button></div>
        <div class="schedule-edit-banner" role="toolbar">
          <span id="edit-banner-blank"></span>
          <button id="edit-banner-button">Auto-fill</button>
        </div>
        <button id="topbar-dismiss-layer" class="schedule-topbar-dismiss-layer"></button>
        <div id="conflict-toast" data-schedule-conflict-toast-content="true"></div>
        <div id="dialog" role="dialog"><span id="dialog-child"></span></div>
        <aside class="schedule-export-panel"><button id="export-panel-button"></button></aside>
      </section>
      <div id="outside"></div>
    `;

    const blank = document.getElementById("blank")!;
    const button = document.getElementById("button")!;
    const employeeTrigger = document.getElementById("employee-trigger")!;
    const cell = document.getElementById("cell")!;
    const pasteButton = document.getElementById("paste-button")!;
    const badge = document.getElementById("badge")!;
    const presetCell = document.getElementById("preset-cell")!;
    const presetChip = document.getElementById("preset-chip")!;
    const dayHeader = document.getElementById("day-header")!;
    const locationHeader = document.getElementById("location-header")!;
    const topbarButton = document.getElementById("topbar-button")!;
    const filterChip = document.getElementById("filter-chip")!;
    const editBannerBlank = document.getElementById("edit-banner-blank")!;
    const editBannerButton = document.getElementById("edit-banner-button")!;
    const topbarDismissLayer = document.getElementById("topbar-dismiss-layer")!;
    const conflictToast = document.getElementById("conflict-toast")!;
    const dialogChild = document.getElementById("dialog-child")!;
    const exportPanelButton = document.getElementById("export-panel-button")!;
    const outside = document.getElementById("outside")!;

    expect(isScheduleSurfaceTarget(blank)).toBe(true);
    expect(isScheduleSurfaceTarget(outside)).toBe(false);
    expect(isScheduleInteractionSurface(badge)).toBe(true);
    expect(isScheduleInteractionSurface(dialogChild)).toBe(true);
    expect(isBlankScheduleDismissTarget(blank)).toBe(true);
    expect(isBlankScheduleDismissTarget(button)).toBe(true);
    expect(isScheduleInteractionSurface(employeeTrigger)).toBe(true);
    expect(isBlankScheduleDismissTarget(employeeTrigger)).toBe(false);
    expect(isBlankScheduleDismissTarget(cell)).toBe(true);
    expect(isBlankScheduleDismissTarget(pasteButton)).toBe(false);
    expect(isBlankScheduleDismissTarget(badge)).toBe(false);
    expect(isScheduleInteractionSurface(presetCell)).toBe(true);
    expect(isScheduleInteractionSurface(presetChip)).toBe(true);
    expect(isBlankScheduleDismissTarget(presetCell)).toBe(false);
    expect(isBlankScheduleDismissTarget(presetChip)).toBe(false);
    expect(isBlankScheduleDismissTarget(dayHeader)).toBe(false);
    expect(isBlankScheduleDismissTarget(locationHeader)).toBe(false);
    expect(isBlankScheduleDismissTarget(topbarButton)).toBe(false);
    expect(isScheduleInteractionSurface(filterChip)).toBe(true);
    expect(isBlankScheduleDismissTarget(filterChip)).toBe(false);
    expect(isScheduleEditBannerBlankTarget(editBannerBlank)).toBe(true);
    expect(isBlankScheduleDismissTarget(editBannerBlank)).toBe(true);
    expect(isScheduleEditBannerBlankTarget(editBannerButton)).toBe(false);
    expect(isBlankScheduleDismissTarget(editBannerButton)).toBe(false);
    expect(isScheduleInteractionSurface(topbarDismissLayer)).toBe(true);
    expect(isBlankScheduleDismissTarget(topbarDismissLayer)).toBe(false);
    expect(isBlankScheduleDismissTarget(conflictToast)).toBe(false);
    expect(isBlankScheduleDismissTarget(dialogChild)).toBe(false);
    expect(isScheduleInteractionSurface(exportPanelButton)).toBe(true);
    expect(isBlankScheduleDismissTarget(exportPanelButton)).toBe(false);
    expect(isBlankScheduleDismissTarget(outside)).toBe(false);
  });

  it("recognizes an already-focused location header without treating subsets as exact", () => {
    document.body.innerHTML = `
      <div data-schedule-location-filter-ids="loc-1,loc-2">
        <span id="group-label"></span>
        <button id="loc-1" data-schedule-location-filter-ids="loc-1"></button>
      </div>
    `;

    expect(
      isMatchingScheduleLocationHeaderTarget(
        document.getElementById("group-label")!,
        ["loc-2", "loc-1"],
      ),
    ).toBe(true);
    expect(
      isMatchingScheduleLocationHeaderTarget(
        document.getElementById("loc-1")!,
        ["loc-1", "loc-2"],
      ),
    ).toBe(false);
  });

  it("consumes only the click generated by the dismissed pointer target", () => {
    document.body.innerHTML = `
      <div id="cell">
        <span id="cell-child"></span>
        <svg><path id="cell-icon"></path></svg>
      </div>
      <button id="other"></button>
    `;
    const cell = document.getElementById("cell")!;
    const child = document.getElementById("cell-child")!;
    const icon = document.getElementById("cell-icon")!;
    const other = document.getElementById("other")!;

    expect(isSuppressedScheduleClickTarget(cell, child)).toBe(true);
    expect(isSuppressedScheduleClickTarget(child, cell)).toBe(true);
    expect(isSuppressedScheduleClickTarget(icon, cell)).toBe(true);
    expect(isSuppressedScheduleClickTarget(cell, other)).toBe(false);
  });

  it("closes the nearest details menu", () => {
    document.body.innerHTML = `
      <details open>
        <summary>Menu</summary>
        <button id="item"></button>
      </details>
    `;

    const item = document.getElementById("item")!;
    closeScheduleMenu(item);

    expect(item.closest("details")?.hasAttribute("open")).toBe(false);
  });

  it("treats non-interactive preview areas as focused badge dismiss targets", () => {
    document.body.innerHTML = `
      <aside id="sidebar-blank"></aside>
      <a id="sidebar-link" href="/app/schedule">Schedule</a>
      <section class="schedule-page">
        <div id="cell" data-testid="schedule-cell-body"></div>
        <div id="unassigned-cell" class="schedule-unassigned-row-cell" data-testid="schedule-cell-body"></div>
        <div id="preset-cell" data-schedule-preset-cell="true"></div>
        <button id="button"></button>
        <div id="location-header" data-schedule-location-filter-ids="loc-1"></div>
        <div id="day-header" data-schedule-day-header-content="true"></div>
        <button id="badge" data-shift-badge="true"></button>
      </section>
    `;

    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("sidebar-blank"),
      ),
    ).toBe(true);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("cell"),
      ),
    ).toBe(true);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("unassigned-cell"),
      ),
    ).toBe(true);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("preset-cell"),
      ),
    ).toBe(false);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("sidebar-link"),
      ),
    ).toBe(false);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("button"),
      ),
    ).toBe(false);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("location-header"),
      ),
    ).toBe(false);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("day-header"),
      ),
    ).toBe(false);
    expect(
      isSchedulePreviewFocusedShiftBlankDismissTarget(
        document.getElementById("badge"),
      ),
    ).toBe(false);
  });

  it("excludes editable grid cells from focused badge blank dismissal", () => {
    document.body.innerHTML = `
      <aside id="sidebar-blank"></aside>
      <section class="schedule-page">
        <div id="cell" data-testid="schedule-cell-body"></div>
        <div id="unassigned-cell" class="schedule-unassigned-row-cell" data-testid="schedule-cell-body"></div>
        <button id="add" class="schedule-cell-add"></button>
        <button id="badge" data-shift-badge="true"></button>
      </section>
    `;

    expect(
      isScheduleEditFocusedShiftBlankDismissTarget(
        document.getElementById("sidebar-blank"),
      ),
    ).toBe(true);
    expect(
      isScheduleEditFocusedShiftBlankDismissTarget(
        document.getElementById("cell"),
      ),
    ).toBe(false);
    expect(
      isScheduleEditFocusedShiftBlankDismissTarget(
        document.getElementById("unassigned-cell"),
      ),
    ).toBe(false);
    expect(
      isScheduleEditFocusedShiftBlankDismissTarget(
        document.getElementById("add"),
      ),
    ).toBe(false);
    expect(
      isScheduleEditFocusedShiftBlankDismissTarget(
        document.getElementById("badge"),
      ),
    ).toBe(false);
  });
});
