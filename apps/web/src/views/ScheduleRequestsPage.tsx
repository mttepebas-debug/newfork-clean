import { CatalogDrawer } from "../settings/CatalogDrawer";
import { CatalogSortButton } from "./CatalogSortButton";
import { CatalogPageHeader } from "./CatalogPageHeader";
import "./requests-catalog.css";
import { timeOffOpenedShiftCount, type TimeOffRequest } from "@newfork/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarOff,
  Check,
  ChevronRight,
  Clock3,
  History,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { TimeOffPeriods } from "../employee-hub/TimeOffPeriods";
import { TimeOffReleasedAssignments } from "../employee-hub/TimeOffReleasedAssignments";
import { TimeOffShorten } from "./TimeOffShorten";
import {
  formatInstant,
  progressVariant,
  TimeOffProgressPanel,
  type ProgressVariant,
} from "./TimeOffProgressPanel";
import { ShiftExchangeHub } from "../employee-hub/shift-exchanges/ShiftExchangeHub";
import { refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { PermissionRoute } from "../auth/PermissionRoute";
import {
  AvailabilityDraftScope,
  requestAvailabilityNavigation,
} from "../availability/availability-navigation";
import {
  isStaleTimeOff,
  useRevokeTimeOff,
  useScheduleRequests,
  useVoteOnTimeOff,
} from "../schedule/requests-data";
import { ConfirmDialog } from "../shell/ConfirmDialog";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
type Tab = "time-off" | "shift-changes";
type RequestSortKey = "employee" | "date" | "decide_by" | "status" | "review";
type Act = { request: TimeOffRequest; kind: "approve" | "deny" | "revoke" };

export function ScheduleRequestsPage() {
  const [params] = useSearchParams();
  if (params.get("tab") === "availability") {
    return <Navigate to="/app/availability" replace />;
  }
  return (
    <PermissionRoute
      anyOf={[
        "schedule.time_off_requests.read",
        "schedule.shift_change_requests.read",
      ]}
    >
      <AvailabilityDraftScope
        labels={{
          saving: "Saving request decision",
          discard: "Discard request decision?",
          saved: "Decision saved",
          unsaved:
            "Your unsaved decision and note will be lost. Saved decisions and published assignments stay in place.",
        }}
      >
        <ScheduleRequestsPageContent />
      </AvailabilityDraftScope>
    </PermissionRoute>
  );
}
function ScheduleRequestsPageContent() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const workspaceId = context?.workspace.id ?? "";
  const canReadTimeOff = can(context, "requests.read");
  const canReadShift = can(context, "exchange.read");
  const requestedTab = params.get("tab");
  const tab: Tab =
    requestedTab === "shift-changes" && canReadShift
      ? "shift-changes"
      : canReadTimeOff
        ? "time-off"
        : "shift-changes";
  const variant = progressVariant(params);
  const [timeOffQueue, setTimeOffQueue] = useState<"needs_review" | "closed">(
    "needs_review",
  );
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: RequestSortKey;
    descending: boolean;
  }>({ key: "date", descending: false });
  const [timeOffCursor, setTimeOffCursor] = useState("");
  const [selectedId, setSelectedId] = useState(params.get("request") ?? "");
  const [act, setAct] = useState<Act | null>(null);
  const [actText, setActText] = useState("");
  const [actError, setActError] = useState("");
  const [notice, setNotice] = useState("");
  const vote = useVoteOnTimeOff(workspaceId);
  const revoke = useRevokeTimeOff(workspaceId);
  // Also loaded under Shift changes, so the Time off tab keeps its count.
  const query = useScheduleRequests(canReadTimeOff ? context?.workspace.id : undefined, {
    timeOffQueue,
    locationId,
    search,
    timeOffCursor,
  });
  const rows = query.data?.time_off_requests;
  const sortedRows = useMemo(
    () =>
      [...(rows ?? [])].sort(
        (left, right) =>
          compareValues(
            requestSortValue(left, sort.key),
            requestSortValue(right, sort.key),
          ) * (sort.descending ? -1 : 1),
      ),
    [rows, sort],
  );
  const selected = useMemo(
    () => rows?.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  function changeTab(next: Tab) {
    requestAvailabilityNavigation(() => {
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", next);
      nextParams.delete("request");
      nextParams.delete("case");
      nextParams.delete("offer");
      setParams(nextParams);
      setSelectedId("");
      setNotice("");
    });
  }
  function resetPaging() {
    setTimeOffCursor("");
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
  function startAct(request: TimeOffRequest, kind: Act["kind"]) {
    setActText("");
    setActError("");
    const progress = request.progress;
    // A manager's plain vote needs no box; one that opens shifts, a deny
    // (its note) and an admin's or owner's decision do (rules 6, 7, 14).
    const ask =
      kind !== "approve" ||
      Boolean(
        progress &&
          (progress.can_decide_alone ||
            (progress.my_approval_finalizes &&
              timeOffOpenedShiftCount(progress) > 0)),
      );
    if (ask) setAct({ request, kind });
    else void runAct({ request, kind }, "");
  }
  async function runAct(current: Act, text: string) {
    const { request, kind } = current;
    try {
      let message: string;
      let closed = true;
      if (kind === "revoke") {
        await revoke.mutateAsync({
          requestId: request.id,
          revoke: { expected_revision: request.revision, reason: text },
        });
        message = "Time off revoked.";
      } else {
        const result = await vote.mutateAsync({
          requestId: request.id,
          verdict: {
            verdict: kind,
            note: text,
            expected_impact: request.progress!.impact!.fingerprint,
          },
        });
        closed = result.final;
        message = verdictMessage(request, kind, result.final, result.remaining);
      }
      setAct(null);
      setNotice(message);
      if (closed) selectRequest("");
      // A decision can open shifts: every surface that shows them refreshes.
      await refreshExchangeSurfaces(client, workspaceId);
    } catch (error) {
      if (isStaleTimeOff(error)) {
        setAct(null);
        setNotice("This request changed. Review it again.");
        return;
      }
      const message = error instanceof Error ? error.message : "Decision failed";
      if (kind === "approve" && !act) setNotice(message);
      else setActError(message);
    }
  }
  const header = (
    <CatalogPageHeader
      eyebrow="TEAM CHANGES. REVIEWED WITH CONTROL."
      title="Requests"
      titleId="requests-title"
      description="Review time off and shift change requests in one place."
      action={
        <div className="requests-tabs" role="tablist" aria-label="Request type">
          {canReadTimeOff ? (
            <button
              role="tab"
              aria-selected={tab === "time-off"}
              className={tab === "time-off" ? "active" : ""}
              onClick={() => changeTab("time-off")}
            >
              Time off{" "}
              {query.data ? (
                <strong>{query.data.time_off_pending_count}</strong>
              ) : null}
            </button>
          ) : null}
          {canReadShift ? (
            <button
              role="tab"
              aria-selected={tab === "shift-changes"}
              className={tab === "shift-changes" ? "active" : ""}
              onClick={() => changeTab("shift-changes")}
            >
              Shift changes
            </button>
          ) : null}
        </div>
      }
    />
  );
  // Shift Hub reads ?case= itself, so manager notification links land here.
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        subject="requests"
        homeHref={noAccessHomePath(context, "/app/schedule/requests")}
      />
    );
  if (tab === "shift-changes" && canReadShift && context)
    return (
      <section
        className="settings-page jobs-settings-page requests-catalog-page requests-page requests-shift-hub"
        aria-labelledby="requests-title"
      >
        {header}
        <ShiftExchangeHub
          key={`${context.workspace.id}:${context.userId}`}
          workspaceId={context.workspace.id}
          manager
        />
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
  const timeFormat = query.data.time_format ?? "12h";

  return (
    <section
      className="settings-page jobs-settings-page requests-catalog-page requests-page"
      aria-labelledby="requests-title"
    >
      {header}

      <div className="requests-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div className="catalog-status-tabs" role="group" aria-label="Queue">
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
          </div>
        </div>
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select"
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
          <label className="requests-search toolbar-search">
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
        </div>
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
          <div className="job-column-headings catalog-column-headings request-catalog-row">
            {(
              [
                ["employee", "Employee", undefined],
                ["date", "Dates", undefined],
                ["decide_by", "Decide by", "request-location-column"],
                ["status", "Status", undefined],
                ["review", "Review", "request-impact-column"],
              ] as const
            ).map(([key, label, className]) => (
              <span
                key={key}
                className={className}
                role="columnheader"
                aria-sort={
                  sort.key === key
                    ? sort.descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
              >
                <CatalogSortButton
                  label={label}
                  active={sort.key === key}
                  onClick={() =>
                    setSort({
                      key,
                      descending: sort.key === key ? !sort.descending : false,
                    })
                  }
                />
              </span>
            ))}
          </div>
          {sortedRows.length ? (
            <>
              {sortedRows.map((row) => (
                <RequestRow
                  key={row.id}
                  row={row}
                  onSelect={() => selectRequest(row.id)}
                />
              ))}
              {timeOffCursor || query.data.time_off_next_cursor ? (
                <div
                  className="request-pagination"
                  aria-label="Request history pages"
                >
                  {timeOffCursor ? (
                    <button
                      className="nf-button secondary"
                      onClick={() => {
                        setTimeOffCursor("");
                        setSelectedId("");
                      }}
                    >
                      Newest
                    </button>
                  ) : null}
                  {query.data.time_off_next_cursor ? (
                    <button
                      className="nf-button secondary"
                      onClick={() => {
                        setTimeOffCursor(query.data.time_off_next_cursor!);
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
        {selected && (
          <CatalogDrawer
            label="Review request"
            className="requests-catalog-page requests-review-drawer"
            onClose={() => selectRequest("")}
          >
            <TimeOffDetail
              request={selected}
              timeFormat={timeFormat}
              variant={variant}
              busy={vote.isPending || revoke.isPending}
              // ponytail: "may they revoke somewhere"; the API asks per person.
              canRevoke={can(context, "time_off.revoke")}
              onClose={() => selectRequest("")}
              onAct={(kind) => startAct(selected, kind)}
              shorten={
                <TimeOffShorten
                  key={`${selected.id}:${selected.revision}`}
                  request={selected}
                  workspaceId={workspaceId}
                  timeFormat={timeFormat}
                  onDone={(message) => {
                    setNotice(message);
                    selectRequest("");
                    void refreshExchangeSurfaces(client, workspaceId);
                  }}
                />
              }
            />
          </CatalogDrawer>
        )}
      </div>
      {act ? (
        <ActDialog
          act={act}
          text={actText}
          error={actError}
          busy={vote.isPending || revoke.isPending}
          onText={setActText}
          onCancel={() => setAct(null)}
          onConfirm={() => void runAct(act, actText.trim())}
        />
      ) : null}
    </section>
  );
}

function verdictMessage(
  request: TimeOffRequest,
  kind: "approve" | "deny",
  final: boolean,
  remaining: number,
) {
  const cancellation = request.request_type === "time_off_cancellation";
  if (kind === "deny") return cancellation ? "Cancellation declined." : "Time off denied.";
  if (final) return cancellation ? "Cancellation approved." : "Time off approved.";
  return `Your approval is saved. ${plural(remaining, "location")} still to approve.`;
}

function ActDialog({
  act,
  text,
  error,
  busy,
  onText,
  onCancel,
  onConfirm,
}: {
  act: Act;
  text: string;
  error: string;
  busy: boolean;
  onText: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { request, kind } = act;
  const name = request.employee_name;
  const cancellation = request.request_type === "time_off_cancellation";
  const opens = request.progress ? timeOffOpenedShiftCount(request.progress) : 0;
  const opensLine = opens
    ? `${plural(opens, "published shift")} become${opens === 1 ? "s an open shift" : " open shifts"}.`
    : "";
  const alone = Boolean(request.progress?.can_decide_alone);
  const copy =
    kind === "revoke"
      ? {
          title: "Revoke time off?",
          description: `Hours not yet taken stop being time off. ${name} and the managers are notified.`,
          confirm: "Revoke",
          field: "Reason",
        }
      : kind === "deny"
        ? {
            title: cancellation ? "Decline cancellation?" : "Deny time off?",
            description: cancellation
              ? "The time off stays in place."
              : "One denial closes the request.",
            confirm: cancellation ? "Decline" : "Deny",
            field: `Note for ${name} (optional)`,
          }
        : {
            title: cancellation ? "Approve cancellation?" : "Approve time off?",
            description: alone
              ? `Takes effect now. Managers at ${name}'s locations are notified.${opensLine ? ` ${opensLine}` : ""}`
              : opensLine,
            confirm: "Approve",
            field: null,
          };
  return (
    <ConfirmDialog
      open
      title={copy.title}
      description={copy.description}
      confirmLabel={busy ? "Saving..." : copy.confirm}
      destructive={kind !== "approve"}
      busy={busy}
      confirmDisabled={kind === "revoke" && !text.trim()}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {copy.field ? (
        <label className="app-confirm-field">
          <span>{copy.field}</span>
          <textarea
            rows={3}
            autoFocus
            maxLength={1000}
            required={kind === "revoke"}
            value={text}
            placeholder={kind === "deny" && !cancellation ? "e.g. I can approve Jan 11–12 only" : undefined}
            onChange={(event) => onText(event.target.value)}
          />
        </label>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </ConfirmDialog>
  );
}

function RequestRow({
  row,
  onSelect,
}: {
  row: TimeOffRequest;
  onSelect: () => void;
}) {
  const opens = row.progress ? timeOffOpenedShiftCount(row.progress) : 0;
  return (
    <button
      type="button"
      className="job-catalog-row request-catalog-row request-catalog-button"
      onClick={onSelect}
    >
      <span className="job-row-identity">
        <span className="request-catalog-marker">
          <CalendarOff size={16} />
        </span>
        <span className="job-name-stack">
          <span className="job-row-name" title={row.employee_name}>
            {row.employee_name}
          </span>
          {row.request_type === "time_off_cancellation" && (
            <small>Leave cancellation</small>
          )}
        </span>
      </span>
      <span className="request-catalog-meta">
        {`${formatDate(row.start_date)} - ${formatDate(row.end_date)}`}
      </span>
      <span className="request-catalog-meta request-location-column">
        {row.status === "pending" && row.decide_by ? formatInstant(row.decide_by) : ""}
      </span>
      <span
        className={`request-status status-${row.status.replaceAll("_", "-")}`}
      >
        {statusLabel(row.status)}
      </span>
      <span className="request-impact-column request-catalog-meta">
        {opens ? (
          <span
            className="request-conflict-count"
            title="Shifts that become open"
          >
            <AlertTriangle size={14} />
            {opens}
          </span>
        ) : (
          <ChevronRight size={15} aria-hidden />
        )}
      </span>
    </button>
  );
}

function requestSortValue(
  row: TimeOffRequest,
  key: RequestSortKey,
): string | number {
  if (key === "employee") return row.employee_name;
  if (key === "date") return row.start_date;
  if (key === "decide_by") return row.decide_by ?? "";
  if (key === "review") return row.progress ? timeOffOpenedShiftCount(row.progress) : 0;
  return row.status;
}

function compareValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function TimeOffDetail({
  request,
  timeFormat,
  variant,
  busy,
  canRevoke,
  onClose,
  onAct,
  shorten,
}: {
  request: TimeOffRequest;
  timeFormat: "12h" | "24h";
  variant: ProgressVariant;
  busy: boolean;
  canRevoke: boolean;
  onClose: () => void;
  shorten?: ReactNode;
  onAct: (kind: Act["kind"]) => void;
}) {
  const cancellation = request.request_type === "time_off_cancellation";
  const progress = request.progress;
  const canVote = Boolean(progress && (progress.can_vote || progress.can_decide_alone));
  const approved = request.status === "approved" || request.status === "partially_approved";
  const revocable = !cancellation && approved && canRevoke;
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
          <dt>Submitted</dt>
          <dd>{formatDate(request.created_at)}</dd>
        </div>
      </dl>
      {cancellation ? (
        <p>Cancellation of approved time off. The time off stays in place until this is approved.</p>
      ) : null}
      {request.cancellation?.pending_request_id ? (
        <p>A cancellation request is waiting. The time off is still in effect.</p>
      ) : null}
      {progress ? (
        <TimeOffProgressPanel progress={progress} timeFormat={timeFormat} variant={variant} />
      ) : null}
      {request.reason ? (
        <section>
          <h2>Employee note</h2>
          <p>{request.reason}</p>
        </section>
      ) : null}
      <section>
        <h2>Requested periods</h2>
        <TimeOffPeriods
          periods={request.segments}
          timeFormat={timeFormat}
          requestStatus={request.status}
          cancellation={cancellation}
        />
      </section>
      <Timeline events={request.events} timeFormat={timeFormat} />
      {canVote ? (
        <div className="request-decisions">
          <button
            className="nf-button danger"
            disabled={busy}
            onClick={() => onAct("deny")}
          >
            <X size={16} /> {cancellation ? "Decline" : "Deny"}
          </button>
          <button
            className="nf-button"
            disabled={busy || !progress?.impact}
            onClick={() => onAct("approve")}
          >
            <Check size={16} /> Approve
          </button>
        </div>
      ) : revocable ? (
        <div className="request-decisions">
          <button className="nf-button danger" disabled={busy} onClick={() => onAct("revoke")}>
            <X size={16} /> Revoke
          </button>
          {shorten}
        </div>
      ) : (
        <p className="view-only-note">View-only access</p>
      )}
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

function Timeline({
  events,
  timeFormat,
}: {
  events: TimeOffRequest["events"];
  timeFormat: "12h" | "24h";
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

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: value.length > 10 ? undefined : "numeric",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
}
function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default ScheduleRequestsPage;
