import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import {
  formatScheduleConflictMessages,
  type ScheduleConflictReason,
} from "../schedule-conflicts";

export function ScheduleConflictNotice({
  title = "Shift conflict",
  description = "This assignment cannot be saved.",
  messages,
  actionHint,
  tone = "blocker",
  role = "alert",
  className,
}: {
  readonly title?: string;
  readonly description?: string | null;
  readonly messages: readonly ScheduleConflictReason[];
  readonly actionHint?: ReactNode;
  readonly tone?: "blocker" | "warning";
  readonly role?: "alert" | "status";
  readonly className?: string;
}) {
  const normalizedMessages = formatScheduleConflictMessages(messages);

  return (
    <div
      role={role}
      aria-label={title}
      className={["schedule-conflict-notice", className]
        .filter(Boolean)
        .join(" ")}
      data-tone={tone}
    >
      <span className="schedule-conflict-notice-accent" aria-hidden />
      <span className="schedule-conflict-notice-icon" aria-hidden>
        <AlertTriangle size={15} />
      </span>
      <div className="schedule-conflict-notice-copy">
        {description ? <strong>{description}</strong> : null}
        {normalizedMessages.map((message, index) => (
          <span key={`${message}-${index}`}>{message}</span>
        ))}
        {actionHint ? <em>{actionHint}</em> : null}
      </div>
    </div>
  );
}
