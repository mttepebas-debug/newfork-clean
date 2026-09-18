import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";

const disarmAfterMs = 3200;

// Two-click confirm for actions that only need a bare "are you sure?":
// the first click arms, the second one confirms. Disarms after a pause, on blur and on Escape.
export function useConfirmClick(onConfirm: () => void) {
  const [armed, setArmed] = useState(false);

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
          event.stopPropagation();
          setArmed(false);
        }
      },
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        // The second click of a double-click is one gesture, not a confirmation.
        if (event.detail > 1) return;
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      },
    },
  };
}

export type ConfirmButtonProps = Omit<
  ButtonProps,
  "onClick" | "onBlur" | "onKeyDown"
> & {
  /** Shown while armed, e.g. "Click again to remove". Becomes the accessible name. */
  confirmLabel: ReactNode;
  onConfirm: () => void;
};

export function ConfirmButton({
  children,
  className,
  confirmLabel,
  onConfirm,
  "aria-label": ariaLabel,
  ...props
}: ConfirmButtonProps) {
  const { armed, confirmProps } = useConfirmClick(onConfirm);

  return (
    <Button
      {...props}
      {...confirmProps}
      // While armed the visible label is the name, so the change is announced.
      aria-label={armed ? undefined : ariaLabel}
      className={`${className ?? ""}${armed ? " is-armed" : ""}`.trim()}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
