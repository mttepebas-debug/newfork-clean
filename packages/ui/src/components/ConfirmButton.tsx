import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";

const disarmAfterMs = 3200;
// Two clicks closer than this are one double-click. A phone counts taps up to ~0.5 s apart as a double-click
// (detail 2), so the browser's count alone would swallow a second tap someone meant (Mert 2026-10-20).
const quickDoubleClickMs = 300;

// Two-click confirm for actions that only need a bare "are you sure?":
// the first click arms, the second one confirms. Disarms after a pause, on blur and on Escape.
// `initiallyArmed` is for a flow whose first click happened elsewhere, such as a row
// menu's Delete that opens the editor with its delete already armed.
export function useConfirmClick(onConfirm: () => void, initiallyArmed = false) {
  const [armed, setArmed] = useState(initiallyArmed);
  const armedAt = useRef(initiallyArmed ? Date.now() : 0);

  useEffect(() => {
    if (!armed) return undefined;
    const timeout = window.setTimeout(() => setArmed(false), disarmAfterMs);
    return () => window.clearTimeout(timeout);
  }, [armed]);

  return {
    armed,
    confirmProps: {
      onBlur: () => setArmed(false),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        // A held Enter repeats the click; it must not arm and confirm in one press.
        if (event.repeat) event.preventDefault();
        if (armed && event.key === "Escape") {
          // Escape only disarms: the default goes too, or a native <dialog>
          // around the button gets a cancel for the same key and closes.
          event.preventDefault();
          event.stopPropagation();
          setArmed(false);
        }
      },
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        // The second click of a quick double-click is one gesture, not a confirmation; a later click of the same
        // count is a second tap someone meant. A triple-click's third click never arms it again.
        if (event.detail > 1 && (!armed || Date.now() - armedAt.current < quickDoubleClickMs)) return;
        if (!armed) {
          armedAt.current = Date.now();
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      },
    },
  };
}

export type ConfirmButtonProps = Omit<ButtonProps, "onBlur" | "onKeyDown"> & {
  /** Shown while armed, e.g. "Confirm delete". Becomes the accessible name. */
  confirmLabel: ReactNode;
  /**
   * The armed name when `confirmLabel` is not text (an icon-only button):
   * used as its accessible name, tooltip and announcement while armed.
   */
  confirmName?: string;
  /** A plain <button> carrying only the caller's classes, for buttons with their own look. */
  unstyled?: boolean;
  onConfirm: () => void;
};

export function ConfirmButton({
  children,
  className,
  confirmLabel,
  confirmName,
  unstyled = false,
  onConfirm,
  onClick,
  "aria-label": ariaLabel,
  title,
  type = "button",
  ...props
}: ConfirmButtonProps) {
  const { armed, confirmProps } = useConfirmClick(onConfirm);
  const Tag = unstyled ? "button" : Button;

  return (
    <>
      <Tag
        {...props}
        {...confirmProps}
        // Runs first, e.g. to keep the click from reaching a clickable row.
        onClick={(event) => {
          onClick?.(event);
          confirmProps.onClick(event);
        }}
        type={type}
        // While armed the visible label is the name, unless it is only an icon.
        aria-label={armed ? confirmName : ariaLabel}
        title={armed ? (confirmName ?? title) : title}
        data-confirming={armed}
        className={`${className ?? ""}${armed ? " is-armed" : ""}`.trim() || undefined}
      >
        {armed ? confirmLabel : children}
      </Tag>
      {/* A name change on the focused button is not reliably spoken, so the
          armed state is also announced. Always mounted: a live region must
          exist before its text changes. `sr-only` comes from the app's CSS. */}
      <span className="sr-only" role="status">
        {armed ? (confirmName ?? confirmLabel) : ""}
      </span>
    </>
  );
}
