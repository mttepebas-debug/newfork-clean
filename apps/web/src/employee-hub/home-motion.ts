// The Daylight Home's motion (variant A, Mert 2026-10-18): everything follows
// the finger's position, never a timer. The page scrolls in `main.app-main`;
// this writes CSS variables the stylesheet reads:
//   --st on the Home root   how far the page scrolled (the greeting fades by it)
//   .is-far on the root     past the greeting: the top bar shows the next shift
//   --p on each [data-rise] how far a section came into view (0 → 1)
// Pull to refresh is the shell's (shell/PullToRefresh.tsx).
// "Reduce motion" leaves every variable at rest.
import { useEffect, useState, type RefObject } from "react";

const reduceQuery = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(reduceQuery).matches;

/** How far below the top the greeting counts as gone. */
export const FAR = 190;

export function useHomeScroll(root: RefObject<HTMLElement | null>) {
  const [far, setFar] = useState(false);
  useEffect(() => {
    const home = root.current;
    const main = home?.closest<HTMLElement>(".app-main") ?? null;
    if (!home || !main) return;
    let frame = 0;
    let items: { el: HTMLElement; top: number; end: number }[] = [];
    let lastFar = false;
    const measure = () => {
      // Measured where each section rests, without its own lift (.is-measuring turns it off).
      home.classList.add("is-measuring");
      const base = main.getBoundingClientRect().top - main.scrollTop;
      const max = Math.max(0, main.scrollHeight - main.clientHeight);
      const vh = main.clientHeight;
      items = Array.from(home.querySelectorAll<HTMLElement>("[data-rise]")).map((el) => {
        const top = el.getBoundingClientRect().top - base;
        // A section the page can never scroll up to still finishes rising at the bottom.
        return { el, top, end: Math.max(vh * 0.6, top - max + 1) };
      });
      home.classList.remove("is-measuring");
      tick();
    };
    const tick = () => {
      frame = 0;
      const reduce = prefersReducedMotion();
      const st = Math.max(0, main.scrollTop);
      const vh = main.clientHeight;
      home.style.setProperty("--st", reduce ? "0" : st.toFixed(1));
      const nextFar = st > FAR;
      if (nextFar !== lastFar) {
        lastFar = nextFar;
        setFar(nextFar);
      }
      for (const item of items) {
        const p = reduce ? 1 : Math.min(1, Math.max(0, (vh - (item.top - st)) / Math.max(40, vh - item.end)));
        item.el.style.setProperty("--p", p.toFixed(3));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => requestAnimationFrame(measure));
    observer?.observe(home);
    observer?.observe(main);
    measure();
    return () => {
      main.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root]);
  return far;
}
