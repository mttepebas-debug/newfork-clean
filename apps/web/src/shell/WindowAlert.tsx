import type { ReactNode } from "react";
import { said } from "./FieldNote";
import "./window-alert.css";

/**
 * A window's or a drawer's own error (UI-FIELDMSG, Mert 2026-10-17): a band
 * laid over the bottom edge of the window's body, just above its footer, out
 * of the flow, so neither the body nor the footer's buttons move when it comes
 * or goes. It may wrap; while it is there it covers the body's last lines.
 *
 * Put it as the footer's first child. A footer that scrolls or clips its
 * overflow, or whose own rules count its children, would cut or upset it:
 * there put it `between`, as the sibling right before the footer, where it
 * keeps a zero-height slot always.
 */
export function WindowAlert({
  message,
  status,
  id,
  between = false,
}: {
  /** The error, read out at once. */
  readonly message: ReactNode;
  /** A held state said in the same band while there is no error, read politely. */
  readonly status?: ReactNode;
  readonly id?: string;
  readonly between?: boolean;
}) {
  const band = said(message) ? (
    <p id={id} className="window-alert" role="alert">
      {message}
    </p>
  ) : said(status) ? (
    <p id={id} className="window-alert" role="status">
      {status}
    </p>
  ) : null;
  return between ? <div className="window-alert-slot">{band}</div> : band;
}
