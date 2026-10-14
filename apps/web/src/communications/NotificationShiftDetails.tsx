import { usePhoneWidth } from "../lib/usePhoneWidth";
import type {
  ExchangeCase,
  ExchangeShift,
  NotificationRecord,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import {
  ExchangeShiftCard,
  ExchangeAssignment,
} from "../employee-hub/shift-exchanges/ExchangeShiftCard";
import { safeAppActionUrl } from "./action-url";
import "../employee-hub/shift-exchanges/shift-exchanges.css";
import "./notification-shift-details.css";
import { LinesOutline, LoadError } from "../shell/LoadState";

export function notificationExchangeTarget(item: NotificationRecord) {
  if (
    ![
      "requests.shift_change.submitted",
      "requests.shift_change.status_changed",
    ].includes(item.type_key ?? "")
  )
    return null;
  const actionUrl = safeAppActionUrl(item.action_url);
  if (!actionUrl) return null;
  const url = new URL(actionUrl, window.location.origin);
  const manager = url.pathname === "/app/schedule/requests";
  if (!manager && url.pathname !== "/app/employee-hub/shift-hub") return null;
  const caseId = url.searchParams.get("case");
  if (
    !caseId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      caseId,
    )
  )
    return null;
  return { caseId, manager, actionUrl };
}

const statuses: Record<ExchangeCase["status"], string> = {
  open: "In progress",
  completed: "Approved",
  cancelled: "Search closed",
  expired: "Expired",
  invalidated: "Shift changed",
};
const stages: Partial<Record<ExchangeCase["stage"], string>> = {
  awaiting_peer: "Awaiting teammate",
  ready_for_manager: "Awaiting manager",
  awaiting_other_manager: "Awaiting other manager",
  seeking_candidates: "Finding cover",
};

export function NotificationShiftDetails({
  workspaceId,
  item,
  panelId,
  onNavigate,
}: {
  workspaceId: string;
  item: NotificationRecord;
  panelId: string;
  onNavigate?: () => void;
}) {
  const target = notificationExchangeTarget(item);
  const query = useQuery({
    queryKey: [
      "shift-exchanges",
      workspaceId,
      "notification",
      target?.caseId,
      target?.manager,
    ],
    queryFn: () =>
      getExchanges(workspaceId, target!.manager, { caseId: target!.caseId }),
    enabled: Boolean(workspaceId && target),
    retry: false,
  });
  if (!target) return null;
  const request = query.data?.cases.find(
    (candidate) => candidate.id === target.caseId,
  );
  return (
    <div
      id={panelId}
      className="notification-shift-details sx-root"
      role="region"
      aria-label="Shift request details"
      aria-busy={query.isFetching}
    >
      {query.isPending ? (
        <LinesOutline label="Loading shift details" />
      ) : query.isError || !request ? (
        <LoadError
          inset
          title="We couldn't load the shift details"
          detail="They didn't load. Nothing was changed. You can also open the request."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="notification-shift-message">
            <h3>Message when sent</h3>
            <p>{item.body || item.safe_preview}</p>
          </div>
          <div className="notification-shift-heading">
            <h3>Current request</h3>
            <span className="notification-shift-status">
              {request.status === "open"
                ? request.kind === "open_pickup" &&
                  request.stage === "seeking_candidates"
                  ? "Awaiting volunteers"
                  : (stages[request.stage] ?? "In progress")
                : statuses[request.status]}
            </span>
          </div>
          <p className="notification-shift-explanation">
            {request.status === "open"
              ? request.kind === "open_pickup"
                ? "This open shift is assigned only after final manager approval."
                : request.kind === "swap"
                  ? "Both current owners remain responsible until final manager approval."
                  : "The current owner remains responsible until final manager approval."
              : "Published assignments below include any later schedule changes."}
          </p>
          {query.isFetching && <p role="status">Updating assignments…</p>}
          <div className="notification-shift-grid">
            <PublishedShift
              shift={request.shift}
              published={request.current_published}
              label={
                request.kind === "swap" ? "First shift" : "Requested shift"
              }
              manager={target.manager}
              onNavigate={onNavigate}
            />
            {request.requested_shift && (
              <PublishedShift
                shift={request.requested_shift}
                published={request.requested_current_published}
                label="Second shift"
                manager={target.manager}
                onNavigate={onNavigate}
              />
            )}
          </div>
        </>
      )}
      <Link
        className="notification-request-link"
        to={target.actionUrl}
        onClick={onNavigate}
      >
        Open request
      </Link>
    </div>
  );
}

function PublishedShift({
  shift,
  published,
  label,
  manager,
  onNavigate,
}: {
  shift: ExchangeShift;
  published: boolean | null | undefined;
  label: string;
  manager: boolean;
  onNavigate?: () => void;
}) {
  const phone = usePhoneWidth();
  const url = manager
    ? `/app/schedule?date=${shift.scheduled_date}&view=day&locations=${shift.location_id}`
    : `/app/employee-hub/schedule?date=${shift.scheduled_date}&view=day`;
  return (
    <div className="notification-published-shift">
      <ExchangeShiftCard
        shift={shift}
        label={`${label} · ${shift.scheduled_date.slice(0, 4)}`}
      />
      <ExchangeAssignment
        shift={shift}
        published={published}
        className="notification-shift-owner"
      />
      {manager && phone ? null : (
        <Link to={url} onClick={onNavigate}>
          Open schedule<span className="sr-only"> · {label}</span>
        </Link>
      )}
    </div>
  );
}
