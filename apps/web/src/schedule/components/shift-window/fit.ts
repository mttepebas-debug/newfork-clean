// How big the shift window is and where it sits. It never scrolls and never
// leaves the screen: it takes the size its content needs, and only when that
// does not fit does it put its second column beside the first, then make the
// time line's person rows shorter, then list the people who still do not fit
// in one "more" list. It opens beside the cell or shift it belongs to and
// keeps its place while it is open, so nothing jumps while you type or drag.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import type { ShiftWindowLayout } from "../../store/scheduleUiStore";

export const WINDOW_WIDTH: Record<ShiftWindowLayout, { readonly stacked: number; readonly wide: number }> = {
  form: { stacked: 404, wide: 760 },
  timeline: { stacked: 720, wide: 1040 },
};
export const SCREEN_PAD = 8;
export const LANE_MAX = 40;
export const LANE_MIN = 28;
const COLUMN_GAP = 6;
// Room kept for the yellow rule box, so it can appear without moving the window.
export const PREVIEW_ROOM = 56;
const ANCHOR_GAP = 10;
const ARROW_OFFSET = 72;

export interface Fit {
  /** Second column beside the first instead of under it. */
  readonly wide: boolean;
  /** Height of a person's row on the time line. */
  readonly laneHeight: number;
  /** How many person rows fit; the rest go into one "more" list. */
  readonly cap: number;
}

export const ROOMY: Fit = { wide: false, laneHeight: LANE_MAX, cap: Number.POSITIVE_INFINITY };

export function fitTightness(fit: Fit): number {
  return (fit.wide ? 10_000 : 0) + (LANE_MAX - fit.laneHeight) * 100 + (Number.isFinite(fit.cap) ? 1_000 - fit.cap : 0);
}

export interface FitMeasure {
  /** Room the two columns may take: screen height less the header, footer and kept room. */
  readonly room: number;
  /** First column without its person rows. */
  readonly top: number;
  /** Second column. */
  readonly side: number;
  /** Person rows on the time line (0 in the form). */
  readonly lanes: number;
}

/** The roomiest size that fits. */
export function chooseFit({ room, top, side, lanes }: FitMeasure): Fit {
  const stacked = (lane: number) => top + lanes * lane + COLUMN_GAP + side;
  const wide = (lane: number) => Math.max(top + lanes * lane, side);
  if (stacked(LANE_MAX) <= room) return ROOMY;
  if (wide(LANE_MAX) <= room || lanes === 0) return { wide: true, laneHeight: LANE_MAX, cap: Number.POSITIVE_INFINITY };
  const lane = Math.floor((room - top) / lanes);
  return lane >= LANE_MIN
    ? { wide: true, laneHeight: Math.min(LANE_MAX, lane), cap: Number.POSITIVE_INFINITY }
    : { wide: true, laneHeight: LANE_MIN, cap: Math.max(3, Math.floor((room - top) / LANE_MIN)) };
}

function isWidthMoving(element: HTMLElement): boolean {
  if (typeof CSSTransition === "undefined" || typeof element.getAnimations !== "function") return false;
  return element.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === "width");
}

/**
 * Within one opening the window only gets tighter, so it never flips back and
 * forth under the pointer; a new layout, another set of people or a resized
 * screen start again from roomy.
 */
export function useFit(windowRef: RefObject<HTMLElement | null>, layout: ShiftWindowLayout, lanes: number): Fit {
  const [fit, setFit] = useState<Fit>(ROOMY);
  const [screen, setScreen] = useState(0);
  useEffect(() => {
    const onResize = () => setScreen((value) => value + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    setFit(ROOMY);
  }, [layout, lanes, screen]);
  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element) return undefined;
    const measure = () => {
      // Never change size while a bar is being dragged or the width is moving.
      if (element.querySelector("[data-busy]") || isWidthMoving(element)) return;
      const cols = element.querySelector<HTMLElement>(".shift-window-cols");
      const a = element.querySelector<HTMLElement>(".shift-window-col-a");
      const b = element.querySelector<HTMLElement>(".shift-window-col-b");
      if (!cols || !a || !b) return;
      const laneRows = element.querySelector<HTMLElement>(".shift-window-lanes");
      const reserve = element.querySelector(".shift-window-preview") ? 0 : PREVIEW_ROOM;
      const next = chooseFit({
        room: window.innerHeight - SCREEN_PAD * 2 - reserve - (element.offsetHeight - cols.offsetHeight),
        top: a.offsetHeight - (laneRows?.offsetHeight ?? 0),
        side: b.offsetHeight,
        lanes: laneRows ? lanes : 0,
      });
      setFit((current) => (fitTightness(next) > fitTightness(current) ? next : current));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    element.addEventListener("transitionend", measure);
    window.addEventListener("pointerup", measure);
    return () => {
      observer?.disconnect();
      element.removeEventListener("transitionend", measure);
      window.removeEventListener("pointerup", measure);
    };
  }, [windowRef, lanes, layout, screen]);
  return fit;
}

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export interface Anchor {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** The shift being edited, else the cell getting the new shift, else the pointer. */
function readAnchor(shiftId: string | null, fallback: { readonly x?: number; readonly y?: number }): Anchor {
  const element = shiftId
    ? document.querySelector(`[data-shift-badge="true"][data-shift-id="${shiftId}"]:not([data-ghost="true"])`)
    : document.querySelector('.schedule-cell[data-shift-editor-active-cell="true"]');
  if (element) return element.getBoundingClientRect();
  const x = typeof fallback.x === "number" && Number.isFinite(fallback.x) ? fallback.x : window.innerWidth / 2;
  const y = typeof fallback.y === "number" && Number.isFinite(fallback.y) ? fallback.y : window.innerHeight / 3;
  return { top: y, left: x, right: x, bottom: y, width: 0, height: 0 };
}

export interface Placement {
  readonly left: number;
  readonly top: number;
  /** Which side of the anchor the window is on; below has no arrow. */
  readonly side: "right" | "left" | "below";
  readonly arrowTop: number;
}

/** Right of the anchor when it fits, else left, else below or above it; never off the screen. */
export function placeWindow(
  anchor: Anchor,
  size: { readonly width: number; readonly height: number; readonly planned: number },
  screen: { readonly width: number; readonly height: number },
): Placement {
  const { width, height, planned } = size;
  let side: Placement["side"] = "right";
  let left = anchor.right + ANCHOR_GAP;
  if (left + width > screen.width - SCREEN_PAD) {
    side = "left";
    left = anchor.left - ANCHOR_GAP - width;
  }
  if (left < SCREEN_PAD) {
    side = "below";
    left = Math.max(SCREEN_PAD, Math.min(screen.width - width - SCREEN_PAD, anchor.left + anchor.width / 2 - width / 2));
  }
  let top = side === "below" ? anchor.bottom + ANCHOR_GAP : anchor.top + anchor.height / 2 - ARROW_OFFSET;
  if (side === "below" && top + planned > screen.height - SCREEN_PAD) top = Math.max(SCREEN_PAD, anchor.top - ANCHOR_GAP - planned);
  top = Math.max(SCREEN_PAD, Math.min(screen.height - planned - SCREEN_PAD, top));
  const arrowTop = Math.max(16, Math.min(height - 24, anchor.top + anchor.height / 2 - top));
  return { left, top, side, arrowTop };
}

/**
 * Beside the anchor. While the window is open its planned height only grows,
 * so when its content grows it moves up only as far as it must to stay on the
 * screen and never moves back down when the content shrinks. Room for the
 * yellow rule box is kept from the start. The header drags it anywhere.
 */
export function usePlacement(
  windowRef: RefObject<HTMLElement | null>,
  shiftId: string | null,
  fallback: { readonly x?: number; readonly y?: number },
  width: number,
  sizeKey: string,
) {
  const [anchor, setAnchor] = useState<Anchor>(() => readAnchor(shiftId, fallback));
  // Height and whether the rule box is showing, read together from the window itself.
  const [measured, setMeasured] = useState<{ key: string; height: number; preview: boolean } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const screen = { width: window.innerWidth, height: window.innerHeight };
  const key = `${sizeKey}|${Math.round(anchor.top)}|${Math.round(anchor.left)}|${screen.width}|${screen.height}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const tallest = useRef({ key: "", height: 0 });
  const fallbackX = fallback.x;
  const fallbackY = fallback.y;
  useLayoutEffect(() => {
    const read = () => setAnchor(readAnchor(shiftId, { x: fallbackX, y: fallbackY }));
    const frame = window.requestAnimationFrame(read);
    window.addEventListener("resize", read);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", read);
    };
  }, [shiftId, fallbackX, fallbackY]);
  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element) return undefined;
    const read = () => setMeasured({
      key: keyRef.current,
      height: element.offsetHeight,
      preview: !!element.querySelector(".shift-window-preview"),
    });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    observer?.observe(element);
    read();
    return () => observer?.disconnect();
  }, [windowRef]);
  const height = measured?.height ?? 0;
  if (tallest.current.key !== key) tallest.current = { key, height: 0 };
  let planned = height + (measured?.preview ? 0 : PREVIEW_ROOM);
  if (measured?.key === key) {
    planned = Math.max(tallest.current.height, planned);
    tallest.current.height = planned;
  }
  const place = placeWindow(anchor, { width, height, planned }, screen);
  const dragged = offset.x !== 0 || offset.y !== 0;
  return {
    left: Math.max(SCREEN_PAD, Math.min(screen.width - width - SCREEN_PAD, place.left + offset.x)),
    top: Math.max(SCREEN_PAD, Math.min(screen.height - height - SCREEN_PAD, place.top + offset.y)),
    side: dragged || place.side === "below" ? undefined : place.side,
    arrowTop: place.arrowTop,
    dragHandlers: {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button > 0) return;
        if (event.target instanceof Element && event.target.closest("button, input, select, textarea, [role='combobox']")) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        setOffset({ x: current.ox + event.clientX - current.x, y: current.oy + event.clientY - current.y });
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        if (drag.current?.id !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
    },
  };
}

/** The shift being edited is marked on the grid while its window is open. */
export function useEditedBadgeMark(shiftId: string | null) {
  useEffect(() => {
    if (!shiftId) return undefined;
    const badges = [...document.querySelectorAll<HTMLElement>(`[data-shift-badge="true"][data-shift-id="${shiftId}"]:not([data-ghost="true"])`)];
    badges.forEach((badge) => badge.setAttribute("data-shift-window-target", "true"));
    return () => badges.forEach((badge) => badge.removeAttribute("data-shift-window-target"));
  }, [shiftId]);
}
