/**
 * A window over the Schedule: a native <dialog> (it has the role without the
 * attribute), or anything carrying the dialog or alertdialog role. A press or a
 * click inside one belongs to that window, never to the page's blank-surface rules.
 */
export const SCHEDULE_WINDOW_SELECTOR = "dialog, [role='dialog'], [role='alertdialog']";

// The Schedule's top action menus and windows (Publish, the New Schedule window and its row menus).
const SCHEDULE_TOP_ACTION_SURFACE_SELECTOR = [
  "[data-schedule-top-action-trigger]",
  ".schedule-draft-menu",
  ".new-schedule-window-menu",
  ".schedule-save-menu-anchor",
  ".schedule-save-draft-menu",
  ".schedule-action-menu",
  ".schedule-published-menu",
  ".schedule-dialog",
  ".schedule-edit-banner",
  ".schedule-export-panel",
  "[data-schedule-export-v2]",
  "[data-employee-drawer-panel='true']",
].join(",");

/**
 * A press that closes an open top action menu: anywhere but the menus
 * themselves and any window, whose presses are the window's (the save
 * recovery sheet's Discard, for one).
 */
export function isTopActionOutsidePress(target: Element): boolean {
  return !target.closest(`${SCHEDULE_TOP_ACTION_SURFACE_SELECTOR}, ${SCHEDULE_WINDOW_SELECTOR}`);
}

export function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

/** BL-1003: a key pressed inside a window or menu belongs to it, not to the grid behind. */
export function isScheduleLayerTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(
    target.closest("[role='dialog'], [role='alertdialog'], [aria-modal='true']"),
  );
}

export function closeScheduleMenu(target: HTMLElement): void {
  target.closest("details")?.removeAttribute("open");
}

export function isScheduleSurfaceTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && Boolean(target.closest(".schedule-page"))
  );
}

export function isScheduleInteractionSurface(target: Element): boolean {
  return Boolean(
    target.closest("[data-schedule-export-v2]") ||
    target.closest("[data-shift-badge='true']") ||
    target.closest("[data-schedule-preset-chip='true']") ||
    target.closest("[data-schedule-preset-cell='true']") ||
    target.closest("[data-preset-drop-cell='true']") ||
    target.closest("[data-schedule-employee-card-trigger='true']") ||
    target.closest("[data-schedule-top-bar]") ||
    target.closest("[data-schedule-filter-command-strip]") ||
    target.closest("[data-schedule-horizontal-nav]") ||
    target.closest(".schedule-topbar-dismiss-layer") ||
    target.closest("[data-topbar-filter-content]") ||
    target.closest("[data-shift-quick-editor-content]") ||
    target.closest("[data-schedule-conflict-sheet-content]") ||
    target.closest("[data-schedule-conflict-toast-content]") ||
    target.closest("[role='menu']") ||
    target.closest("[role='toolbar']") ||
    target.closest(SCHEDULE_WINDOW_SELECTOR) ||
    target.closest(".schedule-topbar") ||
    target.closest(".schedule-edit-banner") ||
    target.closest(".schedule-action-menu") ||
    target.closest(".schedule-published-menu") ||
    target.closest(".schedule-export-panel") ||
    target.closest(".schedule-export-dialog"),
  );
}

export function isBlankScheduleDismissTarget(target: Element): boolean {
  if (target.closest("[data-schedule-export-v2]")) return false;
  // The employee board reuses the same dismissal cascade on its own root.
  if (!target.closest(".schedule-page, .employee-schedule-board")) return false;
  if (isScheduleEditBannerBlankTarget(target)) return true;
  return !target.closest(
    [
      "[data-schedule-top-bar]",
      "[data-schedule-filter-command-strip]",
      // S-228: the search's "No one matches" box and its buttons.
      "[data-schedule-search-empty]",
      // Mert, 2026-10-12: the bottom navigation bar only scrolls the grid.
      "[data-schedule-horizontal-nav]",
      ".schedule-topbar-dismiss-layer",
      "[data-topbar-filter-content]",
      "[data-shift-quick-editor-content]",
      "[data-schedule-conflict-sheet-content]",
      "[data-schedule-conflict-toast-content]",
      "[data-shift-badge='true']",
      "[data-schedule-preset-chip='true']",
      "[data-schedule-preset-cell='true']",
      "[data-preset-drop-cell='true']",
      "[data-schedule-employee-card-trigger='true']",
      "[data-schedule-day-header-content='true']",
      "[data-schedule-location-filter-ids]",
      // BL-714: the grid's logo opens its own window.
      ".schedule-grid-logo-button",
      "[role='menu']",
      "[role='toolbar']",
      SCHEDULE_WINDOW_SELECTOR,
      ".schedule-cell-paste",
      ".schedule-topbar",
      ".schedule-edit-banner",
      ".schedule-action-menu",
      ".schedule-published-menu",
      ".schedule-export-panel",
      ".schedule-export-dialog",
    ].join(","),
  );
}

export function isScheduleEditBannerBlankTarget(target: Element): boolean {
  return Boolean(
    target.closest(".schedule-edit-banner") &&
      !target.closest(
        [
          "button",
          "input",
          "textarea",
          "select",
          "[contenteditable='true']",
          "[role='button']",
          "[role='menu']",
          "[role='dialog']",
        ].join(","),
      ),
  );
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

export function isMatchingScheduleLocationHeaderTarget(
  target: Element,
  selectedLocationIds: readonly string[],
): boolean {
  if (!selectedLocationIds.length) return false;
  const headerTarget = target.closest<HTMLElement>(
    "[data-schedule-location-filter-ids]",
  );
  if (!headerTarget) return false;
  const targetLocationIds = (
    headerTarget.dataset.scheduleLocationFilterIds ?? ""
  )
    .split(",")
    .filter(Boolean);
  return sameIdSet(selectedLocationIds, targetLocationIds);
}

export function isScheduleGridCellActivationTarget(target: Element): boolean {
  return Boolean(
    target.closest(
      [
        "[data-testid='schedule-cell-body']",
        ".schedule-cell-add",
        ".schedule-cell-add-another",
        ".schedule-cell-paste",
      ].join(","),
    ),
  );
}

export function isSchedulePreviewFocusedShiftBlankDismissTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-schedule-export-v2]")) return false;
  return !target.closest(
    [
      "button",
      "a[href]",
      "input",
      "textarea",
      "select",
      "summary",
      "label",
      "[contenteditable='true']",
      "[role='button']",
      "[role='link']",
      "[role='menuitem']",
      "[role='checkbox']",
      "[role='tab']",
      "[data-shift-badge='true']",
      "[data-schedule-preset-chip='true']",
      "[data-schedule-preset-cell='true']",
      "[data-preset-drop-cell='true']",
      "[data-schedule-location-filter-ids]",
      "[data-schedule-day-header-content='true']",
      "[data-schedule-top-bar]",
      "[data-schedule-filter-command-strip]",
      "[data-schedule-horizontal-nav]",
      "[role='menu']",
      "[role='toolbar']",
      SCHEDULE_WINDOW_SELECTOR,
      ".schedule-topbar",
      ".schedule-edit-banner",
      ".schedule-action-menu",
      ".schedule-published-menu",
      ".schedule-export-panel",
      ".schedule-export-dialog",
    ].join(","),
  );
}

export function isScheduleEditFocusedShiftBlankDismissTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  if (isScheduleGridCellActivationTarget(target)) return false;
  return isSchedulePreviewFocusedShiftBlankDismissTarget(target);
}

export function isSuppressedScheduleClickTarget(
  pointerTarget: Element | null,
  clickTarget: Element,
): boolean {
  if (!pointerTarget) return false;
  return (
    pointerTarget === clickTarget ||
    pointerTarget.contains(clickTarget) ||
    clickTarget.contains(pointerTarget)
  );
}
