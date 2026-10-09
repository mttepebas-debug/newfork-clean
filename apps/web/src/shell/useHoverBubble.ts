import { useCallback, useEffect, useRef, useState } from "react";

// Time to move the pointer from the trigger onto the bubble (WCAG 1.4.13, hoverable).
const CLOSE_DELAY_MS = 150;

/**
 * When a hover bubble opens and closes (BL-297): the Tooltip and a shift's
 * note corner share it, so their timing cannot drift apart. `anchor` is the
 * rectangle the bubble is placed against, null while it is closed.
 */
export function useHoverBubble() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  const open = useCallback(
    (rect: DOMRect | null) => {
      cancel();
      setAnchor(rect);
    },
    [cancel],
  );
  // `measure` runs when the delay ends, so the bubble meets the trigger where it is then.
  const openSoon = useCallback(
    (measure: () => DOMRect, delayMs: number) => {
      cancel();
      openTimer.current = window.setTimeout(() => setAnchor(measure()), delayMs);
    },
    [cancel],
  );
  const close = useCallback(() => {
    cancel();
    setAnchor(null);
  }, [cancel]);
  const closeSoon = useCallback(() => {
    cancel();
    closeTimer.current = window.setTimeout(() => setAnchor(null), CLOSE_DELAY_MS);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return { anchor, open, openSoon, close, closeSoon, cancel };
}
