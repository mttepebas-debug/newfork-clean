import { useEffect, useState } from "react";
import { useListPhoneWidth } from "../lib/usePhoneWidth";

// On a phone, Settings' and Account's menu sits under the page heading's
// line, where a page's own tabs sit (Mert 2026-10-17, "Başlığın altında"), so
// every heading line is at the same height (phone-page-top.css). The layout
// renders its menu into the box this hook keeps at the end of the first page
// heading in `area`; on a computer, or before a heading is there, it returns
// null and the menu stays at the side.
const HEADINGS = ".catalog-page-header, .settings-page-header, .account-page-header";

export function usePhonePageMenu(area: HTMLElement | null): HTMLElement | null {
  const phone = useListPhoneWidth();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!area || !phone) return;
    let box: HTMLElement | null = null;
    const place = () => {
      const heading = [...area.querySelectorAll<HTMLElement>(HEADINGS)].find(
        (element) => !element.closest('dialog, [role="dialog"], [aria-modal="true"]'),
      );
      if (box && box.parentElement === heading) return;
      box?.remove();
      box = null;
      if (heading) {
        box = document.createElement("div");
        box.className = "phone-page-menu";
        heading.append(box);
      }
      setSlot(box);
    };
    place();
    // A new page brings a new heading.
    const changes = new MutationObserver(place);
    changes.observe(area, { childList: true, subtree: true });
    return () => {
      changes.disconnect();
      box?.remove();
      setSlot(null);
    };
  }, [area, phone]);
  return phone ? slot : null;
}
