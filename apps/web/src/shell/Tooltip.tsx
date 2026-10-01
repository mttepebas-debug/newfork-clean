import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import { createPortal } from "react-dom";

import "./tooltip.css";
import { useHoverBubble } from "./useHoverBubble";

// Air between the bubble and the window's side.
const SIDE_GAP = 8;
// Below this the bubble has no room above its trigger and opens under it.
const ROOM_ABOVE = 64;
// What an area trigger leaves alone by default: controls with their own say.
const OWN_CONTROLS = "button, a[href], [role='button']";

/**
 * The bubble every Tooltip shares: placement, Escape, scroll and the hover
 * delay. `rich` draws it as a white card for several lines (G14). A trigger
 * that is not a plain button (a shift card's corner mark) uses this directly
 * and calls `show` with the rectangle the bubble belongs to.
 */
export function useTooltip(content: ReactNode, rich = false) {
  const id = useId();
  const bubble = useRef<HTMLSpanElement>(null);
  // Half the bubble's own width, measured once it is drawn: a short bubble
  // stays over its trigger near a side, a wide one is pulled in further.
  const [halfWidth, setHalfWidth] = useState(0);
  const { anchor, open, close, closeSoon, cancel } = useHoverBubble();
  const show = useCallback((rect: DOMRect | null) => open(rect), [open]);

  useLayoutEffect(() => {
    if (anchor && bubble.current) setHalfWidth(bubble.current.offsetWidth / 2);
  }, [anchor, content]);
  const sideRoom = halfWidth + SIDE_GAP;
  // The bubble sits in a portal under its trigger; its presses stay its own,
  // so a double click on a cell's bubble does not add a shift there.
  const keepInside = (event: SyntheticEvent) => event.stopPropagation();

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

  const element = anchor
    ? createPortal(
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          className="nf-tooltip"
          data-rich={rich ? "true" : undefined}
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
          onPointerDown={keepInside}
          onMouseDown={keepInside}
          onClick={keepInside}
          onDoubleClick={keepInside}
          onContextMenu={keepInside}
        >
          {content}
        </span>,
        document.body,
      )
    : null;

  return { id, isOpen: anchor !== null, show, close, closeSoon, cancel, bubble: element };
}

/**
 * A small bubble over a button. It opens on hover, on keyboard focus and on a
 * tap (a second tap closes it), stays open while the pointer is on the bubble,
 * closes on leave, blur, Escape or scroll. It describes the trigger through
 * aria-describedby whether open or not, so a screen reader hears `content` on
 * arrival. `label` names the trigger. `unstyled` drops the bare-icon look so
 * the trigger can wear another control's classes; `aria-disabled` and `data-*`
 * attributes pass through to it (BL-308).
 *
 * `area` makes the trigger cover its parent (a Schedule cell, G14): the mouse
 * anywhere on the parent opens the bubble, except over what `areaExcept`
 * matches (by default the parent's own controls), and the bubble is placed
 * against the parent. The trigger itself
 * takes no clicks, so the parent's presses stay the parent's.
 */
export function Tooltip({
  label,
  content,
  className,
  unstyled = false,
  rich = false,
  area = false,
  areaExcept = OWN_CONTROLS,
  tabIndex,
  children,
  ...attributes
}: {
  readonly label: string;
  readonly content: ReactNode;
  readonly className?: string;
  readonly unstyled?: boolean;
  readonly rich?: boolean;
  readonly area?: boolean;
  readonly areaExcept?: string;
  readonly tabIndex?: number;
  readonly children?: ReactNode;
  readonly "aria-disabled"?: "true";
  readonly [attribute: `data-${string}`]: string | undefined;
}) {
  const descriptionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pointerPressed = useRef(false);
  const tooltip = useTooltip(content, rich);
  const { isOpen, close, closeSoon, cancel } = tooltip;
  const target = () => (area ? trigger.current?.parentElement : trigger.current) ?? null;
  const show = () => tooltip.show(target()?.getBoundingClientRect() ?? null);
  // BL-207: a press that ends without a click (dragged off, cancelled) must
  // not keep the next keyboard focus from opening the bubble.
  const endPress = () => {
    pointerPressed.current = false;
  };

  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const showRef = useRef(tooltip.show);
  showRef.current = tooltip.show;
  useEffect(() => {
    const parent = area ? trigger.current?.parentElement : null;
    if (!parent) return;
    const onOver = (event: MouseEvent) => {
      // A pressed button means a drag is passing over the cell.
      if (event.buttons !== 0) return;
      const control = event.target instanceof Element ? event.target.closest(areaExcept) : null;
      if (control && control !== trigger.current && parent.contains(control)) {
        closeSoon();
        return;
      }
      if (openRef.current) cancel();
      else showRef.current(parent.getBoundingClientRect());
    };
    parent.addEventListener("mouseover", onOver);
    parent.addEventListener("mouseleave", closeSoon);
    parent.addEventListener("pointerdown", close);
    return () => {
      parent.removeEventListener("mouseover", onOver);
      parent.removeEventListener("mouseleave", closeSoon);
      parent.removeEventListener("pointerdown", close);
    };
  }, [area, areaExcept, cancel, close, closeSoon]);

  return (
    <button
      ref={trigger}
      type="button"
      tabIndex={tabIndex}
      {...attributes}
      className={[unstyled ? null : area ? "nf-tooltip-area" : "nf-tooltip-trigger", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      aria-describedby={isOpen ? tooltip.id : descriptionId}
      onMouseEnter={area ? undefined : show}
      onMouseLeave={area ? undefined : closeSoon}
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
        if (isOpen) close();
        else show();
      }}
    >
      {children}
      <span id={descriptionId} hidden>
        {content}
      </span>
      {tooltip.bubble}
    </button>
  );
}
