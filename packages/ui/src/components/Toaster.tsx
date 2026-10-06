import { type JSX } from "react";
import "sonner/dist/styles.css";
import { Toaster as SonnerToaster } from "sonner";

const TOAST_DURATION_MS = 6_000;

function TypeIcon({
  glyph,
  className,
}: {
  glyph: string;
  className: string;
}): JSX.Element {
  return (
    <span aria-hidden="true" className={`toast-type-icon ${className}`}>
      {glyph}
    </span>
  );
}

export function Toaster(): JSX.Element {
  return (
    <SonnerToaster
      className="toaster"
      closeButton
      containerAriaLabel="Notifications"
      duration={TOAST_DURATION_MS}
      gap={10}
      icons={{
        success: <TypeIcon className="success" glyph="✓" />,
        error: <TypeIcon className="error" glyph="✕" />,
        warning: <TypeIcon className="warning" glyph="!" />,
        info: <TypeIcon className="info" glyph="i" />,
      }}
      offset="28px"
      position="bottom-center"
      richColors={false}
      toastOptions={{
        duration: TOAST_DURATION_MS,
        classNames: {
          actionButton: "toast-action",
          closeButton: "toast-close",
          content: "toast-content",
          description: "toast-description",
          icon: "toast-icon",
          title: "toast-title",
          toast: "newfork-toast",
        },
      }}
      visibleToasts={3}
    />
  );
}
