import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import "./tooltip.css";

// Time to move the pointer from the trigger onto the bubble (WCAG 1.4.13, hoverable).
const CLOSE_DELAY_MS = 150;

/**
 * A small bubble over a button. It opens on hover, on keyboard focus and on a
 * tap (a second tap closes it), stays open while the pointer is on the bubble,
 * closes on leave, blur, Escape or scroll, and describes the trigger through
 * aria-describedby while it is open. `label` names the trigger.
 */
export function Tooltip({
  label,
  content,
  className,
  children,
}: {
  readonly label: string;
  readonly content: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const pointerPressed = useRef(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setAnchor(trigger.current?.getBoundingClientRect() ?? null);
  };
  const hide = () => {
    cancelClose();
    setAnchor(null);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(hide, CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!anchor) return;
    const close = () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setAnchor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor]);

  useEffect(() => cancelClose, []);

  return (
    <button
      ref={trigger}
      type="button"
      className={`nf-tooltip-trigger${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onPointerDown={() => {
        pointerPressed.current = true;
      }}
      onFocus={() => {
        // A press also focuses; let the click decide so a tap can toggle.
        if (!pointerPressed.current) show();
      }}
      onBlur={hide}
      onClick={() => {
        pointerPressed.current = false;
        if (anchor) hide();
        else show();
      }}
    >
      {children}
      {anchor
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              className="nf-tooltip"
              style={{
                left: anchor.left + anchor.width / 2,
                top: anchor.top - 6,
              }}
              onMouseEnter={cancelClose}
              onMouseLeave={hideSoon}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </button>
  );
}
