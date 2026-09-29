import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import "./tooltip.css";
import { useHoverBubble } from "./useHoverBubble";

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
  const pointerPressed = useRef(false);
  const { anchor, open, close, closeSoon, cancel } = useHoverBubble();
  const show = () => open(trigger.current?.getBoundingClientRect() ?? null);
  // BL-207: a press that ends without a click (dragged off, cancelled) must
  // not keep the next keyboard focus from opening the bubble.
  const endPress = () => {
    pointerPressed.current = false;
  };

  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor, close]);

  return (
    <button
      ref={trigger}
      type="button"
      className={`nf-tooltip-trigger${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={closeSoon}
      onPointerDown={() => {
        pointerPressed.current = true;
      }}
      // A touch leaves before its focus and click arrive; only a mouse
      // leaving mid-press has dragged off.
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") endPress();
      }}
      onPointerCancel={endPress}
      onFocus={() => {
        // A press also focuses; let the click decide so a tap can toggle.
        if (!pointerPressed.current) show();
      }}
      onBlur={() => {
        endPress();
        close();
      }}
      onClick={() => {
        endPress();
        if (anchor) close();
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
              onMouseEnter={cancel}
              onMouseLeave={closeSoon}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </button>
  );
}
