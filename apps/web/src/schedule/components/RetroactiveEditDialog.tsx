import type { JSX } from "react";
import type { PastEditFinding } from "../schedule-data";

const REASON_LABEL: Record<PastEditFinding["reason"], string> = {
  pay_period_locked: "Closed pay period",
  time_entry_exists: "Time entry recorded",
  shift_started: "Already started",
  past_week: "Past week",
};

function findingKey(finding: PastEditFinding, index: number): string {
  return `${finding.shift_id ?? "new"}-${finding.scheduled_date}-${finding.reason}-${index}`;
}

export function RetroactiveEditDialog({
  open,
  mode,
  findings,
  messages,
  onConfirm,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly mode: "blocked" | "confirm";
  readonly findings: readonly PastEditFinding[];
  readonly messages: readonly string[];
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
}): JSX.Element | null {
  if (!open) return null;
  const blocked = mode === "blocked";

  return (
    <div className="schedule-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={() => onOpenChange(false)}
      />
      <section
        className="schedule-retroactive-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-retroactive-title"
      >
        <header>
          <div>
            <h2 id="schedule-retroactive-title">
              {blocked
                ? "These changes cannot be saved"
                : "This changes shifts that already ran"}
            </h2>
            <p>
              {blocked
                ? "Payroll has already used part of what this draft touches. Correct the record in Time Entries instead of rewriting the schedule."
                : "The schedule is the plan, not the record of what happened. Saving keeps the time entries as they were recorded."}
            </p>
          </div>
        </header>
        <ul>
          {findings.map((finding, index) => (
            <li key={findingKey(finding, index)}>
              <span>{REASON_LABEL[finding.reason]}</span>
              <strong>
                {messages[index] ??
                  `${finding.employee_name ?? "An open shift"} — ${finding.location_name} on ${finding.scheduled_date}`}
              </strong>
            </li>
          ))}
        </ul>
        <footer>
          <button type="button" onClick={() => onOpenChange(false)}>
            {blocked ? "Back to editing" : "Cancel"}
          </button>
          {!blocked ? (
            <button type="button" className="primary" onClick={onConfirm}>
              Save anyway
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
