import type { TimeOffPeriodRead } from "@newfork/shared";
import { formatAvailabilityClock } from "../availability/AvailabilityClockInput";
import { formatTimeOffInstant } from "./time-off-split";

export function TimeOffPeriods({ periods, timeFormat, requestStatus, cancellation = false }: { periods: TimeOffPeriodRead[]; timeFormat: "12h" | "24h"; requestStatus?: string; cancellation?: boolean }) {
  return <ul className="time-off-period-details" aria-label="Requested periods and decisions">
    {periods.map((period) => <li key={period.id}>
      <strong>{period.segment_date} · {period.start_time && period.end_time
        ? `${formatAvailabilityClock(period.start_time, timeFormat)}–${formatAvailabilityClock(period.end_time, timeFormat)}${period.ends_next_day || period.end_time.startsWith("24:") ? " (+1 day)" : ""}` : "Full day"}</strong>
      {/* A pending period names no state: the request is decided as one and its status is in the header. */}
      <span>{[cancellation ? requestStatus === "revoked" ? "Cancellation closed · Leave was not changed by this request" : period.status === "pending" ? "Cancellation pending · Approved leave stays in effect" : "Cancellation decision" : requestStatus === "revoked" ? "Revoked · No longer approved leave" : period.cancelled_intervals?.length ? "Leave updated after cancellation" : period.status === "pending" ? "" : period.decision_pieces?.some(p => p.status === "approved") && period.decision_pieces.some(p => p.status === "denied") ? "Partially approved" : period.status === "approved" ? "Approved" : "Declined", period.time_timezone].filter(Boolean).join(" · ")}</span>
      {period.decision_pieces?.length ? <ul aria-label={`Decision pieces for ${period.segment_date}`}>
        {period.decision_pieces.map(piece => <li key={piece.id}>
          <strong>{cancellation ? piece.status === "approved" ? "Cancellation approved" : "Cancellation declined · Leave kept" : piece.status === "approved" ? requestStatus === "revoked" || period.cancelled_intervals?.length ? "Previously approved" : "Approved" : "Declined"}</strong>
          <span>{formatTimeOffInstant(piece.starts_at, piece.time_timezone, timeFormat)} – {formatTimeOffInstant(piece.ends_at, piece.time_timezone, timeFormat)}</span>
        </li>)}
      </ul> : null}
      {period.cancelled_intervals?.length && period.time_timezone ? <ul aria-label={`Leave after cancellation for ${period.segment_date}`}>
        {period.cancelled_intervals.map(span => <li key={`cancelled:${span.start_at}`}><strong>Cancelled leave</strong><span>{formatTimeOffInstant(span.start_at, period.time_timezone!, timeFormat)} – {formatTimeOffInstant(span.end_at, period.time_timezone!, timeFormat)}</span></li>)}
        {period.effective_intervals?.map(span => <li key={`approved:${span.start_at}`}><strong>Still approved</strong><span>{formatTimeOffInstant(span.start_at, period.time_timezone!, timeFormat)} – {formatTimeOffInstant(span.end_at, period.time_timezone!, timeFormat)}</span></li>)}
      </ul> : null}
      {period.fold_choices?.start_fold || period.fold_choices?.end_fold ? <small>
        {period.fold_choices.start_fold ? `Start: ${period.fold_choices.start_fold === "earlier" ? "first" : "second"} occurrence. ` : ""}
        {period.fold_choices.end_fold ? `End: ${period.fold_choices.end_fold === "earlier" ? "first" : "second"} occurrence.` : ""}
      </small> : null}
      {period.time_source === "legacy_location" ? <small>Earlier request; hours use the location time zone because no original time-zone snapshot was recorded.</small> : null}
    </li>)}
  </ul>;
}
