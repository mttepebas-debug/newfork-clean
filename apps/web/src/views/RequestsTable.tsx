import { ArrowLeftRight, CalendarOff, Hand } from "lucide-react";
import type { ReactNode } from "react";
import { timeOffDeadlineAt, timeOffZoneName } from "../employee-hub/time-off-split";
import { ListCards } from "./ListCards";
import type { RequestRow } from "../schedule/requests-list";
import {
  exchangeSentence,
  rowExpires,
  rowKind,
  rowKindLabels,
  rowStatus,
  sentenceText,
  timeOffSentence,
  type Part,
  type RowKind,
} from "../schedule/request-sentences";

// Schedule → Requests as one table of thin rows (TAKAS-RELEASE; shift changes:
// Mert, 2026-10-14; time off in the same form: Mert, 2026-10-17): the kind's
// icon on a rounded tile, one sentence, a short status, and Expires (when the
// request closes on its own; red in its last 12 hours). The detail is in the
// drawer. The phone draws the same as cards.

/** Steps in (Mert, 2026-10-14 00:28): a person and an arrow coming in. */
function StepsIn({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 20a7 7 0 0 1 11.5-5.4" />
      <path d="M22 17h-7" />
      <path d="m18 13.5-3.5 3.5 3.5 3.5" />
    </svg>
  );
}

export function KindIcon({ kind, size = 40 }: { kind: RowKind; size?: 28 | 40 }) {
  const icon = size === 40 ? 22 : 16;
  return (
    <span className={`request-kind request-kind--${size}`} data-kind={kind} aria-hidden>
      {kind === "time_off" ? (
        <CalendarOff size={icon} />
      ) : kind === "swap" ? (
        <ArrowLeftRight size={icon} />
      ) : kind === "pickup" ? (
        <Hand size={icon} />
      ) : (
        <StepsIn size={icon} />
      )}
    </span>
  );
}

function Sentence({ parts }: { parts: readonly Part[] }): ReactNode {
  return parts.map((part, index) => (typeof part === "string" ? part : <b key={index}>{part.strong}</b>));
}

function sentenceOf(row: RequestRow, timeFormat: "12h" | "24h") {
  return row.source === "time_off" ? timeOffSentence(row.request, timeFormat) : exchangeSentence(row.request, timeFormat);
}

function rowZone(row: RequestRow) {
  return row.source === "time_off" ? row.request.time_timezone : row.request.shift.timezone;
}

function Expires({ row, timeFormat, phone = false }: { row: RequestRow; timeFormat: "12h" | "24h"; phone?: boolean }) {
  const expires = rowExpires(row);
  const zone = rowZone(row);
  if (!expires || !zone)
    return phone ? null : (
      <>
        <span className="request-expires request-expires--none" aria-hidden>
          —
        </span>
        <span className="sr-only">No expiry</span>
      </>
    );
  const at = timeOffDeadlineAt(expires.at, zone, timeFormat);
  // A deadline names its zone on any device (FB-6.3.8d): the time, then the zone below it.
  if (phone)
    return (
      <span className={`request-expires${expires.soon ? " request-expires--soon" : ""}`}>
        Expires {at} {timeOffZoneName(zone)}
      </span>
    );
  return (
    <span className={`request-expires${expires.soon ? " request-expires--soon" : ""}`}>
      <span>{at}</span>
      <small>{timeOffZoneName(zone)}</small>
    </span>
  );
}

export function RequestsTable({
  rows,
  timeFormat,
  onOpen,
}: {
  readonly rows: readonly RequestRow[];
  readonly timeFormat: "12h" | "24h";
  readonly onOpen: (row: RequestRow) => void;
}) {
  return (
    <table className="employee-table requests-table">
      <colgroup>
        <col style={{ width: "64px" }} />
        <col />
        {/* "Needs decision" and "Oct 23, 12:00 PM" fit whole. */}
        <col style={{ width: "190px" }} />
        <col style={{ width: "180px" }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Type</span>
          </th>
          <th scope="col">Request</th>
          <th scope="col">Status</th>
          <th scope="col">Expires</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <RequestRowView key={`${row.source}:${row.id}`} row={row} timeFormat={timeFormat} onOpen={() => onOpen(row)} />
        ))}
      </tbody>
    </table>
  );
}

function RequestRowView({ row, timeFormat, onOpen }: { row: RequestRow; timeFormat: "12h" | "24h"; onOpen: () => void }) {
  const kind = rowKind(row);
  const parts = sentenceOf(row, timeFormat);
  const status = rowStatus(row);
  return (
    <tr
      tabIndex={0}
      aria-label={`${rowKindLabels[kind]}: ${sentenceText(parts)} ${status.label}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === " ") event.preventDefault();
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
    >
      <td className="request-kind-cell">
        <KindIcon kind={kind} />
        <span className="sr-only">{rowKindLabels[kind]}</span>
      </td>
      <td>
        <span className="request-sentence">
          <Sentence parts={parts} />
        </span>
      </td>
      <td>
        <span className="list-chip" data-tone={status.tone}>
          {status.label}
        </span>
      </td>
      <td>
        <Expires row={row} timeFormat={timeFormat} />
      </td>
    </tr>
  );
}

/** The phone's list (#67): a card per request instead of the table. */
export function RequestCards({
  rows,
  timeFormat,
  onOpen,
}: {
  readonly rows: readonly RequestRow[];
  readonly timeFormat: "12h" | "24h";
  readonly onOpen: (row: RequestRow) => void;
}) {
  return (
    <ListCards label="Requests">
      {rows.map((row) => {
        const kind = rowKind(row);
        const parts = sentenceOf(row, timeFormat);
        const status = rowStatus(row);
        return (
          <li key={`${row.source}:${row.id}`}>
            <button
              type="button"
              className="list-card request-card"
              aria-label={`${rowKindLabels[kind]}: ${sentenceText(parts)} ${status.label}`}
              onClick={() => onOpen(row)}
            >
              <KindIcon kind={kind} />
              <span className="request-sentence">
                <Sentence parts={parts} />
              </span>
              <span className="request-card-foot">
                <span className="list-chip" data-tone={status.tone}>
                  {status.label}
                </span>
                <Expires row={row} timeFormat={timeFormat} phone />
              </span>
            </button>
          </li>
        );
      })}
    </ListCards>
  );
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

/** "3:30 PM–11:00 PM" or "15:30–23:00": both ends name their half (Mert, 2026-10-12). */
export function clockRange(start: string, end: string, timeFormat: "12h" | "24h", options: { spaced?: boolean } = {}) {
  const parts = (value: string) => {
    const [hour = 0, minute = 0] = value.split(":").map(Number);
    return { hour, minute: String(minute).padStart(2, "0") };
  };
  const from = parts(start);
  const to = parts(end);
  // The swap review (H2): thin spaces around the dash.
  const dash = options.spaced ? " – " : "–";
  if (timeFormat === "24h")
    return `${String(from.hour).padStart(2, "0")}:${from.minute}${dash}${String(to.hour).padStart(2, "0")}:${to.minute}`;
  const clock = (time: { hour: number; minute: string }) => `${time.hour % 12 || 12}:${time.minute} ${time.hour % 24 < 12 ? "AM" : "PM"}`;
  return `${clock(from)}${dash}${clock(to)}`;
}

function toDate(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}
