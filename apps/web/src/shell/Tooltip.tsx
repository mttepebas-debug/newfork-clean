import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import "./tooltip.css";
import { useHoverBubble } from "./useHoverBubble";

// Air between the bubble and the window's side.
const SIDE_GAP = 8;
// Below this the bubble has no room above its trigger and opens under it.
const ROOM_ABOVE = 64;

/**
 * A small bubble over a button. It opens on hover, on keyboard focus and on a
 * tap (a second tap closes it), stays open while the pointer is on the bubble,
 * closes on leave, blur, Escape or scroll. It describes the trigger through
 * aria-describedby whether open or not, so a screen reader hears `content` on
 * arrival. `label` names the trigger. `unstyled` drops the bare-icon look so
 * the trigger can wear another control's classes; `aria-disabled` and `data-*`
 * attributes pass through to it (BL-308).
 */
export function Tooltip({
  label,
  content,
  className,
  unstyled = false,
  children,
  ...attributes
}: {
  readonly label: string;
  readonly content: string;
  readonly className?: string;
  readonly unstyled?: boolean;
  readonly children: ReactNode;
  readonly "aria-disabled"?: "true";
  readonly [attribute: `data-${string}`]: string | undefined;
}) {
  const id = useId();
  const descriptionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  // Half the bubble's own width, measured once it is drawn: a short bubble
  // stays over its trigger near a side, a wide one is pulled in further.
  const [halfWidth, setHalfWidth] = useState(0);
  const pointerPressed = useRef(false);
  const { anchor, open, close, closeSoon, cancel } = useHoverBubble();
  const show = () => open(trigger.current?.getBoundingClientRect() ?? null);
  // BL-207: a press that ends without a click (dragged off, cancelled) must
  // not keep the next keyboard focus from opening the bubble.
  const endPress = () => {
    pointerPressed.current = false;
  };

  useLayoutEffect(() => {
    if (anchor && bubble.current) setHalfWidth(bubble.current.offsetWidth / 2);
  }, [anchor, content]);
  const sideRoom = halfWidth + SIDE_GAP;

  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // This Escape is the bubble's. The page under it has its own Escape rule
      // (the Schedule jumps back to this week) and must not run on the same press.
      event.stopPropagation();
      close();
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
      {...attributes}
      className={[unstyled ? null : "nf-tooltip-trigger", className].filter(Boolean).join(" ")}
      aria-label={label}
      aria-describedby={anchor ? id : descriptionId}
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
      <span id={descriptionId} hidden>
        {content}
      </span>
      {anchor
        ? createPortal(
            <span
              ref={bubble}
              id={id}
              role="tooltip"
              className="nf-tooltip"
              data-placement={anchor.top < ROOM_ABOVE ? "below" : "above"}
              style={{
                left: Math.min(
                  Math.max(anchor.left + anchor.width / 2, sideRoom),
                  window.innerWidth - sideRoom,
                ),
                top: anchor.top < ROOM_ABOVE ? anchor.bottom + 6 : anchor.top - 6,
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
