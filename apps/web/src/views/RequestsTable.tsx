import { timeOffOpenedShiftCount, type ExchangeCase, type TimeOffRequest } from "@newfork/shared";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarOff,
  ChevronRight,
  CircleDashed,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import { timeOffDeadlineAt, timeOffZoneName } from "../employee-hub/time-off-split";
import { requestTypeLabels, type RequestRow, type RequestType } from "../schedule/requests-list";

// EKRAN-02 C1 (KARARLAR Schedule → Requests, K-S8 – K-S10, KK-173): one table
// for time off and every shift change. Employee carries a second line that
// depends on the type; When is one date form, the year only when it is not
// this year; an Open shift row has an empty-shift mark instead of a person.
// Status tells an open request (Needs review, In progress) from a closed one.

type RequestTableRow = RequestRow;

const typeIcons: Record<RequestType, LucideIcon> = {
  time_off: CalendarOff,
  swap: ArrowLeftRight,
  cover: UserRoundSearch,
  open_pickup: CircleDashed,
};

export function RequestsTable({
  rows,
  timeFormat,
  onOpen,
}: {
  readonly rows: readonly RequestTableRow[];
  readonly timeFormat: "12h" | "24h";
  readonly onOpen: (row: RequestTableRow) => void;
}) {
  return (
    <table className="employee-table requests-table">
      <colgroup>
        <col style={{ width: "27%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "24%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "8%" }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Employee</th>
          <th scope="col">Type</th>
          <th scope="col">When</th>
          <th scope="col">Decide by</th>
          <th scope="col">Status</th>
          <th scope="col">Review</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <RequestTableRowView key={`${row.source}:${row.id}`} row={row} timeFormat={timeFormat} onOpen={() => onOpen(row)} />
        ))}
      </tbody>
    </table>
  );
}

function RequestTableRowView({
  row,
  timeFormat,
  onOpen,
}: {
  row: RequestTableRow;
  timeFormat: "12h" | "24h";
  onOpen: () => void;
}) {
  const Icon = typeIcons[row.type];
  const person = rowPerson(row);
  const opens = row.source === "time_off" && row.request.progress ? timeOffOpenedShiftCount(row.request.progress) : 0;
  const status = rowStatus(row);
  return (
    <tr
      tabIndex={0}
      aria-label={`${person.name}, ${requestTypeLabels[row.type]}, ${rowWhen(row, timeFormat)}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === " ") event.preventDefault();
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
    >
      <td>
        <span className="request-person">
          {row.type === "open_pickup" ? (
            <span className="request-person-mark request-person-mark--open" aria-hidden>
              <CircleDashed size={16} />
            </span>
          ) : (
            <span className="request-person-mark" aria-hidden>
              {person.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="request-person-text">
            <span className="request-person-name">{person.name}</span>
            {person.detail ? <small>{person.detail}</small> : null}
          </span>
        </span>
      </td>
      <td>
        <span className="request-type" data-type={row.type}>
          <Icon size={14} aria-hidden />
          {requestTypeLabels[row.type]}
        </span>
      </td>
      <td>{rowWhen(row, timeFormat)}</td>
      <td>
        <RowDecideBy row={row} timeFormat={timeFormat} />
      </td>
      <td>
        <span className="list-chip" data-tone={statusTone(status)}>
          {statusText(status)}
        </span>
      </td>
      <td className="request-review-cell">
        {opens ? (
          <span className="request-conflict-count" title="Shifts that become open">
            <AlertTriangle size={14} aria-hidden />
            {opens}
          </span>
        ) : (
          <ChevronRight size={15} aria-hidden />
        )}
      </td>
    </tr>
  );
}

function rowPerson(row: RequestTableRow): { name: string; detail: string } {
  if (row.source === "time_off") {
    const request = row.request;
    if (request.request_type === "time_off_cancellation") return { name: request.employee_name, detail: "Cancels approved time off" };
    const opens = request.progress ? timeOffOpenedShiftCount(request.progress) : 0;
    return { name: request.employee_name, detail: opens ? `${opens} ${opens === 1 ? "shift becomes" : "shifts become"} open` : "" };
  }
  const item = row.request;
  if (item.kind === "open_pickup") {
    const applicants = item.applications.length;
    return {
      name: "Open shift",
      detail: [item.shift.location_name, item.shift.job_name, applicants ? `${applicants} ${applicants === 1 ? "applicant" : "applicants"}` : ""]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const name = item.owner_name ?? item.shift.employee_name ?? "Unknown employee";
  if (item.kind === "swap" && item.requested_shift) {
    const other = item.requested_shift.employee_name;
    return { name, detail: `${other ? `for ${other}'s` : "for"} ${shortDate(item.requested_shift.scheduled_date, { weekday: true })}` };
  }
  const candidates = item.candidate_count;
  return { name, detail: candidates ? `${candidates} ${candidates === 1 ? "candidate" : "candidates"}` : "Looking for cover" };
}

/** K-S10: one date form; the year only when it is not this year. A shift
 * names its weekday; a time off date does not (artifact, Version 2). */
export function shortDate(value: string, options: { weekday?: boolean; year?: boolean } = {}, now = new Date()) {
  const date = toDate(value);
  return new Intl.DateTimeFormat("en-US", {
    weekday: options.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: (options.year ?? true) && date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  }).format(date);
}

/** "Apr 25 – Apr 27, 2029": a range in one year names that year once, at its end. */
export function dateRange(start: string, end: string, now = new Date()) {
  if (start === end) return shortDate(start, {}, now);
  const sameYear = toDate(start).getFullYear() === toDate(end).getFullYear();
  return `${shortDate(start, { year: !sameYear }, now)} – ${shortDate(end, {}, now)}`;
}

/** "3:30–11:00 PM", "11:00 AM–3:00 PM", "15:30–23:00" (artifact, Version 2). */
export function clockRange(start: string, end: string, timeFormat: "12h" | "24h") {
  const parts = (value: string) => {
    const [hour = 0, minute = 0] = value.split(":").map(Number);
    return { hour, minute: String(minute).padStart(2, "0") };
  };
  const from = parts(start);
  const to = parts(end);
  if (timeFormat === "24h")
    return `${String(from.hour).padStart(2, "0")}:${from.minute}–${String(to.hour).padStart(2, "0")}:${to.minute}`;
  const half = (hour: number) => (hour % 24 < 12 ? "AM" : "PM");
  const clock = (time: { hour: number; minute: string }) => `${time.hour % 12 || 12}:${time.minute}`;
  return half(from.hour) === half(to.hour)
    ? `${clock(from)}–${clock(to)} ${half(to.hour)}`
    : `${clock(from)} ${half(from.hour)}–${clock(to)} ${half(to.hour)}`;
}

function toDate(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

function rowWhen(row: RequestTableRow, timeFormat: "12h" | "24h") {
  if (row.source === "time_off") {
    const { start_date: start, end_date: end } = row.request;
    return dateRange(start, end);
  }
  const shift = row.request.shift;
  const hours = shift.start_time && shift.end_time ? ` · ${clockRange(shift.start_time, shift.end_time, timeFormat)}` : "";
  return `${shortDate(shift.scheduled_date, { weekday: true })}${hours}`;
}

// KARARLAR:133 names the zone; it gets its own line so it is never cut.
function RowDecideBy({ row, timeFormat }: { row: RequestTableRow; timeFormat: "12h" | "24h" }) {
  const zone = row.source === "time_off" ? row.request.segments[0]?.time_timezone : row.request.shift.timezone;
  if (!row.decideBy || !zone) return null;
  return (
    <span className="request-deadline">
      <span>{timeOffDeadlineAt(row.decideBy, zone, timeFormat)}</span>
      <small>{timeOffZoneName(zone)}</small>
    </span>
  );
}

function rowStatus(row: RequestTableRow): string {
  if (row.state !== "closed") return row.state;
  return row.source === "time_off" ? row.request.status : (row.request as ExchangeCase).status;
}

function statusTone(status: string) {
  if (status === "needs_review") return "amber";
  if (status === "approved" || status === "completed") return "green";
  if (status === "denied" || status === "invalidated") return "red";
  return "gray";
}

function statusText(status: string) {
  return status.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
