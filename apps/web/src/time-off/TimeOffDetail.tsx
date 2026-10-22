import type { TimeOffRequestView } from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { AlertCircle, Info } from "lucide-react";
import { useId, useState } from "react";
import { LeaveIcon } from "./leave-icon";
import {
  canAskToCancel,
  cancellationWaiting,
  clockText,
  dayText,
  instantDay,
  leaveLabel,
  lengthText,
  monthDay,
  placesText,
  rangeText,
  requestLook,
  zoneNow,
  type StatusLook,
  type TimeFormat,
} from "./time-off-text";

export function StatusPill({ look }: { look: StatusLook }) {
  return <span className={`tor-pill is-${look.tone}`}>{look.label}</span>;
}

/** Sent, then where the answer stands, and (D4) what happened to approved time off since. */
function Steps({ request, places }: { request: TimeOffRequestView; places: readonly string[] }) {
  const zone = request.time_timezone;
  const by = (name: string | null, at: string | null) => [name, at ? monthDay(instantDay(at, zone)) : null].filter(Boolean).join(", ");
  const approvedOnce = request.status === "approved" || request.status === "cancelled" || request.status === "revoked";
  const cancellation = request.cancellation;
  // D5: time off a manager added for them was not sent, nor answered: it was added, approved.
  const added = request.added_by_name;
  return (
    <ol className="tor-steps">
      {added ? (
        <li className="is-done">
          <strong>Added by {added} on {monthDay(instantDay(request.created_at, zone))}</strong>
        </li>
      ) : (
        <li className="is-done">
          <strong>Sent</strong>
          <span>{dayText(instantDay(request.created_at, zone))}</span>
        </li>
      )}
      {request.status === "pending" ? (
        <li className="is-now">
          <strong>Waiting for a manager</strong>
          {places.length ? <span>{placesText(places)}</span> : null}
        </li>
      ) : null}
      {approvedOnce && !added ? (
        <li className="is-done">
          <strong>Approved</strong>
          <span>{by(request.decided_by_name, request.decided_at)}</span>
        </li>
      ) : null}
      {request.status === "approved" && cancellation?.status === "pending" ? (
        <li className="is-now">
          <strong>Cancellation asked</strong>
          <span>{cancellationWaiting(request) ? "Waiting for a manager" : `Sent ${monthDay(instantDay(cancellation.created_at, zone))}`}</span>
        </li>
      ) : null}
      {cancellation?.status === "declined" && request.status === "approved" ? (
        <li className="is-bad">
          <strong>Cancellation declined</strong>
          <span>{by(cancellation.decided_by_name, cancellation.decided_at)}</span>
        </li>
      ) : null}
      {request.status === "cancelled" ? (
        <li className="is-mute">
          <strong>Cancelled</strong>
          <span>{by(request.ended_by_name, request.ended_at)}</span>
        </li>
      ) : null}
      {request.status === "revoked" ? (
        <li className="is-bad">
          <strong>Revoked</strong>
          <span>{by(request.ended_by_name, request.ended_at)}</span>
        </li>
      ) : null}
      {request.status === "declined" ? (
        <li className="is-bad">
          <strong>Declined</strong>
          <span>{by(request.decided_by_name, request.decided_at)}</span>
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

/** "You were off until Wed, Oct 21, 12:00 PM." for time off that ended early. */
function usedLine(request: TimeOffRequestView, timeFormat: TimeFormat): string {
  const stays = "Shifts that went to open shifts stay open.";
  if (!request.used_until) return stays;
  const at = zoneNow(request.time_timezone, new Date(request.used_until));
  return `You were off until ${dayText(at.date)}, ${clockText(at.time, timeFormat)}. ${stays}`;
}

/** D4: "Ask to cancel" opens a box with an optional reason; "Withdraw cancellation" takes two clicks. */
function CancelActions({
  request,
  boxOpen,
  onBoxOpen,
  asking,
  askError,
  onAsk,
  withdrawing,
  onWithdrawCancellation,
}: {
  request: TimeOffRequestView;
  boxOpen: boolean;
  onBoxOpen: (open: boolean) => void;
  asking: boolean;
  askError: string | null;
  onAsk: (note: string | null) => void;
  withdrawing: boolean;
  onWithdrawCancellation: () => void;
}) {
  const [note, setNote] = useState("");
  const noteId = useId();
  const started = new Date(request.starts_at) <= new Date();
  if (cancellationWaiting(request))
    return (
      <div className="tor-row-actions">
        <ConfirmButton
          className="secondary-button tor-small"
          confirmLabel="Confirm withdraw"
          disabled={withdrawing}
          onConfirm={onWithdrawCancellation}
        >
          {withdrawing ? "Withdrawing…" : "Withdraw cancellation"}
        </ConfirmButton>
      </div>
    );
  if (!canAskToCancel(request)) return null;
  if (!boxOpen)
    return (
      <div className="tor-row-actions">
        <Button className="secondary-button tor-small" onClick={() => onBoxOpen(true)}>Ask to cancel</Button>
      </div>
    );
  return (
    <div className="tor-cancelbox">
      <label htmlFor={noteId} className="tor-label">
        Why do you want to cancel? <span className="tor-opt">Optional</span>
      </label>
      <textarea
        id={noteId}
        maxLength={1000}
        value={note}
        placeholder="Plans changed"
        disabled={asking}
        onChange={(event) => setNote(event.target.value)}
      />
      <p className="tor-fdesc">
        A manager answers. Until then you stay off{started ? " for the rest of it" : ""}. Shifts that already went to open shifts stay open.
      </p>
      {askError ? (
        <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden />{askError}</p>
      ) : null}
      <div className="tor-row-actions">
        <Button className="secondary-button tor-small" disabled={asking} onClick={() => onBoxOpen(false)}>Keep my time off</Button>
        <Button className="tor-small" disabled={asking} onClick={() => onAsk(note.trim() || null)}>
          {asking ? "Sending…" : "Send cancellation request"}
        </Button>
      </div>
    </div>
  );
}

/**
 * One request. On a computer, B Tur 1's drawer (type and status, the dates large, the steps); on a phone,
 * B1's card (When and Length, then the Answer steps). Notes and the buttons below both: Withdraw while it
 * waits, and (D4) Ask to cancel or Withdraw cancellation once approved.
 */
export function TimeOffDetail({
  request,
  phone,
  places,
  timeFormat,
  withdrawing,
  withdrawError,
  onWithdraw,
  cancelBoxOpen,
  onCancelBoxOpen,
  askingCancel,
  cancelError,
  onAskCancel,
  onWithdrawCancellation,
}: {
  request: TimeOffRequestView;
  phone: boolean;
  places: readonly string[];
  timeFormat: TimeFormat;
  withdrawing: boolean;
  withdrawError: string | null;
  onWithdraw: () => void;
  cancelBoxOpen: boolean;
  onCancelBoxOpen: (open: boolean) => void;
  askingCancel: boolean;
  cancelError: string | null;
  onAskCancel: (note: string | null) => void;
  onWithdrawCancellation: () => void;
}) {
  const cancellation = request.cancellation;
  return (
    <div className="tor-detail">
      <div className="tor-row-top">
        <span className="tor-ico"><LeaveIcon kind={request.kind_of_leave} size={17} /></span>
        <strong>{leaveLabel(request.kind_of_leave)}</strong>
        <StatusPill look={requestLook(request)} />
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
      {request.status === "cancelled" || request.status === "revoked" ? (
        <p className="tor-note-line"><Info size={15} aria-hidden /><span>{usedLine(request, timeFormat)}</span></p>
      ) : null}
      {request.note && request.added_by_name ? (
        <blockquote className="tor-quote">
          <span>{request.added_by_name} wrote</span>
          {request.note}
        </blockquote>
      ) : request.note ? (
        <p className="tor-mynote">Your note: {request.note}</p>
      ) : null}
      {request.decision_note ? (
        <blockquote className="tor-quote">
          <span>{request.decided_by_name ?? "Your manager"} wrote</span>
          {request.decision_note}
        </blockquote>
      ) : null}
      {cancellation?.note && (cancellation.status === "pending" || request.status === "cancelled") ? (
        <p className="tor-mynote">Your reason: {cancellation.note}</p>
      ) : null}
      {cancellation?.decision_note && cancellation.status !== "pending" ? (
        <blockquote className="tor-quote">
          <span>{cancellation.decided_by_name ?? "Your manager"} wrote</span>
          {cancellation.decision_note}
        </blockquote>
      ) : null}
      {request.status === "revoked" && request.ended_note ? (
        <blockquote className="tor-quote">
          <span>{request.ended_by_name ?? "Your manager"} wrote</span>
          {request.ended_note}
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
      ) : (
        <CancelActions
          request={request}
          boxOpen={cancelBoxOpen}
          onBoxOpen={onCancelBoxOpen}
          asking={askingCancel}
          askError={cancelError}
          onAsk={onAskCancel}
          withdrawing={withdrawing}
          onWithdrawCancellation={onWithdrawCancellation}
        />
      )}
      {withdrawError ? (
        <p className="tor-err" role="alert"><AlertCircle size={15} aria-hidden />{withdrawError}</p>
      ) : null}
    </div>
  );
}
