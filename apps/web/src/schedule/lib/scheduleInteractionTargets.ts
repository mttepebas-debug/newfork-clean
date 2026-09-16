export function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
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
    target.closest(".schedule-topbar-dismiss-layer") ||
    target.closest("[data-topbar-filter-content]") ||
    target.closest("[data-shift-quick-editor-content]") ||
    target.closest("[data-schedule-conflict-sheet-content]") ||
    target.closest("[data-schedule-conflict-toast-content]") ||
    target.closest("[role='menu']") ||
    target.closest("[role='toolbar']") ||
    target.closest("[role='dialog']") ||
    target.closest(".schedule-topbar") ||
    target.closest(".schedule-edit-banner") ||
    target.closest(".schedule-quick-editor") ||
    target.closest(".schedule-action-menu") ||
    target.closest(".schedule-published-menu") ||
    target.closest(".schedule-export-panel") ||
    target.closest(".schedule-export-dialog") ||
    target.closest(".schedule-template-dialog"),
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
      "[role='menu']",
      "[role='toolbar']",
      "[role='dialog']",
      ".schedule-cell-paste",
      ".schedule-topbar",
      ".schedule-edit-banner",
      ".schedule-quick-editor",
      ".schedule-action-menu",
      ".schedule-published-menu",
      ".schedule-export-panel",
      ".schedule-export-dialog",
      ".schedule-template-dialog",
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
      "[role='menu']",
      "[role='toolbar']",
      "[role='dialog']",
      "[role='alertdialog']",
      ".schedule-topbar",
      ".schedule-edit-banner",
      ".schedule-quick-editor",
      ".schedule-action-menu",
      ".schedule-published-menu",
      ".schedule-export-panel",
      ".schedule-export-dialog",
      ".schedule-template-dialog",
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
