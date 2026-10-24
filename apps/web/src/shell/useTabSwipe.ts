import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefCallback } from "react";
import { useListPhoneWidth } from "../lib/usePhoneWidth";

// KARARLAR §1.5 (Mert 2026-10-17, "Telefonda sekmeli sayfalarda yana kaydırma"): on a phone, a sideways
// swipe on a tabbed page's content moves to the next tab (finger to the left) or the previous one, and
// stops at the ends. The new tab slides in from the side it came from. What moves sideways on its own keeps
// its swipe: the tab row, fields, a control group (Lineup's day wheel, its shift tabs), a sheet, a strip
// that scrolls sideways. The browser's swipe back from the screen's edge is off while such a page is open.
// One hook for every tabbed page (Employee Schedule · Lineup, Shift Hub, My Availability, Account →
// Documents, the manager's phone Lineup).

/** The swipe the studio tried (Newfork mobile studio, "Telefonda sekmeler: tek stil"). */
const MIN_DISTANCE = 56;
const MAX_SLOPE = 1.6;
const MAX_MS = 900;
/** The screen-edge band where a touch would start iOS Safari's swipe back, px. */
export const EDGE_BAND = 16;
/** The slide-in: 26 px from the side, from a third of its strength, 0.22 s. */
const SLIDE_PX = 26;
const SLIDE_MS = 220;

// Text boxes keep a finger's sideways move for the caret and the selection (a date, a time, a choice box and a
// checkbox have none: a swipe across them still changes the tab).
const OWN_SWIPE =
  'textarea, input:not([type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"], [type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"]), [contenteditable=""], [contenteditable="true"], [role="tablist"], [role="tab"], [role="group"], [role="slider"], [role="dialog"], dialog, [aria-modal="true"], nav';
/**
 * Where a page's swipe can start: the whole area the page sits in (the app's, or the account's), not only as far
 * down as its content reaches. A tab with little on it ends under its first box while its page goes on down the
 * screen (Mert 2026-10-19, Shift Hub → My requests: a swipe under "You're all caught up" did nothing).
 */
const PAGE_AREA = ".app-main, .account-shell";
const CONTROL = 'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [contenteditable=""], [contenteditable="true"]';

/** 1: the next tab (the finger went left), -1: the previous one, 0: not a swipe. */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > MAX_MS || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * MAX_SLOPE) return 0;
  return dx < 0 ? 1 : -1;
}

/** Whether a touch on `target` belongs to something under it that moves sideways itself. */
function ownsSwipe(target: Element, area: Element): boolean {
  if (target.closest(OWN_SWIPE)) return true;
  for (let element: Element | null = target; element && element !== area; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(element).overflowX)) return true;
  }
  return false;
}

// More than one tabbed page can be up at once (a page and the tabs on it); the edge stays off until the last goes.
let edgeHolders = 0;
function holdEdge(): () => void {
  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return;
    if (touch.clientX > EDGE_BAND && touch.clientX < window.innerWidth - EDGE_BAND) return;
    if (event.target instanceof Element && event.target.closest(CONTROL)) return;
    event.preventDefault();
  };
  const root = document.documentElement;
  if (edgeHolders++ === 0) root.style.overscrollBehaviorX = "none";
  document.addEventListener("touchstart", onStart, { capture: true, passive: false });
  return () => {
    document.removeEventListener("touchstart", onStart, { capture: true });
    if (--edgeHolders === 0) root.style.overscrollBehaviorX = "";
  };
}

export interface TabSwipe {
  /** The page (or, with scope "self", the card): swipes on the page's area move between the tabs. */
  readonly root: RefCallback<HTMLElement>;
  /** The tab row: what comes after it slides in when the tab changes. */
  readonly tabs: RefCallback<HTMLElement>;
}

export function useTabSwipe<T extends string>({
  tabs,
  active,
  onSelect,
  enabled = true,
  scope = "page",
}: {
  readonly tabs: readonly T[];
  /** The tab shown; one the list doesn't have (an unknown address) moves nowhere. */
  readonly active: string;
  readonly onSelect: (tab: T) => void;
  /** Off while the page shows something else over its tabs (an opened request). */
  readonly enabled?: boolean;
  /** "page": a swipe anywhere on the page's area; "self": only on the root, for a card with tabs of its own. */
  readonly scope?: "page" | "self";
}): TabSwipe {
  const phone = useListPhoneWidth();
  const on = phone && enabled;
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const tabRow = useRef<HTMLElement | null>(null);
  const latest = useRef({ tabs, active, onSelect });
  latest.current = { tabs, active, onSelect };

  useEffect(() => {
    if (!on || !root) return;
    const area = (scope === "page" && root.closest<HTMLElement>(PAGE_AREA)) || root;
    let start: { x: number; y: number; at: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start =
        event.touches.length === 1 && touch && event.target instanceof Element && !ownsSwipe(event.target, area)
          ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
          : null;
    };
    const onMove = (event: TouchEvent) => {
      if (event.touches.length > 1) start = null;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!start || !touch || event.touches.length) return void (start = null);
      // The finger's own time (the events' timeStamp), never the wall clock: a clock correction can move
      // Date.now by seconds in the middle of a quick swipe, which then reads as a slow drag (BL-1136).
      const step = swipeStep(touch.clientX - start.x, touch.clientY - start.y, event.timeStamp - start.at);
      start = null;
      const { tabs: list, active: current, onSelect: select } = latest.current;
      const at = (list as readonly string[]).indexOf(current);
      const next = list[at + step];
      if (step && at >= 0 && next !== undefined) select(next);
    };
    const onCancel = () => void (start = null);
    area.addEventListener("touchstart", onStart, { passive: true });
    area.addEventListener("touchmove", onMove, { passive: true });
    area.addEventListener("touchend", onEnd);
    area.addEventListener("touchcancel", onCancel);
    const releaseEdge = holdEdge();
    return () => {
      area.removeEventListener("touchstart", onStart);
      area.removeEventListener("touchmove", onMove);
      area.removeEventListener("touchend", onEnd);
      area.removeEventListener("touchcancel", onCancel);
      releaseEdge();
    };
  }, [on, root, scope]);

  // The new tab comes in from the side it is on: from the right going forward, from the left going back.
  const shown = useRef(active);
  useLayoutEffect(() => {
    const order: readonly string[] = tabs;
    const before = order.indexOf(shown.current);
    shown.current = active;
    const after = order.indexOf(active);
    const row = tabRow.current;
    if (!phone || before < 0 || after < 0 || before === after || !row?.parentElement) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const from = after > before ? SLIDE_PX : -SLIDE_PX;
    for (let element = row.nextElementSibling; element; element = element.nextElementSibling) {
      if (!(element instanceof HTMLElement) || typeof element.animate !== "function") continue;
      if (element.getAttribute("aria-hidden") === "true" || getComputedStyle(element).position === "fixed") continue;
      element.animate(
        [
          { transform: `translateX(${from}px)`, opacity: 0.35 },
          { transform: "none", opacity: 1 },
        ],
        { duration: SLIDE_MS, easing: "ease-out" },
      );
    }
  }, [active, phone, tabs]);

  const tabLine = useTabLine(active);

  const setTabs = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      tabRow.current = element;
      tabLine(element);
    },
    [tabLine],
  );
  return { root: setRoot, tabs: setTabs };
}

/** The open tab: a page's own tab (aria-current, aria-selected) or a list's status tab (aria-pressed, .active). */
const OPEN_TAB = ':scope > [aria-current="page"], :scope > [aria-selected="true"], :scope > [aria-pressed="true"], :scope > .active';
type Line = { x: number; w: number };

/** Puts the open tab's line on the row (--tab-line-x, --tab-line-w, data-tab-line), starting from `from` when
    the row has none yet so it slides from there. Returns where it is now. */
function placeTabLine(row: HTMLElement, from: Line | null): Line | null {
  const open = row.querySelector<HTMLElement>(OPEN_TAB);
  if (!open) {
    delete row.dataset.tabLine;
    return null;
  }
  const box = row.getBoundingClientRect();
  const tab = open.getBoundingClientRect();
  const next = { x: Math.round(tab.left - box.left + row.scrollLeft - row.clientLeft), w: Math.round(tab.width) };
  const set = ({ x, w }: Line) => {
    row.style.setProperty("--tab-line-x", `${x}px`);
    row.style.setProperty("--tab-line-w", `${w}px`);
  };
  if (row.dataset.tabLine === undefined && from) {
    set(from);
    row.dataset.tabLine = "";
    getComputedStyle(row, "::after").getPropertyValue("transform");
  }
  set(next);
  row.dataset.tabLine = "";
  return next;
}

/**
 * The open tab's line (S-152, Mert 2026-10-17, D; every page's tab row since S-253, 2026-10-23): the tab row
 * learns where the open tab is, and phone-page-tabs.css draws the line there and slides it when the tab
 * changes. A page that draws a new tab row for the new tab (Schedule → Lineup) starts its line where the last
 * row's was, so it slides across too. A row that comes once the page has loaded gets its line then.
 * Returns the tab row's ref.
 */
export function useTabLine(active: string): RefCallback<HTMLElement> {
  const phone = useListPhoneWidth();
  const line = useRef<Line | null>(null);
  const [row, setRow] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!phone || !row) return;
    const place = () => void (line.current = placeTabLine(row, line.current) ?? line.current);
    place();
    return watchTabSizes(row, place);
  }, [active, phone, row]);
  return setRow;
}

/** Places the line again when the row or one of its tabs changes size: a tab's count comes in, or the font
    loads, while the row keeps its size. A tab added later is watched too. Returns the stop. */
function watchTabSizes(row: HTMLElement, place: () => void): () => void {
  if (typeof ResizeObserver !== "function") return () => undefined;
  const resized = new ResizeObserver(place);
  const watch = () => {
    resized.observe(row);
    for (const tab of Array.from(row.children)) resized.observe(tab);
  };
  watch();
  const added = new MutationObserver(watch);
  added.observe(row, { childList: true });
  return () => {
    resized.disconnect();
    added.disconnect();
  };
}

/**
 * A list page's status tabs (S-253): the tab row's ref, no hook. The line follows the open tab as the tabs'
 * class or aria state changes, and the row's and the tabs' sizes. phone-page-tabs.css draws it on a phone only.
 */
export function tabLineRef(row: HTMLElement | null): (() => void) | undefined {
  if (!row) return undefined;
  const place = () => void placeTabLine(row, null);
  place();
  const changed = new MutationObserver(place);
  changed.observe(row, { subtree: true, attributes: true, attributeFilter: ["class", "aria-pressed", "aria-selected", "aria-current"] });
  const stop = watchTabSizes(row, place);
  return () => {
    changed.disconnect();
    stop();
  };
}
