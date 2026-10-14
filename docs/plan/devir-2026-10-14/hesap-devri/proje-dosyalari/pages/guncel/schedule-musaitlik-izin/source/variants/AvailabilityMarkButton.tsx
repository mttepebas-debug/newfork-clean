// Test-page copy of apps/web/src/schedule/components/AvailabilityMarkButton.tsx
// (main 021f82e0). Main's behaviour is the "Original" option; the additions:
// - item 1: a name-cell "!" marks that person's unavailable days while open
//   (spotlight.ts); in variant C its lines bring each day into view.
// - item 15: what the open window does when the page scrolls.
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { flashDay, setSpotlight } from "./spotlight";
import { useVariant } from "./store";

type Hub = (event: Event) => void;
let activeHub: Hub | null = null;

if (typeof window !== "undefined") {
  const relay = (event: Event) => activeHub?.(event);
  window.addEventListener("pointerdown", relay, true);
  window.addEventListener("keydown", relay, true);
}

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

/** The "!" can be seen: on screen and not under the sticky header, the frozen column or another layer. */
function inSight(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0) return false;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit && (element === hit || element.contains(hit)));
}

type Dock = "up" | "down" | "left" | "right";

export function AvailabilityMarkButton({ lines, label, className = "", insideButton = false }: {
  readonly lines: readonly string[];
  readonly label: string;
  readonly className?: string;
  readonly insideButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hidden, setHidden] = useState(false);
  const [dock, setDock] = useState<Dock | null>(null);
  const button = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const v1 = useVariant("i1");
  const v15 = useVariant("i15");
  const nameMark = className.includes("schedule-availability-mark-name");
  const employeeId = () =>
    button.current?.closest<HTMLElement>("[data-schedule-employee-row]")?.dataset.scheduleEmployeeRow ?? null;

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
    return () => {
      if (activeHub === handle) activeHub = null;
    };
  }, [open]);

  // Item 1: the person's unavailable days, while the name's window is open.
  useEffect(() => {
    if (!open || !nameMark || v1 === "today") return;
    const id = employeeId();
    if (!id) return;
    setSpotlight(id);
    return () => setSpotlight(null);
  }, [open, nameMark, v1]);

  // Item 15: scrolling while the window is open.
  useEffect(() => {
    if (!open || v15 === "today") return;
    let frame = 0;
    let last: DOMRect | null = button.current?.getBoundingClientRect() ?? null;
    const place = () => {
      frame = 0;
      const element = button.current;
      if (!element) return;
      const next = element.getBoundingClientRect();
      if (inSight(element)) {
        last = next;
        setRect(next);
        setHidden(false);
        setDock(null);
        return;
      }
      if (v15 === "a") {
        setHidden(true);
        return;
      }
      // C: the window stops where the "!" left sight and points the way back.
      if (last) {
        const dy = next.top - last.top;
        const dx = next.left - last.left;
        setDock(Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "up" : "down") : (dx < 0 ? "left" : "right"));
      }
    };
    const onScroll = (event: Event) => {
      if (card.current && event.target instanceof Node && card.current.contains(event.target)) return;
      if (v15 === "b") {
        setOpen(false);
        return;
      }
      if (!frame) frame = requestAnimationFrame(place);
    };
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      setHidden(false);
      setDock(null);
    };
  }, [open, v15]);

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
  const clickableLines = nameMark && v1 === "c";
  const arrow = { up: "↑", down: "↓", left: "←", right: "→" } as const;
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
            event.preventDefault();
            event.stopPropagation();
            toggle(event.currentTarget);
          }}
        >
          !
        </span>
      ) : (
        <button {...props} ref={button as RefObject<HTMLButtonElement>} type="button">
          !
        </button>
      )}
      {open && rect
        ? createPortal(
            <div
              ref={card}
              className="schedule-availability-mark-window"
              role="dialog"
              aria-label={label}
              data-mi-hidden={hidden || undefined}
              data-mi-dock={dock ?? undefined}
              style={{ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - 400)) }}
            >
              {dock ? (
                <button
                  type="button"
                  className="mi-dock-back"
                  onClick={() => button.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })}
                >
                  <span aria-hidden>{arrow[dock]}</span> Scrolled out of view · show it
                </button>
              ) : null}
              {lines.map((line) =>
                clickableLines ? (
                  <button
                    type="button"
                    key={line}
                    className="mi-line-button"
                    onClick={() => {
                      const id = employeeId();
                      if (id) flashDay(id, line);
                    }}
                  >
                    {line}
                  </button>
                ) : (
                  <p key={line}>{line}</p>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
