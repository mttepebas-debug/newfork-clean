import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { scheduleDefaultHoursInputSchema, type ScheduleDefaultHoursPreview, type ScheduleEditSession, type ScheduleReadModel } from "@newfork/shared/schedule";
import { applyScheduleDefaultHours, previewScheduleDefaultHours } from "../schedule-data";
import "./default-hours-review.css";
import { requestErrorText } from "../../lib/request-error";
import { scheduleRefusalReason } from "../lib/scheduleRefusalReason";
import { FieldNote } from "../../shell/FieldNote";
import { zoneName } from "../../lib/today";

export function DefaultHoursReviewDialog({ workspaceId, session, model, initialSelectedIds = [], onClose, onApplied }: {
  workspaceId: string; session: ScheduleEditSession; model: ScheduleReadModel; initialSelectedIds?: readonly string[];
  onClose: () => void; onApplied: (session: ScheduleEditSession) => void;
}) {
  const [start, setStart] = useState(session.week_start);
  const lastDay = new Date(`${session.week_start}T12:00:00Z`); lastDay.setUTCDate(lastDay.getUTCDate() + 6);
  const [end, setEnd] = useState(lastDay.toISOString().slice(0, 10));
  const [typeId, setTypeId] = useState("");
  const [chosen, setChosen] = useState(() => new Set(initialSelectedIds.length ? initialSelectedIds : session.shifts.filter(s => s.time_basis === "type_default").map(s => s.id)));
  const [review, setReview] = useState<ScheduleDefaultHoursPreview | null>(null);
  const [reviewedSignature, setReviewedSignature] = useState("");
  const [pending, setPending] = useState<"review" | "apply" | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const candidates = session.shifts.filter(s => s.time_basis === "type_default" && s.pending_op_type !== "delete" && s.scheduled_date >= start && s.scheduled_date <= end && (!typeId || s.shift_type_id === typeId));
  const ids = candidates.filter(s => chosen.has(s.id)).map(s => s.id).sort();
  const parsed = scheduleDefaultHoursInputSchema.safeParse({ expected_session_revision: session.revision, starts_on: start, ends_on: end, shift_ids: ids });
  const command = parsed.success ? parsed.data : null;
  const signature = JSON.stringify(command);
  const currentSignature = useRef(signature); currentSignature.current = signature;
  const fresh = Boolean(review && reviewedSignature === signature);
  const needsAvailabilityConfirmation = Boolean(review?.shifts.some(s => s.can_apply
    && s.after_assessment?.operation === "warning_requires_override"
    && s.after_assessment.warning_policy === "confirm" && !s.after_assessment.override_recorded));
  useEffect(() => { if (pending) dialog.current?.focus(); }, [pending]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => { mounted.current = false; if (previous?.isConnected) previous.focus(); };
  }, []);
  const load = async () => {
    if (!command || pending) return;
    setPending("review"); setError("");
    try {
      const result = await previewScheduleDefaultHours(workspaceId, session.id, command);
      if (mounted.current && signature === currentSignature.current) { setReview(result); setReviewedSignature(signature); }
    } catch (caught) { if (mounted.current) { setReviewedSignature(""); setError(requestErrorText(caught, "Review unavailable")); } }
    finally { if (mounted.current) setPending(null); }
  };
  const apply = async () => {
    if (!command || !review || !fresh || pending || review.blocked_count || !review.changed_count) return;
    const values = { ...command, fingerprint: review.fingerprint,
      confirm_availability: needsAvailabilityConfirmation };
    const keySignature = JSON.stringify(values);
    if (retry.current?.signature !== keySignature) retry.current = { signature: keySignature, key: crypto.randomUUID() };
    setPending("apply"); setError("");
    try {
      const result = await applyScheduleDefaultHours(workspaceId, session.id, { ...values, idempotency_key: retry.current.key });
      if (mounted.current) { onApplied(result); onClose(); }
    } catch (caught) {
      if (!mounted.current) return;
      // BL-1044: defaults, shifts or conflicts moved on since the review; the
      // review goes out of date (its own line says so) instead of a raw sentence.
      if (scheduleRefusalReason(caught) === "schedule.default_hours_stale") setReviewedSignature("");
      else setError(requestErrorText(caught, "Unable to apply defaults"));
    }
    finally { if (mounted.current) setPending(null); }
  };
  const hours = (s: ScheduleDefaultHoursPreview["shifts"][number]["before"]) => {
    const clock = (value: string) => {
      const [h, m] = value.split(":");
      return model.settings.time_format === "24h" ? `${h}:${m}` : `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "PM" : "AM"}`;
    };
    return `${clock(s.start_time)} – ${clock(s.end_time)}${s.end_time < s.start_time ? " (next day)" : ""} · ${zoneName(s.time_timezone)}`;
  };
  return <div className="schedule-dialog-layer">
    <button type="button" className="schedule-dialog-backdrop" aria-label="Close default hours review" disabled={Boolean(pending)} onClick={onClose} />
    <section ref={dialog} tabIndex={-1} className="schedule-dialog schedule-default-hours-dialog" role="dialog" aria-modal="true" aria-labelledby="default-hours-title" onCopy={event => event.stopPropagation()} onPaste={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.stopPropagation(); if (!pending) onClose(); }
      if (event.key === "Tab") {
        const fields = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') ?? []);
        if (!fields.length) { event.preventDefault(); dialog.current?.focus(); return; }
        if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
      }
    }}>
      <header><h2 id="default-hours-title">Review current default hours</h2><button ref={closeButton} type="button" disabled={Boolean(pending)} onClick={onClose}>Close</button></header>
      <div className="schedule-tool-dialog">
        <p>Update future name-only shifts in this edit week. Explicit hours stay unchanged. Applied changes remain in the edit session; save and publish the schedule to change employees' published shifts.</p>
        <fieldset disabled={Boolean(pending)}><legend>Choose dates and shifts</legend>
          <div className="default-hours-filters">
            <label>From<input type="date" min={session.week_start} max={lastDay.toISOString().slice(0, 10)} value={start} onChange={e => setStart(e.target.value)} /></label>
            <label>Through<input type="date" min={start} max={lastDay.toISOString().slice(0, 10)} value={end} onChange={e => setEnd(e.target.value)} /></label>
            <label>Shift type<select value={typeId} onChange={e => setTypeId(e.target.value)}><option value="">All shift types</option>{model.shift_types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          </div>
          <div className="default-hours-selection">{candidates.map(s => <label key={s.id}><input type="checkbox" checked={chosen.has(s.id)} onChange={e => setChosen(current => { const next = new Set(current); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next; })} />
            {s.scheduled_date} · {shiftTypeName(model, s.shift_type_id)} · {model.employees.find(e => e.id === s.employee_id)?.display_name ?? "Open shift"} · {model.locations.find(l => l.id === s.location_id)?.name ?? "Location"}</label>)}</div>
        </fieldset>
        {!candidates.length ? <p>No saved reference-hour shifts in this range.</p> : null}
        {candidates.length && !command ? <p>{ids.length ? "Check the dates and shifts selected." : "Choose at least one shift to review."}</p> : null}
        <button type="button" disabled={!command || Boolean(pending)} onClick={() => void load()}>{pending === "review" ? "Reviewing…" : `Review ${ids.length} shift${ids.length === 1 ? "" : "s"}`}</button>
        {/* Under the button only while there is an error, said whole (UI-FIELDMSG-2). */}
        <FieldNote id="default-hours-review" error={error} />
        {review ? <section aria-label="Default hours comparison" aria-live="polite">
          <p>Review for {review.starts_on} through {review.ends_on}: {review.changed_count} change{review.changed_count === 1 ? "" : "s"}, {review.blocked_count} blocked.</p>
          {!fresh ? <p role="status">This review is out of date. Review the selected shifts again before applying.</p> : null}
          {review.shifts.map(s => <article className="default-hours-result" key={s.shift_id}>
            <h3>{s.scheduled_date} · {s.employee_name} · {s.shift_type_name}</h3><p>{s.location_name}</p>
            <dl><dt>Saved reference hours</dt><dd>{hours(s.before)}</dd>{s.after ? <><dt>Current defaults</dt><dd>{hours(s.after)}</dd></> : null}
              {s.before_assessment ? <><dt>Availability before</dt><dd>{s.before_assessment.coverage}</dd><dt>Availability after</dt><dd>{s.after_assessment?.coverage}</dd></> : null}
              <dt>Overlapping assignments</dt><dd>{s.before_overlap_count} before → {s.after_overlap_count} after</dd></dl>
            {s.reason ? <p className={s.can_apply ? undefined : "default-hours-problem"}>{s.can_apply ? null : <CircleAlert size={15} aria-hidden />}{s.reason}</p> : null}
            {s.after_assessment?.reasons.map((r, i) => <p key={i}>{r.message}</p>)}
          </article>)}
          <button type="button" disabled={!fresh || Boolean(pending) || !review.changed_count || Boolean(review.blocked_count)} onClick={() => void apply()}>{pending === "apply" ? "Applying…" : `${needsAvailabilityConfirmation ? "Confirm conflicts and apply" : "Apply"} ${review.changed_count} change${review.changed_count === 1 ? "" : "s"} to edit session`}</button>
        </section> : null}
      </div>
    </section>
  </div>;
}

// A type archived since keeps its name, marked so (BL-499).
function shiftTypeName(model: ScheduleReadModel, shiftTypeId: string | null): string {
  const active = model.shift_types.find(type => type.id === shiftTypeId);
  if (active) return active.name;
  const archived = model.referenced_shift_types?.find(type => type.id === shiftTypeId);
  return archived ? `${archived.name} (archived)` : "No shift type";
}
