import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./pull-to-refresh.css";

// Pull to refresh on an employee page (Mert 2026-10-18, KARARLAR S-163): the
// page itself never stretches (S-143); at the very top a pull down brings a
// turning mark that follows the finger, and past 74 px a release refreshes
// that page's data. The browser's own pull (which reloads the page) is held
// back while ours runs. Home first; the other employee pages follow.

export const PULL_READY = 74;
/** How far the mark travels for a pull of `distance` px: it slows down, it never runs away. */
export const rubber = (distance: number) => 128 * (1 - Math.exp(-distance / 190));

export type PullState = "idle" | "pulling" | "ready" | "refreshing";

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
      if (busy || event.touches.length !== 1 || area.scrollTop > 0) return;
      // A strip, a deck or a field takes its own drags.
      if ((event.target as Element).closest("[data-own-drag], input, textarea, select, dialog")) return;
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
