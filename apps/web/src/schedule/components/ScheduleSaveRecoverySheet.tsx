import { type JSX, type ReactNode, useEffect, useRef } from "react";
import { AlertTriangle, RotateCcw, Save, XCircle } from "lucide-react";
import "./schedule-save-recovery.css";

interface ScheduleSaveRecoverySheetProps {
  readonly open: boolean;
  readonly isRetrying?: boolean;
  readonly canDiscard?: boolean;
  readonly canRetry?: boolean;
  readonly children?: ReactNode;
  readonly onRetry: () => void;
  readonly onKeepEditing: () => void;
  readonly onDiscard: () => void;
}

export function ScheduleSaveRecoverySheet({
  open,
  isRetrying = false,
  canDiscard = true,
  canRetry = true,
  children,
  onRetry,
  onKeepEditing,
  onDiscard,
}: ScheduleSaveRecoverySheetProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const keepEditingRef = useRef(onKeepEditing);
  keepEditingRef.current = onKeepEditing;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    titleRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      keepEditingRef.current();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      dialog?.close?.();
      if (before?.isConnected && before !== document.body) before.focus();
      else document.querySelector<HTMLElement>('[data-schedule-top-action-trigger="publish"], [data-schedule-top-action-trigger="save-draft"]')?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="schedule-save-recovery-layer schedule-recovery-modal"
      aria-modal="true"
      aria-labelledby="schedule-save-recovery-title"
      aria-describedby="schedule-save-recovery-description"
      onCancel={(event) => { event.preventDefault(); onKeepEditing(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
          .filter((control) => control.tabIndex >= 0 && control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
    >
      <button
        type="button"
        className="schedule-save-recovery-backdrop"
        aria-label="Close recovery sheet"
        tabIndex={-1}
        aria-hidden="true"
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
        data-testid="schedule-save-recovery-sheet-panel"
      >
        <header>
          <span aria-hidden>
            <AlertTriangle className="schedule-save-recovery-alert-icon" />
          </span>
          <div>
            <h2 ref={titleRef} tabIndex={-1} id="schedule-save-recovery-title">Schedule save failed</h2>
            <p id="schedule-save-recovery-description">
              Your changes are still here. Review the issue below before saving again.
            </p>
          </div>
        </header>
        <div className="schedule-save-recovery-body">
          Your edit session is still open. Nothing was published by this save attempt.
        </div>
        {children}
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
            disabled={isRetrying || !canRetry}
            onClick={onRetry}
          >
            <Save aria-hidden className="schedule-save-recovery-action-icon" />
            {isRetrying ? "Saving..." : "Retry save"}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
