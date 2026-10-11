import { CatalogDrawer } from "../settings/CatalogDrawer";
import { CatalogPageHeader } from "./CatalogPageHeader";
import { ListPagination } from "./ListPagination";
import { RequestCards, RequestsTable } from "./RequestsTable";
import { SwapReview } from "./SwapReview";
import "./requests-catalog.css";
import { timeOffOpenedShiftCount, type ExchangeCase, type TimeOffRequest } from "@newfork/shared";
import { useToast } from "@newfork/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Clock3,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TimeOffPeriods } from "../employee-hub/TimeOffPeriods";
import { TimeOffReleasedAssignments } from "../employee-hub/TimeOffReleasedAssignments";
import { TimeOffShorten } from "./TimeOffShorten";
import { TimeOffProgressPanel } from "./TimeOffProgressPanel";
import { ShiftExchangeHub } from "../employee-hub/shift-exchanges/ShiftExchangeHub";
import { refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import {
  AvailabilityDraftScope,
  requestAvailabilityNavigation,
} from "../availability/availability-navigation";
import {
  isStaleTimeOff,
  useRevokeTimeOff,
  useVoteOnTimeOff,
} from "../schedule/requests-data";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import {
  openCounts,
  pageOf,
  readRequestsParams,
  requestRows,
  requestTypesFor,
  useRequests,
  type RequestRow,
  requestTabLabels,
  requestTabsFor,
  tabOf,
} from "../schedule/requests-list";

import { NoAccessState } from "../shell/NoAccessState";
import { appLandingPath, noAccessHomePath } from "../auth/resolveLanding";
type Act = { request: TimeOffRequest; kind: "approve" | "deny" | "revoke" };
type DrawerNotice = { text: string; tone?: "warning" | "error" };

export function ScheduleRequestsPage() {
  const [params] = useSearchParams();
  const { context } = useAuth();
  if (params.get("tab") === "availability") {
    return <Navigate to="/app/availability" replace />;
  }
  // EKRAN-02 B1: the door asks the core, like the tabs do.
  if (!can(context, "requests.read") && !can(context, "exchange.read"))
    return <Navigate to={appLandingPath(context)} replace />;
  return (
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
  );
}
function ScheduleRequestsPageContent() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const workspaceId = context?.workspace.id ?? "";
  const canReadTimeOff = can(context, "requests.read");
  const canReadShift = can(context, "exchange.read");
  const allowedTypes = requestTypesFor({ timeOff: canReadTimeOff, shiftChanges: canReadShift });
  const view = readRequestsParams(params, allowedTypes);
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(params.get("request") ?? "");
  // EKRAN-02 C2 (H2): the swap whose review window is open over the list. The
  // window reads the list's latest copy and keeps the last one it saw, so a
  // refresh that no longer lists the swap does not pull it away (P26).
  const [openSwap, setOpenSwap] = useState<ExchangeCase | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const [actText, setActText] = useState("");
  const [actError, setActError] = useState("");
  const toast = useToast();
  // Said inside the drawer while it stays open (CatalogDrawer).
  const [drawerNotice, setDrawerNotice] = useState<DrawerNotice | null>(null);
  const vote = useVoteOnTimeOff(workspaceId);
  const revoke = useRevokeTimeOff(workspaceId);
  const data = useRequests(workspaceId, { timeOff: canReadTimeOff, shiftChanges: canReadShift }, { locationId, search });
  // Every type, so each tab can count what is still open in it.
  const allRows = useMemo(
    () => requestRows(data.timeOff, data.exchanges, { type: "all", locationId, search }),
    [data.timeOff, data.exchanges, locationId, search],
  );
  const counts = openCounts(allRows);
  const page = pageOf(view.type === "all" ? allRows : allRows.filter((row) => tabOf(row.type) === view.type), view.page, view.pageSize);
  const swap = openSwap ? (data.exchanges.find((item) => item.id === openSwap.id) ?? openSwap) : null;
  const timeOffById = new Map<string, TimeOffRequest>();
  for (const row of allRows) if (row.source === "time_off") timeOffById.set(row.id, row.request);
  const selected = timeOffById.get(selectedId) ?? null;

  function setView(values: Record<string, string | null>) {
    requestAvailabilityNavigation(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(values)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    });
  }
  function selectRequest(id: string) {
    setSelectedId(id);
    setDrawerNotice(null);
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
  function openRow(row: RequestRow) {
    // A swap opens its review window over the list (H2). A cover or open
    // shift opens its review where it lives today (Shift Hub's manager view,
    // ?case=); that is a step the browser's Back undoes, so it is pushed.
    if (row.source === "exchange" && row.type === "swap") setOpenSwap(row.request);
    else if (row.source === "exchange")
      requestAvailabilityNavigation(() =>
        setParams((previous) => {
          const next = new URLSearchParams(previous);
          next.set("case", row.id);
          return next;
        }),
      );
    else selectRequest(row.id);
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
    setDrawerNotice(null);
    try {
      let message: string;
      let closedNow = true;
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
        closedNow = result.final;
        message = verdictMessage(request, kind, result.final, result.remaining);
      }
      setAct(null);
      if (closedNow) {
        selectRequest("");
        toast.success(message);
      } else setDrawerNotice({ text: message });
      // A decision can open shifts: every surface that shows them refreshes.
      await refreshExchangeSurfaces(client, workspaceId);
    } catch (error) {
      if (isStaleTimeOff(error)) {
        setAct(null);
        setDrawerNotice({ text: "This request changed. Review it again.", tone: "warning" });
        return;
      }
      const message = error instanceof Error ? error.message : "Decision failed";
      if (kind === "approve" && !act) setDrawerNotice({ text: message, tone: "error" });
      else setActError(message);
    }
  }
  const header = (
    <CatalogPageHeader
      eyebrow="TEAM CHANGES. REVIEWED WITH CONTROL."
      title="Requests"
      titleId="requests-title"
      description="Review time off and shift change requests in one place."
    />
  );
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (data.failure === "no_access")
    return (
      <NoAccessState
        subject="requests"
        homeHref={noAccessHomePath(context, "/app/schedule/requests")}
      />
    );
  // Shift Hub reads ?case= itself; manager notification links land here too.
  // Its Renew swaps ?case= for ?offer=, whose form Shift Hub draws as well.
  if ((params.has("case") || params.has("offer")) && canReadShift && context)
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
  const timeFormat = data.timeFormat;
  const loading = data.isLoading;
  const failed = Boolean(data.failure);
  // One group to read needs no tabs: All would say the same thing.
  const tabs = requestTabsFor(allowedTypes);

  return (
    <section
      className="settings-page jobs-settings-page requests-catalog-page requests-page list-page"
      aria-labelledby="requests-title"
    >
      {header}

      <div className="requests-toolbar catalog-toolbar">
        {tabs.length ? (
        <TabRow chosen={view.type}>
          <div
            className="catalog-status-tabs"
            role="group"
            aria-label="Request type"
            onKeyDown={(event) => {
              // R2-48: the arrow keys move along the tabs.
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const buttons = [...event.currentTarget.querySelectorAll("button")];
              const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (at < 0) return;
              event.preventDefault();
              buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }}
          >
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                className={view.type === key ? "active" : ""}
                aria-pressed={view.type === key}
                onClick={() => {
                  selectRequest("");
                  setView({ type: key === "all" ? null : key, page: null });
                }}
              >
                {requestTabLabels[key]}
                {counts[key] ? <strong>{counts[key]}</strong> : null}
              </button>
            ))}
          </div>
        </TabRow>
        ) : null}
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select"
            value={locationId}
            aria-label="Filter by location"
            onChange={(event) => {
              setLocationId(event.target.value);
              setView({ page: null });
            }}
          >
            <option value="">All locations</option>
            {data.locations.map((location) => (
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
                setView({ page: null });
              }}
            />
          </label>
        </div>
      </div>

      <div className="employee-table-wrap requests-table-wrap">
        {/* Three reads make one list: it is drawn once all of them answered. */}
        <RequestsTable rows={loading ? [] : page.rows} timeFormat={timeFormat} onOpen={openRow} />
        <RequestCards rows={loading ? [] : page.rows} timeFormat={timeFormat} onOpen={openRow} />
        {loading ? <p className="settings-state">Loading requests...</p> : null}
        {!loading && failed ? (
          <div className="catalog-table-empty" role="alert">
            <span className="catalog-table-empty-icon" aria-hidden>
              <AlertTriangle size={22} />
            </span>
            <h2>Requests could not load</h2>
            <p>Check your connection and try again.</p>
            <button type="button" className="nf-button secondary" onClick={data.retry}>
              <RotateCcw size={16} aria-hidden /> Try again
            </button>
          </div>
        ) : null}
        {!loading && !failed && !page.rows.length ? (
          <div className="catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              <Check size={22} />
            </span>
            <h2>No requests</h2>
            <p>{view.type === "all" ? "No requests match these filters." : `No ${view.type === "time_off" ? "time off" : "shift change"} requests match these filters.`}</p>
          </div>
        ) : null}
      </div>
      <ListPagination
        total={page.total}
        page={page.page}
        pageSize={view.pageSize}
        onPageChange={(next) => setView({ page: next > 1 ? String(next) : null })}
        onPageSizeChange={(size) => setView({ size: size === 50 ? null : String(size), page: null })}
      />

      {selected && (
        <CatalogDrawer
          label="Review request"
          className="requests-catalog-page requests-review-drawer"
          onClose={() => selectRequest("")}
        >
          <TimeOffDetail
            request={selected}
            timeFormat={timeFormat}
            notice={drawerNotice}
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
                  selectRequest("");
                  toast.success(message);
                  void refreshExchangeSurfaces(client, workspaceId);
                }}
              />
            }
          />
        </CatalogDrawer>
      )}
      {swap ? (
        <SwapReview
          // One window per swap: a refresh keeps a reason being typed (P26).
          key={swap.id}
          item={swap}
          workspace={workspaceId}
          timeFormat={timeFormat}
          onClose={() => setOpenSwap(null)}
          onDone={(message) => {
            setOpenSwap(null);
            toast.success(message);
          }}
        />
      ) : null}
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

/**
 * The type tabs' row. When it is wider than a phone the row scrolls, its edge
 * fades where more tabs wait (`data-more`), and the chosen tab is scrolled into view.
 */
function TabRow({ chosen, children }: { chosen: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<"left" | "right" | "both" | null>(null);
  const measure = useCallback(() => {
    const element = row.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setMore(left && right ? "both" : left ? "left" : right ? "right" : null);
  }, []);
  useEffect(() => {
    row.current?.querySelector<HTMLElement>("button.active")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [chosen, measure]);
  return (
    <div ref={row} className="catalog-toolbar-status-row" data-more={more ?? undefined} onScroll={measure}>
      {children}
    </div>
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
              ? `Takes effect now.${request.progress?.locations.length ? ` Managers at ${name}'s locations are notified.` : ""}${opensLine ? ` ${opensLine}` : ""}`
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
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </ConfirmDialog>
  );
}

function TimeOffDetail({
  request,
  timeFormat,
  notice,
  busy,
  canRevoke,
  onClose,
  onAct,
  shorten,
}: {
  request: TimeOffRequest;
  timeFormat: "12h" | "24h";
  notice: DrawerNotice | null;
  busy: boolean;
  canRevoke: boolean;
  onClose: () => void;
  shorten?: ReactNode;
  onAct: (kind: Act["kind"]) => void;
}) {
  const cancellation = request.request_type === "time_off_cancellation";
  const progress = request.progress;
  const canVote = Boolean(progress && (progress.can_vote || progress.can_decide_alone));
  const approved = request.status === "approved";
  const revocable = !cancellation && approved && canRevoke;
  return (
    <div className="request-detail-inner">
      <DetailHeader
        title={request.employee_name}
        status={request.status}
        onClose={onClose}
      >
        {notice ? (
          <p
            className={notice.tone ? `request-drawer-notice ${notice.tone}` : "request-drawer-notice"}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </DetailHeader>
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
        <TimeOffProgressPanel progress={progress} timeFormat={timeFormat} zone={requestZone(request)} />
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
  children,
}: {
  title: string;
  status: string;
  onClose: () => void;
  children?: ReactNode;
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
      {children}
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
// A request is asked in one zone; every period carries it (FB-6.3.8d).
function requestZone(request: TimeOffRequest) {
  return request.segments[0]?.time_timezone;
}
