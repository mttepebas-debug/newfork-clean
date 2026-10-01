import type { TimeOffImpactShift, TimeOffProgress } from "@newfork/shared";
import { Check, Circle, Clock3 } from "lucide-react";
import { formatAvailabilityClock } from "../availability/AvailabilityClockInput";

// FB-6.3.6: where a pending request stands (rules 10 and 14). Three layouts
// wait for Mert's pick (P04), opened in DEV with ?progressVariant=a|b|c; the
// two not chosen are deleted.
export type ProgressVariant = "a" | "b" | "c";
export function progressVariant(params: URLSearchParams): ProgressVariant {
  const value = import.meta.env.DEV ? params.get("progressVariant") : null;
  return value === "b" || value === "c" ? value : "a";
}

type Place = { id: string; name: string; shifts: TimeOffImpactShift[] };

export function TimeOffProgressPanel({ progress, timeFormat, variant }: {
  progress: TimeOffProgress; timeFormat: "12h" | "24h"; variant: ProgressVariant;
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

  if (variant === "b")
    return (
      <section className="tov tov-b" aria-label="Approval progress">
        <div className="tov-banner">
          <strong>{status}</strong>
          {deadline ? <span><Clock3 size={14} aria-hidden /> {deadline}</span> : null}
        </div>
        {mine}
        <div className="tov-cards">
          {progress.locations.map((place) => (
            <article key={place.id} className={place.approved_by ? "approved" : ""}>
              <header>
                <h3>{place.name}</h3>
                <span className="tov-badge">{place.approved_by ? "Approved" : "Waiting"}</span>
              </header>
              {place.approved_by ? <p className="tov-muted">{place.approved_by_name} · {formatInstant(place.approved_at!)}</p> : null}
              <ShiftList shifts={impact[place.id]?.shifts ?? []} timeFormat={timeFormat} empty="No shifts open here" />
            </article>
          ))}
          {places.filter((place) => !progress.locations.some((asked) => asked.id === place.id)).map((place) => (
            <article key={place.id}>
              <header><h3>{place.name}</h3><span className="tov-badge">No vote</span></header>
              <ShiftList shifts={place.shifts} timeFormat={timeFormat} />
            </article>
          ))}
        </div>
        {hiddenNote}
      </section>
    );

  if (variant === "c")
    return (
      <section className="tov tov-c" aria-label="Approval progress">
        <div className="tov-meter-row">
          <div className="tov-meter" role="meter" aria-label="Locations approved" aria-valuemin={0} aria-valuemax={total} aria-valuenow={approved}>
            {progress.locations.map((place) => <span key={place.id} className={place.approved_by ? "filled" : ""} />)}
          </div>
          <strong>{progress.fallback ? "Admin or owner decides" : `${approved}/${total} approved`}</strong>
          {deadline ? <span className="tov-chip"><Clock3 size={13} aria-hidden /> {deadline}</span> : null}
        </div>
        {mine}
        <ul className="tov-pills">
          {progress.locations.map((place) => (
            <li key={place.id} className={place.approved_by ? "approved" : ""}
              title={place.approved_by ? `${place.approved_by_name} · ${formatInstant(place.approved_at!)}` : "Waiting"}>
              {place.approved_by ? <Check size={13} aria-hidden /> : <Circle size={11} aria-hidden />}
              {place.name}
              <span className="sr-only">{place.approved_by ? `approved by ${place.approved_by_name}` : "waiting"}</span>
            </li>
          ))}
        </ul>
        <h3>Shifts that become open</h3>
        {places.length ? (
          <table className="tov-table">
            <thead><tr><th>Date</th><th>Time</th><th>Job</th><th>Location</th></tr></thead>
            <tbody>
              {places.flatMap((place) => place.shifts).map((shift) => (
                <tr key={shift.id}>
                  <td>{formatDay(shift.scheduled_date)}</td><td>{shiftHours(shift, timeFormat)}</td>
                  <td>{shift.job_name}</td><td>{shift.location_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="tov-muted">No published shifts change.</p>}
        {hiddenNote}
      </section>
    );

  return (
    <section className="tov tov-a" aria-label="Approval progress">
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
      <h3>Shifts that become open</h3>
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

function ShiftList({ shifts, timeFormat, empty }: { shifts: TimeOffImpactShift[]; timeFormat: "12h" | "24h"; empty?: string }) {
  if (!shifts.length) return empty ? <p className="tov-muted">{empty}</p> : null;
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
