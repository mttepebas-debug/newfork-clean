/** Everything a window's Tab trap may land on, `<summary>` included (BL-960). */
export const TAB_STOP_SELECTOR =
  'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"], summary, [contenteditable="true"]';

/** What any closed <details> folds away is no Tab stop; its own summary still is. */
export function foldedAway(element: HTMLElement): boolean {
  for (
    let fold = element.closest("details:not([open])");
    fold;
    fold = fold.parentElement?.closest("details:not([open])") ?? null
  ) {
    if (!fold.querySelector(":scope > summary")?.contains(element)) return true;
  }
  return false;
}
