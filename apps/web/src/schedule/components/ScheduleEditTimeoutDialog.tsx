import type { JSX } from "react";

export interface ScheduleEditTimeoutDialogProps {
  readonly open: boolean;
  readonly secondsRemaining: number;
  /** Minutes without activity before the warning opens. */
  readonly idleMinutes: number;
  /** Length of the countdown the progress bar runs down from. */
  readonly countdownSeconds: number;
  readonly isSaving: boolean;
  readonly error?: string | null;
  readonly onContinue: () => void;
  readonly onSaveDraft: () => void;
}

export function ScheduleEditTimeoutDialog({
  open,
  secondsRemaining,
  idleMinutes,
  countdownSeconds,
  isSaving,
  error,
  onContinue,
  onSaveDraft,
}: ScheduleEditTimeoutDialogProps): JSX.Element | null {
  const progressPercent = Math.max(
    0,
    Math.min(100, (secondsRemaining / countdownSeconds) * 100),
  );

  if (!open) return null;

  return (
    <div className="schedule-dialog-layer" role="presentation">
      <div
        className="schedule-timeout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-timeout-title"
      >
        <aside>
          <span>Time left</span>
          <strong>{secondsRemaining}</strong>
          <em>seconds</em>
        </aside>
        <section>
          <h2 id="schedule-timeout-title">Keep editing?</h2>
          <p>No activity for {idleMinutes} minutes.</p>
          {error ? (
            <p className="schedule-timeout-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="schedule-dialog-actions">
            <button type="button" disabled={isSaving} onClick={onSaveDraft}>
              {isSaving ? "SAVING..." : "SAVE"}
            </button>
            <button
              type="button"
              className="primary"
              disabled={isSaving}
              onClick={onContinue}
            >
              CONTINUE
            </button>
          </div>
        </section>
        <div className="schedule-timeout-progress" aria-hidden>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
