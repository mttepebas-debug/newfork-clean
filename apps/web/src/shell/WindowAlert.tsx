import type { ReactNode } from "react";
import "./window-alert.css";

/**
 * A window's or a drawer's own error (UI-FIELDMSG, Mert 2026-10-17): a band
 * laid over the bottom edge of the window's body, just above its footer. It is
 * put as the footer's first child and sits out of the flow, so neither the
 * body nor the footer's buttons move when it comes or goes. It may wrap; while
 * it is there it covers the body's last lines.
 */
export function WindowAlert({
  message,
  id,
}: {
  readonly message: ReactNode;
  readonly id?: string;
}) {
  if (message === null || message === undefined || message === false || message === "") return null;
  return (
    <p id={id} className="window-alert" role="alert">
      {message}
    </p>
  );
}
