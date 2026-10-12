import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * While a shift or a preset is dragged, people who cannot take it leave the
 * list, so the grid gets shorter and the browser pulls its scroll up. Once the
 * drop brings the rows back, the grid returns to the height it was at when the
 * drag started; sideways it stays where the drag left it (Mert, 2026-10-12).
 */
export function useKeepScrollThroughDrag({
  active,
  gridRef,
}: {
  readonly active: boolean;
  readonly gridRef: RefObject<HTMLDivElement | null>;
}): void {
  const activeRef = useRef(active);
  const wasActiveRef = useRef(active);
  const startTopRef = useRef<number | null>(null);
  // Read during render: the shrink's own scroll event comes after this
  // render, and must not count as the place the drag started from.
  activeRef.current = active;

  // Runs again after each drag (the grid may have mounted late); it starts
  // listening from the place the grid is at, never from a shrunken list.
  useEffect(() => {
    const scroll = gridRef.current?.closest<HTMLElement>(".schedule-grid-scroll");
    if (!scroll) return undefined;
    if (!active) startTopRef.current = scroll.scrollTop;
    const remember = () => {
      if (!activeRef.current) startTopRef.current = scroll.scrollTop;
    };
    scroll.addEventListener("scroll", remember, { passive: true });
    return () => scroll.removeEventListener("scroll", remember);
  }, [active, gridRef]);

  useLayoutEffect(() => {
    const ended = wasActiveRef.current && !active;
    wasActiveRef.current = active;
    if (!ended || startTopRef.current === null) return;
    const scroll = gridRef.current?.closest<HTMLElement>(".schedule-grid-scroll");
    if (scroll && scroll.scrollTop !== startTopRef.current) scroll.scrollTop = startTopRef.current;
  }, [active, gridRef]);
}
