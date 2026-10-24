import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { swipeAxis, swipeEnd, swipeOffset, swipeSlidTo, type SwipeSide } from "./notification-swipe";

/**
 * A row that slides on the phone (S-251): `open` is the side it stays open on, `onOpen` opens or closes it,
 * `onAct` does the action under it (reads it, or marks a read row unread). The list holds which row is open, so
 * opening one closes another; a tap anywhere else closes it too. Vertical moves stay the list's scroll
 * (touch-action: pan-y in the sheet's CSS).
 */
export function useRowSwipe({
  enabled,
  open,
  onOpen,
  onAct,
}: {
  readonly enabled: boolean;
  readonly open: SwipeSide | null;
  readonly onOpen: (side: SwipeSide | null) => void;
  readonly onAct: () => void;
}) {
  const row = useRef<HTMLLIElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; from: number; width: number; axis: "x" | "y" | null } | null>(null);
  // When the last drag ended: the click the browser may send with it is not a tap on the row.
  const ended = useRef<number | null>(null);
  const [dragged, setDragged] = useState<{ offset: number; width: number } | null>(null);
  const opened = enabled ? open : null;
  const rest = opened === "left" ? swipeSlidTo : opened === "right" ? -swipeSlidTo : 0;
  const close = useRef(onOpen);
  close.current = onOpen;

  useEffect(() => {
    if (!opened) return;
    const away = (event: Event) => {
      if (!row.current?.contains(event.target as Node)) close.current(null);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [opened]);

  const onPointerDown = (event: PointerEvent<HTMLLIElement>) => {
    ended.current = null;
    // The dot and the action under the row are taps of their own.
    if (!enabled || event.button !== 0 || (event.target as Element).closest("button:not(.ni-row-title)")) return;
    const { width } = event.currentTarget.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, from: rest, width, axis: null };
  };
  const onPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    const at = drag.current;
    if (!at || at.pointer !== event.pointerId) return;
    const dx = event.clientX - at.x;
    if (!at.axis) {
      at.axis = swipeAxis(dx, event.clientY - at.y);
      if (!at.axis) return;
      if (at.axis === "y") {
        drag.current = null;
        return;
      }
      // The row keeps the finger when it leaves the row.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setDragged({ offset: swipeOffset(at.from + dx, at.width), width: at.width });
  };
  const onLetGo = (event: PointerEvent<HTMLLIElement>) => {
    const at = drag.current;
    if (!at || at.pointer !== event.pointerId) return;
    drag.current = null;
    if (at.axis !== "x") return;
    ended.current = event.timeStamp;
    setDragged(null);
    // The browser took the gesture over: the row goes back to where it was.
    if (event.type === "pointercancel") return;
    const end = swipeEnd(swipeOffset(at.from + event.clientX - at.x, at.width), at.width);
    if (end.action === "act") {
      onOpen(null);
      onAct();
    } else onOpen(end.action === "open" ? end.side : null);
  };

  const offset = dragged ? dragged.offset : rest;
  /** The side the action shows on now, while dragged or open. */
  const side: SwipeSide | null = offset > 0 ? "left" : offset < 0 ? "right" : null;
  const style: CSSProperties | undefined = offset ? { transform: `translateX(${offset}px)` } : undefined;
  return {
    row,
    side,
    /** The action is a button to reach only while the row stays open on it. */
    open: !dragged && opened !== null,
    dragging: dragged !== null,
    /** Past half the row: letting go does the action. */
    full: dragged !== null && Math.abs(dragged.offset) >= dragged.width / 2,
    style,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onLetGo, onPointerCancel: onLetGo },
    /** Whether a click is the one that ended a drag (it does not open the row). */
    endsDrag: (event: MouseEvent) => {
      const last = ended.current;
      ended.current = null;
      return last !== null && event.timeStamp - last < 500;
    },
  };
}
