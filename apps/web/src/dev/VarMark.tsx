// VAR-HUCRE b (Mert, 2026-10-06): the orange "!" is a button. Hover shows it
// can be pressed; a press opens a small window with the date and hours only.
// The window closes on Escape, a press outside, or the same "!" again; that
// first Escape / outside press only closes the window and reaches nothing else.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  type ScheduleAvailabilityMark,
} from "../schedule/lib/scheduleAvailabilityMark";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Marked unavailable Wed, Sep 30 · All day by Carlos" — one line per window. */
export function varMarkLines(day: string, mark: ScheduleAvailabilityMark, name: string): string[] {
  if (mark.kind !== "unavailable") return [];
  return mark.windows.map((window) => {
    const hours = formatAvailabilityRange("unavailable", window, "12h").replace(/^Unavailable /, "");
    return `Marked unavailable ${formatAvailabilityMarkDay(day)} · ${hours.charAt(0).toUpperCase()}${hours.slice(1)} by ${firstName(name)}`;
  });
}

export function VarMarkButton({ lines, label, className = "" }: {
  readonly lines: readonly string[];
  readonly label: string;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // The press that closes the window is the window's alone: its mousedown
    // and click never reach the grid (no new shift, no filters, no week jump).
    const swallowOnce = (type: "mousedown" | "click") => {
      const stop = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        window.removeEventListener(type, stop, true);
      };
      window.addEventListener(type, stop, true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (button.current?.contains(target) || card.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      swallowOnce("mousedown");
      swallowOnce("click");
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`var-mark ${className}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        // The Schedule's blank-surface rules (a press on empty space jumps to
        // this week) must treat the "!" as a control, as they do a name button.
        data-schedule-employee-card-trigger="true"
        onPointerDown={stop}
        onMouseDown={stop}
        onDoubleClick={stop}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setRect(event.currentTarget.getBoundingClientRect());
          setOpen((value) => !value);
        }}
      >
        !
      </button>
      {open && rect
        ? createPortal(
            <div
              ref={card}
              className="var-mark-pop"
              role="dialog"
              aria-label={label}
              style={{ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - 400)) }}
            >
              {lines.map((line) => <p key={line}>{line}</p>)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
