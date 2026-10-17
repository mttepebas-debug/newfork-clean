import { useEffect, useState } from "react";
import { useListPhoneWidth } from "../lib/usePhoneWidth";

// On a phone, Settings' and Account's menu sits under the page heading's
// line, where a page's own tabs sit (Mert 2026-10-17, "Başlığın altında"), so
// every heading line is at the same height (phone-page-top.css). The layout
// renders its menu into the box this hook keeps in the first page heading in
// `area`; on a computer, or before a heading is there, it returns null and
// the menu stays at the side.
const HEADINGS = ".catalog-page-header, .settings-page-header, .account-page-header";

export function usePhonePageMenu(area: HTMLElement | null): HTMLElement | null {
  const phone = useListPhoneWidth();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!area || !phone) return;
    let box: HTMLElement | null = null;
    // Whether focus is in the menu. A page that changes takes its heading, the
    // box and the chosen link with it, and the browser sends no focusout then;
    // the next page may first show its loading state, with no heading yet.
    let focused = false;
    let restore = false;
    let frame = 0;
    const onFocusIn = () => {
      focused = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      // Focus that goes nowhere is either a page change taking the link away
      // (Chrome reports that too) or a tap elsewhere, which onPointerDown sees.
      if (event.relatedTarget instanceof Node && !box?.contains(event.relatedTarget)) focused = false;
    };
    // Focus that went somewhere else, or a tap outside the menu (on an empty
    // spot, or on a link iOS does not focus), is the person's own choice.
    const leave = (event: Event) => {
      if (event.target instanceof Node && box?.contains(event.target)) return;
      focused = false;
      restore = false;
    };
    const focusActive = (into: HTMLElement, tries: number) => {
      // The menu renders into the new box on the next commit.
      frame = requestAnimationFrame(() => {
        const link = into.querySelector<HTMLElement>('[aria-current="page"], .active');
        if (link) link.focus({ preventScroll: true });
        else if (tries > 0 && into.isConnected) focusActive(into, tries - 1);
      });
    };
    const place = () => {
      const heading = [...area.querySelectorAll<HTMLElement>(HEADINGS)].find(
        (element) => !element.closest('dialog, [role="dialog"], [aria-modal="true"]'),
      );
      if (box && box.parentElement === heading) return;
      if (focused && (!box?.isConnected || box.contains(document.activeElement))) restore = true;
      box?.remove();
      box = null;
      focused = false;
      if (heading) {
        box = document.createElement("div");
        box.className = "phone-page-menu";
        box.addEventListener("focusin", onFocusIn);
        box.addEventListener("focusout", onFocusOut);
        // Before the heading's own tabs, the order it is drawn in (Settings → Acknowledgements).
        const tabs = [...heading.children].find((child) => child.querySelector('[role="tablist"]'));
        heading.insertBefore(box, tabs ?? null);
      }
      setSlot(box);
      if (restore && box) {
        restore = false;
        cancelAnimationFrame(frame);
        focusActive(box, 10);
      }
    };
    document.addEventListener("focusin", leave);
    document.addEventListener("pointerdown", leave, true);
    place();
    // A new page brings a new heading.
    const changes = new MutationObserver(place);
    changes.observe(area, { childList: true, subtree: true });
    return () => {
      changes.disconnect();
      document.removeEventListener("focusin", leave);
      document.removeEventListener("pointerdown", leave, true);
      cancelAnimationFrame(frame);
      box?.remove();
      setSlot(null);
    };
  }, [area, phone]);
  return phone ? slot : null;
}
