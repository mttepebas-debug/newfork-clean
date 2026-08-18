import type {
  ShiftChangeRequest,
  TimeOffRequest,
  TimeOffSegmentDecision,
} from "@newfork/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarOff,
  Check,
  ChevronRight,
  Clock3,
  History,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  decideShiftChange,
  decideTimeOff,
  getScheduleRequests,
  markTimeOffViewed,
} from "../schedule/requests-data";

type Tab = "time-off" | "shift-changes";
type Decision =
  | {
      kind: "time-off";
      request: TimeOffRequest;
      action:
        "approve" | "deny" | "partial_approve" | "return_to_pending" | "revoke";
    }
  | {
      kind: "shift-change";
      request: ShiftChangeRequest;
      action: "approve" | "reject";
    };

export function ScheduleRequestsPage() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canReadTimeOff =
    context?.permissions.includes("schedule.time_off_requests.read") ?? false;
  const canReadShift =
    context?.permissions.includes("schedule.shift_change_requests.read") ??
    false;
  const requestedTab = params.get("tab");
  const tab: Tab =
    requestedTab === "shift-changes" && canReadShift
      ? "shift-changes"
      : canReadTimeOff
        ? "time-off"
        : "shift-changes";
  const [timeOffQueue, setTimeOffQueue] = useState<"needs_review" | "closed">(
    "needs_review",
  );
  const [shiftQueue, setShiftQueue] = useState<"needs_review" | "history">(
    "needs_review",
  );
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [timeOffCursor, setTimeOffCursor] = useState("");
  const [shiftCursor, setShiftCursor] = useState("");
  const [selectedId, setSelectedId] = useState(params.get("request") ?? "");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: [
      "schedule-requests",
      context?.workspace.id,
      timeOffQueue,
      shiftQueue,
      locationId,
      search,
      timeOffCursor,
      shiftCursor,
    ],
    queryFn: () =>
      getScheduleRequests(context!.workspace.id, {
        timeOffQueue,
        shiftQueue,
        locationId,
        search,
        timeOffCursor,
        shiftCursor,
      }),
    enabled: Boolean(context),
  });
  const rows =
    tab === "time-off"
      ? query.data?.time_off_requests
      : query.data?.shift_change_requests;
  const selected = useMemo(
    () => rows?.find((row) => row.id === selectedId) ?? rows?.[0] ?? null,
    [rows, selectedId],
  );
  useEffect(() => {
    if (
      tab === "time-off" &&
      selected &&
      "segments" in selected &&
      !selected.viewed_at &&
      context
    ) {
      void markTimeOffViewed(context.workspace.id, selected.id).then(() =>
        client.invalidateQueries({ queryKey: ["schedule-requests"] }),
      );
    }
  }, [client, context, selected, tab]);

  function changeTab(next: Tab) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    nextParams.delete("request");
    setParams(nextParams);
    setSelectedId("");
    setNotice("");
  }
  function resetPaging() {
    setTimeOffCursor("");
    setShiftCursor("");
    setSelectedId("");
  }
  async function refreshed(message: string) {
    setDecision(null);
    setNotice(message);
    setSelectedId("");
    await client.invalidateQueries({ queryKey: ["schedule-requests"] });
  }
  async function submit(
    current: Decision,
    note: string,
    segmentDecisions: TimeOffSegmentDecision[],
  ) {
    try {
      if (current.kind === "time-off") {
        await decideTimeOff(context!.workspace.id, current.request.id, {
          expected_revision: current.request.revision,
          action: current.action,
          note,
          segment_decisions:
            current.action === "partial_approve" ? segmentDecisions : [],
        });
      } else {
        await decideShiftChange(context!.workspace.id, current.request.id, {
          expected_revision: current.request.revision,
          action: current.action,
          note,
        });
      }
      await refreshed("Decision saved. The queue is current.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Decision failed";
      if (message.includes("stale") || message.includes("changed")) {
        await refreshed("This request changed. The queue was refreshed.");
      } else {
        setNotice(message);
      }
    }
  }
  if (query.isLoading) return <RequestState text="Loading requests..." />;
  if (query.isError || !query.data)
    return (
      <RequestState
        text={
          query.error instanceof Error
            ? query.error.message
            : "Requests unavailable"
        }
        error
      />
    );

  return (
    <section className="requests-page" aria-labelledby="requests-title">
      <nav className="schedule-subnav" aria-label="Schedule sections">
        <Link to="/app/schedule">Schedule</Link>
        {context?.permissions.includes("schedule.lineup.read") ? (
          <Link to="/app/schedule/lineup">Line-up</Link>
        ) : null}
        <Link className="active" to="/app/schedule/requests">
          Requests
        </Link>
      </nav>
      <header className="requests-header">
        <div>
          <h1 id="requests-title">Schedule Requests</h1>
          <p>Review employee requests and protect the published schedule.</p>
        </div>
        <div className="requests-tabs" role="tablist" aria-label="Request type">
          {canReadTimeOff ? (
            <button
              role="tab"
              aria-selected={tab === "time-off"}
              className={tab === "time-off" ? "active" : ""}
              onClick={() => changeTab("time-off")}
            >
              Time off <strong>{query.data.time_off_pending_count}</strong>
            </button>
          ) : null}
          {canReadShift ? (
            <button
              role="tab"
              aria-selected={tab === "shift-changes"}
              className={tab === "shift-changes" ? "active" : ""}
              onClick={() => changeTab("shift-changes")}
            >
              Shift changes{" "}
              <strong>{query.data.shift_change_pending_count}</strong>
            </button>
          ) : null}
        </div>
      </header>

      <div className="requests-toolbar">
        <div className="request-queue-toggle" aria-label="Queue">
          {tab === "time-off" ? (
            <>
              <button
                className={timeOffQueue === "needs_review" ? "active" : ""}
                onClick={() => {
                  setTimeOffQueue("needs_review");
                  resetPaging();
                }}
              >
                Needs review
              </button>
              <button
                className={timeOffQueue === "closed" ? "active" : ""}
                onClick={() => {
                  setTimeOffQueue("closed");
                  resetPaging();
                }}
              >
                <History size={15} /> Closed
              </button>
            </>
          ) : (
            <>
              <button
                className={shiftQueue === "needs_review" ? "active" : ""}
                onClick={() => {
                  setShiftQueue("needs_review");
                  resetPaging();
                }}
              >
                Needs review
              </button>
              <button
                className={shiftQueue === "history" ? "active" : ""}
                onClick={() => {
                  setShiftQueue("history");
                  resetPaging();
                }}
              >
                <History size={15} /> History
              </button>
            </>
          )}
        </div>
        <label className="requests-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            placeholder="Search employee or note"
            aria-label="Search requests"
            onChange={(event) => {
              setSearch(event.target.value);
              resetPaging();
            }}
          />
        </label>
        <select
          value={locationId}
          aria-label="Filter by location"
          onChange={(event) => {
            setLocationId(event.target.value);
            resetPaging();
          }}
        >
          <option value="">All locations</option>
          {query.data.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      {notice ? (
        <div className="request-notice" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="requests-workbench">
        <div className="requests-list" aria-label={`${tab} requests`}>
          {rows?.length ? (
            <>
              {rows.map((row) => (
                <RequestRow
                  key={row.id}
                  row={row}
                  selected={selected?.id === row.id}
                  onSelect={() => setSelectedId(row.id)}
                />
              ))}
              {(
                tab === "time-off"
                  ? timeOffCursor || query.data.time_off_next_cursor
                  : shiftCursor || query.data.shift_change_next_cursor
              ) ? (
                <div
                  className="request-pagination"
                  aria-label="Request history pages"
                >
                  {(tab === "time-off" ? timeOffCursor : shiftCursor) ? (
                    <button
                      className="nf-button secondary"
                      onClick={() => {
                        if (tab === "time-off") setTimeOffCursor("");
                        else setShiftCursor("");
                        setSelectedId("");
                      }}
                    >
                      Newest
                    </button>
                  ) : null}
                  {(
                    tab === "time-off"
                      ? query.data.time_off_next_cursor
                      : query.data.shift_change_next_cursor
                  ) ? (
                    <button
                      className="nf-button secondary"
                      onClick={() => {
                        if (tab === "time-off")
                          setTimeOffCursor(query.data.time_off_next_cursor!);
                        else
                          setShiftCursor(query.data.shift_change_next_cursor!);
                        setSelectedId("");
                      }}
                    >
                      Older
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="requests-empty">
              <Check size={22} />
              <strong>Queue clear</strong>
              <span>No requests match these filters.</span>
            </div>
          )}
        </div>
        <aside
          className={`request-detail ${selectedId && selected ? "open" : ""}`}
        >
          {selected ? (
            "segments" in selected ? (
              <TimeOffDetail
                request={selected}
                canManage={
                  context?.permissions.includes(
                    "schedule.time_off_requests.manage",
                  ) ?? false
                }
                onClose={() => setSelectedId("")}
                onDecision={(action) =>
                  setDecision({ kind: "time-off", request: selected, action })
                }
              />
            ) : (
              <ShiftDetail
                request={selected}
                canManage={
                  context?.permissions.includes(
                    "schedule.shift_change_requests.manage",
                  ) ?? false
                }
                onClose={() => setSelectedId("")}
                onDecision={(action) =>
                  setDecision({
                    kind: "shift-change",
                    request: selected,
                    action,
                  })
                }
              />
            )
          ) : (
            <div className="requests-empty detail-empty">
              <ChevronRight size={22} />
              <strong>Select a request</strong>
              <span>Review details, conflicts, and history.</span>
            </div>
          )}
        </aside>
      </div>
      {decision ? (
        <DecisionDialog
          decision={decision}
          onCancel={() => setDecision(null)}
          onSubmit={(note, segments) => submit(decision, note, segments)}
        />
      ) : null}
    </section>
  );
}

function RequestRow({
  row,
  selected,
  onSelect,
}: {
  row: TimeOffRequest | ShiftChangeRequest;
  selected: boolean;
  onSelect: () => void;
}) {
  const timeOff = "segments" in row;
  const title = timeOff
    ? row.employee_name
    : (row.participants.find((participant) => participant.role === "requester")
        ?.employee_name ?? "Shift request");
  const detail = timeOff
    ? `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`
    : `${formatDate(row.offered_shift.scheduled_date)} · ${formatTime(row.offered_shift.start_time)}-${formatTime(row.offered_shift.end_time)}`;
  return (
    <button
      className={`request-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span className="request-row-icon">
        {timeOff ? <CalendarOff size={17} /> : <RotateCcw size={17} />}
      </span>
      <span className="request-row-main">
        <strong>{title}</strong>
        <span>{detail}</span>
        <small>
          {timeOff ? row.location_name : row.offered_shift.location_name}
        </small>
      </span>
      <span
        className={`request-status status-${row.status.replaceAll("_", "-")}`}
      >
        {statusLabel(row.status)}
      </span>
      {timeOff && row.conflict_count ? (
        <span
          className="request-conflict-count"
          title="Published shift conflicts"
        >
          <AlertTriangle size={14} /> {row.conflict_count}
        </span>
      ) : null}
      <ChevronRight size={16} aria-hidden />
    </button>
  );
}

function TimeOffDetail({
  request,
  canManage,
  onClose,
  onDecision,
}: {
  request: TimeOffRequest;
  canManage: boolean;
  onClose: () => void;
  onDecision: (
    action:
      "approve" | "deny" | "partial_approve" | "return_to_pending" | "revoke",
  ) => void;
}) {
  const decide = onDecision;
  return (
    <div className="request-detail-inner">
      <DetailHeader
        title={request.employee_name}
        status={request.status}
        onClose={onClose}
      />
      <dl className="request-facts">
        <div>
          <dt>Dates</dt>
          <dd>
            {formatDate(request.start_date)} - {formatDate(request.end_date)}
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{request.location_name}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatDate(request.created_at)}</dd>
        </div>
        <div>
          <dt>Conflicts</dt>
          <dd>{request.conflict_count} published shifts</dd>
        </div>
      </dl>
      {request.reason ? (
        <section>
          <h2>Employee note</h2>
          <p>{request.reason}</p>
        </section>
      ) : null}
      <section>
        <h2>Date segments</h2>
        <div className="request-segments">
          {request.segments.map((segment) => (
            <div key={segment.id}>
              <span>{formatDate(segment.segment_date)}</span>
              <span>
                {segment.start_time
                  ? `${formatTime(segment.start_time)}-${formatTime(segment.end_time!)}`
                  : "Full day"}
              </span>
              <span className={`request-status status-${segment.status}`}>
                {statusLabel(segment.status)}
              </span>
            </div>
          ))}
        </div>
      </section>
      <Timeline events={request.events} />
      {canManage ? (
        <div className="request-decisions">
          {request.status === "pending" ? (
            <>
              <button className="nf-button" onClick={() => decide("approve")}>
                <Check size={16} /> Approve
              </button>
              {request.segments.length > 1 ? (
                <button
                  className="nf-button secondary"
                  onClick={() => decide("partial_approve")}
                >
                  Partial
                </button>
              ) : null}
              <button
                className="nf-button danger"
                onClick={() => decide("deny")}
              >
                <X size={16} /> Deny
              </button>
            </>
          ) : (
            <>
              {request.status !== "revoked" ? (
                <button
                  className="nf-button secondary"
                  onClick={() => decide("return_to_pending")}
                >
                  <RotateCcw size={16} /> Return to pending
                </button>
              ) : null}
              {request.status === "approved" ||
              request.status === "partially_approved" ? (
                <button
                  className="nf-button danger"
                  onClick={() => decide("revoke")}
                >
                  <X size={16} /> Revoke
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <p className="view-only-note">View-only access</p>
      )}
    </div>
  );
}

function ShiftDetail({
  request,
  canManage,
  onClose,
  onDecision,
}: {
  request: ShiftChangeRequest;
  canManage: boolean;
  onClose: () => void;
  onDecision: (action: "approve" | "reject") => void;
}) {
  const requester = request.participants.find(
    (participant) => participant.role === "requester",
  );
  return (
    <div className="request-detail-inner">
      <DetailHeader
        title={requester?.employee_name ?? "Shift change"}
        status={request.status}
        onClose={onClose}
      />
      <div className="shift-change-diagram">
        <ShiftBlock label="Current" shift={request.offered_shift} />
        <ChevronRight size={20} />
        {request.requested_shift ? (
          <ShiftBlock label="Requested" shift={request.requested_shift} />
        ) : (
          <div className="shift-target">
            <small>Requested outcome</small>
            <strong>
              {request.participants.find(
                (participant) => participant.role === "receiver",
              )?.employee_name ?? "Open shift"}
            </strong>
            <span>takes this shift</span>
          </div>
        )}
      </div>
      {request.note ? (
        <section>
          <h2>Request note</h2>
          <p>{request.note}</p>
        </section>
      ) : null}
      <section>
        <h2>Conflict check</h2>
        {request.conflicts.length ? (
          <div className="request-conflicts">
            {request.conflicts.map((conflict) => (
              <div key={conflict.code} className={conflict.severity}>
                <AlertTriangle size={16} />
                <span>
                  <strong>
                    {conflict.severity === "hard" ? "Blocked" : "Review"}
                  </strong>
                  {conflict.message}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="conflict-clear">
            <Check size={16} /> No current conflicts
          </p>
        )}
      </section>
      <Timeline events={request.events} />
      {canManage && request.status === "pending_manager_approval" ? (
        <div className="request-decisions">
          <button
            className="nf-button"
            disabled={request.conflicts.some(
              (conflict) => conflict.severity === "hard",
            )}
            onClick={() => onDecision("approve")}
          >
            <Check size={16} /> Approve
          </button>
          <button
            className="nf-button danger"
            onClick={() => onDecision("reject")}
          >
            <X size={16} /> Reject
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DetailHeader({
  title,
  status,
  onClose,
}: {
  title: string;
  status: string;
  onClose: () => void;
}) {
  return (
    <header className="request-detail-header">
      <div>
        <small>Request review</small>
        <h2>{title}</h2>
      </div>
      <span className={`request-status status-${status.replaceAll("_", "-")}`}>
        {statusLabel(status)}
      </span>
      <button
        className="icon-button request-mobile-close"
        aria-label="Close details"
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </header>
  );
}

function ShiftBlock({
  label,
  shift,
}: {
  label: string;
  shift: ShiftChangeRequest["offered_shift"];
}) {
  return (
    <div className="shift-target">
      <small>{label}</small>
      <strong>{shift.employee_name ?? "Open shift"}</strong>
      <span>
        {formatDate(shift.scheduled_date)} · {formatTime(shift.start_time)}-
        {formatTime(shift.end_time)}
      </span>
      <span>
        {shift.location_name} · {shift.job_name}
      </span>
    </div>
  );
}

function Timeline({ events }: { events: TimeOffRequest["events"] }) {
  return (
    <section>
      <h2>Activity</h2>
      <ol className="request-timeline">
        {events.map((event) => (
          <li key={event.id}>
            <Clock3 size={14} />
            <div>
              <strong>{statusLabel(event.action)}</strong>
              <span>
                {event.actor_name} ·{" "}
                {new Date(event.created_at).toLocaleString()}
              </span>
              {event.note ? <p>{event.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DecisionDialog({
  decision,
  onCancel,
  onSubmit,
}: {
  decision: Decision;
  onCancel: () => void;
  onSubmit: (note: string, segments: TimeOffSegmentDecision[]) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [segments, setSegments] = useState<TimeOffSegmentDecision[]>(
    decision.kind === "time-off" && decision.action === "partial_approve"
      ? decision.request.segments.map((segment) => ({
          segment_id: segment.id,
          status: "approved",
        }))
      : [],
  );
  const softOverride =
    decision.kind === "shift-change" &&
    decision.action === "approve" &&
    decision.request.conflicts.some((conflict) => conflict.severity === "soft");
  const noteRequired = softOverride;
  async function confirm() {
    setBusy(true);
    await onSubmit(note, segments);
    setBusy(false);
  }
  return (
    <div className="request-dialog-backdrop" role="presentation">
      <div
        className="request-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-title"
      >
        <header>
          <div>
            <small>Confirm decision</small>
            <h2 id="decision-title">{actionLabel(decision.action)}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        {decision.kind === "time-off" &&
        decision.action === "partial_approve" ? (
          <div className="partial-decisions">
            {decision.request.segments.map((segment) => (
              <label key={segment.id}>
                <span>{formatDate(segment.segment_date)}</span>
                <select
                  value={
                    segments.find((item) => item.segment_id === segment.id)
                      ?.status ?? "approved"
                  }
                  onChange={(event) =>
                    setSegments((current) =>
                      current.map((item) =>
                        item.segment_id === segment.id
                          ? {
                              ...item,
                              status: event.target.value as
                                "approved" | "denied",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="approved">Approve</option>
                  <option value="denied">Deny</option>
                </select>
              </label>
            ))}
          </div>
        ) : null}
        <label className="decision-note">
          Manager note{" "}
          {noteRequired ? (
            <span>Required for conflict override</span>
          ) : (
            <span>Optional</span>
          )}
          <textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <footer>
          <button className="nf-button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`nf-button ${decision.action === "deny" || decision.action === "reject" || decision.action === "revoke" ? "danger" : ""}`}
            disabled={busy || (noteRequired && note.trim().length < 10)}
            onClick={() => void confirm()}
          >
            {busy ? "Saving..." : actionLabel(decision.action)}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RequestState({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <main className={`schedule-state ${error ? "error" : ""}`}>
      <strong>{text}</strong>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: value.length > 10 ? undefined : "numeric",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
}
function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function actionLabel(value: Decision["action"]) {
  return statusLabel(
    value === "partial_approve" ? "Save partial decision" : value,
  );
}

export default ScheduleRequestsPage;
