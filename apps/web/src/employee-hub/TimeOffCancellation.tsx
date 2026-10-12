import { useEffect, useRef, useState } from "react";
import type { EmployeeHubReadModel } from "@newfork/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isStaleTimeOff, requestTimeOffCancellation } from "../schedule/requests-data";
import { formatTimeOffInstant } from "./time-off-split";
import { timeOffNavigationLabels, useAvailabilityNavigationGuard } from "../availability/availability-navigation";
import { cancellationSelectionError, TimeOffCancellationHours, type CancellationChoice } from "./TimeOffCancellationHours";
import "./time-off.css";

type Request = EmployeeHubReadModel["requests"][number];
export function TimeOffCancellation({ request, workspaceId, timeFormat, onChanged, onDraftChange }: {
  request: Request; workspaceId: string; timeFormat: "12h" | "24h"; onChanged: () => void; onDraftChange?: (active:boolean) => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<{ workspace: string; request: string; revision: number; periods: CancellationChoice[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const noticeRevision = useRef<number | null>(null);
  const launchButton = useRef<HTMLButtonElement>(null);
  const formTitle = useRef<HTMLLegendElement>(null);
  const returnToLaunch = useRef(false);
  const formOpen = Boolean(draft);
  useEffect(() => {
    if (formOpen) formTitle.current?.focus();
    else if (returnToLaunch.current) launchButton.current?.focus();
    returnToLaunch.current = false;
  }, [formOpen]);
  const retry = useRef({ signature: "", key: crypto.randomUUID() });
  const stale = Boolean(draft && (draft.workspace !== workspaceId || draft.request !== request.id || draft.revision !== request.revision || !request.cancellation?.can_request));
  const choices = draft?.periods.filter(period => selected.includes(period.key)) ?? [];
  const periods = choices.map(({ segment_id, starts_at, ends_at }) => ({ segment_id, starts_at, ends_at }));
  const signature = JSON.stringify({ workspace: workspaceId, request: request.id, periods, reason, revision: draft?.revision });
  // A lost response may already have committed. Preserve that operation key even
  // when its hours have since started; the server returns its recorded result.
  const selectionError = cancellationSelectionError(choices, retry.current.signature === signature);
  const unfinished = editing.some(key => selected.includes(key));
  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft || stale) throw new Error("The approved leave changed. Review it before requesting cancellation.");
      if (unfinished) throw new Error("Apply or discard your unfinished cancellation hours first.");
      const currentError = cancellationSelectionError(choices, retry.current.signature === signature);
      if (currentError) throw new Error(currentError);
      if (signature !== retry.current.signature) retry.current = { signature, key: crypto.randomUUID() };
      return requestTimeOffCancellation(workspaceId, request.id, {
        expected_revision: draft.revision, operation_id: retry.current.key, periods, reason });
    },
    onSuccess: () => {
      noticeRevision.current = draft?.revision ?? null;
      setDraft(null); setSelected([]); setEditing([]); setReason(""); setNotice("Cancellation requested. Your approved leave stays in effect until a manager accepts the cancellation.");
      void client.invalidateQueries({ queryKey: ["schedule-requests", workspaceId] }); onChanged();
    },
    // BL-1043: the approved leave changed meanwhile (the database's key):
    // reload it, and the form says so in its own words.
    onError: error => { if (isStaleTimeOff(error)) onChanged(); },
  });
  function begin() {
    const periods = request.periods?.flatMap(p => p.time_timezone ? (p.effective_intervals ?? [])
      .filter(span => Date.parse(span.end_at) > Date.now()).map(span => ({ key: crypto.randomUUID(), segment_id: p.id, starts_at: span.start_at, ends_at: span.end_at,
        original_start: span.start_at, original_end: span.end_at, zone: p.time_timezone! })) : []) ?? [];
    setDraft({ workspace: workspaceId, request: request.id, revision: request.revision, periods }); setSelected(periods.filter(p => Date.parse(p.starts_at) > Date.now()).map(p => p.key));
    setEditing([]); setReason(""); setNotice(""); mutation.reset();
  }
  const navigationDialog = useAvailabilityNavigationGuard({
    dirty: Boolean(draft), busy: mutation.isPending, labels: timeOffNavigationLabels,
    onDiscard: () => { setDraft(null); setSelected([]); setEditing([]); setReason(""); mutation.reset(); },
  });
  const draftListener = useRef(onDraftChange);
  draftListener.current = onDraftChange;
  const activeDraft = Boolean(draft) || mutation.isPending;
  useEffect(() => { draftListener.current?.(activeDraft); }, [activeDraft]);
  useEffect(() => () => draftListener.current?.(false), []);
  return <div className="time-off-cancellation">
    {navigationDialog}
    {request.cancellation?.pending_request_id ? <p>Cancellation awaiting manager review. Approved leave remains in effect.</p> : null}
    {notice && noticeRevision.current === request.revision ? <p role="status">{notice}</p> : null}
    {!draft && request.cancellation?.can_request ? <button ref={launchButton} type="button" className="text-button" onClick={begin}>Request leave cancellation</button> : null}
    {draft ? <form onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
      <fieldset disabled={mutation.isPending}>
        <legend ref={formTitle} tabIndex={-1}>Cancel approved leave</legend>
        <p>Select the future approved hours you want to cancel. You can shorten a period or add separate hours within its approved bounds. Leave remains approved until a manager decides. Previously released shifts will not be reassigned automatically.</p>
        <p>A manager must approve cancellation before the selected hours start. For leave already in progress, choose a future start; hours already taken stay recorded.</p>
        {!draft.periods.length ? <p>No future approved hours remain. Refresh the request to see its current status.</p> : null}
        {draft.periods.map((period, i) => <div className="time-off-cancellation-period" key={period.key}>
          <label>
            <input type="checkbox" aria-label={`Cancel period ${i + 1}`} checked={selected.includes(period.key)} onChange={event => setSelected(current => event.target.checked ? [...current, period.key] : current.filter(key => key !== period.key))} />
            {formatTimeOffInstant(period.starts_at, period.zone, timeFormat)} – {formatTimeOffInstant(period.ends_at, period.zone, timeFormat)}
          </label>
          {Date.parse(period.starts_at) <= Date.now() ? <small>This period has started. Choose future hours before selecting it.</small> : null}
          <TimeOffCancellationHours period={period} index={i} timeFormat={timeFormat}
            onChange={value => setDraft(current => current ? { ...current, periods: current.periods.map(p => p.key === period.key ? value : p) } : current)}
            onEditing={active => setEditing(current => active ? [...new Set([...current, period.key])] : current.filter(key => key !== period.key))} />
          <button type="button" aria-label={`Add another period within approved hours ${i + 1}`} disabled={draft.periods.length >= 124} onClick={() => {
            const added = { ...period, key: crypto.randomUUID(), initialEdit: true };
            setDraft(current => current ? { ...current, periods: [...current.periods, added] } : current);
            setSelected(current => [...current, added.key]); setEditing(current => [...current, added.key]);
          }}>Add another time range</button>
        </div>)}
        <label>Cancellation note<textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {stale ? <p role="alert">The approved leave changed. Close this form and review the current hours before continuing.</p> : null}
        {selectionError ? <p role="alert">{selectionError}</p> : null}
        {unfinished ? <p>Apply or discard the hours being edited before sending.</p> : null}
        {mutation.error && !(stale && isStaleTimeOff(mutation.error)) ? <p role="alert">{mutation.error.message}</p> : null}
        <button type="submit" disabled={stale || Boolean(selectionError) || unfinished}>Send cancellation request</button>
        <button type="button" onClick={() => { returnToLaunch.current = true; setDraft(null); }}>Keep approved leave</button>
      </fieldset>
    </form> : null}
  </div>;
}
