import { todayIn, zoneName } from "../../lib/today";
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
  CalendarX,
  Check,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
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
import { ConfirmButton } from "@newfork/ui";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { useTabSwipe } from "../../shell/useTabSwipe";
import { addDays } from "../../schedule/lib/scheduleDateTime";
import {
  changeExchange,
  ExchangeError,
  getExchangeCandidates,
  getExchanges,
  refreshExchangeSurfaces,
} from "./exchange-data";
import { activeApplication, blockedByTimeOff, pickupOpportunities } from "./pickup";
import "./shift-exchanges.css";
import { ExchangeShiftCard, shiftHours } from "./ExchangeShiftCard";
import { ChangeOptions, CLOSE_BEFORE_MS, SelfOnlyNote, type ChangeMode } from "./ChangeOptions";
import { PlanDialog } from "./PlanDialog";
import { ReleaseCard, ReleaseDialog, firstName } from "./Release";
import { ReleaseDeck } from "./ReleaseDeck";
import { ShiftTicket } from "./ShiftTicket";
import { FieldNote } from "../../shell/FieldNote";
import { WindowAlert } from "../../shell/WindowAlert";
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
// TAKAS-RELEASE: a release is a cover asked of everyone eligible.
const isRelease = (item: ExchangeCase) => item.kind === "cover" && item.audience === "eligible_pool";
function caseTitle(item: ExchangeCase) {
  if (item.kind === "swap") return "Shift swap";
  // An open shift the manager offered on publishing has no owner (Mert, 2026-10-20).
  if (isRelease(item) && item.owner_id === null) return "Open shift";
  if (isRelease(item)) return item.is_owner ? "Released shift" : `Released by ${item.owner_name ?? "a teammate"}`;
  return `Cover for ${item.owner_name ?? "a teammate"}`;
}


function availabilityMessage(verb: "Requesting" | "Accepting") {
  return `Conflicts with your availability. ${verb} anyway does not change your weekly preferences.`;
}

type ExchangeOpportunity = ExchangeReadModel["opportunities"][number];

// Mert chose variant A (2026-10-10): a muted card that says why and where to ask.
function TimeOffBlockedCard({ opportunity }: { opportunity: ExchangeOpportunity }) {
  return (
    <article className="sx-card sx-card-time-off">
      <div className="sx-card-top">
        <span className="sx-pill">{opportunity.shift.employee_name ? "Released shift" : "Open shift"}</span>
        <span className="sx-time-off">
          <CalendarX size={14} />
          On time off
        </span>
      </div>
      <ExchangeShiftCard shift={opportunity.shift} />
      <p>{opportunity.shift.employee_name ? `Released by ${opportunity.shift.employee_name}` : "Offered by your manager"}</p>
      <p className="sx-help">
        You have approved time off during this shift. To take it, ask to cancel
        those hours first.
      </p>
      <Link className="sx-time-off-action" to="/app/employee-hub/my-availability">
        Ask to cancel time off <ChevronRight size={16} />
      </Link>
    </article>
  );
}

export function ExchangeDialog({
  title,
  children,
  onClose,
  fallbackFocus,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  fallbackFocus?: RefObject<HTMLElement | null>;
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
      className="sx-dialog sx-root"
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
                    : command.action === "apply"
                      ? "You asked for this shift. Your manager picks who gets it."
                      : command.action === "pass"
                        ? "Hidden from your Available Shifts."
                        : command.action === "create" && command.kind === "cover" && !command.employee_id
                          ? "Shift released. It stays yours until your manager approves someone."
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

const HUB_VIEWS = ["available", "requests", "history"] as const;

export function ShiftExchangeHub({ workspaceId, zone }: { workspaceId: string; zone?: string }) {
  const { context } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const locationFilter = params.get("location") ?? "";
  const [online, setOnline] = useState(navigator.onLine);
  const detailRef = useRef<HTMLElement>(null);
  const { mutation, notice, setNotice } = useExchangeAction(workspaceId);
  // From today at the primary location (S-226).
  const from = params.get("from") ?? todayIn(zone);
  const to = params.get("to") ?? addDays(from, 42);
  const focusedCase = params.get("case") ?? undefined;
  const query = useQuery({
    queryKey: [
      "shift-exchanges",
      workspaceId,
      context?.userId,
      from,
      to,
      focusedCase,
    ],
    queryFn: () =>
      getExchanges(workspaceId, false, { from, to, caseId: focusedCase }),
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
  const selected = query.data?.cases.find((item) => item.id === params.get("case"));
  const view =
    params.get("hub_view") ??
    (selected
      ? selected.status !== "open"
        ? "history"
        : "requests"
      : "available");
  // On a phone a swipe sideways moves between the three views (KARARLAR §1.5); an opened request stays put.
  const swipe = useTabSwipe({
    tabs: HUB_VIEWS,
    active: view,
    enabled: !selected,
    onSelect: (key) => navigate({ hub_view: key, case: null }),
  });
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
  // A confirmation describes one command result. Once that request changes,
  // the current detail must not compete with a stale success message.
  const currentNotice =
    notice && !noticeStale && (!selectedId || selectedId === notice.caseId)
      ? notice.text
      : null;
  const offering = params.has("offer");
  const offerMode = params.get("mode") as ChangeMode | null;
  const offerShift = model.own_shifts.find(
    (s) => s.id === params.get("offer") || s.source_id === params.get("offer"),
  );
  // Inside the last 4 hours before the shift nothing opens (plan 04:56).
  const offerClosed =
    Boolean(offerShift?.starts_at) && Date.parse(offerShift!.starts_at!) - CLOSE_BEFORE_MS <= Date.now();
  const offerActive = offerShift
    ? model.cases.find((c) => c.status === "open" && c.shift.source_id === offerShift.source_id)
    : undefined;
  const tabs: [(typeof HUB_VIEWS)[number], string][] = [
    ["available", "Available Shifts"],
    ["requests", "My requests"],
    ["history", "History"],
  ];
  // Like an unread count: the open requests that wait for my answer,
  // whatever the filters show.
  const awaitingMe = model.cases.filter(
    (c) =>
      c.status === "open" &&
      c.applications.some(
        (a) => a.employee_id === model.employee_id && a.status === "invited",
      ),
  ).length;
  const myApplication = (opportunity: ExchangeOpportunity) =>
    model.cases
      .find((c) => c.id === opportunity.case_id)
      ?.applications.find(
        (a) => a.employee_id === model.employee_id && activeApplication(a),
      );
  // The same for open shifts: the ones I can still ask for, whatever the
  // filters show. Time off blocks a shift; one I asked for waits on a manager.
  const takeable = pickupOpportunities(model).length;
  const canWrite = online && !mutation.isPending;
  const matches = (shift: ExchangeShift) =>
    shift.scheduled_date >= from &&
    shift.scheduled_date <= to &&
    (!locationFilter || shift.location_id === locationFilter) &&
    `${shift.location_name} ${shift.job_name} ${shift.employee_name ?? ""} ${shift.scheduled_date}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const visibleOpportunities = model.opportunities.filter((o) => matches(o.shift));
  // All filters must match the same side of a swap. A date on one side
  // must not be combined with a location or name on the other side.
  const matchesCase = (item: ExchangeCase) =>
    matches(item.shift) ||
    (item.requested_shift != null && matches(item.requested_shift));
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
          : item.status === "open"),
    )
    .sort((a, b) => {
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
      className={`sx-root ${selected ? "sx-reading-detail" : ""}`}
      ref={swipe.root}
    >
      {/* The employee page title comes from the shared catalog header. */}
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
      <FieldNote
        id="shift-exchange-hub"
        error={
          mutation.error
            ? mutation.error.message +
              (mutation.error instanceof ExchangeError
                ? ""
                : " If the response was lost, retry the same action to check its result.")
            : null
        }
      />
      <nav
        className="sx-tabs"
        aria-label="Shift Hub views"
        ref={swipe.tabs}
      >
        {tabs.map(([key, label]) => {
          const count =
            key === "requests" ? awaitingMe : key === "available" ? takeable : 0;
          return (
            <button
              key={key}
              className={count ? "sx-tab-counted" : undefined}
              aria-label={
                count
                  ? key === "available"
                    ? `${label}, ${count} you can take`
                    : `${label}, ${count} ${count === 1 ? "needs" : "need"} your answer`
                  : undefined
              }
              aria-current={view === key ? "page" : undefined}
              onClick={() => navigate({ hub_view: key, case: null })}
            >
              {label}
              {count ? (
                <span className="sx-tab-count" aria-hidden="true">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
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
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => navigate({ q: e.target.value })}
            placeholder="Search date, location or position"
          />
        </label>
      </div>
      <div
        className={`sx-workbench ${selected ? "sx-has-detail" : ""}`}
      >
        <div className="sx-list">
          {view === "available" ? (
            <>
              {/* One released shift at a time (TAKAS-RELEASE, plan 06:43). */}
              <ReleaseDeck
                cards={visibleOpportunities.filter(
                  (o) => !blockedByTimeOff(o.eligibility) && !myApplication(o),
                )}
                disabled={!canWrite}
                onChoose={(card, choice) =>
                  mutation.mutateAsync(
                    choice === "take"
                      ? {
                          action: "apply",
                          shift_id: card.shift.id,
                          case_id: card.case_id,
                          ...(card.eligibility.availability_warning
                            ? {
                                availability_fingerprint:
                                  card.eligibility.availability_warning
                                    .fingerprint,
                              }
                            : {}),
                        }
                      : { action: "pass", shift_id: card.shift.id, case_id: card.case_id },
                  )
                }
              />
              {visibleOpportunities.some((o) => myApplication(o)) && (
                <>
                  <h3 className="sx-section-title">You asked for</h3>
                  <div className="sx-asked">
                    {visibleOpportunities
                      .filter((o) => myApplication(o))
                      .map((opportunity) => (
                        <button
                          type="button"
                          key={opportunity.case_id}
                          className="sx-pr"
                          onClick={() =>
                            navigate({
                              case: opportunity.case_id,
                              hub_view: "requests",
                            })
                          }
                        >
                          <span className="sx-pr-av" aria-hidden>
                            {Number(opportunity.shift.scheduled_date.slice(8, 10))}
                          </span>
                          <span className="sx-pr-name">
                            {new Intl.DateTimeFormat("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            }).format(
                              new Date(`${opportunity.shift.scheduled_date}T12:00:00Z`),
                            )}{" "}
                            · {opportunity.shift.employee_name ? `Released by ${firstName(opportunity.shift.employee_name)}` : "Open shift"}
                          </span>
                          <span className="sx-pr-sub">
                            {opportunity.shift.location_name} · {opportunity.shift.job_name}
                          </span>
                          <span className="sx-pr-state">
                            <span className="sx-st" data-tone="warn">
                              Manager picks
                            </span>
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              )}
              {visibleOpportunities.some((o) => blockedByTimeOff(o.eligibility)) && (
                <>
                  <h3 className="sx-section-title">During your time off</h3>
                  {visibleOpportunities
                    .filter((o) => blockedByTimeOff(o.eligibility))
                    .map((opportunity) => (
                      <TimeOffBlockedCard
                        key={opportunity.shift.id}
                        opportunity={opportunity}
                      />
                    ))}
                </>
              )}
            </>
          ) : (
            <>
              {cases.map((item) => (
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
                  <span>{caseTitle(item)}</span>
                  <span className="sx-case-footer">
                    <span>
                      <Users size={15} />
                      {item.is_owner
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
              ))}
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
                      : "No cover searches, applications or swap invitations match these filters."
                  }
                />
              )}
            </>
          )}
        </div>
        {selected && (
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
              canWrite={canWrite}
              run={(command) => mutation.mutateAsync(command)}
              onRenew={() =>
                navigate({
                  offer: selected.shift.id,
                  mode: isRelease(selected) ? "release" : selected.kind,
                  case: null,
                })
              }
            />
          </aside>
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
      {offering &&
        (offerMode === "cover" || offerMode === "swap" ? (
          <CreateExchange
            model={model}
            workspace={workspaceId}
            mode={offerMode}
            initialShift={params.get("offer") ?? ""}
            canWrite={canWrite}
            run={(command) => mutation.mutateAsync(command)}
            onClose={() => navigate({ offer: null, mode: null })}
            onRelease={() => navigate({ mode: "release" })}
            onCreated={(id) =>
              navigate({ offer: null, mode: null, case: id, hub_view: "requests" })
            }
          />
        ) : offerShift && offerActive ? (
          <PlanDialog
            eyebrow="Your shift"
            onClose={() => navigate({ offer: null, mode: null })}
            foot={
              <button
                type="button"
                className="sx-primary"
                onClick={() =>
                  navigate({ offer: null, mode: null, case: offerActive.id, hub_view: "requests" })
                }
              >
                View request
              </button>
            }
          >
            <ShiftTicket shift={offerShift} />
            <p className="sx-help">
              This shift already has an open request. Take it back to start a different one.
            </p>
          </PlanDialog>
        ) : offerShift && offerMode === "release" ? (
          <ReleaseDialog
            shift={offerShift}
            ownerName={offerShift.employee_name ?? "You"}
            canWrite={canWrite}
            run={(command) => mutation.mutateAsync(command)}
            onBack={() => navigate({ mode: null })}
            onClose={() => navigate({ offer: null, mode: null })}
            onReleased={(id) =>
              navigate({ offer: null, mode: null, case: id, hub_view: "requests" })
            }
          />
        ) : offerShift ? (
          <PlanDialog eyebrow="Your shift" onClose={() => navigate({ offer: null, mode: null })}>
            <ShiftTicket shift={offerShift} />
            {offerClosed ? null : <SelfOnlyNote tier={offerShift.decision_tier} />}
            <ChangeOptions
              // The page's own dates stay: a shift past today's 42 days was opened with from/to.
              hrefFor={(mode) => {
                const next = new URLSearchParams(params);
                next.set("offer", offerShift.id);
                next.set("mode", mode);
                return `?${next}`;
              }}
              closed={offerClosed}
            />
          </PlanDialog>
        ) : (
          <PlanDialog eyebrow="Your shift" onClose={() => navigate({ offer: null, mode: null })}>
            <p className="sx-help">
              This shift is no longer on your upcoming schedule. Check your current schedule.
            </p>
          </PlanDialog>
        ))}
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

function CaseDetail({
  item,
  model,
  canWrite,
  run,
  onRenew,
}: {
  item: ExchangeCase;
  model: ExchangeReadModel;
  canWrite: boolean;
  run: (command: ExchangeCommand) => Promise<unknown>;
  onRenew: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const decisionDescriptionId = useId();
  const own = item.applications.filter(
    (a) => a.employee_id === model.employee_id,
  );
  const actionable = item.status === "open" && canWrite;
  const requestEnded = item.status !== "open";
  // An owner cancels a swap; a cover search is closed.
  const swap = item.kind === "swap";
  const swapPartner = item.requested_shift?.employee_name ?? null;
  const command = async (action: ExchangeCommand) => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await run(action);
      setClosing(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update request");
    } finally {
      setWorking(false);
    }
  };
  const history = (
    <>
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
      <Link className="sx-text-link" to="/app/employee-hub/schedule">
        View current schedule <ChevronRight size={15} />
      </Link>
    </>
  );
  // TAKAS-RELEASE: the owner's open release reads as one card (mockup moment 6).
  if (isRelease(item) && item.is_owner && item.status === "open")
    return (
      <>
        <ReleaseCard item={item} canWrite={canWrite} run={run} />
        {history}
      </>
    );
  return (
    <>
      <div className="sx-detail-heading">
        <h3 ref={detailHeading} tabIndex={-1}>
          {caseTitle(item)}
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
      {item.status !== "open" &&
        item.status !== "completed" &&
        item.current_published !== false &&
        model.own_shifts.some(
          (shift) => shift.source_id === item.shift.source_id,
        ) && (
          <button className="sx-primary" disabled={!canWrite} onClick={onRenew}>
            Start a new cover or swap request
          </button>
        )}
      {item.private_note && item.is_owner && (
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
                : item.owner_id === model.employee_id
                  ? "You receive"
                  : "You give"
            }
          />
        )}
      </div>
      {item.requested_shift && (
        <p className="sx-help">
          {item.status !== "open" ? "First / second" : "Give / receive"}
          :{" "}
          {shiftHours(
            item.status !== "open" || item.owner_id === model.employee_id
              ? item.shift
              : item.requested_shift,
          ).toFixed(1)}
          h /{" "}
          {shiftHours(
            item.status !== "open" || item.owner_id === model.employee_id
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
          {zoneName(item.shift.timezone)}
        </p>
      )}
      {item.is_owner ? (
        <section className="sx-candidates">
          <h4>
            {item.status === "open"
              ? `${item.candidate_count} active ${item.candidate_count === 1 ? "candidate" : "candidates"}`
              : "Application results"}
          </h4>
          {item.status === "open" && (
            <p className="sx-help">
              {item.audience === "direct"
                  ? "Your teammate must accept before your manager can approve. Until final approval, each shift stays with its current owner."
                  : "Your manager chooses the replacement. You don’t need to accept individual applications."}
            </p>
          )}
          {item.applications.map((a) => (
            <div className="sx-candidate" key={a.id}>
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
              </div>
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
      {own.map((a) => (
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
              <AlertTriangle size={14} />{" "}
              {availabilityMessage("Accepting")}
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
      {item.status === "open" && item.is_owner && (
        <button
          className="sx-text-button"
          disabled={!canWrite}
          onClick={() => setClosing(true)}
        >
          {item.kind === "swap"
            ? "Cancel swap request"
            : "Close cover search"}
        </button>
      )}
      {/* While the close window is open its band says the server's sentence;
          the panel says it only for its own actions (UI-FIELDMSG-2). */}
      <FieldNote id={`shift-exchange-${item.id}`} error={closing ? null : error} />
      {history}
      {closing && (
        <ExchangeDialog
          title={
            requestEnded
              ? "Request updated"
              : swap
                ? "Cancel this swap request"
                : "Close this search"
          }
          onClose={() => setClosing(false)}
          fallbackFocus={detailHeading}
          busy={working}
        >
          <p
            id={decisionDescriptionId}
            role={requestEnded ? "alert" : undefined}
          >
            {requestEnded
              ? item.status === "completed"
                ? `This ${item.kind === "swap" ? "swap" : "transfer"} has already been approved. This review cannot change the result. Current published assignments are shown below.`
                : `This request is no longer open (${caseStatusLabels[item.status].toLowerCase()}). This review cannot change the result. Check the current assignments below.`
              : swap
                ? swapPartner
                  ? `Your swap request with ${swapPartner} ends. You both keep your own shifts.`
                  : "Your swap request ends. You keep your shift."
                : `${
                    item.candidate_count === 0
                      ? "Nobody has applied yet."
                      : item.candidate_count === 1
                        ? "The 1 active application will close."
                        : `All ${item.candidate_count} active applications will close.`
                  } The current owner remains responsible.`}
          </p>
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
          {requestEnded && Boolean(reason) && (
            <p className="sx-help">
              Your draft note is still here. It has not been sent.
            </p>
          )}
          <label className="sx-field">
            Reason shared with affected employees{" "}
            <span className="sx-help">Optional</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="Give a short, clear reason"
            />
          </label>
          <footer className="sx-actions">
            {/* Over the form's bottom edge, above the buttons (UI-FIELDMSG). */}
            <WindowAlert message={error} />
            <button
              className={requestEnded ? "sx-primary" : undefined}
              disabled={working}
              onClick={() => setClosing(false)}
            >
              {requestEnded ? "View latest result" : "Back"}
            </button>
            {!requestEnded && (
              // Closing or cancelling takes the request away: red, two clicks (BL-748).
              <ConfirmButton
                unstyled
                className="sx-danger"
                aria-describedby={decisionDescriptionId}
                confirmLabel={swap ? "Confirm cancel" : "Confirm close"}
                disabled={working || !actionable}
                onConfirm={() =>
                  void command({
                    action: "close",
                    case_id: item.id,
                    expected_revision: item.revision,
                    reason,
                    private_note: "",
                  })
                }
              >
                {swap ? "Cancel request" : "Close search"}
              </ConfirmButton>
            )}
          </footer>
        </ExchangeDialog>
      )}
    </>
  );
}

// Ask someone to cover, or swap (TAKAS-RELEASE: three named options; a release
// to everyone eligible has its own window, ReleaseDialog).
function CreateExchange({
  model,
  workspace,
  mode,
  initialShift,
  canWrite,
  run,
  onClose,
  onRelease,
  onCreated,
}: {
  model: ExchangeReadModel;
  workspace: string;
  mode: "cover" | "swap";
  initialShift: string;
  canWrite: boolean;
  run: (command: ExchangeCommand) => Promise<{ case_id: string }>;
  onClose: () => void;
  onRelease: () => void;
  onCreated: (id: string) => void;
}) {
  const [shiftId, setShiftId] = useState(
    initialShift !== "new" ? initialShift : "",
  );
  const kind = mode;
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
  const needsCandidate = true;
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
    <ExchangeDialog title={kind === "swap" ? "Swap shifts" : "Ask someone to cover"} onClose={close}>
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
                  : { employee_id: target }),
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
          <SelfOnlyNote tier={shift?.decision_tier} />
          {active ? (
            <div className="sx-banner">
              <p>This shift already has an active request.</p>
              <button type="button" onClick={() => onCreated(active.id)}>
                View request
              </button>
            </div>
          ) : (
            <>
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
                          ? "No eligible matches for this shift. Choose another shift or release it to everyone eligible."
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
                      <button type="button" onClick={onRelease}>
                        Release it to everyone instead
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
                      <AlertTriangle size={14} />{" "}
                      {availabilityMessage("Requesting")}
                    </p>
                  )}
                  <p>
                    Both employees must agree to the swap. If its date, hours or
                    location change, existing acceptance remains valid. Your
                    manager approves the final exchange.
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
              <footer className="sx-actions">
                {/* Over the form's bottom edge, above the buttons (UI-FIELDMSG). */}
                <WindowAlert message={error} />
                <button type="button" onClick={close}>
                  Cancel
                </button>
                <button className="sx-primary" disabled={!canSubmit}>
                  {kind === "swap"
                    ? targetShift?.availability_warning
                      ? "Request swap anyway"
                      : "Send swap request"
                    : "Send cover request"}
                </button>
              </footer>
            </>
          )}
        </form>
      )}
    </ExchangeDialog>
  );
}
