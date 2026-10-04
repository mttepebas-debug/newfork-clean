import type { ExchangeShift } from "@newfork/shared";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ExchangeDialog } from "../../employee-hub/shift-exchanges/ShiftExchangeHub";
import { ExchangeShiftCard } from "../../employee-hub/shift-exchanges/ExchangeShiftCard";
import "../../employee-hub/shift-exchanges/shift-exchanges.css";
import { CatalogPageHeader } from "../../views/CatalogPageHeader";
import { exchangeShift } from "./fixtures";
import { LabBanner, useVariant, type LabSet, type Variant } from "./lab";

export const s4Set: LabSet = {
  id: "s4",
  title: "Employee: \"You look unavailable. Sure?\"",
  screen: "Employee → Shift Hub → Available → request a cover or an open shift on hours you marked unavailable",
  variants: {
    a: { name: "Bottom sheet", hint: "The Shift Hub's own window (a sheet from the bottom on a phone) asks once, then sends." },
    b: { name: "On the card", hint: "No window: the card opens an amber line under the shift with Yes, request / Cancel." },
    c: { name: "Checkbox", hint: "The card carries a tick box; the request button works only once it is ticked." },
    d: { name: "Second tap", hint: "The first tap turns the button amber and says why; a second tap within 5 seconds sends." },
    e: { name: "Day picture", hint: "The window draws the day: the orange hours you marked and the shift on top, so the overlap is seen, not read." },
  },
};

type Opportunity = {
  readonly key: string;
  readonly shift: ExchangeShift;
  readonly unavailable: { readonly from: number; readonly to: number; readonly words: string } | null;
};

const cover = exchangeShift("cover");
const pickup = exchangeShift("pickup");
const lunch: ExchangeShift = {
  ...cover,
  id: "99999999-9999-4999-8999-999999999993",
  source_id: "99999999-9999-4999-8999-999999999983",
  scheduled_date: "2026-10-22",
  start_time: "11:00",
  end_time: "16:00",
  starts_at: "2026-10-22T15:00:00.000Z",
  ends_at: "2026-10-22T20:00:00.000Z",
  employee_name: "KadıköyGarson3",
  shift_type_name: "Lunch",
};

const opportunities: readonly Opportunity[] = [
  { key: "cover", shift: cover, unavailable: { from: 17, to: 24, words: "Tue, Oct 20 after 5:00 PM" } },
  { key: "pickup", shift: pickup, unavailable: { from: 0, to: 24, words: "Sat, Oct 24, all day" } },
  { key: "lunch", shift: lunch, unavailable: null },
];

const consent = "Your manager will see that you asked anyway.";

export function S4EmployeeConsent() {
  const variant = useVariant(s4Set);
  const [requested, setRequested] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState<string | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const send = (key: string) => {
    setRequested((current) => new Set(current).add(key));
    setAsking(null);
  };
  const asked = opportunities.find((item) => item.key === asking) ?? null;
  return (
    <>
      <LabBanner set={s4Set} variant={variant}>
        <p>
          You are KadıköyGarson2. You marked Tue after 5:00 PM and all of Sat unavailable. Kadıköy · Server matches and you have no
          approved time off, so both shifts are offered to you (M6). Thursday's lunch is a normal request, for comparison. Best at "Telefon 375".
        </p>
      </LabBanner>
      <section className="employee-hub-page" aria-labelledby="employee-hub-title">
        <CatalogPageHeader
          eyebrow="WORK BETTER TOGETHER"
          title="Shift Hub"
          description="Ask for cover, pick up an open shift, or swap with a teammate."
          titleId="employee-hub-title"
        />
        <div className="sx-root">
          <nav className="sx-tabs" aria-label="Shift Hub views">
            <button type="button" aria-current="page">Available</button>
            <button type="button">My requests</button>
            <button type="button">History</button>
          </nav>
          <div className="sx-workbench">
            <div className="sx-list">
              {opportunities.map((item) => (
                <Card
                  key={item.key}
                  variant={variant}
                  item={item}
                  requested={requested.has(item.key)}
                  asking={asking === item.key}
                  ticked={ticked.has(item.key)}
                  onTick={(value) =>
                    setTicked((current) => {
                      const next = new Set(current);
                      if (value) next.add(item.key);
                      else next.delete(item.key);
                      return next;
                    })
                  }
                  onAsk={() => (item.unavailable ? setAsking(item.key) : send(item.key))}
                  onSend={() => send(item.key)}
                  onCancel={() => setAsking(null)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
      {asked?.unavailable && (variant === "a" || variant === "e") ? (
        <ExchangeDialog title="You marked this time unavailable" onClose={() => setAsking(null)}>
          {variant === "e" ? <DayPicture item={asked} /> : <ExchangeShiftCard shift={asked.shift} />}
          <p className="avail-consent-line">{asked.unavailable.words}. {consent}</p>
          <p className="sx-help">Your weekly availability stays as it is.</p>
          <div className="sx-actions avail-consent-dialog-actions">
            <button type="button" className="sx-primary" onClick={() => send(asked.key)}>Request anyway</button>
            <button type="button" onClick={() => setAsking(null)}>Cancel</button>
          </div>
        </ExchangeDialog>
      ) : null}
    </>
  );
}

function Card({ variant, item, requested, asking, ticked, onTick, onAsk, onSend, onCancel }: {
  readonly variant: Variant;
  readonly item: Opportunity;
  readonly requested: boolean;
  readonly asking: boolean;
  readonly ticked: boolean;
  readonly onTick: (value: boolean) => void;
  readonly onAsk: () => void;
  readonly onSend: () => void;
  readonly onCancel: () => void;
}) {
  const { shift, unavailable } = item;
  const armed = variant === "d" && asking;
  // D: the armed button falls back after 5 seconds, like the app's two-tap buttons.
  useEffect(() => {
    if (!armed) return undefined;
    const id = window.setTimeout(onCancel, 5000);
    return () => window.clearTimeout(id);
  }, [armed, onCancel]);
  const label = `Request to ${shift.employee_id ? "cover" : "pick up"}`;
  return (
    <article className="sx-card">
      <div className="sx-card-top">
        <span className="sx-pill">{shift.employee_id ? "Cover" : "Open shift"}</span>
        <span className={unavailable ? "sx-pending" : "sx-eligible"}>
          {unavailable ? <AlertTriangle size={14} /> : <Check size={14} />}
          {unavailable ? "You're unavailable" : "Eligible"}
        </span>
      </div>
      <ExchangeShiftCard shift={shift} />
      <p>{shift.employee_name ? `Cover for ${shift.employee_name}` : "No assigned employee"}</p>
      <p className="sx-help">
        {unavailable ? `You marked ${unavailable.words} unavailable.` : "Job and location match · No assignment blockers"}
      </p>
      {requested ? (
        <>
          <p className="sx-pending">Awaiting manager · Not added to your schedule yet</p>
          <button type="button">View request <ChevronRight size={16} /></button>
        </>
      ) : variant === "b" && asking && unavailable ? (
        <div className="avail-consent-strip" role="group" aria-label="Confirm request">
          <p><AlertTriangle size={15} aria-hidden /> You marked this time unavailable. {consent}</p>
          <div className="sx-actions">
            <button type="button" className="sx-primary" onClick={onSend}>Yes, request</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      ) : variant === "c" && unavailable ? (
        <>
          <label className="avail-consent-check">
            <input type="checkbox" checked={ticked} onChange={(event) => onTick(event.target.checked)} />
            <span>I can work it, even though I marked this time unavailable.</span>
          </label>
          <button type="button" className="sx-primary" disabled={!ticked} onClick={onSend}>{label}</button>
        </>
      ) : variant === "d" && unavailable ? (
        <>
          <button type="button" className={armed ? "sx-primary avail-armed" : "sx-primary"} onClick={armed ? onSend : onAsk}>
            {armed ? "Tap again to request anyway" : label}
          </button>
          {armed ? <p className="sx-pending" role="status">You marked this time unavailable. {consent}</p> : null}
        </>
      ) : (
        <button type="button" className="sx-primary" onClick={onAsk}>{label}</button>
      )}
    </article>
  );
}

const clock = (hour: number) => (hour % 24 === 0 ? "12 AM" : hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`);

// The day from midnight to midnight: marked hours hatched orange, the shift on top.
function DayPicture({ item }: { readonly item: Opportunity }) {
  const { shift } = item;
  const unavailable = item.unavailable!;
  const start = Number(shift.start_time!.slice(0, 2));
  const end = Number(shift.end_time!.slice(0, 2));
  const overlap = Math.min(end, unavailable.to) - Math.max(start, unavailable.from);
  const pct = (hour: number) => `${(hour / 24) * 100}%`;
  return (
    <figure className="avail-day" aria-label={`Unavailable ${clock(unavailable.from)} to ${clock(unavailable.to)}; shift ${clock(start)} to ${clock(end)}`}>
      <figcaption>
        <strong>
          {new Date(`${shift.scheduled_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
        </strong>
        <span>{shift.location_name} · {shift.job_name}</span>
      </figcaption>
      <div className="avail-day-track" aria-hidden>
        <span className="avail-day-unavailable" style={{ left: pct(unavailable.from), width: pct(unavailable.to - unavailable.from) }} />
        <span className="avail-day-shift" style={{ left: pct(start), width: pct(end - start) }}>
          {clock(start)} – {clock(end)}
        </span>
      </div>
      <div className="avail-day-scale" aria-hidden>
        {[0, 6, 12, 18, 24].map((hour) => (
          <span key={hour} style={{ left: pct(hour) }}>{clock(hour)}</span>
        ))}
      </div>
      <p className="avail-day-legend">
        <span className="avail-day-key" data-kind="unavailable" /> You marked unavailable
        <span className="avail-day-key" data-kind="shift" /> The shift · {overlap} of {end - start} hours overlap
      </p>
    </figure>
  );
}
