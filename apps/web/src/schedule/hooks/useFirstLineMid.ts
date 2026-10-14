import { useLayoutEffect, type RefObject } from "react";

// Every top mark sits level with the card's first line (Mert, 2026-10-14:
// "Her zaman için ilk satır meta datayla aynı hizada olsun"). The card keeps
// the middle of its first line in --shift-card-line1-mid (px from the top of
// its padding box); styles.css puts the marks on it.
export function useFirstLineMid(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const badge = ref.current;
    if (!badge) return undefined;
    const content = badge.querySelector<HTMLElement>("[data-shift-badge-content]");
    if (!content) return undefined;
    const set = () => {
      const first = content.firstElementChild;
      if (!first) return;
      const card = badge.getBoundingClientRect();
      const line = first.getBoundingClientRect();
      if (!line.height) return;
      // Half pixels, so the marks settle.
      const mid = Math.round((line.top + line.height / 2 - card.top - badge.clientTop) * 2) / 2;
      const value = `${mid}px`;
      if (badge.style.getPropertyValue("--shift-card-line1-mid") !== value) {
        badge.style.setProperty("--shift-card-line1-mid", value);
      }
    };
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    // The card's height (its row) and the words' own box (a band's padding).
    const observer = new ResizeObserver(set);
    observer.observe(badge);
    observer.observe(content, { box: "border-box" });
    return () => observer.disconnect();
  }, [ref]);
}
