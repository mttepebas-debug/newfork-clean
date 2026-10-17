import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Scissors } from "lucide-react";
import type { TimeOffRequest } from "@newfork/shared";
import { isStaleTimeOff, shortenTimeOff, timeOffKeys } from "../schedule/requests-data";
import { formatTimeOffInstant } from "../employee-hub/time-off-split";
import {
  cancellationSelectionError,
  TimeOffCancellationHours,
  type CancellationChoice,
} from "../employee-hub/TimeOffCancellationHours";
import "../employee-hub/time-off.css";
import { FieldNote } from "../shell/FieldNote";

/**
 * BL-127: Requests → Time off → an approved request → Shorten time off. The
 * manager gives back hours of the leave (e.g. to put Ali on Saturday's
 * 10:00–2:00 shift); it takes effect at once. Same hour picker as the
 * employee's cancellation.
 */
export function TimeOffShorten({ request, workspaceId, timeFormat, onDone }: {
  request: TimeOffRequest; workspaceId: string; timeFormat: "12h" | "24h"; onDone: (message: string) => void;
}) {
  const client = useQueryClient();
  const [periods, setPeriods] = useState<CancellationChoice[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const retry = useRef({ signature: "", key: crypto.randomUUID() });
  const choices = periods?.filter(period => selected.includes(period.key)) ?? [];
  const chosen = choices.map(({ segment_id, starts_at, ends_at }) => ({ segment_id, starts_at, ends_at }));
  const signature = JSON.stringify({ chosen, note, revision: request.revision });
  const selectionError = cancellationSelectionError(choices, retry.current.signature === signature);
  const unfinished = editing.some(key => selected.includes(key));
  const mutation = useMutation({
    mutationFn: async () => {
      if (signature !== retry.current.signature) retry.current = { signature, key: crypto.randomUUID() };
      return shortenTimeOff(workspaceId, request.id, {
        expected_revision: request.revision, periods: chosen, note, operation_id: retry.current.key,
      });
    },
    onSuccess: () => {
      setPeriods(null);
      onDone(`${request.employee_name}'s time off is shorter.`);
    },
    // BL-1043: the leave changed meanwhile (the database's key): reload it.
    onError: (error) => {
      if (isStaleTimeOff(error)) void client.invalidateQueries({ queryKey: timeOffKeys.requests(workspaceId) });
    },
  });
  function begin() {
    const open = request.segments.flatMap(p => p.time_timezone ? (p.effective_intervals ?? [])
      .filter(span => Date.parse(span.end_at) > Date.now()).map(span => ({ key: crypto.randomUUID(), segment_id: p.id,
        starts_at: span.start_at, ends_at: span.end_at, original_start: span.start_at, original_end: span.end_at, zone: p.time_timezone! })) : []);
    setPeriods(open); setSelected([]); setEditing([]); setNote(""); mutation.reset();
  }
  if (!periods)
    return <button type="button" className="nf-button secondary" onClick={begin}><Scissors size={16} /> Shorten time off</button>;
  return <form className="time-off-cancellation" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
    <fieldset disabled={mutation.isPending}>
      <legend>Shorten {request.employee_name}'s time off</legend>
      <p>Choose the approved hours to give back, then add {request.employee_name} to the schedule for them. This takes effect now.</p>
      {!periods.length ? <p>No future approved hours remain.</p> : null}
      {periods.map((period, i) => <div className="time-off-cancellation-period" key={period.key}>
        <label>
          <input type="checkbox" aria-label={`Give back period ${i + 1}`} checked={selected.includes(period.key)}
            onChange={event => setSelected(current => event.target.checked ? [...current, period.key] : current.filter(key => key !== period.key))} />
          {formatTimeOffInstant(period.starts_at, period.zone, timeFormat)} – {formatTimeOffInstant(period.ends_at, period.zone, timeFormat)}
        </label>
        <TimeOffCancellationHours period={period} index={i} timeFormat={timeFormat} heading="Hours to give back"
          onChange={value => setPeriods(current => current?.map(p => p.key === period.key ? value : p) ?? current)}
          onEditing={active => setEditing(current => active ? [...new Set([...current, period.key])] : current.filter(key => key !== period.key))} />
      </div>)}
      <label>Note for {request.employee_name}<textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
      {/* Why it can't be sent, in one kept place above the buttons (UI-FIELDMSG). */}
      <FieldNote
        id={`time-off-shorten-${request.id}`}
        lines={2}
        help={unfinished ? "Apply or discard the hours being edited first." : null}
        error={
          (choices.length && selectionError) ||
          (mutation.error
            ? isStaleTimeOff(mutation.error) ? "This request changed. Review it again." : mutation.error.message
            : null)
        }
      />
      <button type="submit" disabled={!choices.length || Boolean(selectionError) || unfinished}>Give back these hours</button>
      <button type="button" onClick={() => setPeriods(null)}>Keep time off</button>
    </fieldset>
  </form>;
}
