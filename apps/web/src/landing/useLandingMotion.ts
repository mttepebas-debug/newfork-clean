import { useEffect, useState, type RefObject } from "react";

const reducedQuery = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia(reducedQuery).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(reducedQuery);
    const update = () => setReduced(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

// Marks every [data-reveal] under the root as shown once it scrolls into
// view; without IntersectionObserver everything is shown at once.
export function useReveal(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const targets = Array.from(element.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof IntersectionObserver !== "function") {
      targets.forEach((target) => target.classList.add("is-shown"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-shown");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [root]);
}

// Writes the page scroll position (0–1) to a CSS variable on the root.
export function useScrollProgress(root: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      root.current?.style.setProperty("--lp-progress", progress.toFixed(4));
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root]);
  return scrolled;
}

export function useRotation(length: number, intervalMs: number, enabled: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % length), intervalMs);
    return () => window.clearTimeout(timer);
  }, [enabled, index, intervalMs, length]);
  return [index, setIndex] as const;
}
