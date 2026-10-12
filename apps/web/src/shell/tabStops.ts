/** Everything a window's Tab trap may land on, `<summary>` included (BL-960). */
export const TAB_STOP_SELECTOR =
  'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"], summary, [contenteditable="true"]';

/** What a closed <details> folds away is no Tab stop; its summary still is. */
export function foldedAway(element: HTMLElement): boolean {
  const fold = element.closest("details:not([open])");
  return Boolean(fold && !fold.querySelector(":scope > summary")?.contains(element));
}
