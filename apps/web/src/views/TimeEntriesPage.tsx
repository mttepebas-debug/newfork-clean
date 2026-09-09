import type {
  ManagerManualTimeEntryInput,
  ManagerTimeAmendmentInput,
  ManagerTimeAttentionCode,
  ManagerTimeEntriesReadModel,
  ManagerTimeSessionDetail,
  TimeCorrectionRequest,
  TimeCorrectionDecisionInput,
  ApproveTimeReviewWindowInput,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarRange,
  Clock3,
  FileClock,
  History,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  amendManagerTimeEntry,
  createManagerManualTimeEntry,
  getManagerTimeEntries,
  decideTimeCorrection,
  approveTimeReviewWindow,
} from "../time-entries/time-entries-data";

type EntryDialog =
  { mode: "manual" } | { mode: "amend"; session: ManagerTimeSessionDetail };

type MutationAttempt =
  | {
      mode: "manual";
      input: ManagerManualTimeEntryInput;
      idempotencyKey: string;
    }
  | {
      mode: "amend";
      sessionId: string;
      input: ManagerTimeAmendmentInput;
      idempotencyKey: string;
    };

export function TimeEntriesPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const initialRange = useMemo(currentWeekRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [locationId, setLocationId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [dialog, setDialog] = useState<EntryDialog | null>(null);
  const [decision, setDecision] = useState<{
    session: ManagerTimeSessionDetail;
    correction: TimeCorrectionRequest;
  } | null>(null);
  const workspaceId = context?.workspace.id ?? "";
  const canAmend =
    context?.permissions.includes("time.amend.location") ?? false;
  const canReview =
    context?.permissions.includes("time.correction.review.location") ?? false;
  const canApprove =
    context?.permissions.includes("time.review.approve.location") ?? false;
  const query = useQuery({
    queryKey: ["manager-time-entries", workspaceId, from, to],
    queryFn: () => getManagerTimeEntries(workspaceId, from, to),
    enabled: Boolean(workspaceId),
  });
  const mutation = useMutation<unknown, Error, MutationAttempt>({
    mutationFn: async (attempt: MutationAttempt) =>
      attempt.mode === "manual"
        ? createManagerManualTimeEntry(
            workspaceId,
            attempt.input,
            attempt.idempotencyKey,
          )
        : amendManagerTimeEntry(
            workspaceId,
            attempt.sessionId,
            attempt.input,
            attempt.idempotencyKey,
          ),
    retry: false,
    onSuccess: async () => {
      setDialog(null);
      await queryClient.invalidateQueries({
        queryKey: ["manager-time-entries", workspaceId],
      });
    },
  });
  const decisionMutation = useMutation({
    mutationFn: (attempt: {
      correctionId: string;
      input: TimeCorrectionDecisionInput;
      idempotencyKey: string;
    }) =>
      decideTimeCorrection(
        workspaceId,
        attempt.correctionId,
        attempt.input,
        attempt.idempotencyKey,
      ),
    retry: false,
    onSuccess: async () => {
      setDecision(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["manager-time-entries", workspaceId],
        }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });
  const reviewMutation = useMutation({
    mutationFn: (attempt: {
      input: ApproveTimeReviewWindowInput;
      idempotencyKey: string;
    }) =>
      approveTimeReviewWindow(
        workspaceId,
        attempt.input,
        attempt.idempotencyKey,
      ),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["manager-time-entries", workspaceId],
      }),
  });
  const sessions = useMemo(
    () =>
      (query.data?.sessions ?? []).filter(
        (session) =>
          (!locationId || session.location_id === locationId) &&
          (!employeeId || session.employee_id === employeeId) &&
          (!attentionOnly || session.attention_codes.length > 0),
      ),
    [attentionOnly, employeeId, locationId, query.data?.sessions],
  );
  const selected =
    sessions.find((session) => session.id === selectedId) ??
    sessions[0] ??
    null;
  const reviewableSessions = (query.data?.sessions ?? []).filter(
    (session) =>
      locationId &&
      session.location_id === locationId &&
      session.capture_state === "complete" &&
      session.review_state !== "approved" &&
      !session.correction_requests.some(
        (correction) => correction.status === "pending",
      ),
  );

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected && selectedId) setSelectedId("");
  }, [selected, selectedId]);

  if (query.isLoading) return <TimeEntriesState text="Loading Time Entries" />;
  if (query.isError || !query.data)
    return (
      <TimeEntriesState
        text={
          query.error instanceof Error
            ? query.error.message
            : "Time Entries unavailable"
        }
        error
        onRetry={() => void query.refetch()}
      />
    );

  const attentionCount = query.data.sessions.filter(
    (session) => session.attention_codes.length,
  ).length;
  const activeCount = query.data.sessions.filter(
    (session) =>
      session.capture_state === "open" || session.capture_state === "on_break",
  ).length;

  return (
    <section className="time-entries-page" aria-labelledby="time-entries-title">
      <header className="time-entries-header">
        <div>
          <h1 id="time-entries-title">Time Entries</h1>
          <p>
            Review operational time records, amendments, corrections, and
            approval status for each location.
          </p>
        </div>
        {canAmend ? (
          <button
            className="primary-button"
            onClick={() => setDialog({ mode: "manual" })}
          >
            <Plus size={17} aria-hidden /> Add entry
          </button>
        ) : null}
        {canApprove && locationId && reviewableSessions.length ? (
          <button
            className="secondary-button"
            disabled={reviewMutation.isPending}
            onClick={() =>
              reviewMutation.mutate({
                input: {
                  location_id: locationId,
                  from,
                  to,
                  sessions: reviewableSessions.map((session) => ({
                    session_id: session.id,
                    expected_revision: session.revision,
                  })),
                },
                idempotencyKey: crypto.randomUUID(),
              })
            }
          >
            Approve {reviewableSessions.length} reviewed
          </button>
        ) : null}
      </header>

      <div className="time-entries-metrics" aria-label="Time entry summary">
        <div>
          <FileClock size={18} aria-hidden />
          <span>Entries</span>
          <strong>{query.data.sessions.length}</strong>
        </div>
        <div>
          <Clock3 size={18} aria-hidden />
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <AlertTriangle size={18} aria-hidden />
          <span>Attention</span>
          <strong>{attentionCount}</strong>
        </div>
      </div>

      <div className="time-entries-toolbar" aria-label="Time entry filters">
        <label>
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label>
          <span>Location</span>
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">All locations</option>
            {query.data.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Employee</span>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">All employees</option>
            {query.data.employees
              .filter(
                (employee) =>
                  !locationId || employee.location_ids.includes(locationId),
              )
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.display_name}
                </option>
              ))}
          </select>
        </label>
        <label className="time-attention-toggle">
          <input
            type="checkbox"
            checked={attentionOnly}
            onChange={(event) => setAttentionOnly(event.target.checked)}
          />
          <span>Attention only</span>
        </label>
      </div>

      {mutation.isError ||
      decisionMutation.isError ||
      reviewMutation.isError ? (
        <div className="time-entries-notice" role="alert">
          <AlertTriangle size={17} aria-hidden />
          {(mutation.error ?? decisionMutation.error ?? reviewMutation.error)
            ?.message ?? "Time entry was not saved"}
          {reviewMutation.isError && reviewMutation.variables ? (
            <button
              className="secondary-button"
              onClick={() => reviewMutation.mutate(reviewMutation.variables)}
            >
              Retry approval
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={`time-entries-workbench${selected ? " has-selection" : ""}`}
      >
        <div className="time-entries-list">
          {sessions.length ? (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <TimeEntryRow
                    key={session.id}
                    session={session}
                    selected={session.id === selected?.id}
                    onSelect={() => setSelectedId(session.id)}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="time-entries-empty">
              <CalendarRange size={24} aria-hidden />
              <strong>No entries in this view</strong>
            </div>
          )}
        </div>
        {selected ? (
          <TimeEntryDetail
            session={selected}
            canAmend={canAmend}
            canReview={canReview}
            onAmend={() => setDialog({ mode: "amend", session: selected })}
            onDecide={(correction) =>
              setDecision({ session: selected, correction })
            }
          />
        ) : null}
      </div>

      {dialog ? (
        <TimeEntryDialog
          dialog={dialog}
          model={query.data}
          busy={mutation.isPending}
          error={mutation.isError ? mutation.error : null}
          onClose={() => {
            if (!mutation.isPending) {
              mutation.reset();
              setDialog(null);
            }
          }}
          onSubmit={(attempt) => mutation.mutate(attempt)}
        />
      ) : null}
      {decision ? (
        <CorrectionDecisionDialog
          session={decision.session}
          correction={decision.correction}
          busy={decisionMutation.isPending}
          error={decisionMutation.error}
          onClose={() => setDecision(null)}
          onSubmit={(attempt) => decisionMutation.mutate(attempt)}
        />
      ) : null}
    </section>
  );
}

function TimeEntryRow({
  session,
  selected,
  onSelect,
}: {
  session: ManagerTimeSessionDetail;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr className={selected ? "selected" : ""}>
      <td>
        <button className="time-entry-select" onClick={onSelect}>
          <strong>{session.employee_name}</strong>
          <small>{session.location_name}</small>
        </button>
      </td>
      <td>
        {formatDate(session.effective_started_at, session.location_timezone)}
      </td>
      <td>
        {formatTime(session.effective_started_at, session.location_timezone)}
      </td>
      <td>
        {session.effective_ended_at
          ? formatTime(session.effective_ended_at, session.location_timezone)
          : "—"}
      </td>
      <td>
        {formatDuration(
          session.effective_started_at,
          session.effective_ended_at,
        )}
      </td>
      <td>
        {session.attention_codes.length ? (
          <span className="time-status attention">
            {attentionLabel(session.attention_codes[0]!)}
            {session.attention_codes.length > 1
              ? ` +${session.attention_codes.length - 1}`
              : ""}
          </span>
        ) : (
          <span className="time-status">Recorded</span>
        )}
      </td>
    </tr>
  );
}

function TimeEntryDetail({
  session,
  canAmend,
  canReview,
  onAmend,
  onDecide,
}: {
  session: ManagerTimeSessionDetail;
  canAmend: boolean;
  canReview: boolean;
  onAmend: () => void;
  onDecide: (correction: TimeCorrectionRequest) => void;
}) {
  return (
    <aside
      className="time-entry-detail"
      aria-label={`${session.employee_name} time entry`}
    >
      <header>
        <div>
          <p className="eyebrow">
            {session.employee_code} · {session.location_name}
          </p>
          <h2>{session.employee_name}</h2>
        </div>
        {canAmend && session.capture_state === "complete" ? (
          <button className="secondary-button" onClick={onAmend}>
            <Pencil size={15} aria-hidden /> Amend
          </button>
        ) : null}
      </header>
      <dl className="time-entry-facts">
        <div>
          <dt>Date</dt>
          <dd>
            {formatDate(
              session.effective_started_at,
              session.location_timezone,
            )}
          </dd>
        </div>
        <div>
          <dt>Effective time</dt>
          <dd>
            {formatRange(
              session.effective_started_at,
              session.effective_ended_at,
              session.location_timezone,
            )}
          </dd>
        </div>
        <div>
          <dt>Raw time</dt>
          <dd>
            {formatRange(
              session.started_at,
              session.ended_at,
              session.location_timezone,
            )}
          </dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{session.revision}</dd>
        </div>
        <div>
          <dt>Review</dt>
          <dd>{reviewStateLabel(session.review_state)}</dd>
        </div>
      </dl>
      {session.attention_codes.length ? (
        <div className="time-attention-list" aria-label="Attention states">
          {session.attention_codes.map((code) => (
            <span key={code}>{attentionLabel(code)}</span>
          ))}
        </div>
      ) : null}
      {session.manual_entry ? (
        <section>
          <h3>Manual entry</h3>
          <p>{session.manual_entry.reason}</p>
          <small>
            {formatTimestamp(
              session.manual_entry.created_at,
              session.location_timezone,
            )}
          </small>
        </section>
      ) : null}
      {session.correction_requests.length ? (
        <section className="time-correction-review">
          <h3>Correction requests</h3>
          {session.correction_requests.map((correction) => (
            <article key={correction.id}>
              <header>
                <strong>{correction.status}</strong>
                <small>Revision {correction.base_revision}</small>
              </header>
              <p>{correction.reason}</p>
              <dl>
                <div>
                  <dt>Current</dt>
                  <dd>
                    {formatRange(
                      session.effective_started_at,
                      session.effective_ended_at,
                      session.location_timezone,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>
                    {formatRange(
                      correction.requested_started_at,
                      correction.requested_ended_at,
                      session.location_timezone,
                    )}
                  </dd>
                </div>
              </dl>
              {correction.decision_reason ? (
                <small>{correction.decision_reason}</small>
              ) : null}
              {canReview && correction.status === "pending" ? (
                <button
                  className="secondary-button"
                  onClick={() => onDecide(correction)}
                >
                  Review request
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      <section>
        <h3>
          <History size={15} aria-hidden /> Event history
        </h3>
        <ol className="time-audit-list">
          {session.events.map((event) => (
            <li key={event.id}>
              <span>
                <strong>{eventLabel(event.event_type)}</strong>
                <small>
                  {event.source} · {event.actor_user_id}
                </small>
              </span>
              <time>
                {formatTimestamp(event.occurred_at, session.location_timezone)}
              </time>
            </li>
          ))}
          {session.amendments.map((amendment) => (
            <li key={amendment.id} className="amendment">
              <span>
                <strong>
                  Amendment · revision {amendment.result_revision}
                </strong>
                <small>
                  {amendment.reason} · {amendment.actor_user_id}
                </small>
              </span>
              <time>
                {formatTimestamp(
                  amendment.created_at,
                  session.location_timezone,
                )}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function TimeEntryDialog({
  dialog,
  model,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  dialog: EntryDialog;
  model: ManagerTimeEntriesReadModel;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (attempt: MutationAttempt) => void;
}) {
  const session = dialog.mode === "amend" ? dialog.session : null;
  const firstLocation = session?.location_id ?? model.locations[0]?.id ?? "";
  const firstEmployee =
    session?.employee_id ??
    model.employees.find((employee) =>
      employee.location_ids.includes(firstLocation),
    )?.id ??
    "";
  const initialTimezone =
    model.locations.find((location) => location.id === firstLocation)
      ?.timezone ?? "UTC";
  const [locationId, setLocationId] = useState(firstLocation);
  const [employeeId, setEmployeeId] = useState(firstEmployee);
  const [startedAt, setStartedAt] = useState(
    toZonedInput(
      session?.effective_started_at ?? `${model.from}T09:00:00`,
      initialTimezone,
    ),
  );
  const [endedAt, setEndedAt] = useState(
    toZonedInput(
      session?.effective_ended_at ?? `${model.from}T17:00:00`,
      initialTimezone,
    ),
  );
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const eligibleEmployees = model.employees.filter((employee) =>
    employee.location_ids.includes(locationId),
  );
  const timezone =
    model.locations.find((location) => location.id === locationId)?.timezone ??
    "UTC";
  const effectiveStartedAt = zonedInputToIso(startedAt, timezone);
  const effectiveEndedAt = zonedInputToIso(endedAt, timezone);
  const valid =
    Boolean(
      locationId && employeeId && effectiveStartedAt && effectiveEndedAt,
    ) &&
    new Date(effectiveEndedAt ?? 0).getTime() >
      new Date(effectiveStartedAt ?? 0).getTime() &&
    reason.trim().length >= 3;
  const changePayload = (change: () => void) => {
    change();
    setIdempotencyKey(crypto.randomUUID());
  };
  const submit = () => {
    if (!valid || !effectiveStartedAt || !effectiveEndedAt) return;
    if (session) {
      onSubmit({
        mode: "amend",
        sessionId: session.id,
        idempotencyKey,
        input: {
          expected_revision: session.revision,
          effective_started_at: effectiveStartedAt,
          effective_ended_at: effectiveEndedAt,
          reason: reason.trim(),
        },
      });
    } else {
      onSubmit({
        mode: "manual",
        idempotencyKey,
        input: {
          employee_id: employeeId,
          location_id: locationId,
          started_at: effectiveStartedAt,
          ended_at: effectiveEndedAt,
          reason: reason.trim(),
        },
      });
    }
  };

  return (
    <div className="time-entry-dialog-backdrop" role="presentation">
      <form
        className="time-entry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-entry-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              {session ? "Revision guarded" : "Append-only provenance"}
            </p>
            <h2 id="time-entry-dialog-title">
              {session ? "Amend entry" : "Add time entry"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="time-entry-form-grid">
          <label>
            <span>Location</span>
            <select
              value={locationId}
              disabled={Boolean(session)}
              onChange={(event) =>
                changePayload(() => {
                  const next = event.target.value;
                  setLocationId(next);
                  setEmployeeId(
                    model.employees.find((employee) =>
                      employee.location_ids.includes(next),
                    )?.id ?? "",
                  );
                })
              }
            >
              {model.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Employee</span>
            <select
              value={employeeId}
              disabled={Boolean(session)}
              onChange={(event) =>
                changePayload(() => setEmployeeId(event.target.value))
              }
            >
              {eligibleEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Start</span>
            <input
              type="datetime-local"
              value={startedAt}
              onInput={(event) =>
                changePayload(() => setStartedAt(event.currentTarget.value))
              }
            />
          </label>
          <label>
            <span>End</span>
            <input
              type="datetime-local"
              value={endedAt}
              onInput={(event) =>
                changePayload(() => setEndedAt(event.currentTarget.value))
              }
            />
          </label>
          <label className="time-entry-reason">
            <span>Reason</span>
            <textarea
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(event) =>
                changePayload(() => setReason(event.target.value))
              }
            />
          </label>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error instanceof Error ? error.message : "Entry was not saved"}
          </p>
        ) : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={!valid || busy}
          >
            {busy ? "Saving…" : session ? "Save amendment" : "Add entry"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CorrectionDecisionDialog({
  session,
  correction,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  session: ManagerTimeSessionDetail;
  correction: TimeCorrectionRequest;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (attempt: {
    correctionId: string;
    input: TimeCorrectionDecisionInput;
    idempotencyKey: string;
  }) => void;
}) {
  const [action, setAction] = useState<"accept" | "reject">("accept");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const change = (update: () => void) => {
    update();
    setIdempotencyKey(crypto.randomUUID());
  };
  return (
    <div className="time-entry-dialog-backdrop" role="presentation">
      <form
        className="time-entry-dialog correction-decision-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-decision-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim().length >= 3)
            onSubmit({
              correctionId: correction.id,
              input: {
                expected_session_revision: session.revision,
                action,
                reason: reason.trim(),
              },
              idempotencyKey,
            });
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              Employee correction · revision {correction.base_revision}
            </p>
            <h2 id="correction-decision-title">Review request</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="correction-comparison">
          <div>
            <span>Current</span>
            <strong>
              {formatRange(
                session.effective_started_at,
                session.effective_ended_at,
                session.location_timezone,
              )}
            </strong>
          </div>
          <div>
            <span>Requested</span>
            <strong>
              {formatRange(
                correction.requested_started_at,
                correction.requested_ended_at,
                session.location_timezone,
              )}
            </strong>
          </div>
        </div>
        <p>{correction.reason}</p>
        <div
          className="correction-decision-control"
          role="group"
          aria-label="Decision"
        >
          <button
            type="button"
            className={action === "accept" ? "selected" : ""}
            onClick={() => change(() => setAction("accept"))}
          >
            Accept
          </button>
          <button
            type="button"
            className={action === "reject" ? "selected" : ""}
            onClick={() => change(() => setAction("reject"))}
          >
            Reject
          </button>
        </div>
        <label className="time-entry-reason">
          <span>Decision reason</span>
          <textarea
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(event) => change(() => setReason(event.target.value))}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error instanceof Error ? error.message : "Decision was not saved"}
          </p>
        ) : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || reason.trim().length < 3}
          >
            {busy
              ? "Saving…"
              : action === "accept"
                ? "Accept correction"
                : "Reject correction"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function TimeEntriesState({
  text,
  error = false,
  onRetry,
}: {
  text: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <main className={`time-entries-state${error ? " error" : ""}`}>
      <strong>{text}</strong>
      {onRetry ? (
        <button className="secondary-button" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden /> Retry
        </button>
      ) : null}
    </main>
  );
}

function currentWeekRange() {
  const current = new Date();
  const mondayOffset = (current.getDay() + 6) % 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: localDate(monday), to: localDate(sunday) };
}

function localDate(date: Date) {
  return date.toLocaleDateString("en-CA");
}

function toZonedInput(value: string, timezone: string) {
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value.slice(0, 16);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const parts = dateTimeParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zonedInputToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const localUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let instant = localUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateTimeParts(new Date(instant), timezone);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    instant = localUtc - (representedUtc - instant);
  }
  const result = new Date(instant).toISOString();
  return toZonedInput(result, timezone) === value ? result : null;
}

function dateTimeParts(date: Date, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatTimestamp(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatRange(start: string, end: string | null, timezone: string) {
  return `${formatTimestamp(start, timezone)} – ${end ? formatTimestamp(end, timezone) : "Active"}`;
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "Active";
  const minutes = Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  );
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function attentionLabel(code: ManagerTimeAttentionCode) {
  return {
    open_session: "Open session",
    open_break: "Open break",
    needs_attention: "Needs attention",
    overlap: "Overlap",
    amended: "Amended",
    correction_pending: "Correction pending",
  }[code];
}

function reviewStateLabel(state: ManagerTimeSessionDetail["review_state"]) {
  return {
    unreviewed: "Unreviewed",
    approved: "Approved",
    reopened: "Reopened",
  }[state];
}

function eventLabel(
  event: ManagerTimeSessionDetail["events"][number]["event_type"],
) {
  return {
    clock_in: "Clock in",
    break_start: "Break start",
    break_end: "Break end",
    clock_out: "Clock out",
  }[event];
}

export default TimeEntriesPage;
