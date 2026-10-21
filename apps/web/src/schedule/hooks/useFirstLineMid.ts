import { useLayoutEffect, type RefObject } from "react";

// Every top mark sits level with the card's first line (Mert, 2026-10-14:
// "Her zaman için ilk satır meta datayla aynı hizada olsun"). The card keeps
// the middle of its first line in --shift-card-line1-mid (px from the top of
// its padding box); styles.css puts the marks on it. NEW sits level with the
// last line the same way (--shift-card-lastline-mid, px up from the bottom of
// the padding box; Mert, 2026-10-21); a one-line card has none.
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
      const last = content.lastElementChild;
      if (!last || last === first) {
        badge.style.removeProperty("--shift-card-lastline-mid");
        return;
      }
      const lastLine = last.getBoundingClientRect();
      const bottom = card.top + badge.clientTop + badge.clientHeight;
      const lastValue = `${Math.round((bottom - lastLine.top - lastLine.height / 2) * 2) / 2}px`;
      if (badge.style.getPropertyValue("--shift-card-lastline-mid") !== lastValue) {
        badge.style.setProperty("--shift-card-lastline-mid", lastValue);
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
