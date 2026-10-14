// Item 9: "Review default hours". The button in the edit strip, an optional
// notice above the grid, and the window they open. Original = main's button
// and dialog; 1–3 are prototypes on the same real preview/apply calls.
import type { ScheduleDefaultHoursPreview, ScheduleEditSession, ScheduleReadModel } from "@newfork/shared/schedule";
import { ArrowRight, CircleAlert, Clock3, HelpCircle, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { DefaultHoursReviewDialog as Original } from "../../../src/schedule/components/DefaultHoursReviewDialog";
import { applyScheduleDefaultHours, previewScheduleDefaultHours } from "../../../src/schedule/schedule-data";
import { useCloseOnEscape } from "../../../src/schedule/lib/useCloseOnEscape";
import { requestErrorText } from "../../../src/lib/request-error";
import { plural } from "./common";
import { useChoice } from "./store";
import "./variants.css";

type Shift = ScheduleEditSession["shifts"][number];
type Type = ScheduleReadModel["shift_types"][number];

/** Shifts written with a shift type's default hours whose default has changed since. */
export function outdatedShifts(session: ScheduleEditSession, model: ScheduleReadModel): { shift: Shift; type: Type }[] {
  return session.shifts.flatMap((shift) => {
    if (shift.time_basis !== "type_default" || shift.pending_op_type === "delete") return [];
    const type = model.shift_types.find((item) => item.id === shift.shift_type_id);
    const saved = (shift.time_snapshot as { default_revision?: number } | null | undefined)?.default_revision;
    if (!type?.default_revision || !saved || saved >= type.default_revision) return [];
    return [{ shift, type }];
  });
}

function clock(model: ScheduleReadModel, value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":");
  return model.settings.time_format === "24h" ? `${h}:${m}` : `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "PM" : "AM"}`;
}
const span = (model: ScheduleReadModel, start?: string | null, end?: string | null) => `${clock(model, start)} – ${clock(model, end)}`;
const dayName = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function openExplainer(): void {
  window.dispatchEvent(new CustomEvent("st-explain", { detail: "defaultHours" }));
}

// ---------- the button in the edit strip ----------
export function StDefaultHoursButton({ session, model, workspaceId, onOpen, onApplied }: {
  readonly session: ScheduleEditSession | null; readonly model: ScheduleReadModel; readonly workspaceId: string;
  readonly onOpen: () => void; readonly onApplied: (session: ScheduleEditSession) => void;
}) {
  const choice = useChoice("defaultHours");
  const [popover, setPopover] = useState(false);
  const outdated = useMemo(() => (session ? outdatedShifts(session, model) : []), [session, model]);
  if (choice === "original") {
    return <button type="button" onClick={onOpen}>Review default hours</button>;
  }
  if (choice === "v2") return null; // the notice above the grid takes its place
  if (choice === "v1") {
    return (
      <button type="button" className="stv-dh-button" disabled={!outdated.length} title={outdated.length ? undefined : "Every shift already uses the current default hours."} onClick={onOpen}>
        <Clock3 size={15} aria-hidden />New default hours
        {outdated.length ? <span className="stv-dh-badge" aria-label={`${outdated.length} shifts to update`}>{outdated.length}</span> : null}
      </button>
    );
  }
  return (
    <span className="stv-dh-anchor">
      <button type="button" aria-expanded={popover} className="stv-dh-button" onClick={() => setPopover(!popover)}>
        <Clock3 size={15} aria-hidden />Default hours{outdated.length ? <span className="stv-dh-badge">{outdated.length}</span> : null}
      </button>
      {popover && session ? <PerTypePopover session={session} model={model} workspaceId={workspaceId} outdated={outdated} onApplied={onApplied} onClose={() => setPopover(false)} /> : null}
    </span>
  );
}

// ---------- 2 · notice above the grid ----------
export function StDefaultHoursNotice({ session, model, onOpen }: {
  readonly session: ScheduleEditSession; readonly model: ScheduleReadModel; readonly onOpen: () => void;
}) {
  const choice = useChoice("defaultHours");
  const [hidden, setHidden] = useState<string | null>(null);
  const outdated = useMemo(() => outdatedShifts(session, model), [session, model]);
  if (choice !== "v2" || !outdated.length) return null;
  const key = outdated.map((item) => item.shift.id).join();
  if (hidden === key) return null;
  const types = [...new Map(outdated.map((item) => [item.type.id, item.type])).values()];
  const first = types[0]!;
  const old = outdated.find((item) => item.type.id === first.id)!.shift.time_snapshot as { start_time?: string; end_time?: string } | null;
  return (
    <div className="stv-dh-notice" role="status">
      <Clock3 size={16} aria-hidden />
      <p>
        <b>{plural(outdated.length, "shift")}</b> still {outdated.length === 1 ? "uses" : "use"} the old default hours of{" "}
        {types.length === 1 ? <><b>{first.name}</b> ({span(model, old?.start_time, old?.end_time)}). The default is now <b>{span(model, first.default_start_time, first.default_end_time)}</b>.</> : <>{types.map((type) => type.name).join(", ")}.</>}
      </p>
      <button type="button" className="stv-link" onClick={openExplainer}><HelpCircle size={14} aria-hidden />What is this?</button>
      <button type="button" className="nf-button stv-btn" onClick={onOpen}>Review and update</button>
      <button type="button" className="icon-button" aria-label="Not now" title="Not now" onClick={() => setHidden(key)}><X size={16} aria-hidden /></button>
    </div>
  );
}

// ---------- the window (alias of DefaultHoursReviewDialog) ----------
export function DefaultHoursReviewDialog(props: ComponentProps<typeof Original>) {
  const choice = useChoice("defaultHours");
  if (choice === "original" || choice === "v3") return <Original {...props} />;
  return <StyledDialog {...props} />;
}

function useDefaultHours(workspaceId: string, session: ScheduleEditSession, onApplied: (session: ScheduleEditSession) => void) {
  const [pending, setPending] = useState<"review" | "apply" | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const lastDay = () => { const day = new Date(`${session.week_start}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 6); return day.toISOString().slice(0, 10); };
  const command = (ids: readonly string[]) => ({ expected_session_revision: session.revision, starts_on: session.week_start, ends_on: lastDay(), shift_ids: [...ids].sort() });
  const review = async (ids: readonly string[]): Promise<ScheduleDefaultHoursPreview | null> => {
    if (!ids.length) return null;
    setPending("review"); setError("");
    try { return await previewScheduleDefaultHours(workspaceId, session.id, command(ids)); }
    catch (caught) { if (mounted.current) setError(requestErrorText(caught, "Review unavailable")); return null; }
    finally { if (mounted.current) setPending(null); }
  };
  const apply = async (ids: readonly string[]): Promise<boolean> => {
    const fresh = await review(ids);
    if (!fresh || fresh.blocked_count || !fresh.changed_count) return false;
    const confirm = fresh.shifts.some((s) => s.can_apply && s.after_assessment?.operation === "warning_requires_override"
      && s.after_assessment.warning_policy === "confirm" && !s.after_assessment.override_recorded);
    setPending("apply"); setError("");
    try {
      const result = await applyScheduleDefaultHours(workspaceId, session.id, { ...command(ids), fingerprint: fresh.fingerprint, confirm_availability: confirm, idempotency_key: crypto.randomUUID() });
      if (mounted.current) onApplied(result);
      return true;
    } catch (caught) { if (mounted.current) setError(requestErrorText(caught, "Unable to apply defaults")); return false; }
    finally { if (mounted.current) setPending(null); }
  };
  return { pending, error, review, apply };
}

function StyledDialog({ workspaceId, session, model, onClose, onApplied }: ComponentProps<typeof Original>) {
  const outdated = useMemo(() => outdatedShifts(session, model), [session, model]);
  const [chosen, setChosen] = useState(() => new Set(outdated.map((item) => item.shift.id)));
  const [preview, setPreview] = useState<ScheduleDefaultHoursPreview | null>(null);
  const tool = useDefaultHours(workspaceId, session, onApplied);
  useCloseOnEscape(tool.pending ? () => undefined : onClose);
  useEffect(() => {
    void tool.review(outdated.map((item) => item.shift.id)).then(setPreview);
    // Runs once: the review of every outdated shift when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const byId = new Map(preview?.shifts.map((item) => [item.shift_id, item]) ?? []);
  const groups = [...new Map(outdated.map((item) => [item.type.id, item.type])).values()].map((type) => ({ type, items: outdated.filter((item) => item.type.id === type.id) }));
  const employee = (id: string | null) => model.employees.find((item) => item.id === id)?.display_name ?? "Open shift";
  const location = (id: string) => model.locations.find((item) => item.id === id)?.name ?? "Location";
  const ids = outdated.filter((item) => chosen.has(item.shift.id)).map((item) => item.shift.id);
  return createPortal(
    <div className="schedule-unpublish-layer" role="presentation">
      <button type="button" className="schedule-unpublish-backdrop" aria-label="Close default hours review" disabled={Boolean(tool.pending)} onClick={onClose} />
      <section className="stv-panel stv-dh" role="dialog" aria-modal="true" aria-labelledby="stv-dh-title">
        <header>
          <div>
            <h2 id="stv-dh-title">Use the new default hours?</h2>
            <p className="stv-muted">Shifts you scheduled with only a shift type keep the hours that type had at the time. These types have new default hours since.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" disabled={Boolean(tool.pending)} onClick={onClose}><X size={18} aria-hidden /></button>
        </header>
        <div className="stv-dh-body">
          {!outdated.length ? <p className="stv-dh-empty">Every shift in this week already uses the current default hours. Nothing to update.</p> : null}
          {groups.map(({ type, items }) => {
            const saved = items[0]!.shift.time_snapshot as { start_time?: string; end_time?: string } | null;
            const all = items.every((item) => chosen.has(item.shift.id));
            return (
              <section key={type.id} className="stv-dh-group">
                <header>
                  <label><input type="checkbox" checked={all} disabled={Boolean(tool.pending)} onChange={() => setChosen((current) => { const next = new Set(current); items.forEach((item) => (all ? next.delete(item.shift.id) : next.add(item.shift.id))); return next; })} />
                    <i style={{ background: type.color ?? "var(--theme-swatch-fallback)" }} aria-hidden /><b>{type.name}</b></label>
                  <span className="stv-dh-change"><s>{span(model, saved?.start_time, saved?.end_time)}</s><ArrowRight size={13} aria-hidden /><b>{span(model, type.default_start_time, type.default_end_time)}</b></span>
                </header>
                <ul>
                  {items.map(({ shift }) => {
                    const row = byId.get(shift.id);
                    const warn = row?.after_assessment?.reasons?.[0]?.message ?? (row && !row.can_apply ? row.reason : null);
                    return (
                      <li key={shift.id}>
                        <label>
                          <input type="checkbox" checked={chosen.has(shift.id)} disabled={Boolean(tool.pending)} onChange={(event) => setChosen((current) => { const next = new Set(current); if (event.target.checked) next.add(shift.id); else next.delete(shift.id); return next; })} />
                          <span>{dayName(shift.scheduled_date)}</span><b>{employee(shift.employee_id)}</b><small>{location(shift.location_id)}</small>
                        </label>
                        {warn ? <p className="stv-dh-warn"><CircleAlert size={13} aria-hidden />{warn}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {tool.error ? <p className="stv-un-error" role="alert">{tool.error}</p> : null}
        </div>
        <footer>
          <button type="button" className="stv-link" onClick={openExplainer}><HelpCircle size={14} aria-hidden />How does this work?</button>
          <span className="stv-grow" />
          <button type="button" className="secondary-button stv-btn" disabled={Boolean(tool.pending)} onClick={onClose}>Cancel</button>
          <button type="button" className="nf-button stv-btn" disabled={!ids.length || Boolean(tool.pending)} onClick={() => void tool.apply(ids).then((ok) => ok && onClose())}>
            {tool.pending ? <Loader2 size={14} className="stv-spin" aria-hidden /> : null}
            {tool.pending === "apply" ? "Updating…" : `Update ${plural(ids.length, "shift")}`}
          </button>
        </footer>
        <p className="stv-dh-note">Changes go into this edit. Employees see them after you publish.</p>
      </section>
    </div>,
    document.body,
  );
}

// ---------- 3 · per shift type pop-over ----------
function PerTypePopover({ session, model, workspaceId, outdated, onApplied, onClose }: {
  readonly session: ScheduleEditSession; readonly model: ScheduleReadModel; readonly workspaceId: string;
  readonly outdated: { shift: Shift; type: Type }[]; readonly onApplied: (session: ScheduleEditSession) => void; readonly onClose: () => void;
}) {
  const tool = useDefaultHours(workspaceId, session, onApplied);
  const layer = useRef<HTMLDivElement | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);
  useCloseOnEscape(onClose);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (layer.current && !layer.current.parentElement?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const groups = [...new Map(outdated.map((item) => [item.type.id, item.type])).values()].map((type) => ({ type, items: outdated.filter((item) => item.type.id === type.id) }));
  const typesWithDefaults = model.shift_types.filter((type) => type.default_start_time && !groups.some((group) => group.type.id === type.id));
  return (
    <div ref={layer} className="stv-panel stv-dh3" role="dialog" aria-label="Default hours">
      <header><b>Default hours</b><button type="button" className="stv-link" onClick={openExplainer}><HelpCircle size={14} aria-hidden />What is this?</button></header>
      {groups.map(({ type, items }) => {
        const saved = items[0]!.shift.time_snapshot as { start_time?: string; end_time?: string } | null;
        return (
          <div key={type.id} className="stv-dh3-row">
            <i style={{ background: type.color ?? "var(--theme-swatch-fallback)" }} aria-hidden />
            <span><b>{type.name}</b><small><s>{span(model, saved?.start_time, saved?.end_time)}</s> → {span(model, type.default_start_time, type.default_end_time)}</small></span>
            <button type="button" className="nf-button stv-btn" disabled={Boolean(tool.pending)} onClick={() => { setBusyType(type.id); void tool.apply(items.map((item) => item.shift.id)).finally(() => setBusyType(null)); }}>
              {busyType === type.id ? <Loader2 size={13} className="stv-spin" aria-hidden /> : null}Update {items.length}
            </button>
          </div>
        );
      })}
      {typesWithDefaults.map((type) => (
        <div key={type.id} className="stv-dh3-row is-ok">
          <i style={{ background: type.color ?? "var(--theme-swatch-fallback)" }} aria-hidden />
          <span><b>{type.name}</b><small>{span(model, type.default_start_time, type.default_end_time)}</small></span>
          <em>Up to date</em>
        </div>
      ))}
      {tool.error ? <p className="stv-un-error" role="alert">{tool.error}</p> : null}
      <p className="stv-dh-note">Updates go into this edit. Employees see them after you publish.</p>
    </div>
  );
}
