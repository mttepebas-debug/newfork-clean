import { StickyNote } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";

// A beat before opening, so crossing the grid does not flash notes.
const OPEN_DELAY_MS = 250;
// Time to move the pointer from the corner onto the note (WCAG 1.4.13, hoverable).
const CLOSE_DELAY_MS = 150;
// Half of the note card's widest width (272px).
const CARD_HALF_WIDTH = 136;
// Space between the shift card and its note, and between the note and the screen edge.
const GAP = 8;

// Open notes right now. The quick editor leaves Escape to an open note, so
// the first Escape closes the note and the editor keeps what was typed.
let openNotes = 0;
export function isShiftNoteOpen(): boolean {
  return openNotes > 0;
}

/**
 * A shift's manager note (BL-199): an ink corner at the card's top left. The
 * note opens only while a mouse rests on that corner; any press, drag,
 * Escape or scroll closes it. Keyboard and screen reader users get the note
 * as the card's description, and a tap keeps doing what it does today.
 */
export function useShiftNoteCorner(note: string, suppressed: boolean) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Measured before paint, so a long note is placed where it fits.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  const closeSoon = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setAnchor(null), CLOSE_DELAY_MS);
  }, [clearTimers]);
  // Once open, the shift card is the bridge to its note (WCAG 1.4.13): the
  // pointer crosses it to a note below without the note closing on the way.
  const inside = (element: Element | null, target: EventTarget | null) =>
    target instanceof Node && Boolean(element?.contains(target));

  // Listeners only while a note shows: a note cleared while open must not
  // leave an invisible one swallowing the next Escape.
  const showing = anchor !== null && note !== "";
  useEffect(() => {
    if (!showing) return;
    const close = () => setAnchor(null);
    // Escape closes the note and nothing else: caught on window's capture
    // pass, before the Schedule's own Escape clears filters or the week.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    openNotes += 1;
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    return () => {
      openNotes -= 1;
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [showing]);

  useEffect(() => {
    if (note) return;
    clearTimers();
    setAnchor(null);
  }, [clearTimers, note]);

  useLayoutEffect(() => {
    setCardHeight(anchor ? (cardRef.current?.offsetHeight ?? 0) : 0);
  }, [anchor, note]);

  // A drag moves the card away from its note.
  useEffect(() => {
    if (!suppressed) return;
    clearTimers();
    setAnchor(null);
  }, [clearTimers, suppressed]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!note) return { corner: null, card: null, badgeHandlers: noBadgeHandlers };

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
        if (event.pointerType !== "mouse") return;
        const badge = event.currentTarget.closest("[data-shift-badge]");
        if (anchor && inside(badge, event.relatedTarget)) return;
        closeSoon();
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
  const place = anchor
    ? placeNoteCard(anchor, cardHeight, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    : null;
  const card = anchor && place
    ? createPortal(
        <div
          ref={cardRef}
          className="schedule-shift-note-card"
          data-side={place.side}
          style={{ left: place.left, top: place.top }}
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

  const badgeHandlers: NoteBadgeHandlers = {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (anchor && event.pointerType === "mouse") clearTimers();
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (!anchor || event.pointerType !== "mouse") return;
      if (inside(cardRef.current, event.relatedTarget)) return;
      closeSoon();
    },
  };

  return { corner, card, badgeHandlers };
}

interface NoteBadgeHandlers {
  readonly onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
}
const noBadgeHandlers: NoteBadgeHandlers = {};

/**
 * Where the note goes: above the shift if it fits, else below it if that
 * fits, else on the roomier side, held at least 8px inside the screen.
 * `left` is the note's centre; `top` its top edge.
 */
export function placeNoteCard(
  anchor: { readonly top: number; readonly bottom: number; readonly left: number; readonly width: number },
  cardHeight: number,
  viewport: { readonly width: number; readonly height: number },
): { readonly left: number; readonly top: number; readonly side: "above" | "below" } {
  const left = Math.min(
    Math.max(anchor.left + anchor.width / 2, CARD_HALF_WIDTH + GAP),
    viewport.width - CARD_HALF_WIDTH - GAP,
  );
  const aboveTop = anchor.top - GAP - cardHeight;
  const belowTop = anchor.bottom + GAP;
  if (aboveTop >= GAP) return { left, top: aboveTop, side: "above" };
  if (belowTop + cardHeight <= viewport.height - GAP) {
    return { left, top: belowTop, side: "below" };
  }
  const side = anchor.top > viewport.height - anchor.bottom ? "above" : "below";
  const top = Math.max(
    GAP,
    Math.min(side === "above" ? aboveTop : belowTop, viewport.height - GAP - cardHeight),
  );
  return { left, top, side };
}
