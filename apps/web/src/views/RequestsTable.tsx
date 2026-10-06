import { timeOffOpenedShiftCount, type ExchangeCase, type TimeOffRequest } from "@newfork/shared";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarOff,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import { formatTimeOffDeadline } from "../employee-hub/time-off-split";
import { formatTimeRange } from "../schedule/lib/scheduleDateTime";
import {
  requestTypeLabels,
  type OpenRequestRow,
  type RequestType,
} from "../schedule/requests-list";

// EKRAN-02 C1 (KARARLAR Schedule → Requests, K-S8 – K-S10, KK-173): one table
// for time off and every shift change. Employee carries a second line that
// depends on the type; When is one date form, the year only when it is not
// this year; an Open shift row has an empty-shift mark instead of a person.

/** A row of the one table: open rows from B1a, closed time off from its own list. */
export type RequestTableRow =
  | OpenRequestRow
  | { source: "time_off"; id: string; type: "time_off"; tab: "closed"; decideBy: null; request: TimeOffRequest };

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
      <td>{rowDecideBy(row, timeFormat)}</td>
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

function toDate(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

function rowWhen(row: RequestTableRow, timeFormat: "12h" | "24h") {
  if (row.source === "time_off") {
    const { start_date: start, end_date: end } = row.request;
    return dateRange(start, end);
  }
  const shift = row.request.shift;
  const hours = shift.start_time && shift.end_time ? ` · ${formatTimeRange(shift.start_time, shift.end_time, timeFormat, "–")}` : "";
  return `${shortDate(shift.scheduled_date, { weekday: true })}${hours}`;
}

function rowDecideBy(row: RequestTableRow, timeFormat: "12h" | "24h") {
  if (!row.decideBy) return "";
  const zone = row.source === "time_off" ? row.request.segments[0]?.time_timezone : row.request.shift.timezone;
  return zone ? formatTimeOffDeadline(row.decideBy, zone, timeFormat) : "";
}

function rowStatus(row: RequestTableRow): string {
  if (row.source === "time_off") return row.request.status;
  const status = (row.request as ExchangeCase).status;
  return status === "open" ? "pending" : status;
}

function statusTone(status: string) {
  if (status === "pending") return "amber";
  if (status === "approved" || status === "completed") return "green";
  if (status === "denied" || status === "invalidated") return "red";
  return "gray";
}

function statusText(status: string) {
  return status.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

/** Request type: a menu of checkboxes; the button names what is chosen. */
export function RequestTypeFilter({
  allowed,
  chosen,
  onChange,
}: {
  readonly allowed: readonly RequestType[];
  readonly chosen: readonly RequestType[];
  readonly onChange: (types: RequestType[]) => void;
}) {
  const summary =
    chosen.length === allowed.length
      ? "All request types"
      : chosen.length === 1
        ? requestTypeLabels[chosen[0]!]
        : `${chosen.length} request types`;
  return (
    <details className="requests-type-filter">
      <summary aria-label={`Request type: ${summary}`}>
        <span>{summary}</span>
        <ChevronDown size={14} aria-hidden />
      </summary>
      <fieldset>
        <legend>Request type</legend>
        {allowed.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={chosen.includes(type)}
              // Keep at least one type: an empty table with no way to say why helps nobody.
              disabled={chosen.length === 1 && chosen.includes(type)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? allowed.filter((item) => item === type || chosen.includes(item))
                    : chosen.filter((item) => item !== type),
                )
              }
            />
            {requestTypeLabels[type]}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
