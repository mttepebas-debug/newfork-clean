import type { ExchangeShift } from "@newfork/shared";
import { Clock3, MapPin } from "lucide-react";
import { formatTimeRange } from "../../schedule/lib/scheduleDateTime";
import { exchangeTimeDetails } from "./exchange-time-details";
import { zoneName } from "../../lib/today";

const shiftDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function shiftHours(shift: ExchangeShift) {
  if (!shift.starts_at || !shift.ends_at) return 0;
  return Math.max(
    0,
    ((Date.parse(shift.ends_at) - Date.parse(shift.starts_at)) / 60000 -
      (shift.unpaid_break_minutes ?? 0)) /
      60,
  );
}
export function ExchangeShiftCard({
  shift,
  label,
  assignment,
}: {
  shift: ExchangeShift;
  label?: string;
  assignment?: {
    published: boolean | null | undefined;
    employeeId?: string | null;
  };
}) {
  const time = exchangeTimeDetails(shift);
  return (
    <div className="sx-shift">
      {label && <p className="sx-eyebrow">{label}</p>}
      <p className="sx-date">
        {shiftDateFormatter.format(
          new Date(`${shift.scheduled_date}T12:00:00Z`),
        )}
      </p>
      <strong className="sx-time">
        {formatTimeRange(shift.start_time!, shift.end_time!, "12h", " – ")}
      </strong>
      <p className="sx-help">
        <Clock3 size={14} aria-hidden />{" "}
        {Number(shiftHours(shift).toFixed(2))} scheduled{" "}
        {Number(shiftHours(shift).toFixed(2)) === 1 ? "hour" : "hours"}
        {Boolean(shift.unpaid_break_minutes) &&
          ` · ${shift.unpaid_break_minutes}m unpaid break`}
      </p>
      <p className="sx-meta">
        <MapPin size={15} aria-hidden /> {shift.location_name} ·{" "}
        {shift.job_name}
      </p>
      <p className="sx-zone">
        {zoneName(shift.time_timezone || shift.timezone)}
        {(time
          ? time.endsNextDay
          : shift.end_time &&
            shift.start_time &&
            shift.end_time <= shift.start_time) && " · Ends next day"}
      </p>
      {time && (time.clockChange || time.repeatedClock) && (
        <div className="sx-clock-detail" aria-label="Clock change details">
          <p>
            {time.clockChange
              ? "Clock change during this shift."
              : "This shift uses a repeated clock time."}{" "}
            Scheduled hours use elapsed time.
          </p>
          <dl>
            <div>
              <dt>Start</dt>
              <dd>
                {time.startLabel}
                {time.startOccurrence && ` · ${time.startOccurrence}`}
              </dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>
                {time.endLabel}
                {time.endOccurrence && ` · ${time.endOccurrence}`}
              </dd>
            </div>
          </dl>
        </div>
      )}
      {assignment && (
        <ExchangeAssignment
          shift={shift}
          published={assignment.published}
          employeeId={assignment.employeeId}
        />
      )}
    </div>
  );
}

export function ExchangeAssignment({
  shift,
  published,
  employeeId,
  className = "",
}: {
  shift: ExchangeShift;
  published: boolean | null | undefined;
  employeeId?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`sx-assignment ${className}`}
      data-assignment-source={shift.source_id}
      data-published-state={
        published === true
          ? "current"
          : published === false
            ? "removed"
            : "unknown"
      }
    >
      <span>
        {published === true
          ? shift.employee_id
            ? "Currently responsible"
            : "Current assignment"
          : "Historical details"}
      </span>
      <strong>
        {published === true
          ? shift.employee_id
            ? shift.employee_name || "Assigned employee"
            : "Open shift · No assigned employee"
          : published === false
            ? "No longer published"
            : "Check the published schedule"}
      </strong>
      {published === true && employeeId && shift.employee_id === employeeId && (
        <small>You</small>
      )}
    </div>
  );
}
