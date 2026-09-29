import { useEffect } from "react";

// A Schedule window owns its Escape: it listens in the capture phase so the
// page-level handler, which ignores keys typed into fields, never sees it
// (BL-329). A window that must stay open (e.g. while sending) passes a no-op;
// a closed one passes null and leaves Escape to the page.
export function useCloseOnEscape(onClose: (() => void) | null): void {
  useEffect(() => {
    if (!onClose) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);
}
