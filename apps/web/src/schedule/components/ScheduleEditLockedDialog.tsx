import type { JSX } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";

export interface ScheduleEditLockedDialogProps {
  readonly open: boolean;
  readonly holderName: string;
  readonly scope: "draft" | "published" | "schedule";
  readonly draftName?: string | null;
  readonly weekLabel: string;
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

function bodyText({
  holderName,
  scope,
  draftName,
  weekLabel,
}: Pick<
  ScheduleEditLockedDialogProps,
  "holderName" | "scope" | "draftName" | "weekLabel"
>): string {
  if (scope === "published") {
    return `${holderName} is editing the published schedule for ${weekLabel}. You can view it, but changes are locked until ${holderName} leaves edit mode or the session times out.`;
  }
  if (scope === "draft" && draftName?.trim()) {
    return `${holderName} is editing "${draftName.trim()}". You can view this draft, but changes are locked until ${holderName} leaves edit mode or the session times out.`;
  }
  return `${holderName} is editing this schedule. You can view it, but changes are locked until ${holderName} leaves edit mode or the session times out.`;
}

export function ScheduleEditLockedDialog({
  open,
  holderName,
  scope,
  draftName,
  weekLabel,
  lastHeartbeat,
  onViewSchedule,
  onTryAgain,
}: ScheduleEditLockedDialogProps): JSX.Element | null {
  const lastActivity = lastActivityLabel(lastHeartbeat);

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
            <h2 id="schedule-edit-locked-title">Schedule is being edited</h2>
            <p>Another manager currently holds the edit lock.</p>
          </div>
        </header>
        <div className="schedule-edit-locked-body">
          <p>{bodyText({ holderName, scope, draftName, weekLabel })}</p>
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
