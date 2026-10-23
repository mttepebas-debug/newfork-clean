// The orange availability "!" (KARARLAR Schedule, 2026-10-06): a button that
// opens a small window with the date and hours only. Escape, a press outside
// or the same "!" closes it; that first Escape or outside press only closes the
// window and reaches nothing else (the shift stays selected, filters stay).
// A press on another "!" closes this window and opens that one. Any scroll
// outside the window closes it too (Mert, 2026-10-09, item 15 B).
// The name's "!" also tints that person's unavailable days while its window is
// open (Mert, 2026-10-09, item 1 A). Time off waiting for an answer opens its
// window from a "Requested" word instead.
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

type Hub = (event: Event) => void;
let activeHub: Hub | null = null;

// Installed when the module loads, before any page mounts its own window
// listeners, so an open window sees the press or the Escape first.
if (typeof window !== "undefined") {
  const relay = (event: Event) => activeHub?.(event);
  window.addEventListener("pointerdown", relay, true);
  window.addEventListener("keydown", relay, true);
}

// The rest of the closing press (its mousedown and click) is the window's too.
// A cancelled pointerdown may send no mousedown, so the click or the next press
// ends it; nothing is left armed to eat a later press.
function swallowRestOfPress() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "click") done();
  };
  const done = () => {
    window.removeEventListener("mousedown", stop, true);
    window.removeEventListener("click", stop, true);
    window.removeEventListener("pointerdown", done, true);
  };
  window.addEventListener("mousedown", stop, true);
  window.addEventListener("click", stop, true);
  window.addEventListener("pointerdown", done, true);
}

const SPOTLIGHT_STYLE_ID = "schedule-availability-spotlight";

// A stylesheet keyed on the person's id: no grid component has to re-render,
// and a grid that re-renders while the window is open keeps the tint.
function setSpotlight(employeeId: string | null) {
  let style = document.getElementById(SPOTLIGHT_STYLE_ID);
  if (!employeeId) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = SPOTLIGHT_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `.schedule-cell[data-employee-id="${employeeId.replace(/["\\]/g, "\\$&")}"][data-availability-kind="unavailable"] {
  background-color: var(--theme-availability-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-availability) 45%, transparent);
  animation: schedule-availability-spotlight-in 0.18s ease-out;
}`;
}

export function AvailabilityMarkButton({ lines, label, className = "", insideButton = false, spotlightEmployeeId, text = "!", windowClassName = "" }: {
  readonly lines: readonly string[];
  readonly label: string;
  readonly className?: string;
  /** What the button shows ("!" by default). */
  readonly text?: string;
  readonly windowClassName?: string;
  /** The name's "!": while open, this person's unavailable days are tinted. */
  readonly spotlightEmployeeId?: string;
  /** On a shift card, itself a button: a focusable span, since a button cannot hold a button. */
  readonly insideButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const button = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle: Hub = (event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        button.current?.focus();
        return;
      }
      const target = event.target as Element;
      if (button.current?.contains(target) || card.current?.contains(target)) return;
      if (target.closest?.(".schedule-availability-mark")) {
        setOpen(false);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      swallowRestOfPress();
      setOpen(false);
    };
    activeHub = handle;
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && card.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      if (activeHub === handle) activeHub = null;
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !spotlightEmployeeId) return;
    setSpotlight(spotlightEmployeeId);
    return () => setSpotlight(null);
  }, [open, spotlightEmployeeId]);

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const toggle = (element: Element) => {
    setRect(element.getBoundingClientRect());
    setOpen((value) => !value);
  };
  const props = {
    className: `schedule-availability-mark ${className}`,
    "aria-label": label,
    "aria-expanded": open,
    "aria-haspopup": "dialog" as const,
    // The grid's blank-surface rules treat the "!" as a control, like a name.
    "data-schedule-employee-card-trigger": "true",
    onPointerDown: stop,
    onMouseDown: stop,
    onDoubleClick: stop,
    onClick: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      toggle(event.currentTarget);
    },
  };
  return (
    <>
      {insideButton ? (
        <span
          {...props}
          ref={button}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            // The card under the "!" must not open its editor.
            event.preventDefault();
            event.stopPropagation();
            toggle(event.currentTarget);
          }}
        >
          {text}
        </span>
      ) : (
        <button {...props} ref={button as RefObject<HTMLButtonElement>} type="button">
          {text}
        </button>
      )}
      {open && rect
        ? createPortal(
            <div
              ref={card}
              className={`schedule-availability-mark-window ${windowClassName}`.trim()}
              role="dialog"
              aria-label={label}
              style={{ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - 400)) }}
            >
              {lines.map((line, index) => <p key={`${index}:${line}`}>{line}</p>)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
