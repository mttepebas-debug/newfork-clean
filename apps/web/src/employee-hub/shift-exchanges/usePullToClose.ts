import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** How far a pull goes before letting go closes the sheet, and how fast a flick must be (px per ms). */
const PULL_CLOSE = 90;
const FLICK_CLOSE = 0.6;

/**
 * A bottom sheet closes when pulled down (Mert 2026-10-24): from its grip row (`handle`) always, from anywhere
 * on it while its scrolling part (`scroller`) is at its top. A short pull springs back; a pull that moved
 * swallows the click it ends in. A sheet with nothing to scroll takes a touch's pull too (`is-still`).
 */
export function usePullToClose(
  ref: RefObject<HTMLDialogElement | null>,
  onClose: () => void,
  { handle, scroller, off = false }: { handle: string; scroller: string; off?: boolean },
) {
  const pull = useRef<{ id: number; y: number; t: number; dy: number; moved: boolean } | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    const body = dialog?.querySelector<HTMLElement>(scroller);
    if (dialog && body) dialog.classList.toggle("is-still", body.scrollHeight <= body.clientHeight);
  });
  const place = (dy: number, animate: boolean) => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.transition = animate ? "transform .22s cubic-bezier(.2, .8, .2, 1)" : "none";
    dialog.style.transform = dy ? `translateY(${dy}px)` : "";
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const dialog = ref.current;
    if (off || !dialog || event.button !== 0) return;
    const fromHandle = (event.target as Element).closest?.(handle);
    if (!fromHandle && (dialog.querySelector<HTMLElement>(scroller)?.scrollTop ?? 0) > 0) return;
    pull.current = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const state = pull.current;
    if (!state || state.id !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - state.y);
    if (!state.moved && dy < 6) return;
    if (!state.moved) {
      state.moved = true;
      ref.current?.setPointerCapture?.(event.pointerId);
    }
    state.dy = dy;
    place(dy, false);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const state = pull.current;
    pull.current = null;
    if (!state || state.id !== event.pointerId || !state.moved) return;
    const speed = state.dy / Math.max(1, event.timeStamp - state.t);
    if (state.dy >= PULL_CLOSE || speed >= FLICK_CLOSE) {
      place(ref.current?.offsetHeight || state.dy, true);
      window.setTimeout(onClose, 180);
    } else {
      place(0, true);
    }
    // The click a pull ends in opens nothing.
    const swallow = (click: Event) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  };
  const onPointerCancel = () => {
    if (pull.current?.moved) place(0, true);
    pull.current = null;
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
