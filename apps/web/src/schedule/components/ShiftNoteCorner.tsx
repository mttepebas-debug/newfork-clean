import { StickyNote } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";

// A beat before opening, so crossing the grid does not flash notes.
const OPEN_DELAY_MS = 250;
// Time to move the pointer from the corner onto the note (WCAG 1.4.13, hoverable).
const CLOSE_DELAY_MS = 150;
// Half of the note card's widest width (272px).
const CARD_HALF_WIDTH = 136;

/**
 * A shift's manager note (BL-199): an ink corner at the card's top left. The
 * note opens only while a mouse rests on that corner; any press, drag,
 * Escape or scroll closes it. Keyboard and screen reader users get the note
 * as the card's description, and a tap keeps doing what it does today.
 */
export function useShiftNoteCorner(note: string, suppressed: boolean) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  const closeSoon = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setAnchor(null), CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    // Escape closes the note and nothing else: caught on window's capture
    // pass, before the Schedule's own Escape clears filters or the week.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor]);

  // A drag moves the card away from its note.
  useEffect(() => {
    if (!suppressed) return;
    clearTimers();
    setAnchor(null);
  }, [clearTimers, suppressed]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!note) return { corner: null, card: null };

  const corner = (
    <span
      className="schedule-shift-note-corner"
      data-shift-note-marker="true"
      aria-hidden="true"
      onPointerEnter={(event) => {
        // A pressed button means a drag, of this card or another, is passing.
        if (event.pointerType !== "mouse" || event.buttons !== 0 || suppressed) return;
        clearTimers();
        const badge =
          event.currentTarget.closest("[data-shift-badge]") ?? event.currentTarget;
        openTimer.current = window.setTimeout(
          () => setAnchor(badge.getBoundingClientRect()),
          OPEN_DELAY_MS,
        );
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") closeSoon();
      }}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        clearTimers();
        setAnchor(null);
      }}
      // A press before the note opened must not open it afterwards.
      onPointerDown={clearTimers}
    />
  );

  // The note sits in a portal under the grid cell; its presses stay its own.
  const keepInside = (event: SyntheticEvent) => event.stopPropagation();
  const card = anchor
    ? createPortal(
        <div
          className="schedule-shift-note-card"
          data-side={anchor.top > 150 ? "above" : "below"}
          style={noteCardPosition(anchor)}
          aria-hidden="true"
          onPointerEnter={clearTimers}
          onPointerLeave={closeSoon}
          onPointerDown={keepInside}
          onMouseDown={keepInside}
          onClick={keepInside}
          onDoubleClick={keepInside}
          onContextMenu={keepInside}
        >
          <span className="schedule-shift-note-card-head">
            <StickyNote size={12} strokeWidth={2.4} aria-hidden="true" />
            Manager note
          </span>
          <p>{note}</p>
        </div>,
        document.body,
      )
    : null;

  return { corner, card };
}

function noteCardPosition(anchor: DOMRect): CSSProperties {
  const left = Math.min(
    Math.max(anchor.left + anchor.width / 2, CARD_HALF_WIDTH + 8),
    window.innerWidth - CARD_HALF_WIDTH - 8,
  );
  return anchor.top > 150
    ? { left, top: anchor.top - 8 }
    : { left, top: anchor.bottom + 8 };
}
