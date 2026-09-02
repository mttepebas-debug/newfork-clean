import { type JSX, useEffect } from "react";
import { AlertTriangle, RotateCcw, Save, XCircle } from "lucide-react";

interface ScheduleSaveRecoverySheetProps {
  readonly open: boolean;
  readonly isRetrying?: boolean;
  readonly canDiscard?: boolean;
  readonly onRetry: () => void;
  readonly onKeepEditing: () => void;
  readonly onDiscard: () => void;
}

export function ScheduleSaveRecoverySheet({
  open,
  isRetrying = false,
  canDiscard = true,
  onRetry,
  onKeepEditing,
  onDiscard,
}: ScheduleSaveRecoverySheetProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onKeepEditing();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onKeepEditing, open]);

  if (!open) return null;

  return (
    <div className="schedule-save-recovery-layer" role="presentation">
      <button
        type="button"
        className="schedule-save-recovery-backdrop"
        aria-label="Close recovery sheet"
        data-testid="schedule-save-recovery-backdrop"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onKeepEditing();
        }}
      />
      <section
        className="schedule-save-recovery-sheet"
        role="dialog"
        aria-modal="false"
        aria-labelledby="schedule-save-recovery-title"
        data-testid="schedule-save-recovery-sheet-panel"
      >
        <header>
          <span aria-hidden>
            <AlertTriangle className="schedule-save-recovery-alert-icon" />
          </span>
          <div>
            <h2 id="schedule-save-recovery-title">Schedule save failed</h2>
            <p>
              Your changes are still here. Retry the save, keep editing, or
              discard this edit session.
            </p>
          </div>
        </header>
        <div className="schedule-save-recovery-body">
          Save did not complete, so Organizer kept the current edit session
          open.
        </div>
        <footer>
          <button type="button" onClick={onKeepEditing}>
            <XCircle
              aria-hidden
              className="schedule-save-recovery-action-icon"
            />
            Keep editing
          </button>
          <button type="button" disabled={!canDiscard} onClick={onDiscard}>
            <RotateCcw
              aria-hidden
              className="schedule-save-recovery-action-icon"
            />
            Discard
          </button>
          <button
            type="button"
            className="primary"
            disabled={isRetrying}
            onClick={onRetry}
          >
            <Save aria-hidden className="schedule-save-recovery-action-icon" />
            {isRetrying ? "Saving..." : "Retry save"}
          </button>
        </footer>
      </section>
    </div>
  );
}
