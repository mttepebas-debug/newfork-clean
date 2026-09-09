import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@newfork/ui";
import {
  lineupOperationPreviewSchema,
  type LineupOperationPreview,
} from "@newfork/shared";
import {
  actOnLineupProposal,
  getLineup,
  getLineupProposals,
} from "../lineup-data";
import { LineupDialog } from "./LineupDialog";
type Proposal = Awaited<ReturnType<typeof getLineupProposals>>[number];

export function LineupQueue({
  workspaceId,
  date,
  locationId,
  refresh,
}: {
  workspaceId: string;
  date: string;
  locationId: string;
  refresh: () => Promise<void>;
}) {
  const query = useQuery({
    queryKey: ["lineup-proposals", workspaceId, date, locationId],
    queryFn: () => getLineupProposals(workspaceId, date, locationId),
  });
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!query.data?.length && !query.error) return null;
  return (
    <section className="lu-sharing-card">
      <span className="lu-eyebrow">OFFERS & LOCATION APPROVALS</span>
      <h3>Requests & responses</h3>
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        query.data?.map((proposal) => (
          <article className="lu-queue-item" key={proposal.id}>
            <strong>{proposal.employee_name}</strong>
            <p>
              {proposal.source_name} → {proposal.target_name}
              <br />
              {proposal.target_date ?? date} · {proposal.start_time}–
              {proposal.end_time}
            </p>
            <p>{proposal.description}</p>
            {proposal.resolution ? <p>{proposal.resolution}</p> : null}
            <span className="lu-badge">
              {proposal.status === "accepted"
                ? "Accepted · needs confirmation"
                : proposal.status}
              {proposal.needs_counterpart ? " · swap request" : ""}
            </span>
            {proposal.can_confirm &&
            ((proposal.kind === "transfer" && proposal.status === "pending") ||
              (proposal.kind === "offer" && proposal.status === "accepted")) ? (
              <button onClick={() => setSelected(proposal)}>
                Review & approve
              </button>
            ) : null}
            {proposal.can_cancel ? (
              <button
                disabled={Boolean(busy)}
                onClick={() => {
                  setBusy(proposal.id);
                  setError("");
                  void actOnLineupProposal(workspaceId, proposal.id, "cancel")
                    .then(refresh)
                    .catch((err) =>
                      setError(
                        err instanceof Error ? err.message : "Could not cancel",
                      ),
                    )
                    .finally(() => setBusy(""));
                }}
              >
                Cancel request
              </button>
            ) : null}
          </article>
        ))
      )}
      {error ? (
        <p className="lu-error" role="alert">
          {error}
        </p>
      ) : null}
      {selected ? (
        <ApprovalDialog
          workspaceId={workspaceId}
          date={selected.target_date ?? date}
          proposal={selected}
          refresh={refresh}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}

function ApprovalDialog({
  workspaceId,
  date,
  proposal,
  refresh,
  onClose,
}: {
  workspaceId: string;
  date: string;
  proposal: Proposal;
  refresh: () => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [counterpart, setCounterpart] = useState("");
  const [preview, setPreview] = useState<LineupOperationPreview | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      preview &&
      (document.activeElement === document.body ||
        document.activeElement === submitRef.current)
    ) {
      previewHeadingRef.current?.focus();
    }
  }, [preview]);
  const team = useQuery({
    queryKey: ["lineup", workspaceId, date],
    queryFn: () => getLineup(workspaceId, date),
    enabled: Boolean(proposal.needs_counterpart || proposal.can_choose_need),
  });
  const entries =
    team.data?.locations
      .find((location) => location.id === proposal.target_location_id)
      ?.entries.filter(
        (entry) =>
          (proposal.needs_counterpart
            ? entry.employee_id && entry.source_shift_id
            : !entry.employee_id || entry.call_off) &&
          !entry.hidden &&
          (!proposal.needs_counterpart || !entry.call_off) &&
          !entry.orphaned &&
          !entry.source_changed,
      ) ?? [];
  return (
    <LineupDialog title="Review location impact" onClose={onClose}>
      <p>
        {proposal.employee_name} · {proposal.source_name} →{" "}
        {proposal.target_name}
      </p>
      <p>{proposal.description}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const details = {
            ...(counterpart ? { target_entry_id: counterpart } : {}),
            ...(preview ? { fingerprint: preview.fingerprint } : {}),
            ...(preview?.availability_warning?.policy === "confirm"
              ? { confirm_availability: true }
              : {}),
          };
          void actOnLineupProposal(
            workspaceId,
            proposal.id,
            preview ? "confirm" : "preview",
            details,
          )
            .then(async (result) => {
              if (preview) {
                if (preview.availability_warning?.policy === "warn") {
                  toast.warning(
                    "Assignment saved with an availability conflict.",
                  );
                }
                await refresh();
                onClose();
              } else setPreview(lineupOperationPreviewSchema.parse(result));
            })
            .catch((err) => {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not validate approval",
              );
              setPreview(null);
            })
            .finally(() => setBusy(false));
        }}
      >
        {proposal.needs_counterpart || proposal.can_choose_need ? (
          <label>
            {proposal.needs_counterpart
              ? "Employee to exchange"
              : "Fill an open need (optional)"}
            <select
              required={Boolean(proposal.needs_counterpart)}
              disabled={busy || Boolean(preview)}
              value={counterpart}
              onChange={(event) => {
                setCounterpart(event.target.value);
                setPreview(null);
              }}
            >
              <option value="">
                {proposal.needs_counterpart
                  ? `Choose an assignment in ${proposal.target_name}`
                  : "Create coverage at destination"}
              </option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.employee_name || "Open need"} · {entry.job_name} ·{" "}
                  {entry.shift_type_name} · {entry.start_time}–{entry.end_time}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {team.error && proposal.needs_counterpart ? (
          <p role="alert">{team.error.message}</p>
        ) : null}
        {preview ? (
          <div className="lu-impact">
            <h3 tabIndex={-1} ref={previewHeadingRef}>
              Review before approval
            </h3>
            {preview.availability_warning ? (
              <p className="lu-badge warning">Availability conflict</p>
            ) : null}
            {preview.effects.map((effect, index) => (
              <p key={index}>{effect}</p>
            ))}
            {preview.blockers.map((blocker, index) => (
              <p role="alert" className="lu-error" key={index}>
                {blocker}
              </p>
            ))}
            <button type="button" onClick={() => setPreview(null)}>
              Edit choices
            </button>
          </div>
        ) : (
          <p className="lu-field-help">
            Both locations, employee eligibility, travel and the latest
            assignments will be checked before approval.
          </p>
        )}
        {error ? (
          <p role="alert" className="lu-error">
            {error}
          </p>
        ) : null}
        <footer className="lu-dialog-footer">
          <button
            type="button"
            className="nf-button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="nf-button lu-primary"
            ref={submitRef}
            disabled={
              busy ||
              Boolean(preview && !preview.allowed) ||
              Boolean(proposal.needs_counterpart && !counterpart)
            }
          >
            {busy
              ? "Checking…"
              : preview
                ? preview.availability_warning?.policy === "confirm"
                  ? "Approve anyway"
                  : "Approve & apply"
                : "Review impact"}
          </button>
        </footer>
      </form>
    </LineupDialog>
  );
}

export { EmployeeLineupOffers } from "./EmployeeLineupOffers";
