import { useEffect, useRef, useState } from "react";
import type { TimeOffDecisionPiece, TimeOffPeriodRead, TimeOffSegmentDecision } from "@newfork/shared";
import { AvailabilityClockInput } from "../availability/AvailabilityClockInput";
import { formatTimeOffInstant, resolveTimeOffSplit, timeOffWallParts } from "./time-off-split";
import "./time-off.css";

export function TimeOffPartialDecision({ period, decision, onChange, onEditing, timeFormat, disabled, cancellation = false }: {
  period: TimeOffPeriodRead; decision: TimeOffSegmentDecision; onChange: (value: TimeOffSegmentDecision) => void;
  timeFormat: "12h" | "24h"; disabled: boolean;
  cancellation?: boolean;
  onEditing: (editing: boolean) => void;
}) {
  const zone = period.time_timezone;
  const splittable = Boolean(period.starts_at && period.ends_at && zone && period.time_source === "snapshot");
  const [splitIndex, setSplitIndex] = useState<number | null>(null);
  const [date, setDate] = useState(period.segment_date);
  const [clock, setClock] = useState("");
  const [fold, setFold] = useState<"" | "earlier" | "later">("");
  const [error, setError] = useState("");
  const decisionInput = useRef<HTMLSelectElement>(null);
  const splitDateInput = useRef<HTMLInputElement>(null);
  const wasSplitting = useRef(false);
  useEffect(() => {
    if (splitIndex !== null) splitDateInput.current?.focus();
    else if (wasSplitting.current) decisionInput.current?.focus();
    wasSplitting.current = splitIndex !== null;
  }, [splitIndex]);
  const pieces: TimeOffDecisionPiece[] = decision.pieces ?? (splittable ? [{ starts_at: period.starts_at!, ends_at: period.ends_at!, status: decision.status ?? "approved" }] : []);
  function beginSplit(index: number) {
    const piece = pieces[index]!;
    const middle = Math.floor((Date.parse(piece.starts_at) + Date.parse(piece.ends_at)) / 2000) * 1000;
    const wall = timeOffWallParts(new Date(middle).toISOString(), zone!);
    setDate(wall.date); setClock(wall.clock); setFold(""); setError(""); setSplitIndex(index); onEditing(true);
  }
  function split() {
    try {
      const point = resolveTimeOffSplit(date, clock, zone!, fold || undefined);
      const piece = pieces[splitIndex!]!;
      if (Date.parse(point) <= Date.parse(piece.starts_at) || Date.parse(point) >= Date.parse(piece.ends_at)) throw new Error("Split strictly inside this requested period.");
      onChange({ segment_id: period.id, pieces: pieces.flatMap((p, i) => i === splitIndex ? [{ ...p, ends_at: point }, { ...p, starts_at: point }] : [p]) });
      setSplitIndex(null); setError(""); onEditing(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Check the split time."); }
  }
  return <fieldset className="time-off-partial-editor" disabled={disabled}>
    <legend>{period.segment_date} · {zone ?? "Requested time"}</legend>
    <label>Decision for {period.segment_date}
      <select ref={decisionInput} aria-label={`Decision for ${period.id}`} value={decision.pieces ? "pieces" : decision.status} onChange={(event) => {
        onChange({ segment_id: period.id, status: event.target.value as "approved" | "denied" }); setSplitIndex(null); onEditing(false);
      }}>
        <option value="approved">{cancellation ? "Cancel leave for entire period" : "Approve entire period"}</option><option value="denied">{cancellation ? "Keep leave for entire period" : "Deny entire period"}</option>
        {decision.pieces ? <option value="pieces">Decide individual pieces</option> : null}
      </select>
    </label>
    {pieces.map((piece, index) => <div key={`${index}:${piece.starts_at}`} className="time-off-piece">
      <span>{formatTimeOffInstant(piece.starts_at, zone!, timeFormat)} – {formatTimeOffInstant(piece.ends_at, zone!, timeFormat)}</span>
      {decision.pieces ? <label>Piece {index + 1}
        <select aria-label={`Piece ${index + 1} decision for ${period.id}`} value={piece.status} onChange={(event) => onChange({ segment_id: period.id, pieces: pieces.map((p, i) => i === index ? { ...p, status: event.target.value as "approved" | "denied" } : p) })}>
          <option value="approved">{cancellation ? "Cancel leave" : "Approve"}</option><option value="denied">{cancellation ? "Keep leave" : "Deny"}</option>
        </select>
      </label> : null}
      {splitIndex === null ? <button type="button" disabled={pieces.length >= 32 || Date.parse(piece.ends_at) - Date.parse(piece.starts_at) <= 1000} onClick={() => beginSplit(index)}>Split {decision.pieces ? `piece ${index + 1}` : "period"}</button> : null}
    </div>)}
    {!splittable ? <small>Earlier request: the original time-zone snapshot is unavailable. Review the entire period or ask for a new hourly request.</small> : null}
    {splitIndex !== null ? <div className="time-off-split-fields">
      <label>Split date<input ref={splitDateInput} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Split time<AvailabilityClockInput value={clock} timeFormat={timeFormat} label="Split time" onChange={setClock} /></label>
      <label>Repeated time<select value={fold} onChange={(event) => setFold(event.target.value as typeof fold)}>
        <option value="">Ask if this clock repeats</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option>
      </select></label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={split}>Apply split</button><button type="button" onClick={() => { setSplitIndex(null); onEditing(false); }}>Cancel split</button>
    </div> : null}
  </fieldset>;
}
