import type { TimeOffRequestView } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { AlertCircle } from "lucide-react";
import { LeaveIcon } from "./leave-icon";
import {
  dayText,
  instantDay,
  leaveLabel,
  lengthText,
  monthDay,
  placesText,
  rangeText,
  statusLook,
  type TimeFormat,
} from "./time-off-text";

export function StatusPill({ status }: { status: TimeOffRequestView["status"] }) {
  const look = statusLook[status];
  return <span className={`tor-pill is-${look.tone}`}>{look.label}</span>;
}

/** Sent, then where the answer stands. */
function Steps({ request, places }: { request: TimeOffRequestView; places: readonly string[] }) {
  const zone = request.time_timezone;
  const by = (at: string | null) => [request.decided_by_name, at ? monthDay(instantDay(at, zone)) : null].filter(Boolean).join(", ");
  return (
    <ol className="tor-steps">
      <li className="is-done">
        <strong>Sent</strong>
        <span>{dayText(instantDay(request.created_at, zone))}</span>
      </li>
      {request.status === "pending" ? (
        <li className="is-now">
          <strong>Waiting for a manager</strong>
          {places.length ? <span>{placesText(places)}</span> : null}
        </li>
      ) : null}
      {request.status === "approved" ? (
        <li className="is-done">
          <strong>Approved</strong>
          <span>{by(request.decided_at)}</span>
        </li>
      ) : null}
      {request.status === "declined" ? (
        <li className="is-bad">
          <strong>Declined</strong>
          <span>{by(request.decided_at)}</span>
        </li>
      ) : null}
      {request.status === "expired" ? (
        <li className="is-mute">
          <strong>Expired</strong>
          <span>No answer before {monthDay(request.start_date)}</span>
        </li>
      ) : null}
      {request.status === "withdrawn" ? (
        <li className="is-mute">
          <strong>Withdrawn</strong>
          {request.ended_at ? <span>{monthDay(instantDay(request.ended_at, zone))}</span> : null}
        </li>
      ) : null}
    </ol>
  );
}

/**
 * One request. On a computer, B Tur 1's drawer (type and status, the dates large, the steps); on a phone,
 * B1's card (When and Length, then the Answer steps). Notes and the Withdraw button below both.
 */
export function TimeOffDetail({
  request,
  phone,
  places,
  timeFormat,
  withdrawing,
  withdrawError,
  onWithdraw,
}: {
  request: TimeOffRequestView;
  phone: boolean;
  places: readonly string[];
  timeFormat: TimeFormat;
  withdrawing: boolean;
  withdrawError: string | null;
  onWithdraw: () => void;
}) {
  return (
    <div className="tor-detail">
      <div className="tor-row-top">
        <span className="tor-ico"><LeaveIcon kind={request.kind_of_leave} size={17} /></span>
        <strong>{leaveLabel(request.kind_of_leave)}</strong>
        <StatusPill status={request.status} />
      </div>
      {phone ? (
        <>
          <dl className="tor-dl">
            <div><dt>When</dt><dd>{rangeText(request, timeFormat)}</dd></div>
            <div><dt>Length</dt><dd>{lengthText(request)}</dd></div>
          </dl>
          <hr className="tor-sep" />
          <div className="tor-field">
            <span className="tor-label">Answer</span>
            <Steps request={request} places={places} />
          </div>
        </>
      ) : (
        <>
          <p className="tor-big">{rangeText(request, timeFormat)}</p>
          <Steps request={request} places={places} />
        </>
      )}
      {request.note ? <p className="tor-mynote">Your note: {request.note}</p> : null}
      {request.decision_note ? (
        <blockquote className="tor-quote">
          <span>{request.decided_by_name ?? "Your manager"} wrote</span>
          {request.decision_note}
        </blockquote>
      ) : null}
      {request.status === "pending" ? (
        <div className="tor-row-actions">
          <ConfirmButton
            className="secondary-button tor-small"
            confirmLabel="Confirm withdraw"
            disabled={withdrawing}
            onConfirm={onWithdraw}
          >
            {withdrawing ? "Withdrawing…" : "Withdraw"}
          </ConfirmButton>
        </div>
      ) : null}
      {withdrawError ? (
        <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden />{withdrawError}</p>
      ) : null}
    </div>
  );
}
