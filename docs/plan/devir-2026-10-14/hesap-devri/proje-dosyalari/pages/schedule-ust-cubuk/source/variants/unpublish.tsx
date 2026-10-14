// Item 8: the Unpublish confirmation. Stands in for
// apps/web/src/schedule/components/UnpublishScheduleDialog: the original or
// one of five prototypes. Every one calls the page's real onConfirm, so
// unpublishing works exactly as in the app.
import type { ScheduleLocation } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { ArrowRight, BellOff, CalendarDays, Check, EyeOff, FileText, Loader2, MessageSquareX, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { UnpublishScheduleDialog as Original } from "../../../src/schedule/components/UnpublishScheduleDialog";
import { useCloseOnEscape } from "../../../src/schedule/lib/useCloseOnEscape";
import { requestErrorText } from "../../../src/lib/request-error";
import { Anchored, plural, useScheduleList } from "./common";
import { useChoice } from "./store";
import "./variants.css";

type Props = ComponentProps<typeof Original>;

export function UnpublishScheduleDialog(props: Props) {
  const choice = useChoice("unpublish");
  if (choice === "original" || !props.open) return <Original {...props} />;
  return <Prototype {...props} variant={choice} />;
}

interface Live {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly shifts: number;
  readonly people: number | null;
}

function Prototype({ weekLabel, locations, statuses = [], isUnpublishing = false, onOpenChange, onConfirm, variant }: Props & { readonly variant: string }) {
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const list = useScheduleList(null);
  const live: Live[] = locations
    .filter((location) => statusById.get(location.id)?.status === "published")
    .map((location: ScheduleLocation) => {
      const status = statusById.get(location.id)!;
      const facts = list?.published?.by_location.find((item) => item.location_id === location.id);
      return {
        id: location.id, name: location.name, color: status.color ?? "var(--theme-swatch-fallback)",
        shifts: status.published_shift_count, people: facts ? facts.employee_count : null,
      };
    });
  // One live location needs no choice; with several, all start chosen.
  const [chosen, setChosen] = useState<string[]>(() => live.map((item) => item.id));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const busy = pending || isUnpublishing;
  const close = () => {
    if (!busy) onOpenChange(false);
  };
  useCloseOnEscape(close);
  useEffect(() => {
    window.setTimeout(() => cancelRef.current?.focus(), 0);
  }, []);
  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const picked = live.filter((item) => chosen.includes(item.id));
  const shiftTotal = picked.reduce((sum, item) => sum + item.shifts, 0);
  const peopleTotal = picked.every((item) => item.people !== null) ? picked.reduce((sum, item) => sum + (item.people ?? 0), 0) : null;
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(chosen);
    } catch (caught) {
      setError(requestErrorText(caught));
    } finally {
      setPending(false);
    }
  };
  const disabled = busy || chosen.length === 0;
  const target = picked.length === 1 ? picked[0]!.name : plural(picked.length, "location");
  const view: View = { weekLabel, live, chosen, toggle, setChosen, picked, shiftTotal, peopleTotal, busy, error, close, cancelRef, target, disabled, confirm };

  if (variant === "v5") return <SmallPopup {...view} />;
  return (
    <div className="schedule-unpublish-layer" role="presentation">
      <button type="button" aria-label="Close unpublish dialog" className="schedule-unpublish-backdrop" onPointerDown={(event) => event.stopPropagation()} onClick={close} />
      {variant === "v1" ? <ShortQuestion {...view} /> : null}
      {variant === "v2" ? <WhoIsAffected {...view} /> : null}
      {variant === "v3" ? <LocationCards {...view} /> : null}
      {variant === "v4" ? <NowAfter {...view} /> : null}
    </div>
  );
}

interface View {
  readonly weekLabel: string;
  readonly live: readonly Live[];
  readonly chosen: readonly string[];
  readonly toggle: (id: string) => void;
  readonly setChosen: (ids: string[]) => void;
  readonly picked: readonly Live[];
  readonly shiftTotal: number;
  readonly peopleTotal: number | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly close: () => void;
  readonly cancelRef: React.RefObject<HTMLButtonElement | null>;
  readonly target: string;
  readonly disabled: boolean;
  readonly confirm: () => Promise<void>;
}

function Buttons({ view, label, full = false }: { readonly view: View; readonly label: string; readonly full?: boolean }) {
  return (
    <div className={`stv-un-buttons${full ? " is-full" : ""}`}>
      <button ref={view.cancelRef} type="button" className="secondary-button stv-btn" disabled={view.busy} onClick={view.close}>Cancel</button>
      <ConfirmButton
        unstyled
        className="stv-btn stv-danger"
        disabled={view.disabled}
        confirmLabel={<><EyeOff size={15} aria-hidden />Click again to unpublish</>}
        confirmName="Confirm unpublish"
        onConfirm={() => void view.confirm()}
      >
        {view.busy ? <Loader2 size={15} className="stv-spin" aria-hidden /> : <EyeOff size={15} aria-hidden />}
        {view.busy ? "Unpublishing…" : label}
      </ConfirmButton>
    </div>
  );
}

function Error({ view }: { readonly view: View }) {
  return view.error ? <p className="stv-un-error" role="alert">{view.error}</p> : null;
}

function Checks({ view, detail }: { readonly view: View; readonly detail: (item: Live) => ReactNode }) {
  if (view.live.length < 2) return null;
  return (
    <div className="stv-un-checks">
      {view.live.map((item) => (
        <label key={item.id}>
          <input type="checkbox" checked={view.chosen.includes(item.id)} disabled={view.busy} onChange={() => view.toggle(item.id)} />
          <i style={{ background: item.color }} aria-hidden />
          <span>{item.name}</span>
          <small>{detail(item)}</small>
        </label>
      ))}
    </div>
  );
}

// ---------- 1 · Short question ----------
function ShortQuestion(view: View) {
  return (
    <section className="stv-un stv-un1" role="dialog" aria-modal="true" aria-labelledby="stv-un-title">
      <h2 id="stv-un-title">Unpublish {view.weekLabel}?</h2>
      <p>Employees stop seeing {view.live.length > 1 ? "the chosen locations'" : "these"} shifts right away. Your draft stays, so you can publish again later.</p>
      <Checks view={view} detail={(item) => plural(item.shifts, "shift")} />
      <Error view={view} />
      <Buttons view={view} label={view.live.length > 1 ? `Unpublish ${view.target}` : "Unpublish"} />
    </section>
  );
}

// ---------- 2 · Who is affected ----------
function WhoIsAffected(view: View) {
  return (
    <section className="stv-un stv-un2" role="dialog" aria-modal="true" aria-labelledby="stv-un-title">
      <header>
        <span className="stv-un-badge"><EyeOff size={18} aria-hidden /></span>
        <div><h2 id="stv-un-title">Unpublish schedule</h2><p className="stv-muted"><CalendarDays size={13} aria-hidden /> {view.weekLabel}</p></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={view.close}><X size={18} aria-hidden /></button>
      </header>
      <div className="stv-un2-impact" aria-live="polite">
        <div><b>{view.peopleTotal ?? "…"}</b><span>{view.peopleTotal === 1 ? "employee loses" : "employees lose"} shifts from their schedule</span></div>
        <div><b>{view.shiftTotal}</b><span>live {view.shiftTotal === 1 ? "shift is" : "shifts are"} taken down</span></div>
      </div>
      <Checks view={view} detail={(item) => `${plural(item.shifts, "shift")}${item.people !== null ? ` · ${plural(item.people, "person", "people")}` : ""}`} />
      <ul className="stv-un-effects">
        <li><Users size={15} aria-hidden />They no longer see these shifts in the app.</li>
        <li><MessageSquareX size={15} aria-hidden />Their open cover and swap requests for these shifts are closed.</li>
        <li><BellOff size={15} aria-hidden />Nobody gets a notification about it.</li>
        <li className="is-good"><FileText size={15} aria-hidden />Your draft is kept. Publish again to bring the shifts back.</li>
      </ul>
      <Error view={view} />
      <footer><Buttons view={view} label={`Unpublish ${view.target}`} /></footer>
    </section>
  );
}

// ---------- 3 · Location cards ----------
function LocationCards(view: View) {
  const all = view.chosen.length === view.live.length;
  return (
    <section className="stv-un stv-un3" role="dialog" aria-modal="true" aria-labelledby="stv-un-title">
      <header>
        <div><h2 id="stv-un-title">Which locations should go back to draft?</h2><p className="stv-muted">{view.weekLabel} · now live for employees</p></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={view.close}><X size={18} aria-hidden /></button>
      </header>
      {view.live.length > 1 ? (
        <button type="button" className="stv-link" disabled={view.busy} onClick={() => view.setChosen(all ? [] : view.live.map((item) => item.id))}>{all ? "Clear all" : "Choose all"}</button>
      ) : null}
      <div className="stv-un3-cards">
        {view.live.map((item) => {
          const on = view.chosen.includes(item.id);
          return (
            <button key={item.id} type="button" role="checkbox" aria-checked={on} disabled={view.busy || view.live.length === 1} className="stv-un3-card" style={{ ["--loc" as string]: item.color }} onClick={() => view.toggle(item.id)}>
              <span className="stv-un3-check" aria-hidden>{on ? <Check size={14} /> : null}</span>
              <strong>{item.name}</strong>
              <small>{plural(item.shifts, "shift")}{item.people !== null ? ` · ${plural(item.people, "person", "people")}` : ""}</small>
              <em>{on ? "Will be hidden from employees" : "Stays live"}</em>
            </button>
          );
        })}
      </div>
      <p className="stv-un3-sum" aria-live="polite">
        {view.picked.length
          ? <>Employees stop seeing <b>{plural(view.shiftTotal, "shift")}</b> at <b>{view.target}</b>. Open cover and swap requests for them close. No notification is sent. Your draft is kept.</>
          : "Choose at least one location."}
      </p>
      <Error view={view} />
      <footer><Buttons view={view} label={`Unpublish ${view.target}`} /></footer>
    </section>
  );
}

// ---------- 4 · Now / after ----------
function NowAfter(view: View) {
  const rows: [string, ReactNode, ReactNode][] = [
    ["Employees see these shifts", <><Check size={14} aria-hidden />Yes</>, <><X size={14} aria-hidden />No, right away</>],
    ["Cover and swap requests", "Open", "Closed"],
    ["Notification to employees", "—", "None is sent"],
    ["Your draft", "Kept", "Kept, publish again any time"],
  ];
  return (
    <section className="stv-un stv-un4" role="dialog" aria-modal="true" aria-labelledby="stv-un-title">
      <header>
        <div><h2 id="stv-un-title">Unpublish schedule</h2><p className="stv-muted">{view.weekLabel}</p></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={view.close}><X size={18} aria-hidden /></button>
      </header>
      {view.live.length > 1 ? (
        <div className="stv-un4-chips" role="group" aria-label="Locations">
          {view.live.map((item) => (
            <button key={item.id} type="button" aria-pressed={view.chosen.includes(item.id)} disabled={view.busy} onClick={() => view.toggle(item.id)}>
              <i style={{ background: item.color }} aria-hidden />{item.name}<small>{item.shifts}</small>
            </button>
          ))}
        </div>
      ) : null}
      <table className="stv-un4-table">
        <thead><tr><th /><th>Now</th><th aria-hidden /><th>After unpublishing</th></tr></thead>
        <tbody>
          {rows.map(([label, now, after], index) => (
            <tr key={label} data-changes={index < 2}><th scope="row">{label}</th><td>{now}</td><td aria-hidden><ArrowRight size={14} /></td><td>{after}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="stv-muted stv-un4-count" aria-live="polite">{view.picked.length ? `${plural(view.shiftTotal, "live shift")} at ${view.target}.` : "Choose at least one location."}</p>
      <Error view={view} />
      <footer><Buttons view={view} label={`Unpublish ${view.target}`} /></footer>
    </section>
  );
}

// ---------- 5 · Small pop-up ----------
function SmallPopup(view: View) {
  const layer = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (layer.current && !layer.current.contains(event.target as Node)) view.close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });
  const anchor = document.querySelector('[data-schedule-top-action-trigger="published"]') ? '[data-schedule-top-action-trigger="published"]' : '[data-schedule-top-action-trigger="new-schedule"]';
  return (
    <Anchored selector={anchor} width={320}>
      <div ref={layer} className="stv-un stv-un5" role="dialog" aria-labelledby="stv-un-title">
        <h2 id="stv-un-title"><EyeOff size={15} aria-hidden />Unpublish {view.weekLabel}</h2>
        <Checks view={view} detail={(item) => String(item.shifts)} />
        <p>Employees stop seeing {plural(view.shiftTotal, "shift")} now. No notification. Draft kept.</p>
        <Error view={view} />
        <Buttons view={view} label="Unpublish" full />
      </div>
    </Anchored>
  );
}
