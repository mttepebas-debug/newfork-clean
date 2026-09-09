import { useEffect, useRef, useState } from "react";
import type { TimeOffCancellationPeriod } from "@newfork/shared";
import { AvailabilityClockInput } from "../availability/AvailabilityClockInput";
import { formatTimeOffInstant, resolveTimeOffSplit, timeOffWallParts } from "./time-off-split";

export type CancellationChoice = TimeOffCancellationPeriod & {
  key: string; zone: string; original_start: string; original_end: string; initialEdit?: boolean;
};
function endpoint(instant: string, zone: string) {
  const wall = timeOffWallParts(instant, zone);
  const earlier = resolveTimeOffSplit(wall.date, wall.clock, zone, "earlier");
  const later = resolveTimeOffSplit(wall.date, wall.clock, zone, "later");
  return { ...wall, fold: earlier === later ? "" : Date.parse(instant) === Date.parse(earlier) ? "earlier" : "later" } as { date: string; clock: string; fold: "" | "earlier" | "later" };
}
export function TimeOffCancellationHours({ period, index, timeFormat, onChange, onEditing }: {
  period: CancellationChoice; index: number; timeFormat: "12h" | "24h";
  onChange: (period: CancellationChoice) => void; onEditing: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(Boolean(period.initialEdit));
  const [start, setStart] = useState(() => endpoint(period.starts_at, period.zone));
  const [end, setEnd] = useState(() => endpoint(period.ends_at, period.zone));
  const [error, setError] = useState("");
  const chooseButton = useRef<HTMLButtonElement>(null);
  const startDateInput = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) startDateInput.current?.focus();
    else if (wasEditing.current) chooseButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  function begin() {
    setStart(endpoint(period.starts_at, period.zone)); setEnd(endpoint(period.ends_at, period.zone));
    setError(""); setEditing(true); onEditing(true);
  }
  function apply() {
    try {
      const resolve = (value: typeof start, original: string) => JSON.stringify(value) === JSON.stringify(endpoint(original, period.zone))
        ? original : resolveTimeOffSplit(value.date, value.clock, period.zone, value.fold || undefined);
      const starts_at = resolve(start, period.starts_at), ends_at = resolve(end, period.ends_at);
      if (Date.parse(starts_at) >= Date.parse(ends_at)) throw new Error("Cancellation must end after it starts.");
      if (Date.parse(starts_at) < Date.parse(period.original_start) || Date.parse(ends_at) > Date.parse(period.original_end))
        throw new Error("Choose hours inside this remaining approved period. Denied or already cancelled hours cannot be included.");
      if (Date.parse(starts_at) <= Date.now()) throw new Error("Choose a future start. Hours already taken cannot be cancelled.");
      onChange({ ...period, starts_at, ends_at }); setEditing(false); onEditing(false); setError("");
    } catch (error) { setError(error instanceof Error ? error.message.replace(/split /g, "cancellation ") : "Check the cancellation hours."); }
  }
  return <div className="time-off-cancellation-hours">
    <small>Approved bounds: {formatTimeOffInstant(period.original_start, period.zone, timeFormat)} – {formatTimeOffInstant(period.original_end, period.zone, timeFormat)}</small>
    {!editing ? <button ref={chooseButton} type="button" aria-label={`Choose hours for period ${index + 1}`} onClick={begin}>Choose hours</button> : <fieldset>
      <legend>Cancellation hours for period {index + 1} · {period.zone}</legend>
      <p>Use the next date for an overnight end. Midnight on the next date ends the previous day.</p>
      {(["start", "end"] as const).map(side => {
        const value = side === "start" ? start : end, change = side === "start" ? setStart : setEnd;
        const prefix = `Cancellation ${side} ${index + 1}`;
        return <div className="time-off-cancellation-endpoint" key={side}>
          <label>{side === "start" ? "Starts on" : "Ends on"}<input ref={side === "start" ? startDateInput : undefined} type="date" aria-label={`${prefix} date`} value={value.date} onChange={event => change({ ...value, date: event.target.value, fold: "" })} /></label>
          <label>{side === "start" ? "Start time" : "End time"}<AvailabilityClockInput value={value.clock} timeFormat={timeFormat} label={`${prefix} time`} onChange={clock => change({ ...value, clock, fold: "" })} /></label>
          <label>Repeated time<select aria-label={`${prefix} occurrence`} value={value.fold} onChange={event => change({ ...value, fold: event.target.value as typeof value.fold })}>
            <option value="">Ask if this clock repeats</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option>
          </select></label>
        </div>;
      })}
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" aria-label={`Apply hours for period ${index + 1}`} onClick={apply}>Apply hours</button>
      <button type="button" aria-label={`Keep previous hours for period ${index + 1}`} onClick={() => { setEditing(false); onEditing(false); setError(""); }}>Discard these edits</button>
    </fieldset>}
  </div>;
}

export function cancellationSelectionError(periods: CancellationChoice[], allowPast = false) {
  if (!periods.length) return "Select at least one future approved period.";
  if (periods.length > 124) return "Select at most 124 cancellation periods in one request.";
  const ordered = [...periods].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const [index, period] of ordered.entries()) {
    if (Date.parse(period.starts_at) >= Date.parse(period.ends_at) || Date.parse(period.starts_at) < Date.parse(period.original_start) || Date.parse(period.ends_at) > Date.parse(period.original_end))
      return "Choose positive hours inside each remaining approved period.";
    if (!allowPast && Date.parse(period.starts_at) <= Date.now()) return "Choose future hours for any period that has already started.";
    if (index && Date.parse(ordered[index - 1]!.ends_at) > Date.parse(period.starts_at)) return "Selected cancellation periods overlap. Adjust or deselect the overlapping hours.";
  }
  return "";
}
