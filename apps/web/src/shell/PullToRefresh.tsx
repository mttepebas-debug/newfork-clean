import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./pull-to-refresh.css";

// Pull to refresh on every page of a phone (Mert 2026-10-18, KARARLAR S-163
// (4) and (9)): the page itself never stretches (S-143); at the very top a
// pull down brings a turning mark that follows the finger, and past 74 px a
// release refreshes that page's data. The browser's own pull (which reloads
// the page) is held back while ours runs. The shell holds the one instance.

export const PULL_READY = 74;
/** How far the mark travels for a pull of `distance` px: it slows down, it never runs away. */
export const rubber = (distance: number) => 128 * (1 - Math.exp(-distance / 190));

export type PullState = "idle" | "pulling" | "ready" | "refreshing";

/** A drawer or a window: it takes its own drags (most drawers are role="dialog" divs inside the page). */
const DRAWERS = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * Whether anything between the touched element and the scrolling area is
 * scrolled away from its top: a list that scrolls in its own frame
 * (list-page-frozen) pulls down its own rows, not the page.
 */
export function scrolledAbove(target: Element | null, area: HTMLElement): boolean {
  for (let node = target instanceof HTMLElement ? target : target?.parentElement ?? null; node && node !== area; node = node.parentElement) {
    if (node.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) return true;
  }
  return area.scrollTop > 0;
}

/**
 * Whether the page's list is away from its top: a page whose list scrolls in its own frame under a heading and
 * controls that stay put (views/list-page-frozen.css) refreshes only while that list is at its top, wherever the
 * pull starts (Mert 2026-10-19 ~06:30 AM, CALISAN-SCROLL). A drawer's own scroll is the drawer's.
 */
export function listScrolled(area: HTMLElement): boolean {
  for (const node of area.querySelectorAll<HTMLElement>("*")) {
    if (node.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(node).overflowY) && !node.closest(DRAWERS)) return true;
  }
  return false;
}

/**
 * Listens on the scrolling area (`main.app-main`) around `anchor` and calls
 * `onRefresh` when a pull from the top is released past the line.
 */
export function usePullToRefresh(anchor: { readonly current: HTMLElement | null }, onRefresh: () => Promise<unknown>) {
  const [state, setState] = useState<PullState>("idle");
  const [pull, setPull] = useState(0);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    const area = anchor.current?.closest<HTMLElement>(".app-main") ?? null;
    if (!area) return;
    // A phone's gesture (Mert 2026-10-18: every main page on a phone).
    const phone = () => typeof window.matchMedia !== "function" || window.matchMedia("(max-width: 720px)").matches;
    let x0 = 0;
    let y0 = 0;
    let axis: "y" | "n" | null = null;
    let distance = 0;
    let busy = false;
    let active = false;
    const set = (value: number) => {
      distance = value;
      setPull(value);
      setState((previous) => {
        if (previous === "refreshing") return previous;
        const next = value >= PULL_READY ? "ready" : value > 0.5 ? "pulling" : "idle";
        if (next === "ready" && previous !== "ready") navigator.vibrate?.(10);
        return next;
      });
    };
    const start = (event: TouchEvent) => {
      active = false;
      if (busy || event.touches.length !== 1 || !phone()) return;
      const target = event.target as Element;
      // A strip, a deck, a wheel, a field or a drawer takes its own drags (most drawers are
      // role="dialog" divs inside the page, not <dialog>); a list scrolled in its own frame pulls its rows.
      if (target.closest(`[data-own-drag], input, textarea, select, ${DRAWERS}`) || scrolledAbove(target, area) || listScrolled(area)) return;
      x0 = event.touches[0]!.clientX;
      y0 = event.touches[0]!.clientY;
      axis = null;
      active = true;
    };
    const move = (event: TouchEvent) => {
      if (!active) return;
      const dx = event.touches[0]!.clientX - x0;
      const dy = event.touches[0]!.clientY - y0;
      if (!axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axis = dy > 0 && Math.abs(dy) > Math.abs(dx) && area.scrollTop <= 0 ? "y" : "n";
      }
      if (axis !== "y") return;
      // The browser's own pull-to-refresh would reload the page; ours keeps it.
      event.preventDefault();
      set(rubber(Math.max(0, dy)));
    };
    const end = () => {
      if (!active || axis !== "y") {
        active = false;
        return;
      }
      active = false;
      axis = null;
      if (distance < PULL_READY) {
        set(0);
        return;
      }
      busy = true;
      set(58);
      setState("refreshing");
      // The mark stays long enough to be seen, even when the answer is instant.
      const shown = new Promise((resolve) => window.setTimeout(resolve, 700));
      void Promise.allSettled([refresh.current(), shown]).finally(() => {
        busy = false;
        setState("idle");
        set(0);
      });
    };
    area.addEventListener("touchstart", start, { passive: true });
    area.addEventListener("touchmove", move, { passive: false });
    area.addEventListener("touchend", end);
    area.addEventListener("touchcancel", end);
    return () => {
      area.removeEventListener("touchstart", start);
      area.removeEventListener("touchmove", move);
      area.removeEventListener("touchend", end);
      area.removeEventListener("touchcancel", end);
    };
  }, [anchor]);
  return { state, pull };
}

/** The turning mark; it sits at the top of the page and never moves the page. */
export function PullToRefreshMark({ state, pull }: { state: PullState; pull: number }) {
  return (
    <div
      className={`pull-mark is-${state}`}
      style={{ "--pull": `${pull.toFixed(1)}px`, "--pp": Math.min(1, pull / PULL_READY).toFixed(3) } as CSSProperties}
    >
      <RefreshCw size={20} aria-hidden />
      <span className="sr-only" role="status">
        {state === "refreshing" ? "Refreshing" : ""}
      </span>
    </div>
  );
}
