import type { ExchangeShift } from "@newfork/shared";
import { BriefcaseBusiness, Clock3, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { dateInZone, validZone } from "../../lib/today";
import { shiftHours } from "./ExchangeShiftCard";
import "./shift-release.css";

// The shift card of the shift change plan (Mert, 2026-10-13 12:10): a date tile
// beside the time, the job and its length, the place; a thin line below says
// where the shift goes ("Maria → you") and when it is.

/** "4:00 PM", as the plan writes a shift's time. */
const clock = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour % 24 < 12 ? "AM" : "PM"}`;
};

const part = (date: string, option: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...option, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** "Today", "Tomorrow", "In 3 days", in the shift's own clock. */
export function shiftWhen(shift: ExchangeShift, now = new Date()) {
  const today = dateInZone(now, validZone(shift.time_timezone || shift.timezone));
  const days = Math.round((Date.parse(`${shift.scheduled_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function ShiftTicket({
  shift,
  hand,
  when = shiftWhen(shift),
  soon = false,
}: {
  shift: ExchangeShift;
  /** Who the shift goes from and to: "Maria → you". */
  hand?: ReactNode;
  when?: string;
  soon?: boolean;
}) {
  const hours = Number((shift.starts_at && shift.ends_at ? shiftHours(shift) : wallHours(shift)).toFixed(2));
  return (
    <div
      className="sx-tk"
      role="group"
      aria-label={`${part(shift.scheduled_date, { weekday: "long", month: "long", day: "numeric" })}${shift.start_time && shift.end_time ? `, ${clock(shift.start_time)} to ${clock(shift.end_time)}` : ""}`}
    >
      <span className="sx-tk-date" aria-hidden>
        <small>{part(shift.scheduled_date, { weekday: "short" })}</small>
        <b>{part(shift.scheduled_date, { day: "numeric" })}</b>
        <small>{part(shift.scheduled_date, { month: "short" })}</small>
      </span>
      <span className="sx-tk-main">
        <b className="sx-tk-time">
          {shift.start_time && shift.end_time ? `${clock(shift.start_time)} – ${clock(shift.end_time)}` : "Hours not confirmed"}
        </b>
        <span className="sx-tk-row">
          <BriefcaseBusiness aria-hidden />
          {shift.job_name}
          <i aria-hidden />
          <Clock3 aria-hidden />
          {hours} h
        </span>
        <span className="sx-tk-row">
          <MapPin aria-hidden />
          {shift.location_name}
        </span>
      </span>
      <span className={`sx-tk-foot ${soon ? "sx-tk-soon" : ""}`}>
        {hand ? <span className="sx-tk-hand">{hand}</span> : <span className="sx-tk-hand">Scheduled</span>}
        <span>{when}</span>
      </span>
    </div>
  );
}

/** The length from the wall clock when the instants are not known; overnight runs to the next day. */
function wallHours(shift: ExchangeShift) {
  if (!shift.start_time || !shift.end_time) return 0;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  let span = minutes(shift.end_time) - minutes(shift.start_time);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, (span - (shift.unpaid_break_minutes ?? 0)) / 60);
}

/** "Maria → you": the arrow is read as "to". */
export function Hand({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <>
      {from} <i aria-label="to">→</i> {to}
    </>
  );
}
