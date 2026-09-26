import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import "./tooltip.css";

/**
 * A small bubble over a focusable trigger. It opens on hover and on keyboard
 * focus, closes on leave, blur, Escape or scroll, and describes the trigger
 * through aria-describedby while it is open. `label` names the trigger.
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
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const show = () => setAnchor(trigger.current?.getBoundingClientRect() ?? null);
  const hide = () => setAnchor(null);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnchor(null);
    };
    const onScroll = () => setAnchor(null);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor]);

  return (
    <button
      ref={trigger}
      type="button"
      className={`nf-tooltip-trigger${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
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
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </button>
  );
}
