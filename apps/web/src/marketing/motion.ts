import { useEffect, useRef, useState, type RefObject } from "react";

/** True when the visitor asked the system for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => readReducedMotion());
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Whether the element is on screen. With `once`, it stays true after the
 * first sighting, which is what an entrance animation wants. Without an
 * IntersectionObserver (old browsers, tests) everything counts as visible.
 */
export function useInView<T extends Element>(
  options: {
    readonly once?: boolean;
    readonly rootMargin?: string;
    readonly threshold?: number;
  } = {},
): [RefObject<T | null>, boolean] {
  const {
    once = false,
    rootMargin = "0px 0px -12% 0px",
    threshold = 0.15,
  } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);
  return [ref, inView];
}

/**
 * Steps through `durations` (ms) in a loop while `running`, and returns the
 * index of the current scene. Reduced motion pins it to `restScene`.
 */
export function useSceneLoop(
  durations: readonly number[],
  running: boolean,
  restScene: number,
): number {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(
      () => setScene((current) => (current + 1) % durations.length),
      durations[scene] ?? 1000,
    );
    return () => window.clearTimeout(timer);
  }, [durations, running, scene]);
  return running ? scene : restScene;
}
