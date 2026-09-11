import { CatalogDrawer } from "../settings/CatalogDrawer";
import { SettingsHeader } from "../settings/GeneralSettingsPage";
import "./requests-catalog.css";
import type {
  ShiftChangeRequest,
  TimeOffRequest,
  TimeOffSegmentDecision,
  TimeOffAssignmentDisposition,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { formatAvailabilityClock } from "../availability/AvailabilityClockInput";
import { TimeOffPartialDecision } from "../employee-hub/TimeOffPartialDecision";
import { TimeOffPeriods } from "../employee-hub/TimeOffPeriods";
import { TimeOffReleasedAssignments } from "../employee-hub/TimeOffReleasedAssignments";
import { formatTimeOffInstant } from "../employee-hub/time-off-split";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { PermissionRoute } from "../auth/PermissionRoute";
import {
  AvailabilityDraftScope,
  leaveAvailability,
  requestAvailabilityNavigation,
  timeOffNavigationLabels,
  useAvailabilityNavigationGuard,
  type AvailabilityNavigationRef,
} from "../availability/availability-navigation";
import {
  decideShiftChange,
  decideTimeOff,
  getScheduleRequests,
  markTimeOffViewed,
  previewTimeOffAssignment,
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
  const [params] = useSearchParams();
  if (params.get("tab") === "availability") {
    return <Navigate to="/app/availability" replace />;
  }
  return (
    <PermissionRoute anyOf={[
      "schedule.time_off_requests.read",
      "schedule.shift_change_requests.read",
    ]}>
      <AvailabilityDraftScope labels={{
        saving: "Saving request decision",
        discard: "Discard request decision?",
        saved: "Decision saved",
        unsaved: "Your unsaved decision and note will be lost. Saved decisions and published assignments stay in place.",
      }}>
        <ScheduleRequestsPageContent />
      </AvailabilityDraftScope>
    </PermissionRoute>
  );
}
function ScheduleRequestsPageContent() {
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
    enabled: Boolean(context) && (canReadTimeOff || canReadShift),
  });
  const rows =
    tab === "time-off"
      ? query.data?.time_off_requests
      : query.data?.shift_change_requests;
  const selected = useMemo(
    () => rows?.find((row) => row.id === selectedId) ?? null,
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
    requestAvailabilityNavigation(() => {
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", next);
      nextParams.delete("request");
      nextParams.delete("legacy");
      nextParams.delete("case");
      nextParams.delete("offer");
      setParams(nextParams);
      setSelectedId("");
      setNotice("");
    });
  }
  function resetPaging() {
    setTimeOffCursor("");
    setShiftCursor("");
    setSelectedId("");
  }
  function selectRequest(id: string) {
    setSelectedId(id);
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (id) next.set("request", id);
        else next.delete("request");
        return next;
      },
      { preventScrollReset: true },
    );
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
    operationId: string,
    assignment?: {
      fingerprint: string;
      decisions: TimeOffAssignmentDisposition[];
    },
  ) {
    try {
      if (current.kind === "time-off") {
        await decideTimeOff(context!.workspace.id, current.request.id, {
          operation_id: operationId,
          ...(assignment
            ? {
                assignment_fingerprint: assignment.fingerprint,
                assignment_decisions: assignment.decisions,
              }
            : {}),
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
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["employee-hub", context!.workspace.id],
        }),
        client.invalidateQueries({ queryKey: ["schedule"] }),
        client.invalidateQueries({ queryKey: ["availability"] }),
      ]);
      return null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Decision failed";
      if (message.includes("stale") || message.includes("changed")) {
        await client.invalidateQueries({ queryKey: ["schedule-requests"] });
        setNotice(
          "This request changed. Close this decision to review the refreshed request.",
        );
      } else {
        setNotice(message);
      }
      return message;
    }
  }
  if (
    tab === "shift-changes" &&
    canReadShift &&
    context &&
    params.get("legacy") !== "1"
  )
    return (
      <section
        className="settings-page jobs-settings-page requests-catalog-page requests-page requests-shift-hub"
        aria-labelledby="requests-title"
      >
        <SettingsHeader
          title="Schedule Requests"
          titleId="requests-title"
          icon={<CalendarOff size={21} aria-hidden />}
          description="Review time off and shift change requests."
          action={
            <div
              className="requests-tabs"
              role="tablist"
              aria-label="Request type"
            >
              {canReadTimeOff && (
                <button
                  role="tab"
                  aria-selected={false}
                  onClick={() => changeTab("time-off")}
                >
                  Time off
                </button>
              )}
              <button role="tab" aria-selected className="active">
                Shift changes
              </button>
            </div>
          }
        />
        <ShiftExchangeHub
          key={`${context.workspace.id}:${context.userId}`}
          workspaceId={context.workspace.id}
          manager
        />
        <button
          className="nf-button secondary"
          onClick={() =>
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              next.set("legacy", "1");
              return next;
            })
          }
        >
          View earlier requests
        </button>
      </section>
    );
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
    <section
      className="settings-page jobs-settings-page requests-catalog-page requests-page"
      aria-labelledby="requests-title"
    >
      <SettingsHeader
        title="Schedule Requests"
        titleId="requests-title"
        icon={<CalendarOff size={21} aria-hidden />}
        description="Review time off and shift change requests."
        action={
          <div
            className="requests-tabs"
            role="tablist"
            aria-label="Request type"
          >
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
        }
      />

      <div
        className={`requests-toolbar${tab === "time-off" ? " requests-toolbar-time-off" : ""}`}
      >
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
        <div
          className="requests-list job-catalog"
          aria-label={`${tab} requests`}
        >
          <div className="job-column-headings request-catalog-row">
            <span>Employee</span>
            <span>Dates / shift</span>
            <span className="request-location-column">Location</span>
            <span>Status</span>
            <span className="request-impact-column">Review</span>
          </div>
          {rows?.length ? (
            <>
              {rows.map((row) => (
                <RequestRow
                  key={row.id}
                  row={row}
                  onSelect={() => selectRequest(row.id)}
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
        {selected && !decision && (
          <CatalogDrawer
            label="Review request"
            className="requests-catalog-page requests-review-drawer"
            onClose={() => selectRequest("")}
          >
            {selected ? (
              "segments" in selected ? (
                <TimeOffDetail
                  request={selected}
                  timeFormat={query.data.time_format ?? "12h"}
                  canManage={
                    context?.permissions.includes(
                      "schedule.time_off_requests.manage",
                    ) ?? false
                  }
                  onClose={() => selectRequest("")}
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
                  onClose={() => selectRequest("")}
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
          </CatalogDrawer>
        )}
      </div>
      {decision ? (
        <DecisionDialog
          decision={decision}
          timeFormat={query.data.time_format ?? "12h"}
          onCancel={() => setDecision(null)}
          onSubmit={(note, segments, operationId, assignment) =>
            submit(decision, note, segments, operationId, assignment)
          }
        />
      ) : null}
    </section>
  );
}

function RequestRow({
  row,
  onSelect,
}: {
  row: TimeOffRequest | ShiftChangeRequest;
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
      type="button"
      className="job-catalog-row request-catalog-row request-catalog-button"
      onClick={onSelect}
    >
      <span className="job-row-identity">
        <span className="request-catalog-marker">
          {timeOff ? <CalendarOff size={16} /> : <RotateCcw size={16} />}
        </span>
        <span className="job-name-stack">
          <span className="job-row-name" title={title}>
            {title}
          </span>
          {timeOff && row.request_type === "time_off_cancellation" && (
            <small>Leave cancellation</small>
          )}
        </span>
      </span>
      <span className="request-catalog-meta">{detail}</span>
      <span
        className="request-catalog-meta request-location-column"
        title={timeOff ? row.location_name : row.offered_shift.location_name}
      >
        {timeOff ? row.location_name : row.offered_shift.location_name}
      </span>
      <span
        className={`request-status status-${row.status.replaceAll("_", "-")}`}
      >
        {statusLabel(row.status)}
      </span>
      <span className="request-impact-column request-catalog-meta">
        {timeOff &&
        row.request_type !== "time_off_cancellation" &&
        row.conflict_count ? (
          <span
            className="request-conflict-count"
            title="Published assignments to review"
          >
            <AlertTriangle size={14} />
            {row.conflict_count}
          </span>
        ) : (
          <ChevronRight size={15} aria-hidden />
        )}
      </span>
    </button>
  );
}

function TimeOffDetail({
  request,
  timeFormat,
  canManage,
  onClose,
  onDecision,
}: {
  request: TimeOffRequest;
  timeFormat: "12h" | "24h";
  canManage: boolean;
  onClose: () => void;
  onDecision: (
    action:
      "approve" | "deny" | "partial_approve" | "return_to_pending" | "revoke",
  ) => void;
}) {
  const decide = onDecision;
  const cancellation = request.request_type === "time_off_cancellation";
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
          <dt>Published assignments to review</dt>
          <dd>
            {cancellation
              ? "Cancellation does not change assignments"
              : `${request.conflict_count} published shifts`}
          </dd>
        </div>
      </dl>
      {!cancellation ? (
        <p>
          Counts use{" "}
          {request.status === "pending"
            ? "requested hours"
            : "remaining approved hours"}{" "}
          across locations, including overnight work and shifts whose hours need
          verification. The approval review checks the exact hours you choose to
          approve.
        </p>
      ) : null}
      {cancellation ? (
        <p>
          Cancellation of approved leave. Accepting removes only the approved
          cancellation hours. Declining keeps the leave. Previously released
          shifts will not be reassigned automatically.
        </p>
      ) : null}
      {request.cancellation?.pending_request_id ? (
        <p>
          A cancellation request is awaiting review. Approved leave is still in
          effect.
        </p>
      ) : null}
      {request.reason ? (
        <section>
          <h2>Employee note</h2>
          <p>{request.reason}</p>
        </section>
      ) : null}
      <section>
        <h2>Requested periods and decisions</h2>
        <TimeOffPeriods
          periods={request.segments}
          timeFormat={timeFormat}
          requestStatus={request.status}
          cancellation={cancellation}
        />
      </section>
      <Timeline events={request.events} timeFormat={timeFormat} />
      {canManage ? (
        <div className="request-decisions">
          {request.status === "pending" ? (
            <>
              <button className="nf-button" onClick={() => decide("approve")}>
                <Check size={16} /> Approve
              </button>
              {request.segments.length > 1 ||
              request.segments.some((p) => p.time_source === "snapshot") ? (
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
              {!cancellation &&
              !request.cancellation?.has_completed_cancellation &&
              request.status !== "revoked" ? (
                <button
                  className="nf-button secondary"
                  onClick={() => decide("return_to_pending")}
                >
                  <RotateCcw size={16} /> Return to pending
                </button>
              ) : null}
              {!cancellation &&
              (request.status === "approved" ||
                request.status === "partially_approved") ? (
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

function Timeline({
  events,
  timeFormat = "12h",
}: {
  events: TimeOffRequest["events"];
  timeFormat?: "12h" | "24h";
}) {
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
              <TimeOffReleasedAssignments
                assignments={event.released_assignments}
                timeFormat={timeFormat}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DecisionDialog({
  decision,
  timeFormat,
  onCancel,
  onSubmit,
}: {
  decision: Decision;
  timeFormat: "12h" | "24h";
  onCancel: () => void;
  onSubmit: (
    note: string,
    segments: TimeOffSegmentDecision[],
    operationId: string,
    assignment?: {
      fingerprint: string;
      decisions: TimeOffAssignmentDisposition[];
    },
  ) => Promise<string | null>;
}) {
  const { context } = useAuth();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSplits, setEditingSplits] = useState<Record<string, boolean>>(
    {},
  );
  const retry = useRef({ signature: "", key: crypto.randomUUID() });
  const [segments, setSegments] = useState<TimeOffSegmentDecision[]>(
    decision.kind === "time-off" && decision.action === "partial_approve"
      ? decision.request.segments.map((segment) => ({
          segment_id: segment.id,
          status: "approved",
        }))
      : [],
  );
  const initialSegments = useRef(JSON.stringify(segments));
  const decisionNavigation: AvailabilityNavigationRef = useRef(null);
  const cancellation =
    decision.kind === "time-off" &&
    decision.request.request_type === "time_off_cancellation";
  const approval =
    decision.kind === "time-off" &&
    !cancellation &&
    (decision.action === "approve" || decision.action === "partial_approve");
  const decisionLabel = cancellation
    ? decision.action === "approve"
      ? "Approve cancellation"
      : decision.action === "deny"
        ? "Decline cancellation"
        : "Save cancellation decision"
    : actionLabel(decision.action);
  const hasUnfinishedSplit = Object.values(editingSplits).some(Boolean);
  const [releases, setReleases] = useState<{
    fingerprint: string;
    ids: string[];
  }>({ fingerprint: "", ids: [] });
  const impact = useQuery({
    queryKey: [
      "time-off-assignment-preview",
      context?.workspace.id,
      decision.request.id,
      decision.request.revision,
      decision.action,
      segments,
    ],
    queryFn: () =>
      previewTimeOffAssignment(context!.workspace.id, decision.request.id, {
        expected_revision: decision.request.revision,
        action: decision.action as "approve" | "partial_approve",
        segment_decisions: segments,
      }),
    enabled: Boolean(context && approval && !busy && !hasUnfinishedSplit),
    retry: false,
  });
  const releaseIds =
    releases.fingerprint === impact.data?.fingerprint ? releases.ids : [];
  const assignmentReady =
    !approval ||
    Boolean(
      impact.data &&
      !impact.isFetching &&
      !impact.isError &&
      !impact.data.restricted_count &&
      impact.data.affected_shifts.every((s) => releaseIds.includes(s.id)),
    );
  const softOverride =
    decision.kind === "shift-change" &&
    decision.action === "approve" &&
    decision.request.conflicts.some((conflict) => conflict.severity === "soft");
  const noteRequired = softOverride;
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty:
      decision.kind === "time-off" &&
      Boolean(
        note ||
        hasUnfinishedSplit ||
        releases.ids.length ||
        error ||
        JSON.stringify(segments) !== initialSegments.current,
      ),
    busy: decision.kind === "time-off" && busy,
    navigationRef: decisionNavigation,
    labels: timeOffNavigationLabels,
    onDiscard: onCancel,
  });
  const closeDecision = () => leaveAvailability(decisionNavigation, onCancel);
  async function confirm() {
    setBusy(true);
    const assignment =
      approval && impact.data
        ? {
            fingerprint: impact.data.fingerprint,
            decisions: releaseIds.map((shift_id) => ({
              shift_id,
              action: "release_entire_shift" as const,
            })),
          }
        : undefined;
    const signature = JSON.stringify({ note, segments, assignment });
    if (signature !== retry.current.signature)
      retry.current = { signature, key: crypto.randomUUID() };
    try {
      setError(await onSubmit(note, segments, retry.current.key, assignment));
    } finally {
      setBusy(false);
    }
  }
  return (
    <CatalogDrawer
      label={decisionLabel}
      className="requests-catalog-page requests-decision-drawer"
      busy={busy}
      onClose={closeDecision}
    >
      {navigationDialog}
      <div className="job-catalog-editor">
        <header className="job-editor-title">
          <div>
            <small>Confirm decision</small>
            <h2 id="decision-title">{decisionLabel}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={closeDecision}
          >
            <X size={18} />
          </button>
        </header>
        <div className="catalog-drawer-body">
          {cancellation ? (
            <p>
              Only hours marked for cancellation will stop being approved leave.
              Keeping a period preserves the leave. This decision does not
              reassign any previously released shift.
            </p>
          ) : null}
          {decision.kind === "time-off" &&
          decision.action === "partial_approve" ? (
            <div className="partial-decisions">
              <p>
                {cancellation
                  ? "Choose which requested hours to cancel and which to keep as approved leave."
                  : "Decide each requested period. Published shifts remain assigned until you confirm an explicit assignment change with this decision."}
              </p>
              {decision.request.segments.map((segment) => (
                <div key={segment.id}>
                  <span>
                    {formatDate(segment.segment_date)} ·{" "}
                    {segment.start_time && segment.end_time
                      ? `${formatAvailabilityClock(segment.start_time, timeFormat)}–${formatAvailabilityClock(segment.end_time, timeFormat)}`
                      : "Full day"}
                    {segment.ends_next_day ||
                    segment.end_time?.startsWith("24:")
                      ? " (+1 day)"
                      : ""}
                    {segment.time_timezone ? ` · ${segment.time_timezone}` : ""}
                  </span>
                  <TimeOffPartialDecision
                    period={segment}
                    timeFormat={timeFormat}
                    disabled={busy}
                    cancellation={cancellation}
                    decision={segments.find(
                      (item) => item.segment_id === segment.id,
                    )!}
                    onEditing={(editing) =>
                      setEditingSplits((current) => ({
                        ...current,
                        [segment.id]: editing,
                      }))
                    }
                    onChange={(value) =>
                      setSegments((current) =>
                        current.map((item) =>
                          item.segment_id === segment.id ? value : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
          {approval ? (
            <section
              className="time-off-assignment-review"
              aria-label="Published assignment decisions"
            >
              <h3>Published assignments</h3>
              {impact.isFetching ? (
                <p role="status">Checking affected published shifts…</p>
              ) : null}
              {impact.isError ? (
                <p role="alert">
                  {impact.error instanceof Error
                    ? impact.error.message
                    : "Could not check published assignments."}
                </p>
              ) : null}
              {impact.data?.restricted_count ? (
                <p role="alert">
                  {impact.data.restricted_count} affected shift(s) require
                  publishing access at another location. Keep this request
                  pending for a manager with access to all affected locations.
                </p>
              ) : null}
              {impact.data &&
              !impact.data.affected_shifts.length &&
              !impact.data.restricted_count ? (
                <p>No published assignments overlap the approved hours.</p>
              ) : null}
              {impact.data?.affected_shifts.length ? (
                <p>
                  Choose what happens to every affected shift. Releasing a shift
                  below removes the employee from its entire duration and leaves
                  open coverage. If they will work the remaining hours, adjust
                  the Schedule first, then review this request again.
                </p>
              ) : null}
              {impact.data?.affected_shifts.map((shift) => (
                <label key={shift.id} className="time-off-assignment-choice">
                  <input
                    type="checkbox"
                    disabled={busy || impact.isFetching}
                    checked={releaseIds.includes(shift.id)}
                    onChange={(event) =>
                      setReleases({
                        fingerprint: impact.data!.fingerprint,
                        ids: event.target.checked
                          ? [...releaseIds, shift.id]
                          : releaseIds.filter((id) => id !== shift.id),
                      })
                    }
                  />
                  <span>
                    <strong>Release entire shift to open coverage</strong>
                    <br />
                    {shift.location_name} · {shift.job_name}
                    <br />
                    {shift.starts_at && shift.ends_at
                      ? `${formatTimeOffInstant(shift.starts_at, shift.timezone, timeFormat)} – ${formatTimeOffInstant(shift.ends_at, shift.timezone, timeFormat)}`
                      : `${shift.scheduled_date} · Hours need verification`}
                  </span>
                </label>
              ))}
              <button
                type="button"
                disabled={busy || impact.isFetching}
                onClick={() => void impact.refetch()}
              >
                Refresh affected assignments
              </button>
              <button type="button" disabled={busy} onClick={closeDecision}>
                Keep request pending
              </button>
              {impact.data?.affected_shifts.length && assignmentReady ? (
                <p>
                  Saving this decision releases the selected entire shifts and
                  approves only the leave hours shown above.
                </p>
              ) : null}
            </section>
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
              maxLength={1000}
              disabled={busy}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          {decision.kind === "time-off" && decision.action === "revoke" ? (
            <p>
              Revoking leave does not reassign previously released shifts.
              Review the Schedule separately if the employee will work.
            </p>
          ) : null}
          {Object.values(editingSplits).some(Boolean) ? (
            <p>Apply or cancel the open split before saving your decision.</p>
          ) : null}
        </div>
        <footer className="job-editor-footer">
          <button
            className="nf-button secondary"
            disabled={busy}
            onClick={closeDecision}
          >
            Cancel
          </button>
          <button
            className={`nf-button ${decision.action === "deny" || decision.action === "reject" || decision.action === "revoke" ? "danger" : ""}`}
            disabled={
              busy ||
              hasUnfinishedSplit ||
              !assignmentReady ||
              (noteRequired && note.trim().length < 10)
            }
            onClick={() => void confirm()}
          >
            {busy ? "Saving..." : decisionLabel}
          </button>
        </footer>
      </div>
    </CatalogDrawer>
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
import { ShiftExchangeHub } from "../employee-hub/shift-exchanges/ShiftExchangeHub";
