import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  formatScheduleConflictMessages,
  type ScheduleConflictReason,
} from "../schedule-conflicts";

/** The one question a passable conflict asks, from the editor or a drag (BL-577). */
export const SCHEDULE_CONFLICT_QUESTION = "Schedule this shift anyway?";

export function ScheduleConflictSheet({
  open,
  messages,
  description = "This assignment cannot be saved.",
  tone = "blocker",
  errorMessage,
  submitLabel,
  submitDisabled = false,
  dismissLabel,
  onSubmit,
  onDismiss,
}: {
  readonly open: boolean;
  readonly modal?: boolean;
  readonly messages: readonly ScheduleConflictReason[];
  readonly contextLabel?: string;
  readonly description?: string | null;
  readonly tone?: "blocker" | "warning";
  readonly errorMessage?: string | null;
  readonly submitLabel?: string;
  readonly submitDisabled?: boolean;
  readonly dismissLabel?: string;
  readonly onSubmit?: () => void;
  readonly onDismiss: () => void;
}) {
  const isDecision = Boolean(submitLabel || onSubmit);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // A question asked from the keyboard too: focus lands on Cancel (as in
  // ConfirmDialog), so a second Enter never places unread, and goes back
  // where it came from when the box closes.
  useEffect(() => {
    if (!open || !isDecision) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [isDecision, open]);

  // Escape is Cancel.
  useEffect(() => {
    if (!open || !isDecision) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Caught on window's capture pass and spent here, like an open shift
      // note: the Schedule's own Escape never closes the editor behind it.
      event.preventDefault();
      event.stopImmediatePropagation();
      onDismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isDecision, onDismiss, open]);

  useEffect(() => {
    if (!open || isDecision) return undefined;
    const timeoutId = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [isDecision, onDismiss, open]);

  if (!open) return null;

  const normalizedMessages = formatScheduleConflictMessages(messages);
  const resolvedMessages =
    normalizedMessages.length > 0
      ? normalizedMessages
      : ["Scheduling policy blocks this assignment."];
  const content = (
    <>
      <span className="schedule-conflict-sheet-accent" aria-hidden />
      <div className="schedule-conflict-sheet-body">
        <span className="schedule-conflict-sheet-icon" aria-hidden>
          <AlertTriangle size={15} />
        </span>
        <div className="schedule-conflict-sheet-copy">
          {isDecision ? (
            <>
              <strong>Scheduling rule</strong>
              {description ? <small>{description}</small> : null}
            </>
          ) : null}
          <div role="alert" aria-label="Shift conflict">
            {resolvedMessages.map((message, index) => (
              <p key={`${message}-${index}`}>{message}</p>
            ))}
          </div>
          {errorMessage ? (
            <p className="schedule-conflict-sheet-error">{errorMessage}</p>
          ) : null}
          {isDecision ? (
            <footer>
              <button ref={cancelRef} type="button" onClick={onDismiss}>
                {dismissLabel ?? "Cancel"}
              </button>
              <button type="submit" className="primary" disabled={submitDisabled}>
                {submitLabel ?? "Confirm"}
              </button>
            </footer>
          ) : null}
        </div>
        <button
          type="button"
          className="schedule-conflict-sheet-close"
          aria-label="Close"
          onClick={onDismiss}
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    </>
  );

  const panelProps = {
    role: "dialog",
    "aria-label": "Shift conflict",
    "data-schedule-conflict-toast-content": true,
    "data-testid": "schedule-conflict-sheet-panel",
    className: "schedule-conflict-sheet",
    "data-tone": tone,
    onPointerDown: (event: PointerEvent) => event.stopPropagation(),
    onMouseDown: (event: MouseEvent) => event.stopPropagation(),
    onMouseUp: (event: MouseEvent) => event.stopPropagation(),
    onClick: (event: MouseEvent) => event.stopPropagation(),
  };

  const panel = isDecision ? (
    <form
      {...panelProps}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      {content}
    </form>
  ) : (
    <div {...panelProps} aria-live="polite">
      {content}
    </div>
  );

  return createPortal(panel, document.body);
}
