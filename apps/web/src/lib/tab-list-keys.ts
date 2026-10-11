import type { KeyboardEvent } from "react";

const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];

/**
 * BL-602: the WAI-ARIA tab pattern for a `role="tablist"`: ← → move to the
 * next tab and choose it (wrapping), Home and End jump to the ends. Each tab
 * sets `tabIndex` 0 only when selected, so the list is one Tab stop.
 */
export function onTabListKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (!keys.includes(event.key)) return;
  const list = event.currentTarget;
  const tabs = Array.from(
    list.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ).filter((tab) => !tab.disabled && tab.closest('[role="tablist"]') === list);
  const at = tabs.indexOf(event.target as HTMLButtonElement);
  if (at < 0 || tabs.length < 2) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
          tabs.length;
  tabs[next]!.focus();
  tabs[next]!.click();
}
