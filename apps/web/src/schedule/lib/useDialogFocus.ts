import { useLayoutEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"], summary, [contenteditable="true"]';

/** What a closed <details> folds away is no Tab stop; its summary still is. */
function foldedAway(element: HTMLElement): boolean {
  const fold = element.closest("details:not([open])");
  return Boolean(fold && !fold.querySelector(":scope > summary")?.contains(element));
}

/**
 * BL-711 (WCAG 2.4.3): a Schedule window takes the keyboard when it opens
 * (its `[data-dialog-autofocus]` control, else its first one), keeps Tab and
 * Shift+Tab inside, and gives focus back to what opened it when it closes.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open = true): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!open || !root) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.closest("[inert], [hidden]") && !foldedAway(element),
      );
    const initial = root.querySelector<HTMLElement>("[data-dialog-autofocus]") ?? focusable()[0];
    if (initial) initial.focus({ preventScroll: true });
    else {
      if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      // A window opened on top of this one owns its own Tab.
      const owner = (event.target as Element | null)?.closest?.('[role="dialog"], [role="alertdialog"]');
      if (owner && owner !== root) return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      // A spot that is no stop (the window itself, a tabindex="-1" note) wraps too.
      const inside = Boolean(active && elements.includes(active));
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, open]);
}
