import { useEffect, useState, type RefObject } from "react";

type Options = {
  /** Fraction of the element that must be visible. */
  readonly threshold?: number;
  readonly rootMargin?: string;
  /** Stop observing after the first time it is seen. */
  readonly once?: boolean;
};

export function useInView(
  ref: RefObject<Element | null>,
  { threshold = 0.25, rootMargin = "0px", once = false }: Options = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin, once]);
  return inView;
}
