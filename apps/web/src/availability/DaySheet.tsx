import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./day-availability.css";

/**
 * A day of the week in a sheet from the bottom (the phone; Mert 2026-10-16,
 * "A · Alt sayfa"): a modal <dialog>, so the page behind is inert, Esc closes,
 * focus goes in and comes back to `returnTo` (a selector for the day's row,
 * which stays on the page).
 */
export function DaySheet({
  title,
  returnTo,
  onCancel,
  footer,
  children,
}: {
  title: string;
  returnTo: string;
  onCancel: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Mert 2026-10-17: the sheet slides up once, when it opens; a tap inside
  // changes only its content. The class goes when the slide ends, so no later
  // render or style change can play it again.
  const [opening, setOpening] = useState(true);
  const back = useRef(returnTo);
  back.current = returnTo;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal?.();
    dialog?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => {
      dialog?.close?.();
      queueMicrotask(() => document.querySelector<HTMLElement>(back.current)?.focus({ preventScroll: true }));
    };
    // Once per sheet: showModal again would replay the slide (and the focus).
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`dav-sheet${opening ? " is-opening" : ""}`}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setOpening(false);
      }}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        // A tap on the dimmed page above the sheet closes it, like Cancel.
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dav-sheet-inner">
        <div className="dav-sheet-head">
          <h2 id={titleId} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="dav-sheet-close" aria-label="Close" onClick={onCancel}>
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </dialog>,
    document.body,
  );
}
