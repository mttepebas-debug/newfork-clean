import type { TimeOffImpactShift, TimeOffProgress } from "@newfork/shared";
import { Check, Circle, Clock3 } from "lucide-react";
import { formatAvailabilityClock } from "../availability/AvailabilityClockInput";

// Where a pending request stands (rules 10 and 14): a checklist of the
// locations asked to approve, then the shifts that would open (P04, FB-6.3.6).
type Place = { id: string; name: string; shifts: TimeOffImpactShift[] };

export function TimeOffProgressPanel({ progress, timeFormat }: {
  progress: TimeOffProgress; timeFormat: "12h" | "24h";
}) {
  const total = progress.locations.length;
  const approved = progress.locations.filter((place) => place.approved_by).length;
  const impact = progress.impact?.locations ?? {};
  // A shift can open at a location that is not asked to vote.
  const places: Place[] = Object.entries(impact)
    .filter(([, place]) => place.shifts.length)
    .map(([id, place]) => ({ id, name: place.shifts[0]!.location_name, shifts: place.shifts }));
  const hidden = progress.impact?.hidden_shift_count ?? 0;
  const deadline = progress.decide_by ? `Decide by ${formatInstant(progress.decide_by)}` : null;
  const status = progress.fallback
    ? "No location manager can decide. An admin or owner decides."
    : `${approved} of ${total} location${total === 1 ? "" : "s"} approved`;
  const mine = progress.my_vote ? <p className="tov-mine">Your vote: {progress.my_vote === "approve" ? "Approved" : "Denied"}</p> : null;
  const hiddenNote = hidden ? <p className="tov-muted">{hidden} more shift{hidden === 1 ? "" : "s"} at locations you can't see</p> : null;

  return (
    <section className="tov" aria-label="Approval progress">
      <header className="tov-head">
        <h2>Approvals</h2>
        <span>{status}</span>
      </header>
      {deadline ? <p className="tov-deadline"><Clock3 size={14} aria-hidden /> {deadline}</p> : null}
      {mine}
      <ol className="tov-steps">
        {progress.locations.map((place) => (
          <li key={place.id} className={place.approved_by ? "approved" : ""}>
            {place.approved_by ? <Check size={15} aria-hidden /> : <Circle size={13} aria-hidden />}
            <span>
              <strong>{place.name}</strong>
              <small>{place.approved_by ? `${place.approved_by_name} · ${formatInstant(place.approved_at!)}` : "Waiting"}</small>
            </span>
          </li>
        ))}
      </ol>
      <h2>Shifts that become open</h2>
      {places.length ? places.map((place) => (
        <div key={place.id} className="tov-place">
          <strong>{place.name}</strong>
          <ShiftList shifts={place.shifts} timeFormat={timeFormat} />
        </div>
      )) : <p className="tov-muted">No published shifts change.</p>}
      {hiddenNote}
    </section>
  );
}

function ShiftList({ shifts, timeFormat }: { shifts: TimeOffImpactShift[]; timeFormat: "12h" | "24h" }) {
  return (
    <ul className="tov-shifts">
      {shifts.map((shift) => <li key={shift.id}>{formatDay(shift.scheduled_date)} · {shiftHours(shift, timeFormat)} · {shift.job_name}</li>)}
    </ul>
  );
}

function shiftHours(shift: TimeOffImpactShift, timeFormat: "12h" | "24h") {
  if (shift.time_unknown || !shift.start_time || !shift.end_time) return "Hours need verification";
  return `${formatAvailabilityClock(shift.start_time, timeFormat)}–${formatAvailabilityClock(shift.end_time, timeFormat)}`;
}
function formatDay(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}
export function formatInstant(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
