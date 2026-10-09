import type { JSX } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";

export interface ScheduleEditLockedDialogProps {
  readonly open: boolean;
  readonly holderName: string;
  readonly draftName?: string | null;
  readonly lastHeartbeat?: string | null;
  readonly onViewSchedule: () => void;
  readonly onTryAgain: () => void;
}

function lastActivityLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Last activity less than a minute ago.";
  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return "Last activity 1 minute ago.";
  return `Last activity ${minutes} minutes ago.`;
}

// Only a draft is ever locked: one person edits it at a time. Edits of the
// published week, a blank week or another draft never wait on each other.
export function ScheduleEditLockedDialog({
  open,
  holderName,
  draftName,
  lastHeartbeat,
  onViewSchedule,
  onTryAgain,
}: ScheduleEditLockedDialogProps): JSX.Element | null {
  const lastActivity = lastActivityLabel(lastHeartbeat);
  const draft = draftName?.trim() ? `"${draftName.trim()}"` : "this draft";

  if (!open) return null;

  return (
    <div className="schedule-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onViewSchedule}
      />
      <section
        className="schedule-edit-locked-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-edit-locked-title"
      >
        <header>
          <span aria-hidden>
            <LockKeyhole size={18} />
          </span>
          <div>
            <h2 id="schedule-edit-locked-title">Draft is being edited</h2>
            <p>Only one person edits a draft at a time.</p>
          </div>
        </header>
        <div className="schedule-edit-locked-body">
          <p>
            {holderName} is editing {draft}. You can view this draft, but
            changes are locked until {holderName} leaves edit mode or the
            session times out.
          </p>
          {lastActivity ? <small>{lastActivity}</small> : null}
        </div>
        <footer>
          <button type="button" onClick={onViewSchedule}>
            View schedule
          </button>
          <button type="button" className="primary" onClick={onTryAgain}>
            <RefreshCw aria-hidden className="schedule-edit-locked-refresh" />
            Try again
          </button>
        </footer>
      </section>
    </div>
  );
}
