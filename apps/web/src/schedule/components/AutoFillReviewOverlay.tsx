import type {
  ScheduleAutoFillAssignment,
  ScheduleAutoFillApplyResult,
  ScheduleAutoFillPreview,
} from "@newfork/shared/schedule";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { autoFillApplyLabel } from "../lib/autoFillText";
import { formatWeekdayDate } from "../lib/scheduleDateTime";
import { requestErrorText } from "../../lib/request-error";

export function AutoFillReviewOverlay({
  preview,
  onClose,
  onApply,
}: {
  readonly preview: ScheduleAutoFillPreview;
  readonly onClose: () => void;
  readonly onApply: (
    assignments: ScheduleAutoFillAssignment[],
  ) => Promise<unknown>;
}) {
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      preview.proposals.map((proposal) => [
        proposal.shift_id,
        proposal.recommended_employee_id,
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{
    applied: number;
    rejected: readonly { shift_id: string; reason: string }[];
  } | null>(null);
  const assignments = preview.proposals.flatMap((proposal) =>
    !rejected[proposal.shift_id] && choices[proposal.shift_id]
      ? [
          {
            shift_id: proposal.shift_id,
            employee_id: choices[proposal.shift_id]!,
          },
        ]
      : [],
  );
  const apply = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await onApply(assignments);
      const applyResult = response as Partial<ScheduleAutoFillApplyResult> | null;
      setResult({
        applied: Array.isArray(applyResult?.applied)
          ? applyResult.applied.length
          : assignments.length,
        rejected: Array.isArray(applyResult?.rejected)
          ? applyResult.rejected
          : [],
      });
    } catch (caught) {
      setError(requestErrorText(caught));
    } finally {
      setPending(false);
    }
  };
  const toggleReject = (shiftId: string) => {
    setRejected((current) => ({ ...current, [shiftId]: !current[shiftId] }));
  };
  return (
    <Dialog title="Review auto-fill" onClose={onClose}>
      <div className="schedule-tool-dialog">
        <p className="schedule-tool-summary">
          {preview.proposals.length} open shifts have eligible candidates. Clear
          a selection to leave that shift open.
        </p>
        {result ? (
          <p className="schedule-autofill-result" role="status">
            Applied {result.applied} shift{result.applied === 1 ? "" : "s"}.
            {result.rejected.length ? (
              <span>
                {" "}
                {result.rejected.length} rejected by the server:{" "}
                {result.rejected.map((item) => item.reason).join(", ")}
              </span>
            ) : null}
          </p>
        ) : null}
        <div className="schedule-autofill-list">
          {preview.proposals.map((proposal) => {
            const selectedEmployeeId = choices[proposal.shift_id] ?? "";
            const selectedCandidate =
              proposal.candidates.find(
                (candidate) => candidate.employee_id === selectedEmployeeId,
              ) ?? proposal.candidates[0];
            const isRejected = Boolean(rejected[proposal.shift_id]);
            return (
              <div
                key={proposal.shift_id}
                className="schedule-autofill-item"
                data-rejected={isRejected ? "true" : "false"}
              >
                <span>
                  <strong>
                    {proposal.job_name} · {proposal.location_name}
                  </strong>
                  <small>
                    {formatWeekdayDate(proposal.scheduled_date)} · {formatTime(proposal.start_time)}
                    –
                    {formatTime(proposal.end_time)}
                  </small>
                  {selectedCandidate ? (
                    <span className="schedule-autofill-reasons">
                      {selectedCandidate.reasons.map((reason) => (
                        <em key={reason}>{reason}</em>
                      ))}
                    </span>
                  ) : null}
                </span>
                <div className="schedule-autofill-controls">
                  <select
                    aria-label={`Assignment for ${proposal.job_name} on ${formatWeekdayDate(proposal.scheduled_date)}`}
                    value={selectedEmployeeId}
                    disabled={isRejected}
                    onChange={(event) =>
                      setChoices((current) => ({
                        ...current,
                        [proposal.shift_id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Leave open</option>
                    {proposal.candidates.map((candidate) => (
                      <option
                        key={candidate.employee_id}
                        value={candidate.employee_id}
                      >
                        {candidate.employee_name} ·{" "}
                        {(candidate.scheduled_minutes / 60).toFixed(1)}h scheduled
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`${isRejected ? "Undo reject" : "Reject"} ${
                      proposal.job_name
                    } on ${formatWeekdayDate(proposal.scheduled_date)}`}
                    onClick={() => toggleReject(proposal.shift_id)}
                  >
                    <X size={14} />
                    {isRejected ? "Rejected" : "Reject"}
                  </button>
                </div>
              </div>
            );
          })}
          {!preview.proposals.length ? (
            <p>No eligible auto-fill proposals for this working copy.</p>
          ) : null}
          {preview.unfilled.map((item) => (
            <p key={item.shift_id} className="schedule-overwrite-warning">
              Open shift not filled: {item.reason}
            </p>
          ))}
        </div>
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending || !assignments.length}
            onClick={() => void apply()}
          >
            {pending ? "Applying…" : autoFillApplyLabel(assignments.length)}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="schedule-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <section
        className="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-autofill-dialog-title"
      >
        <header>
          <h2 id="schedule-autofill-dialog-title">{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "p" : "a";
  const display = (hour ?? 0) % 12 || 12;
  return minute
    ? `${display}:${String(minute).padStart(2, "0")}${suffix}`
    : `${display}${suffix}`;
}
