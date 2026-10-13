import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const HOLD_ATTRIBUTE = "scheduleDragHold";
const HOLD_COLUMNS = "--schedule-drag-hold-columns";
const HOLD_TOP = "--schedule-drag-hold-top";
const HOLD_BOTTOM = "--schedule-drag-hold-bottom";

interface GrabbedCard {
  readonly element: HTMLElement;
  readonly top: number;
  readonly left: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly columns: string;
}

/**
 * While a shift or a preset is dragged, people who cannot take it leave the
 * list, so the grid gets shorter and the browser pulls its scroll up. The
 * picked-up card stays under the mouse all the same: the days keep their
 * widths, the grid scrolls back to the card and, where it cannot scroll that
 * far, leaves empty space above or below the rows (Mert, 2026-10-13). Once
 * the drop brings the rows back, the grid returns to the height it was at
 * when the drag started; sideways it stays where the drag left it (Mert,
 * 2026-10-12).
 */
export function useKeepScrollThroughDrag({
  active,
  gridRef,
}: {
  readonly active: boolean;
  readonly gridRef: RefObject<HTMLDivElement | null>;
}): { readonly grab: (element: HTMLElement) => void } {
  const activeRef = useRef(active);
  const wasActiveRef = useRef(active);
  const startTopRef = useRef<number | null>(null);
  const startLeftRef = useRef<number | null>(null);
  const grabbedRef = useRef<GrabbedCard | null>(null);
  // Read during render: the shrink's own scroll event comes after this
  // render, and must not count as the place the drag started from.
  activeRef.current = active;

  // Runs again after each drag (the grid may have mounted late); it starts
  // listening from the place the grid is at, never from a shrunken list.
  useEffect(() => {
    const scroll = gridRef.current?.closest<HTMLElement>(".schedule-grid-scroll");
    if (!scroll) return undefined;
    const remember = () => {
      if (activeRef.current) return;
      startTopRef.current = scroll.scrollTop;
      startLeftRef.current = scroll.scrollLeft;
    };
    if (!active) remember();
    scroll.addEventListener("scroll", remember, { passive: true });
    return () => scroll.removeEventListener("scroll", remember);
  }, [active, gridRef]);

  // A press on a card: where it is and how wide each day is, before any row
  // leaves. A press that never becomes a drag is overwritten by the next one.
  const grab = useCallback(
    (element: HTMLElement) => {
      const grid = gridRef.current;
      const scroll = grid?.closest<HTMLElement>(".schedule-grid-scroll");
      if (activeRef.current || !grid || !scroll) return;
      const bounds = element.getBoundingClientRect();
      grabbedRef.current = {
        element,
        top: bounds.top,
        left: bounds.left,
        scrollTop: scroll.scrollTop,
        scrollLeft: scroll.scrollLeft,
        columns: window.getComputedStyle(grid).gridTemplateColumns,
      };
    },
    [gridRef],
  );

  useLayoutEffect(() => {
    const started = !wasActiveRef.current && active;
    const ended = wasActiveRef.current && !active;
    wasActiveRef.current = active;
    const grid = gridRef.current;
    const scroll = grid?.closest<HTMLElement>(".schedule-grid-scroll");
    if (!grid || !scroll) return;
    if (started) {
      const grabbed = grabbedRef.current;
      grabbedRef.current = null;
      if (grabbed?.element.isConnected) holdCard(grid, scroll, grabbed, startTopRef.current, startLeftRef.current);
      return;
    }
    if (!ended) return;
    releaseGrid(grid);
    if (startTopRef.current !== null && scroll.scrollTop !== startTopRef.current) scroll.scrollTop = startTopRef.current;
  }, [active, gridRef]);

  return { grab };
}

function holdCard(
  grid: HTMLElement,
  scroll: HTMLElement,
  grabbed: GrabbedCard,
  startTop: number | null,
  startLeft: number | null,
): void {
  // Set before anything is measured, so the first layout of the shorter grid
  // already has the days at their old widths.
  if (grabbed.columns && grabbed.columns !== "none") {
    grid.dataset[HOLD_ATTRIBUTE] = "true";
    grid.style.setProperty(HOLD_COLUMNS, grabbed.columns);
  }
  // Where the card was on screen as the drag began: where it was pressed,
  // moved by any scroll in between.
  const wantedTop = grabbed.top - ((startTop ?? grabbed.scrollTop) - grabbed.scrollTop);
  const wantedLeft = grabbed.left - ((startLeft ?? grabbed.scrollLeft) - grabbed.scrollLeft);
  const now = grabbed.element.getBoundingClientRect();
  let top = scroll.scrollTop + (now.top - wantedTop);
  const above = Math.max(0, -top);
  top = Math.max(0, top);
  const below = Math.max(0, top - (scroll.scrollHeight + above - scroll.clientHeight));
  grid.style.setProperty(HOLD_TOP, `${Math.round(above)}px`);
  grid.style.setProperty(HOLD_BOTTOM, `${Math.round(below)}px`);
  scroll.scrollTop = top;
  scroll.scrollLeft = Math.max(0, scroll.scrollLeft + (now.left - wantedLeft));
}

function releaseGrid(grid: HTMLElement): void {
  delete grid.dataset[HOLD_ATTRIBUTE];
  grid.style.removeProperty(HOLD_COLUMNS);
  grid.style.removeProperty(HOLD_TOP);
  grid.style.removeProperty(HOLD_BOTTOM);
}
