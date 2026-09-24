import { CatalogDrawer } from "../../settings/CatalogDrawer";
import type {
  ExchangeApplication,
  ExchangeCase,
  ExchangeCommand,
  ExchangeReadModel,
  ExchangeShift,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronRight,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { addDays } from "../../schedule/lib/scheduleDateTime";
import {
  changeExchange,
  ExchangeError,
  getExchangeCandidates,
  getExchangePreview,
  getExchanges,
  refreshExchangeSurfaces,
} from "./exchange-data";
import "./shift-exchanges.css";
import { ExchangeShiftCard, shiftHours } from "./ExchangeShiftCard";
export { ExchangeShiftCard } from "./ExchangeShiftCard";

const stageLabels: Record<ExchangeCase["stage"], string> = {
  seeking_candidates: "Finding cover",
  awaiting_peer: "Awaiting teammate",
  ready_for_manager: "Awaiting manager",
  awaiting_other_manager: "Awaiting other manager",
  closed: "Closed",
};
const statusLabels: Record<ExchangeApplication["status"], string> = {
  invited: "Your response needed",
  pending_manager: "Awaiting manager",
  approved: "Approved",
  rejected_by_manager: "Declined by manager",
  declined_by_employee: "Declined",
  withdrawn: "Withdrawn",
  closed_other_selected: "Another teammate selected",
  closed_case_cancelled: "Search closed",
  expired: "Expired",
  invalidated: "Shift changed",
};
const caseStatusLabels: Record<ExchangeCase["status"], string> = {
  open: "Open",
  completed: "Approved",
  cancelled: "Search closed",
  expired: "Expired",
  invalidated: "Shift changed",
};
const activeApplication = (a: ExchangeApplication) =>
  a.status === "invited" || a.status === "pending_manager";

export function ExchangeDialog({
  title,
  children,
  onClose,
  fallbackFocus,
  catalog = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
  catalog?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal?.();
    return () => {
      dialog?.close?.();
      if (before?.isConnected && !before.matches(":disabled")) before.focus();
      else fallbackFocus?.current?.focus();
    };
  }, [fallbackFocus]);
  return createPortal(
    <dialog
      ref={ref}
      className={`sx-dialog sx-root ${catalog ? "jobs-settings-page requests-catalog-page request-catalog-exchange-dialog" : ""}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 && element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="sx-icon"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
function Responsibility({
  item,
  employeeId,
}: {
  item: ExchangeCase;
  employeeId: string | null;
}) {
  const missing =
    item.current_published === false ||
    (item.kind === "swap" && item.requested_current_published === false);
  const unknown =
    item.current_published !== true ||
    (item.kind === "swap" && item.requested_current_published !== true);
  const stillOwner =
    employeeId !== null && item.shift.employee_id === employeeId;
  const title = missing
    ? item.kind === "swap"
      ? "One of these shifts is no longer published"
      : "This shift is no longer published"
    : unknown
      ? "Check current assignments"
      : item.status === "completed"
        ? item.kind === "swap"
          ? "Swap approved"
          : "Transfer approved"
        : item.kind === "swap"
          ? item.status === "open"
            ? "Both owners keep their current shifts"
            : "Request closed"
          : stillOwner
            ? "Still your shift"
            : item.shift.employee_name
              ? `Current owner: ${item.shift.employee_name}`
              : "Open shift · No assigned employee";
  return (
    <div
      className={`sx-responsibility ${item.status === "completed" && !missing && !unknown ? "sx-success" : ""}`}
    >
      <ShieldCheck size={21} aria-hidden />
      <div>
        <strong>{title}</strong>
        <p>
          {missing || unknown
            ? "Check the current published assignments below. Retained shift details do not confirm current responsibility."
            : item.status === "completed"
              ? "This request is complete. Assignments below include any later schedule changes."
              : item.status !== "open"
                ? "This request is closed. Check the current assignments below."
                : item.kind === "swap"
                  ? "Each person remains responsible for their shift until final manager approval."
                  : "Responsibility changes only after final manager approval."}
        </p>
      </div>
    </div>
  );
}

function useExchangeAction(workspace: string) {
  const client = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const [notice, setNotice] = useState<{
    caseId: string;
    revision: number;
    status: string;
    text: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: async (command: ExchangeCommand) => {
      if (!navigator.onLine)
        throw new Error("You’re offline. Reconnect before making a change.");
      const signature = JSON.stringify(command);
      const key = keys.current.get(signature) ?? crypto.randomUUID();
      keys.current.set(signature, key);
      const result = await changeExchange(workspace, command, key);
      keys.current.delete(signature);
      return result;
    },
    onSuccess: async (result, command) => {
      setNotice({
        caseId: result.case_id,
        revision: result.revision,
        status: result.status,
        text:
          result.status === "completed"
            ? "Manager approved the change. Schedules have been updated."
            : result.status === "invalidated"
              ? "Shift details changed. No transfer was made. Review the current schedule before starting a new request."
              : result.status === "expired"
                ? "The decision deadline passed. No transfer was made. Check your current schedule for your assignment."
                : result.status === "cancelled"
                  ? "Request closed. No transfer was made. Check your current schedule for your assignment."
                  : command.action === "accept"
                    ? "Request accepted. Waiting for final manager approval."
                    : "Request updated. Assignment changes require final manager approval.",
      });
      await refreshExchangeSurfaces(client, workspace);
    },
    onError: (error) => {
      if (
        error instanceof ExchangeError &&
        (error.status === 409 || error.status === 403)
      )
        void refreshExchangeSurfaces(client, workspace);
    },
  });
  return { mutation, notice, setNotice };
}

export function ShiftExchangeHub({
  workspaceId,
  manager = false,
}: {
  workspaceId: string;
  manager?: boolean;
}) {
  const { context } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const locationFilter = params.get("location") ?? "";
  const [online, setOnline] = useState(navigator.onLine);
  const detailRef = useRef<HTMLElement>(null);
  const { mutation, notice, setNotice } = useExchangeAction(workspaceId);
  const from = params.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = params.get("to") ?? addDays(from, 42);
  const focusedCase = params.get("case") ?? undefined;
  const query = useQuery({
    queryKey: [
      "shift-exchanges",
      workspaceId,
      context?.userId,
      manager,
      from,
      to,
      focusedCase,
    ],
    queryFn: () =>
      getExchanges(workspaceId, manager, { from, to, caseId: focusedCase }),
    refetchInterval: 60_000,
    refetchOnReconnect: "always",
  });
  const selectedId = params.get("case");
  const noticeItem = query.data?.cases.find(
    (item) => item.id === notice?.caseId,
  );
  const noticeStale = Boolean(
    notice &&
    noticeItem &&
    (noticeItem.revision > notice.revision ||
      (noticeItem.revision === notice.revision &&
        noticeItem.status !== notice.status)),
  );
  useEffect(() => {
    if (noticeStale) setNotice(null);
  }, [noticeStale, setNotice]);
  const hasData = Boolean(query.data);
  useEffect(() => {
    if (!selectedId || !hasData) return;
    const frame = requestAnimationFrame(() => {
      // A quick user action may happen before this navigation frame runs.
      // Preserve the explicit review/dialog focus instead of pulling it back.
      const active = document.activeElement;
      if (
        (active !== detailRef.current && detailRef.current?.contains(active)) ||
        active?.closest("dialog")
      )
        return;
      detailRef.current?.focus({ preventScroll: true });
      if (window.innerWidth <= 900)
        detailRef.current?.scrollIntoView?.({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, hasData]);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void query.refetch();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [query.refetch]);
  function navigate(values: Record<string, string | null>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      return next;
    });
  }
  if (query.isLoading)
    return (
      <div
        className="sx-root sx-skeleton"
        role="status"
        aria-label="Loading shift changes"
      >
        <div />
        <div />
        <div />
      </div>
    );
  if (
    !query.data ||
    (query.error instanceof ExchangeError &&
      [401, 403].includes(query.error.status))
  )
    return (
      <div className="sx-root sx-empty">
        <h2>Shift Hub is unavailable</h2>
        <p role="alert">{query.error?.message}</p>
        <button onClick={() => void query.refetch()}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  const model = query.data;
  const selected = model.cases.find((item) => item.id === params.get("case"));
  // A confirmation describes one command result. Once that request changes,
  // the current detail must not compete with a stale success message.
  const currentNotice =
    notice && !noticeStale && (!selectedId || selectedId === notice.caseId)
      ? notice.text
      : null;
  const view =
    params.get("hub_view") ??
    (selected
      ? selected.status !== "open"
        ? "history"
        : !manager
          ? "requests"
          : selected.stage === "seeking_candidates"
            ? "finding"
            : selected.stage === "awaiting_peer"
              ? "peer"
              : "ready"
      : manager
        ? "ready"
        : "available");
  const offering = params.has("offer");
  const tabs: [string, string][] = manager
    ? [
        ["ready", "Ready for review"],
        ["finding", "Finding cover"],
        ["peer", "Awaiting response"],
        ["history", "History"],
      ]
    : [
        ["available", "Available"],
        ["requests", "My requests"],
        ["history", "History"],
      ];
  const canWrite = online && !mutation.isPending;
  const matches = (shift: ExchangeShift) =>
    shift.scheduled_date >= from &&
    shift.scheduled_date <= to &&
    (!locationFilter || shift.location_id === locationFilter) &&
    `${shift.location_name} ${shift.job_name} ${shift.employee_name ?? ""} ${shift.scheduled_date}`
      .toLowerCase()
      .includes(search.toLowerCase());
  // All filters must match the same side of a swap. A date on one side
  // must not be combined with a location or name on the other side.
  const matchesCase = (item: ExchangeCase) =>
    matches(item.shift) ||
    (item.requested_shift != null && matches(item.requested_shift));
  const readyCount = model.cases.filter(
    (item) =>
      matchesCase(item) &&
      item.status === "open" &&
      ["ready_for_manager", "awaiting_other_manager"].includes(item.stage),
  ).length;
  const locations = Array.from(
    new Map(
      [
        ...model.opportunities.map((o) => o.shift),
        ...model.cases.flatMap((c) =>
          c.requested_shift ? [c.shift, c.requested_shift] : [c.shift],
        ),
      ].map((s) => [s.location_id, s.location_name]),
    ),
  );
  const cases = model.cases
    .filter(
      (item) =>
        matchesCase(item) &&
        (view === "history"
          ? item.status !== "open"
          : item.status === "open" &&
            (!manager ||
              (view === "ready" &&
                ["ready_for_manager", "awaiting_other_manager"].includes(
                  item.stage,
                )) ||
              (view === "finding" && item.stage === "seeking_candidates") ||
              (view === "peer" && item.stage === "awaiting_peer"))),
    )
    .sort((a, b) => {
      if (manager) return a.expires_at.localeCompare(b.expires_at);
      const priority = (c: ExchangeCase) =>
        c.applications.some(
          (a) => a.employee_id === model.employee_id && a.status === "invited",
        )
          ? 0
          : c.stage === "ready_for_manager"
            ? 1
            : 2;
      return (
        priority(a) - priority(b) || a.expires_at.localeCompare(b.expires_at)
      );
    });
  return (
    <div
      className={`sx-root ${manager ? "request-catalog-shift-hub" : ""} ${selected ? "sx-reading-detail" : ""}`}
    >
      {/* The employee page title comes from the shared catalog header. */}
      {manager && (
        <div className="sx-heading">
          <div>
            <p className="sx-eyebrow">TEAM SCHEDULE</p>
            <h2>Shift changes</h2>
            <p>
              {`${readyCount} ${readyCount === 1 ? "case" : "cases"} ready for a decision · Every transfer needs your final approval.`}
            </p>
          </div>
        </div>
      )}
      {!online && (
        <p className="sx-banner" role="status">
          You’re offline. Showing the last loaded requests. Reconnect to make
          changes.
        </p>
      )}
      {query.isError && (
        <p className="sx-banner" role="alert">
          Couldn’t refresh these requests.{" "}
          <button onClick={() => void query.refetch()}>Retry</button>
        </p>
      )}
      {currentNotice && (
        <p className="sx-notice" role="status">
          <Check size={17} />
          {currentNotice}
        </p>
      )}
      {mutation.error && (
        <p className="sx-error" role="alert">
          {mutation.error.message}
          {!(mutation.error instanceof ExchangeError) &&
            " If the response was lost, retry the same action to check its result."}
        </p>
      )}
      <nav
        className="sx-tabs"
        aria-label={manager ? "Shift change queues" : "Shift Hub views"}
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-current={view === key ? "page" : undefined}
            onClick={() => navigate({ hub_view: key, case: null })}
          >
            {label}
            {key === "ready" && <span>{readyCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sx-filters">
        <label className="sx-filter-location">
          <span className="sx-sr">Location</span>
          <select
            value={locationFilter}
            onChange={(e) => navigate({ location: e.target.value })}
          >
            <option value="">All my locations</option>
            {locations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="sx-filter-search">
          <span className="sx-sr">Search shifts</span>
          <input
            type="search"
            value={search}
            onChange={(e) => navigate({ q: e.target.value })}
            placeholder="Search date, location or position"
          />
        </label>
      </div>
      <div
        className={`sx-workbench ${selected ? "sx-has-detail" : ""} ${manager ? "sx-manager" : ""}`}
      >
        <div className={`sx-list ${manager ? "job-catalog" : ""}`}>
          {!manager && view === "available" ? (
            <>
              {model.opportunities
                .filter((o) => matches(o.shift))
                .map((opportunity) => {
                  const application = model.cases
                    .find((c) => c.id === opportunity.case_id)
                    ?.applications.find(
                      (a) =>
                        a.employee_id === model.employee_id &&
                        activeApplication(a),
                    );
                  return (
                    <article className="sx-card" key={opportunity.shift.id}>
                      <div className="sx-card-top">
                        <span className="sx-pill">
                          {opportunity.shift.employee_id
                            ? "Cover"
                            : "Open shift"}
                        </span>
                        <span
                          className={
                            opportunity.eligibility.availability_warning
                              ? "sx-pending"
                              : "sx-eligible"
                          }
                        >
                          {opportunity.eligibility.availability_warning ? (
                            <AlertTriangle size={14} />
                          ) : (
                            <Check size={14} />
                          )}
                          {opportunity.eligibility.availability_warning
                            ? "Availability conflict"
                            : "Eligible"}
                        </span>
                      </div>
                      <ExchangeShiftCard shift={opportunity.shift} />
                      <p>
                        {opportunity.shift.employee_name
                          ? `Cover for ${opportunity.shift.employee_name}`
                          : "No assigned employee"}
                      </p>
                      <p className="sx-help">
                        {opportunity.eligibility.availability_warning
                          ? "Conflicts with your availability. Requesting anyway does not change your weekly preferences."
                          : "Job and location match · No assignment blockers"}
                      </p>
                      {application ? (
                        <>
                          <p className="sx-pending">
                            Awaiting manager · Not added to your schedule yet
                          </p>
                          <button
                            onClick={() =>
                              navigate({
                                case: opportunity.case_id,
                                hub_view: "requests",
                              })
                            }
                          >
                            View request <ChevronRight size={16} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="sx-primary"
                          disabled={!canWrite}
                          onClick={() =>
                            mutation.mutate(
                              {
                                action: "apply",
                                shift_id: opportunity.shift.id,
                                ...(opportunity.eligibility.availability_warning
                                  ? {
                                      availability_fingerprint:
                                        opportunity.eligibility
                                          .availability_warning.fingerprint,
                                    }
                                  : {}),
                                ...(opportunity.case_id
                                  ? { case_id: opportunity.case_id }
                                  : {}),
                              },
                              {
                                onSuccess: (result) =>
                                  navigate({
                                    case: result.case_id,
                                    hub_view: "requests",
                                  }),
                              },
                            )
                          }
                        >
                          {opportunity.eligibility.availability_warning
                            ? "Request anyway"
                            : `Request to ${opportunity.shift.employee_id ? "cover" : "pick up"}`}
                        </button>
                      )}
                    </article>
                  );
                })}
              {!model.opportunities.filter((o) => matches(o.shift)).length && (
                <EmptyState
                  title="No eligible shifts right now"
                  text="No shifts match your position, locations and current assignment requirements."
                />
              )}
            </>
          ) : (
            <>
              {manager && (
                <div className="job-column-headings request-catalog-row">
                  <span>Employee / request</span>
                  <span>Shift</span>
                  <span className="request-location-column">
                    Location / job
                  </span>
                  <span>Status</span>
                  <span className="request-impact-column">Candidates</span>
                </div>
              )}
              {cases.map((item) =>
                manager ? (
                  <button
                    type="button"
                    className="job-catalog-row request-catalog-row request-catalog-button"
                    key={item.id}
                    onClick={() => navigate({ case: item.id })}
                  >
                    <span className="job-row-identity">
                      <span className="request-catalog-marker">
                        <ArrowLeftRight size={16} />
                      </span>
                      <span className="job-name-stack">
                        <span
                          className="job-row-name"
                          title={item.owner_name ?? "Open shift"}
                        >
                          {item.owner_name ?? "Open shift"}
                        </span>
                        <small>
                          {item.kind === "swap"
                            ? "Shift swap"
                            : item.owner_name
                              ? "Cover request"
                              : "Open shift pickup"}
                        </small>
                      </span>
                    </span>
                    <span className="request-catalog-meta">
                      {item.shift.scheduled_date}
                      <br />
                      {item.shift.start_time?.slice(0, 5) ?? "—"} –{" "}
                      {item.shift.end_time?.slice(0, 5) ?? "—"}
                    </span>
                    <span
                      className="request-catalog-meta request-location-column"
                      title={`${item.shift.location_name} · ${item.shift.job_name}`}
                    >
                      {item.shift.location_name}
                      <br />
                      {item.shift.job_name}
                    </span>
                    <span className="request-status">
                      {item.status === "open"
                        ? stageLabels[item.stage]
                        : caseStatusLabels[item.status]}
                    </span>
                    <span className="request-catalog-meta request-impact-column">
                      {item.candidate_count}
                    </span>
                  </button>
                ) : (
                  <button
                    className={`sx-card sx-case-row ${selected?.id === item.id ? "sx-selected" : ""}`}
                    key={item.id}
                    onClick={() => navigate({ case: item.id })}
                  >
                    <span
                      className={`sx-pill ${item.status === "completed" ? "sx-done" : ""}`}
                    >
                      {item.status === "open"
                        ? stageLabels[item.stage]
                        : item.status === "completed"
                          ? "Approved"
                          : item.status === "invalidated"
                            ? "Shift changed"
                            : caseStatusLabels[item.status]}
                    </span>
                    <ExchangeShiftCard
                      shift={
                        matches(item.shift) ? item.shift : item.requested_shift!
                      }
                      label={
                        matches(item.shift) ? undefined : "Requested in return"
                      }
                    />
                    <span>
                      {item.kind === "swap"
                        ? "Shift swap"
                        : item.owner_name
                          ? `Cover for ${item.owner_name}`
                          : "Open shift pickup"}
                    </span>
                    <span className="sx-case-footer">
                      <span>
                        <Users size={15} />
                        {manager || item.is_owner
                          ? `${item.candidate_count} ${item.candidate_count === 1 ? "candidate" : "candidates"}`
                          : item.applications.find(
                                (a) => a.employee_id === model.employee_id,
                              )
                            ? statusLabels[
                                item.applications.find(
                                  (a) => a.employee_id === model.employee_id,
                                )!.status
                              ]
                            : "View request"}
                      </span>
                      <ChevronRight size={18} />
                    </span>
                  </button>
                ),
              )}
              {!cases.length && (
                <EmptyState
                  title={
                    view === "history"
                      ? "No past requests"
                      : "You’re all caught up"
                  }
                  text={
                    view === "history"
                      ? "No past requests match these filters. Try another date range or location."
                      : manager
                        ? "No requests match this stage and these filters. Try another date range or location."
                        : "No cover searches, applications or swap invitations match these filters."
                  }
                />
              )}
            </>
          )}
        </div>
        {selected && (
          <ManagerRequestSurface
            manager={manager}
            busy={mutation.isPending}
            onClose={() => navigate({ case: null, hub_view: view })}
          >
            <aside
              ref={detailRef}
              tabIndex={-1}
              className="sx-detail"
              aria-label="Request details"
            >
              <button
                className="sx-back"
                onClick={() => navigate({ case: null, hub_view: view })}
              >
                <ArrowLeft size={17} /> Back to requests
              </button>
              {!matchesCase(selected) && (
                <p className="sx-banner" role="status">
                  This request is outside your list filters. Its details are
                  still available here.
                </p>
              )}
              <CaseDetail
                key={selected.id}
                item={selected}
                model={model}
                manager={manager}
                canWrite={canWrite}
                workspace={workspaceId}
                run={(command) => mutation.mutateAsync(command)}
                onRenew={() =>
                  navigate({ offer: selected.shift.id, case: null })
                }
              />
            </aside>
          </ManagerRequestSurface>
        )}
        {params.has("case") && !selected && (
          <aside className="sx-detail">
            <EmptyState
              title="Request unavailable"
              text="It may be outside this date range or your current access. Your current schedule remains the source of responsibility."
            />
            <button onClick={() => navigate({ case: null })}>
              Back to requests
            </button>
          </aside>
        )}
      </div>
      {offering && (
        <CreateExchange
          model={model}
          workspace={workspaceId}
          initialShift={params.get("offer") ?? ""}
          canWrite={canWrite}
          run={(command) => mutation.mutateAsync(command)}
          onClose={() => navigate({ offer: null })}
          onCreated={(id) =>
            navigate({ offer: null, case: id, hub_view: "requests" })
          }
        />
      )}
    </div>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="sx-empty">
      <ArrowLeftRight size={28} aria-hidden />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ExchangeEligibilityDetails({
  preview,
  receiverName,
  giverName,
  showSummary = true,
}: {
  preview: Awaited<ReturnType<typeof getExchangePreview>>;
  receiverName: string;
  giverName: string;
  showSummary?: boolean;
}) {
  const checks = [
    {
      name: receiverName,
      check: preview.receiver,
      label: "Receiving the offered shift",
    },
    {
      name: giverName,
      check: preview.giver,
      label: "Receiving the requested shift",
    },
  ];
  const detailReasons = new Set(
    checks.flatMap(({ check }) =>
      check && check.status !== "eligible"
        ? check.reasons.map((reason) => reason.trim())
        : [],
    ),
  );
  const summary = [...new Set(preview.reasons)].filter(
    (reason) => !detailReasons.has(reason.trim()),
  );
  return (
    <>
      {showSummary && summary.length > 0 && (
        <ul className="sx-error">
          {summary.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {checks.map(({ name, check, label }) => {
        if (!check || check.status === "eligible") return null;
        const reasons = [
          ...new Set(
            check.reasons.map((reason) => reason.trim()).filter(Boolean),
          ),
        ];
        if (!reasons.length) return null;
        return (
          <section
            className="sx-eligibility-detail"
            aria-label={`${name} eligibility`}
            key={label}
          >
            <strong>{name}</strong>
            <p className="sx-help">{label}</p>
            <ul>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function CaseDetail({
  item,
  model,
  manager,
  canWrite,
  workspace,
  run,
  onRenew,
}: {
  item: ExchangeCase;
  model: ExchangeReadModel;
  manager: boolean;
  canWrite: boolean;
  workspace: string;
  run: (command: ExchangeCommand) => Promise<unknown>;
  onRenew: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [decision, setDecision] = useState<
    "approve" | "reject" | "close" | null
  >(null);
  const [reason, setReason] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [error, setError] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selectedReviewButton = useRef<HTMLButtonElement>(null);
  const reviewTitleId = useId();
  const decisionDescriptionId = useId();
  useEffect(() => {
    // Reviewing is explicit navigation to a decision summary. Keep background
    // eligibility refreshes from moving focus or interrupting a manager's work.
    if (candidate) {
      reviewHeading.current?.focus();
      reviewHeading.current?.scrollIntoView?.({ block: "start" });
    }
  }, [candidate]);
  const current = item.applications.find(
    (a) => a.id === candidate && activeApplication(a),
  );
  const own = item.applications.filter(
    (a) => a.employee_id === model.employee_id,
  );
  const preview = useQuery({
    queryKey: [
      "shift-exchanges",
      workspace,
      "preview",
      item.id,
      candidate,
      item.revision,
    ],
    queryFn: () => getExchangePreview(workspace, item.id, candidate),
    enabled:
      manager &&
      Boolean(current?.status === "pending_manager") &&
      item.can_manage &&
      item.status === "open",
    retry: false,
  });
  const actionable =
    item.status === "open" && canWrite && (!manager || item.can_manage);
  const requestEnded = item.status !== "open";
  const reviewBlocked =
    decision === "approve" &&
    Boolean(current) &&
    (preview.isError || preview.data?.allowed === false);
  const command = async (action: ExchangeCommand) => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await run(action);
      setDecision(null);
      setReason("");
      setPrivateNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update request");
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <div className="sx-detail-heading">
        <h3 ref={detailHeading} tabIndex={-1}>
          {item.kind === "swap"
            ? "Shift swap"
            : item.kind === "open_pickup"
              ? "Open shift pickup"
              : "Cover request"}
        </h3>
        <span
          className={`sx-pill ${item.status === "completed" ? "sx-done" : ""}`}
        >
          {item.status === "open"
            ? stageLabels[item.stage]
            : item.status === "completed"
              ? "Approved"
              : caseStatusLabels[item.status]}
        </span>
      </div>
      <Responsibility item={item} employeeId={model.employee_id} />
      {item.status === "invalidated" && (
        <p className="sx-banner" role="status">
          Shift details changed, so this offer ended without a transfer. New
          employee consent is required.
        </p>
      )}
      {!manager &&
        item.status !== "open" &&
        item.status !== "completed" &&
        item.current_published !== false &&
        model.own_shifts.some(
          (shift) => shift.source_id === item.shift.source_id,
        ) && (
          <button className="sx-primary" disabled={!canWrite} onClick={onRenew}>
            Start a new cover or swap request
          </button>
        )}
      {item.private_note && (manager || item.is_owner) && (
        <section className="sx-preview">
          <h4>Private note for the manager</h4>
          <p>{item.private_note}</p>
        </section>
      )}
      <div className={item.requested_shift ? "sx-swap-pair" : ""}>
        <ExchangeShiftCard
          shift={item.shift}
          assignment={{
            published: item.current_published,
            employeeId: model.employee_id,
          }}
          label={
            item.requested_shift
              ? item.status !== "open"
                ? "First shift"
                : manager
                  ? "Offered shift"
                  : item.owner_id === model.employee_id
                    ? "You give"
                    : "You receive"
              : undefined
          }
        />
        {item.requested_shift && (
          <ExchangeShiftCard
            shift={item.requested_shift}
            assignment={{
              published: item.requested_current_published,
              employeeId: model.employee_id,
            }}
            label={
              item.status !== "open"
                ? "Second shift"
                : manager
                  ? "Requested in return"
                  : item.owner_id === model.employee_id
                    ? "You receive"
                    : "You give"
            }
          />
        )}
      </div>
      {item.requested_shift && (
        <p className="sx-help">
          {item.status !== "open"
            ? "First / second"
            : manager
              ? "Offered / returned"
              : "Give / receive"}
          :{" "}
          {shiftHours(
            item.status !== "open" ||
              item.owner_id === model.employee_id ||
              manager
              ? item.shift
              : item.requested_shift,
          ).toFixed(1)}
          h /{" "}
          {shiftHours(
            item.status !== "open" ||
              item.owner_id === model.employee_id ||
              manager
              ? item.requested_shift
              : item.shift,
          ).toFixed(1)}
          h.{" "}
          {item.status === "open"
            ? "Both shifts change together after final approval."
            : "These details may include later schedule changes."}
        </p>
      )}
      {item.status === "open" && (
        <p className="sx-help">
          <Clock3 size={14} /> Decision needed before{" "}
          {new Date(item.expires_at).toLocaleString("en-US", {
            timeZone: item.shift.timezone,
          })}{" "}
          · {item.shift.timezone}
        </p>
      )}
      {manager || item.is_owner ? (
        <section className="sx-candidates">
          <h4>
            {item.status === "open"
              ? `${item.candidate_count} active ${item.candidate_count === 1 ? "candidate" : "candidates"}`
              : "Application results"}
          </h4>
          {item.status === "open" && (
            <p className="sx-help">
              {manager
                ? "Select a candidate to check eligibility and review the change."
                : item.audience === "direct"
                  ? "Your teammate must accept before your manager can approve. Until final approval, each shift stays with its current owner."
                  : "Your manager chooses the replacement. You don’t need to accept individual applications."}
            </p>
          )}
          {item.applications.map((a) => (
            <div
              className={`sx-candidate ${candidate === a.id ? "sx-selected" : ""}`}
              key={a.id}
            >
              <div className="sx-avatar" aria-hidden>
                {a.employee_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <strong>{a.employee_name}</strong>
                <span className="sx-help">
                  {a.status === "invited"
                    ? "Awaiting teammate response"
                    : statusLabels[a.status]}
                </span>
                <time className="sx-help" dateTime={a.created_at}>
                  {new Date(a.created_at).toLocaleString()}
                </time>
                {a.eligibility && (
                  <span
                    className={
                      a.eligibility.status === "eligible"
                        ? "sx-eligible"
                        : "sx-pending"
                    }
                  >
                    {a.eligibility.status === "eligible"
                      ? "Eligible"
                      : "Recheck needed"}
                  </span>
                )}
                {manager &&
                  a.eligibility?.status !== "eligible" &&
                  a.eligibility && (
                    <details>
                      <summary>Review eligibility</summary>
                      <ul>
                        {a.eligibility.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </details>
                  )}
              </div>
              {manager &&
                item.can_manage &&
                item.status === "open" &&
                activeApplication(a) && (
                  <button
                    ref={candidate === a.id ? selectedReviewButton : undefined}
                    aria-pressed={candidate === a.id}
                    aria-label={`Review ${a.employee_name}`}
                    onClick={() => {
                      setCandidate(a.id);
                      if (candidate === a.id) {
                        reviewHeading.current?.focus();
                        reviewHeading.current?.scrollIntoView?.({
                          block: "start",
                        });
                      }
                    }}
                  >
                    {candidate === a.id ? "Selected" : "Review"}
                  </button>
                )}
            </div>
          ))}
          {!item.applications.length && (
            <p className="sx-help">
              No volunteers yet. The shift remains assigned to its current
              owner.
            </p>
          )}
        </section>
      ) : null}
      {!manager &&
        own.map((a) => (
          <section key={a.id} className="sx-response">
            <h4>{statusLabels[a.status]}</h4>
            {a.reason && <p>{a.reason}</p>}
            {a.status === "pending_manager" && (
              <p>
                Not added to your schedule yet. Your manager makes the final
                decision.
              </p>
            )}
            {a.status === "invited" && (
              <p>
                Accepting sends this request to the manager. Your current
                responsibilities stay in place.
              </p>
            )}
            {a.status === "invited" && a.eligibility?.availability_warning && (
              <p className="sx-pending">
                <AlertTriangle size={14} /> Conflicts with your availability.
                Accepting anyway does not change your weekly preferences.
              </p>
            )}
            {actionable && activeApplication(a) && (
              <div className="sx-actions">
                {a.status === "invited" ? (
                  <>
                    <button
                      className="sx-primary"
                      onClick={() =>
                        void command({
                          action: "accept",
                          case_id: item.id,
                          application_id: a.id,
                          expected_revision: item.revision,
                          ...(a.eligibility?.availability_warning
                            ? {
                                availability_fingerprint:
                                  a.eligibility.availability_warning
                                    .fingerprint,
                              }
                            : {}),
                        })
                      }
                    >
                      {a.eligibility?.availability_warning
                        ? "Accept anyway"
                        : "Accept request"}
                    </button>
                    <button
                      onClick={() =>
                        void command({
                          action: "decline",
                          case_id: item.id,
                          application_id: a.id,
                          expected_revision: item.revision,
                        })
                      }
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() =>
                      void command({
                        action: "withdraw",
                        case_id: item.id,
                        application_id: a.id,
                        expected_revision: item.revision,
                      })
                    }
                  >
                    Withdraw{" "}
                    {item.audience === "direct" ? "acceptance" : "request"}
                  </button>
                )}
              </div>
            )}
          </section>
        ))}
      {manager && current && item.status === "open" && (
        <section className="sx-preview" aria-labelledby={reviewTitleId}>
          <p className="sx-eyebrow">IF APPROVED</p>
          <h4 id={reviewTitleId} ref={reviewHeading} tabIndex={-1}>
            {item.owner_name ?? "Open shift"} → {current.employee_name}
          </h4>
          <p>
            Same time, location and position.
            {item.kind === "swap" && " Both shifts transfer together."}
          </p>
          {preview.data && (
            <p>
              {preview.data.other_applications} other applications will close as
              “Another teammate selected”.
            </p>
          )}
          {preview.isFetching && <p role="status">Rechecking eligibility…</p>}
          {preview.error && (
            <p className="sx-error" role="alert">
              {preview.error.message}
            </p>
          )}
          {preview.data?.requires_other_manager && (
            <p className="sx-pending">
              Another location’s manager must also approve. Your approval alone
              will not change either assignment.
            </p>
          )}
          {preview.data && !preview.data.allowed && !preview.isError && (
            <ExchangeEligibilityDetails
              preview={preview.data}
              receiverName={current.employee_name}
              giverName={item.owner_name ?? "Original owner"}
            />
          )}
          <div className="sx-actions">
            <button
              className="sx-primary"
              disabled={
                !actionable ||
                !preview.data?.allowed ||
                preview.isFetching ||
                preview.isError ||
                current.status !== "pending_manager"
              }
              onClick={() => setDecision("approve")}
            >
              {preview.data?.requires_other_manager
                ? "Approve my location"
                : `Approve transfer to ${current.employee_name}`}
            </button>
            <button
              disabled={!actionable}
              onClick={() => setDecision("reject")}
            >
              Decline this application
            </button>
          </div>
          <button
            className="sx-text-button"
            onClick={() => selectedReviewButton.current?.focus()}
          >
            Back to candidates
          </button>
        </section>
      )}
      {item.status === "open" &&
        (item.is_owner || (manager && item.can_manage)) && (
          <button
            className="sx-text-button"
            disabled={!canWrite}
            onClick={() => setDecision("close")}
          >
            {item.kind === "swap"
              ? "Cancel swap request"
              : "Close cover search"}
          </button>
        )}
      {error && (
        <p className="sx-error" role="alert">
          {error}
        </p>
      )}
      <details className="sx-history">
        <summary>Request history</summary>
        <ol>
          {item.history.map((event) => (
            <li key={event.id}>
              <p>{event.message}</p>
              <time dateTime={event.created_at}>
                {new Date(event.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </details>
      <Link
        className="sx-text-link"
        to={manager ? "/app/schedule" : "/app/employee-hub/schedule"}
      >
        View current schedule <ChevronRight size={15} />
      </Link>
      {decision && (
        <ExchangeDialog
          title={
            requestEnded
              ? "Request updated"
              : reviewBlocked
                ? "Review needs updating"
                : decision === "approve"
                  ? "Confirm your decision"
                  : decision === "reject"
                    ? "Decline this application"
                    : "Close this search"
          }
          onClose={() => setDecision(null)}
          fallbackFocus={detailHeading}
          catalog={manager}
          busy={working}
        >
          <p
            id={decisionDescriptionId}
            role={
              requestEnded ||
              reviewBlocked ||
              (decision !== "close" && !current)
                ? "alert"
                : undefined
            }
          >
            {requestEnded
              ? item.status === "completed"
                ? `This ${item.kind === "swap" ? "swap" : "transfer"} has already been approved. This review cannot change the result. Current published assignments are shown below.`
                : `This request is no longer open (${caseStatusLabels[item.status].toLowerCase()}). This review cannot change the result. Check the current assignments below.`
              : decision !== "close" && !current
                ? "This application is no longer available for a decision. Close this review to see the latest result."
                : reviewBlocked
                  ? preview.isError
                    ? "Eligibility could not be checked. Go back and retry the check before approving."
                    : "This transfer cannot be approved with the current eligibility details. Review the reason below before trying again."
                  : decision === "approve"
                    ? `${item.owner_name ?? "Open shift"} → ${current?.employee_name}. ${preview.data?.requires_other_manager ? "Assignments remain unchanged until the other manager approves." : "This changes the published assignment immediately."}`
                    : decision === "reject"
                      ? `Only ${current?.employee_name}’s application will be declined. Other candidates remain available.`
                      : `All ${item.candidate_count} active applications will close. The current owner remains responsible.`}
          </p>
          {reviewBlocked &&
            !requestEnded &&
            !preview.isError &&
            preview.data &&
            current && (
              <ExchangeEligibilityDetails
                preview={preview.data}
                receiverName={current.employee_name}
                giverName={item.owner_name ?? "Original owner"}
                showSummary={!error}
              />
            )}
          <div
            className={`sx-decision-shifts ${item.requested_shift ? "sx-swap-pair" : ""}`}
          >
            <ExchangeShiftCard
              shift={item.shift}
              label={
                item.requested_shift
                  ? requestEnded
                    ? "First shift"
                    : "Offered shift"
                  : undefined
              }
              assignment={
                requestEnded ? { published: item.current_published } : undefined
              }
            />
            {item.requested_shift && (
              <ExchangeShiftCard
                shift={item.requested_shift}
                label={requestEnded ? "Second shift" : "Requested shift"}
                assignment={
                  requestEnded
                    ? { published: item.requested_current_published }
                    : undefined
                }
              />
            )}
          </div>
          {requestEnded && Boolean(reason || privateNote) && (
            <p className="sx-help">
              Your draft note is still here. It has not been sent.
            </p>
          )}
          {decision !== "approve" && (
            <label className="sx-field">
              Reason shared with affected employees
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                placeholder="Give a short, clear reason"
              />
            </label>
          )}
          {manager && (
            <label className="sx-field">
              Private manager note{" "}
              <span className="sx-help">Not shared with employees</span>
              <textarea
                value={privateNote}
                onChange={(e) => setPrivateNote(e.target.value)}
                maxLength={1000}
              />
            </label>
          )}
          {error && (
            <p className="sx-error" role="alert">
              {error}
            </p>
          )}
          <footer className="sx-actions">
            <button
              className={requestEnded ? "sx-primary" : undefined}
              disabled={working}
              onClick={() => setDecision(null)}
            >
              {requestEnded ? "View latest result" : "Back"}
            </button>
            {!requestEnded && (
              <button
                className="sx-primary"
                aria-describedby={decisionDescriptionId}
                aria-label={
                  decision === "approve" &&
                  current &&
                  !preview.data?.requires_other_manager
                    ? `Confirm transfer to ${current?.employee_name}`
                    : undefined
                }
                disabled={
                  working ||
                  !actionable ||
                  (decision !== "close" && !current) ||
                  (decision !== "approve" && !reason.trim()) ||
                  (decision === "approve" &&
                    (!preview.data?.allowed ||
                      preview.isFetching ||
                      preview.isError ||
                      !current))
                }
                onClick={() =>
                  void command({
                    action: decision,
                    case_id: item.id,
                    ...(current && decision !== "close"
                      ? { application_id: current.id }
                      : {}),
                    expected_revision: item.revision,
                    fingerprint: preview.data?.fingerprint,
                    reason,
                    private_note: privateNote,
                  })
                }
              >
                {decision === "approve"
                  ? preview.data?.requires_other_manager
                    ? "Record my approval"
                    : "Confirm transfer"
                  : decision === "reject"
                    ? "Decline application"
                    : "Close search"}
              </button>
            )}
          </footer>
        </ExchangeDialog>
      )}
    </>
  );
}

function CreateExchange({
  model,
  workspace,
  initialShift,
  canWrite,
  run,
  onClose,
  onCreated,
}: {
  model: ExchangeReadModel;
  workspace: string;
  initialShift: string;
  canWrite: boolean;
  run: (command: ExchangeCommand) => Promise<{ case_id: string }>;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [shiftId, setShiftId] = useState(
    initialShift !== "new" ? initialShift : "",
  );
  const [kind, setKind] = useState<"cover" | "swap">("cover");
  const [audience, setAudience] = useState("pool");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState("");
  const shift = model.own_shifts.find(
    (s) => s.id === shiftId || s.source_id === shiftId,
  );
  const active = model.cases.find(
    (c) => c.status === "open" && c.shift.source_id === shift?.source_id,
  );
  const needsCandidate = kind === "swap" || audience === "direct";
  const matchSelect = useRef<HTMLSelectElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const restoreMatchFocus = useRef(false);
  const candidates = useQuery({
    queryKey: ["shift-exchanges", workspace, "candidates", shift?.id],
    queryFn: () => getExchangeCandidates(workspace, shift!.id),
    enabled: Boolean(shift) && !active && needsCandidate,
  });
  const targetShift = candidates.data?.shifts.find((s) => s.id === target);
  const hasCurrentMatch = Boolean(
    target &&
    (kind === "swap"
      ? targetShift
      : candidates.data?.employees.find(
          (employee) =>
            employee.id === target &&
            employee.eligibility.status === "eligible",
        )),
  );
  const matchCount =
    (kind === "swap"
      ? candidates.data?.shifts.length
      : candidates.data?.employees.length) ?? 0;
  const canSubmit = Boolean(
    canWrite &&
    shift &&
    !active &&
    (!needsCandidate ||
      (hasCurrentMatch && !candidates.isFetching && !candidates.isError)),
  );
  const matchStatusId = useId();
  useEffect(() => {
    if (!restoreMatchFocus.current || candidates.isFetching) return;
    restoreMatchFocus.current = false;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== retryButton.current
    )
      return;
    (candidates.isError ? retryButton.current : matchSelect.current)?.focus();
  }, [
    candidates.isFetching,
    candidates.isError,
    candidates.dataUpdatedAt,
    candidates.errorUpdatedAt,
  ]);
  const close = () => (note || target ? setDiscard(true) : onClose());
  return (
    <ExchangeDialog title="Find cover or swap" onClose={close}>
      {discard ? (
        <>
          <p>You have an unfinished request. Keep editing or discard it.</p>
          <div className="sx-actions">
            <button className="sx-primary" onClick={() => setDiscard(false)}>
              Keep editing
            </button>
            <button onClick={onClose}>Discard request</button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!shift || !canSubmit) return;
            setError("");
            try {
              const result = await run({
                action: "create",
                kind,
                shift_id: shift.id,
                note,
                ...(kind === "swap"
                  ? {
                      requested_shift_id: target,
                      ...(targetShift?.availability_warning
                        ? {
                            availability_fingerprint:
                              targetShift.availability_warning.fingerprint,
                          }
                        : {}),
                    }
                  : audience === "direct"
                    ? { employee_id: target }
                    : {}),
              });
              onCreated(result.case_id);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Unable to create request",
              );
            }
          }}
        >
          <label className="sx-field">
            Your shift
            <select
              value={shift?.id ?? ""}
              onChange={(e) => {
                setShiftId(e.target.value);
                setTarget("");
              }}
              required
            >
              <option value="">Choose an upcoming shift</option>
              {model.own_shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.scheduled_date} ·{" "}
                  {s.start_time?.slice(0, 5) ?? "Unconfirmed"}–
                  {s.end_time?.slice(0, 5) ?? ""} · {s.location_name}
                </option>
              ))}
            </select>
          </label>
          {shift && <ExchangeShiftCard shift={shift} />}
          {active ? (
            <div className="sx-banner">
              <p>This shift already has an active request.</p>
              <button type="button" onClick={() => onCreated(active.id)}>
                View request
              </button>
            </div>
          ) : (
            <>
              <fieldset className="sx-options">
                <legend>What would help?</legend>
                {(["cover", "swap"] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="exchange-kind"
                      checked={kind === value}
                      onChange={() => {
                        setKind(value);
                        setTarget("");
                      }}
                    />
                    <span>
                      <strong>
                        {value === "cover" ? "Find cover" : "Swap shifts"}
                      </strong>
                      <small>
                        {value === "cover"
                          ? "A teammate takes this shift"
                          : "Exchange two complete shifts"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {kind === "cover" && (
                <fieldset className="sx-options">
                  <legend>Who can help?</legend>
                  <label>
                    <input
                      type="radio"
                      name="audience"
                      checked={audience === "pool"}
                      onChange={() => {
                        setAudience("pool");
                        setTarget("");
                      }}
                    />
                    <span>Offer to eligible teammates</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="audience"
                      checked={audience === "direct"}
                      onChange={() => setAudience("direct")}
                    />
                    <span>Ask a teammate</span>
                  </label>
                </fieldset>
              )}
              {needsCandidate && (
                <section className="sx-match-selector">
                  <label className="sx-field">
                    {kind === "swap"
                      ? "Eligible teammate shift"
                      : "Eligible teammate"}
                    <select
                      ref={matchSelect}
                      value={hasCurrentMatch ? target : ""}
                      onChange={(e) => setTarget(e.target.value)}
                      disabled={
                        !shift || candidates.isFetching || candidates.isError
                      }
                      aria-describedby={matchStatusId}
                      required
                    >
                      <option value="">
                        {candidates.isFetching
                          ? "Checking eligibility…"
                          : kind === "swap"
                            ? "Choose a teammate’s shift"
                            : "Choose a teammate"}
                      </option>
                      {kind === "swap"
                        ? candidates.data?.shifts.map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.employee_name} · {s.scheduled_date} ·{" "}
                              {s.start_time?.slice(0, 5) ?? "Unconfirmed"}–
                              {s.end_time?.slice(0, 5) ?? ""} ·{" "}
                              {s.location_name}
                            </option>
                          ))
                        : candidates.data?.employees.map((e) => (
                            <option value={e.id} key={e.id}>
                              {e.name}
                            </option>
                          ))}
                    </select>
                  </label>
                  <div
                    id={matchStatusId}
                    className="sx-match-status"
                    aria-live="polite"
                  >
                    {!shift ? (
                      <p className="sx-help">
                        Choose your shift to see eligible matches.
                      </p>
                    ) : candidates.isFetching ? (
                      <p className="sx-help">
                        Checking current eligibility. Your selections and note
                        stay here.
                      </p>
                    ) : candidates.isError ? (
                      <>
                        <p className="sx-error">
                          We couldn’t check eligible matches. Your request has
                          not been sent.
                        </p>
                        <button
                          ref={retryButton}
                          type="button"
                          onClick={() => {
                            restoreMatchFocus.current = true;
                            void candidates.refetch();
                          }}
                        >
                          <RefreshCw size={16} aria-hidden="true" /> Retry
                          eligibility check
                        </button>
                      </>
                    ) : target && !hasCurrentMatch ? (
                      <p className="sx-warning">
                        This match is no longer available for these shift
                        details. Choose another match. Your note is still here.
                      </p>
                    ) : (
                      <p className="sx-help">
                        {matchCount === 0
                          ? "No eligible matches for this shift. Choose another shift or start a cover search."
                          : kind === "swap"
                            ? "Matches are checked for both employees’ position, location and schedule."
                            : "Teammates must meet the position, location and schedule requirements."}
                      </p>
                    )}
                  </div>
                  {shift &&
                    !candidates.isFetching &&
                    !candidates.isError &&
                    matchCount === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setKind("cover");
                          setAudience("pool");
                          setTarget("");
                        }}
                      >
                        Start a cover search instead
                      </button>
                    )}
                </section>
              )}
              {targetShift && (
                <div className="sx-preview">
                  <p className="sx-eyebrow">YOU RECEIVE</p>
                  <ExchangeShiftCard shift={targetShift} />
                  {targetShift.availability_warning && (
                    <p className="sx-pending">
                      <AlertTriangle size={14} /> Conflicts with your
                      availability. Requesting anyway does not change your
                      weekly preferences.
                    </p>
                  )}
                  <p>
                    Both employees must agree to the swap. If its date, hours or
                    location change, existing acceptance remains valid and you
                    will be notified. Your manager approves the final exchange.
                  </p>
                </div>
              )}
              <label className="sx-field">
                Private note for your manager{" "}
                <span className="sx-help">
                  Optional · Other employees won’t see this
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <div className="sx-responsibility">
                <ShieldCheck size={22} />
                <p>
                  You remain responsible until a manager approves the transfer.
                </p>
              </div>
              {error && (
                <p className="sx-error" role="alert">
                  {error}
                </p>
              )}
              <footer className="sx-actions">
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button className="sx-primary" disabled={!canSubmit}>
                  {kind === "swap"
                    ? targetShift?.availability_warning
                      ? "Request swap anyway"
                      : "Send swap request"
                    : audience === "direct"
                      ? "Send cover request"
                      : "Offer shift"}
                </button>
              </footer>
            </>
          )}
        </form>
      )}
    </ExchangeDialog>
  );
}

function ManagerRequestSurface({
  manager,
  busy,
  onClose,
  children,
}: {
  manager: boolean;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!manager) return <>{children}</>;
  return (
    <CatalogDrawer
      label="Review shift change"
      className="requests-catalog-page requests-exchange-drawer sx-root"
      busy={busy}
      onClose={onClose}
    >
      <div className="job-catalog-editor">
        <div className="job-editor-title">
          <div>
            <h2>Shift change</h2>
            <p>Review assignments, candidates, and the proposed change.</p>
          </div>
          <button
            type="button"
            className="job-icon-button"
            disabled={busy}
            aria-label="Close shift request"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="catalog-drawer-body">{children}</div>
        <div className="job-editor-footer">
          <span />
          <button
            type="button"
            className="job-secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </CatalogDrawer>
  );
}
