import { AlertTriangle, X } from "lucide-react";
import { useEffect, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  formatScheduleConflictMessages,
  type ScheduleConflictReason,
} from "../schedule-conflicts";

export function ScheduleConflictSheet({
  open,
  messages,
  description = "This assignment cannot be saved.",
  tone = "blocker",
  requiresOverrideReason = false,
  overrideReason,
  onOverrideReasonChange,
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
  readonly requiresOverrideReason?: boolean;
  readonly overrideReason?: string;
  readonly onOverrideReasonChange?: (value: string) => void;
  readonly errorMessage?: string | null;
  readonly submitLabel?: string;
  readonly submitDisabled?: boolean;
  readonly dismissLabel?: string;
  readonly onSubmit?: () => void;
  readonly onDismiss: () => void;
}) {
  const isDecision = requiresOverrideReason || Boolean(submitLabel || onSubmit);

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
          {requiresOverrideReason ? (
            <p className="schedule-conflict-sheet-helper">
              Add a manager reason to override.
            </p>
          ) : null}
          {requiresOverrideReason ? (
            <label htmlFor="schedule-conflict-sheet-override-reason">
              Override reason
              <textarea
                id="schedule-conflict-sheet-override-reason"
                aria-label="Override reason"
                value={overrideReason ?? ""}
                maxLength={1000}
                placeholder="Emergency staffing need, employee volunteered, or schedule correction"
                onChange={(event) =>
                  onOverrideReasonChange?.(event.currentTarget.value)
                }
              />
              <span>
                Required for availability and time off overrides. Minimum 10
                characters.
              </span>
            </label>
          ) : null}
          {errorMessage ? (
            <p className="schedule-conflict-sheet-error">{errorMessage}</p>
          ) : null}
          {isDecision ? (
            <footer>
              <button type="button" onClick={onDismiss}>
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
