import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const HOLD_ATTRIBUTE = "scheduleDragHold";
// Frames to keep the anchor in place after the rows change: the grid settles
// in the first, the rest catch a late layout (a font, a card's measure).
const FOLLOW_MS = 120;

interface GrabbedCard {
  readonly element: HTMLElement;
  readonly top: number;
  readonly left: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly columns: string;
}

interface Anchor {
  readonly element: HTMLElement;
  readonly top: number;
  readonly left: number;
}

/**
 * While a shift or a preset is dragged, people who cannot take it fold out
 * of the list, so the grid gets shorter and the browser pulls its scroll up.
 * The picked-up card stays under the mouse all the same, frame by frame while
 * the rows fold: the days keep their widths, the grid scrolls back to the
 * card and, where it cannot scroll that far, leaves empty space above or
 * below the rows (Mert, 2026-10-13). At the drop the rows unfold and the cell
 * the shift landed in stays where it is on screen (Mert, 2026-10-20); a drag
 * let go outside any cell brings the grid back to the height it was at when
 * the drag started (Mert, 2026-10-12).
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
  const dropRef = useRef<Anchor | null>(null);
  const followRef = useRef<number | null>(null);
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

  // The cell under the pointer as it lets go, before the rows come back.
  useEffect(() => {
    if (!active) return undefined;
    const remember = (event: MouseEvent) => {
      const hit = document.elementFromPoint?.(event.clientX, event.clientY);
      const cell = hit instanceof HTMLElement ? hit.closest<HTMLElement>("[data-drop-cell='true']") : null;
      if (!cell || !gridRef.current?.contains(cell)) return;
      const bounds = cell.getBoundingClientRect();
      dropRef.current = { element: cell, top: bounds.top, left: bounds.left };
    };
    window.addEventListener("pointerup", remember, true);
    window.addEventListener("mouseup", remember, true);
    return () => {
      window.removeEventListener("pointerup", remember, true);
      window.removeEventListener("mouseup", remember, true);
    };
  }, [active, gridRef]);

  useEffect(() => () => {
    if (followRef.current !== null) window.cancelAnimationFrame(followRef.current);
  }, []);

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
    if (!grid || !scroll || (!started && !ended)) return;
    if (followRef.current !== null) window.cancelAnimationFrame(followRef.current);
    followRef.current = null;
    // Keeps one element at one place on screen while the rows fold or unfold.
    // A scroll it did not make (the wheel, the drag's own edge scroll) ends it.
    const follow = (anchor: Anchor, done: () => void) => {
      const until = performance.now() + FOLLOW_MS;
      keepAt(grid, scroll, anchor);
      let kept = { top: scroll.scrollTop, left: scroll.scrollLeft };
      const frame = () => {
        if (!anchor.element.isConnected || scroll.scrollTop !== kept.top || scroll.scrollLeft !== kept.left) {
          followRef.current = null;
          return done();
        }
        keepAt(grid, scroll, anchor);
        kept = { top: scroll.scrollTop, left: scroll.scrollLeft };
        if (performance.now() < until) followRef.current = window.requestAnimationFrame(frame);
        else {
          followRef.current = null;
          done();
        }
      };
      followRef.current = window.requestAnimationFrame(frame);
    };
    if (started) {
      dropRef.current = null;
      const grabbed = grabbedRef.current;
      grabbedRef.current = null;
      if (!grabbed?.element.isConnected) return;
      // Set before anything is measured, so the first layout of the shorter
      // grid already has the days at their old widths.
      if (grabbed.columns && grabbed.columns !== "none") {
        grid.dataset[HOLD_ATTRIBUTE] = "true";
        if (!ownColumns.has(grid)) ownColumns.set(grid, grid.style.getPropertyValue("grid-template-columns"));
        grid.style.setProperty("grid-template-columns", grabbed.columns, "important");
        heldColumns.set(grid, grid.style.getPropertyValue("grid-template-columns"));
      }
      // Where the card was on screen as the drag began: where it was pressed,
      // moved by any scroll in between.
      const startTop = startTopRef.current ?? grabbed.scrollTop;
      const startLeft = startLeftRef.current ?? grabbed.scrollLeft;
      follow({
        element: grabbed.element,
        top: grabbed.top - (startTop - grabbed.scrollTop),
        left: grabbed.left - (startLeft - grabbed.scrollLeft),
      }, () => {});
      return;
    }
    const drop = dropRef.current;
    dropRef.current = null;
    if (!drop?.element.isConnected) {
      releaseGrid(grid);
      if (startTopRef.current !== null && scroll.scrollTop !== startTopRef.current) scroll.scrollTop = startTopRef.current;
      return;
    }
    follow(drop, () => releaseGrid(grid));
  }, [active, gridRef]);

  return { grab };
}

/** Scrolls, or pads above or below the rows, so the anchor sits where it was. */
function keepAt(grid: HTMLElement, scroll: HTMLElement, anchor: Anchor): void {
  const space = holdSpace(grid);
  // Counted as if the space added on an earlier frame were not there.
  const previousAbove = Number.parseFloat(space?.style.height ?? "") || 0;
  const previousBelow = Number.parseFloat(grid.style.paddingBottom) || 0;
  const now = anchor.element.getBoundingClientRect();
  let top = scroll.scrollTop - previousAbove + (now.top - anchor.top);
  const above = space ? Math.max(0, -top) : 0;
  top = Math.max(0, top);
  const rows = scroll.scrollHeight - previousAbove - previousBelow;
  const below = Math.max(0, top - (rows + above - scroll.clientHeight));
  // Written only when it changes: an unchanged write still costs a layout.
  if (space && Math.round(above) !== Math.round(previousAbove)) space.style.height = `${Math.round(above)}px`;
  if (Math.round(below) !== Math.round(previousBelow)) grid.style.paddingBottom = `${Math.round(below)}px`;
  if (scroll.scrollTop !== top) scroll.scrollTop = top;
  const left = Math.max(0, scroll.scrollLeft + (now.left - anchor.left));
  if (scroll.scrollLeft !== left) scroll.scrollLeft = left;
}

function holdSpace(grid: HTMLElement): HTMLElement | null {
  return grid.querySelector<HTMLElement>(":scope > .schedule-drag-hold-space");
}

// The grid's columns are React's inline style: React writes them only when
// they change, so a drop that removed them left the grid with none and the
// days wrapped onto new lines until a reload (Mert, 2026-10-21). The drop
// puts React's value back, unless React wrote a newer one during the drag.
const ownColumns = new WeakMap<HTMLElement, string>();
const heldColumns = new WeakMap<HTMLElement, string>();

function releaseGrid(grid: HTMLElement): void {
  delete grid.dataset[HOLD_ATTRIBUTE];
  const own = ownColumns.get(grid);
  const held = heldColumns.get(grid);
  ownColumns.delete(grid);
  heldColumns.delete(grid);
  if (held !== undefined && grid.style.getPropertyValue("grid-template-columns") === held) {
    if (own) grid.style.setProperty("grid-template-columns", own);
    else grid.style.removeProperty("grid-template-columns");
  }
  grid.style.removeProperty("padding-bottom");
  holdSpace(grid)?.style.removeProperty("height");
}
