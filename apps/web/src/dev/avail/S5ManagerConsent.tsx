import { useToast } from "@newfork/ui";
import { AlertTriangle, ArrowLeftRight, Clock, Clock3, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ExchangeDialog } from "../../employee-hub/shift-exchanges/ShiftExchangeHub";
import { ExchangeShiftCard } from "../../employee-hub/shift-exchanges/ExchangeShiftCard";
import "../../employee-hub/shift-exchanges/shift-exchanges.css";
import { CatalogDrawer } from "../../settings/CatalogDrawer";
import "../../settings/jobs-settings.css";
import { CatalogPageHeader } from "../../views/CatalogPageHeader";
import "../../views/requests-catalog.css";
import { exchangeShift } from "./fixtures";
import { LabBanner, useVariant, type LabSet, type Variant } from "./lab";

export const s5Set: LabSet = {
  id: "s5",
  title: "Manager: \"Unavailable, asked anyway\"",
  screen: "Schedule → Requests → Shift changes → open a cover request → review a candidate",
  variants: {
    a: { name: "Status pill", hint: "The candidate's pill says it instead of \"Eligible\": one amber phrase in the list, one line in the review." },
    b: { name: "Review line", hint: "The pill stays \"Eligible\"; the review part says it in the amber line the app already uses for time off given up." },
    c: { name: "Orange \"!\"", hint: "The Schedule's orange \"!\" next to the name; it opens the chosen bubble (tinted header) with the hours." },
    d: { name: "Hours side by side", hint: "The review draws the shift over the hours the person marked, so the overlap is visible." },
    e: { name: "Their words", hint: "The person's consent is shown as a dated statement, again in the final confirmation." },
  },
};

const shift = exchangeShift("cover");
const asked = { name: "KadıköyGarson2", hours: "Tue, Oct 20 after 5:00 PM", short: "after 5:00 PM", at: "Oct 3, 3:12 PM", from: 17, to: 24 };
const other = { name: "KadıköyGarson3", at: "Oct 3, 4:40 PM" };
const clock = (hour: number) => (hour % 24 === 0 ? "12 AM" : hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`);

export function S5ManagerConsent() {
  const variant = useVariant(s5Set);
  const [open, setOpen] = useState(true);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tip, setTip] = useState(false);
  const toast = useToast();
  const reviewing = candidate === asked.name;
  const review = useRef<HTMLElement>(null);
  // Like the real Review button: the decision part comes into view.
  useEffect(() => {
    if (candidate) review.current?.scrollIntoView({ block: "start" });
  }, [candidate]);
  return (
    <>
      <LabBanner set={s5Set} variant={variant}>
        <p>
          You are KadıköyMüdür1. KadıköyGarson1 asked for cover on Tue, Oct 20, 4:00 – 11:00 PM. KadıköyGarson2 marked Tue after 5:00 PM
          unavailable and asked anyway; KadıköyGarson3 is free. Press <b>Review</b> on KadıköyGarson2, then Approve.{" "}
          {open ? null : <button type="button" onClick={() => setOpen(true)}>Open the request again</button>}
        </p>
      </LabBanner>
      <section className="settings-page jobs-settings-page requests-catalog-page requests-page requests-shift-hub" aria-labelledby="requests-title">
        <CatalogPageHeader
          eyebrow="TEAM CHANGES. REVIEWED WITH CONTROL."
          title="Requests"
          titleId="requests-title"
          description="Review time off and shift change requests in one place."
          action={
            <div className="requests-tabs" role="tablist" aria-label="Request type">
              <button type="button" role="tab" aria-selected={false}>Time off <strong>0</strong></button>
              <button type="button" role="tab" aria-selected className="active">Shift changes</button>
            </div>
          }
        />
        <div className="sx-root request-catalog-shift-hub">
          <div className="sx-heading">
            <div>
              <p className="sx-eyebrow">TEAM SCHEDULE</p>
              <h2>Shift changes</h2>
              <p>1 case ready for a decision · Every transfer needs your final approval.</p>
            </div>
          </div>
          <nav className="sx-tabs" aria-label="Shift change queues">
            <button type="button" aria-current="page">Ready for review<span>1</span></button>
            <button type="button">Finding cover</button>
            <button type="button">Awaiting response</button>
            <button type="button">History</button>
          </nav>
          <div className="sx-workbench sx-manager">
            <div className="sx-list job-catalog">
              <div className="job-column-headings request-catalog-row">
                <span>Employee / request</span>
                <span>Shift</span>
                <span className="request-location-column">Location / job</span>
                <span>Status</span>
                <span className="request-impact-column">Candidates</span>
              </div>
              <button type="button" className="job-catalog-row request-catalog-row request-catalog-button" onClick={() => setOpen(true)}>
                <span className="job-row-identity">
                  <span className="request-catalog-marker"><ArrowLeftRight size={16} /></span>
                  <span className="job-name-stack">
                    <span className="job-row-name">KadıköyGarson1</span>
                    <small>Cover request</small>
                  </span>
                </span>
                <span className="request-catalog-meta">2026-10-20<br />16:00 – 23:00</span>
                <span className="request-catalog-meta request-location-column">Kadıköy<br />Server</span>
                <span className="request-status">Awaiting manager</span>
                <span className="request-catalog-meta request-impact-column">2</span>
              </button>
            </div>
          </div>
        </div>
      </section>
      {open ? (
        <CatalogDrawer label="Review shift change" className="requests-catalog-page requests-exchange-drawer sx-root" onClose={() => setOpen(false)}>
          <div className="job-catalog-editor">
            <div className="job-editor-title">
              <div>
                <h2>Shift change</h2>
                <p>Review assignments, candidates, and the proposed change.</p>
              </div>
              <button type="button" className="job-icon-button" aria-label="Close shift request" onClick={() => setOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="catalog-drawer-body">
              <aside className="sx-detail" aria-label="Request details">
                <div className="sx-detail-heading">
                  <h3>Cover request</h3>
                  <span className="sx-pill">Awaiting manager</span>
                </div>
                <div className="sx-responsibility">
                  <ShieldCheck size={21} aria-hidden />
                  <div>
                    <strong>Current owner: KadıköyGarson1</strong>
                    <p>Responsibility changes only after final manager approval.</p>
                  </div>
                </div>
                <ExchangeShiftCard shift={shift} assignment={{ published: true, employeeId: null }} />
                <p className="sx-help"><Clock3 size={14} /> Decision needed before Oct 20, 12:00 PM · America/New_York</p>
                <section className="sx-candidates">
                  <h4>2 active candidates</h4>
                  <p className="sx-help">Select a candidate to check eligibility and review the change.</p>
                  <Candidate
                    variant={variant}
                    name={asked.name}
                    at={asked.at}
                    consent
                    selected={reviewing}
                    tipOpen={tip}
                    onTip={setTip}
                    onReview={() => setCandidate(asked.name)}
                  />
                  <Candidate variant={variant} name={other.name} at={other.at} selected={candidate === other.name} onReview={() => setCandidate(other.name)} />
                </section>
                {candidate ? (
                  <section ref={review} className="sx-preview" aria-labelledby="avail-review-title">
                    <p className="sx-eyebrow">IF APPROVED</p>
                    <h4 id="avail-review-title">KadıköyGarson1 → {candidate}</h4>
                    <p>Same time, location and position.</p>
                    <p>1 other application will close as “Another teammate selected”.</p>
                    {reviewing ? <ReviewConsent variant={variant} /> : null}
                    <div className="sx-actions">
                      <button type="button" className="sx-primary" onClick={() => setConfirming(true)}>Approve transfer to {candidate}</button>
                      <button type="button" onClick={() => toast.info(`Declines only ${candidate}'s application (unchanged).`)}>Decline this application</button>
                    </div>
                  </section>
                ) : null}
              </aside>
            </div>
            <div className="job-editor-footer">
              <span />
              <button type="button" className="job-secondary-button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </CatalogDrawer>
      ) : null}
      {confirming && candidate ? (
        <ExchangeDialog title="Confirm your decision" catalog onClose={() => setConfirming(false)}>
          <p>KadıköyGarson1 → {candidate}. This changes the published assignment immediately.</p>
          {reviewing && variant === "e" ? <Statement /> : null}
          {reviewing && (variant === "a" || variant === "b") ? (
            <p className="sx-pending"><AlertTriangle size={14} /> {asked.name} is unavailable {asked.short} that day and asked for this shift anyway.</p>
          ) : null}
          <div className="sx-decision-shifts"><ExchangeShiftCard shift={shift} /></div>
          <div className="sx-actions">
            <button
              type="button"
              className="sx-primary"
              onClick={() => {
                setConfirming(false);
                setOpen(false);
                toast.success(`Transfer approved. ${candidate} now works Tue, Oct 20.`);
              }}
            >
              Approve
            </button>
            <button type="button" onClick={() => setConfirming(false)}>Back</button>
          </div>
        </ExchangeDialog>
      ) : null}
    </>
  );
}

function Candidate({ variant, name, at, consent = false, selected, tipOpen = false, onTip, onReview }: {
  readonly variant: Variant;
  readonly name: string;
  readonly at: string;
  readonly consent?: boolean;
  readonly selected: boolean;
  readonly tipOpen?: boolean;
  readonly onTip?: (open: boolean) => void;
  readonly onReview: () => void;
}) {
  const flagged = consent && variant === "a";
  return (
    <div className={`sx-candidate ${selected ? "sx-selected" : ""}`}>
      <div className="sx-avatar" aria-hidden>{name.slice(0, 2).toUpperCase()}</div>
      <div>
        <strong className="avail-candidate-name">
          {name}
          {consent && variant === "c" ? (
            <span className="avail-tip-anchor">
              <button
                type="button"
                className="avail-flag"
                aria-label={`${name} is unavailable then and asked anyway`}
                aria-expanded={tipOpen}
                onClick={() => onTip?.(!tipOpen)}
                onMouseEnter={() => onTip?.(true)}
                onMouseLeave={() => onTip?.(false)}
              >
                !
              </button>
              {tipOpen ? (
                <span className="avail-c3" role="tooltip">
                  <span className="avail-c3-band">
                    <span className="avail-c3-dot" aria-hidden>!</span>
                    <span className="avail-c3-who"><strong>{name}</strong><span>Tue, Oct 20</span></span>
                  </span>
                  <span className="avail-c3-body">
                    <span className="avail-c3-status">Unavailable after 5:00 PM</span>
                    <span className="avail-c3-pill"><Clock size={12} aria-hidden /> Asked anyway · {at}</span>
                  </span>
                </span>
              ) : null}
            </span>
          ) : null}
        </strong>
        <span className="sx-help">Awaiting manager</span>
        <time className="sx-help">{at}</time>
        <span className={flagged ? "sx-pending avail-pill-consent" : "sx-eligible"}>
          {flagged ? <AlertTriangle size={13} aria-hidden /> : null}
          {flagged ? "Unavailable · asked anyway" : "Eligible"}
        </span>
      </div>
      <button type="button" aria-pressed={selected} aria-label={`Review ${name}`} onClick={onReview}>
        {selected ? "Selected" : "Review"}
      </button>
    </div>
  );
}

function ReviewConsent({ variant }: { readonly variant: Variant }) {
  if (variant === "a" || variant === "b")
    return (
      <p className="sx-pending">
        <AlertTriangle size={14} /> {asked.name} marked {asked.hours} unavailable and asked for this shift anyway.
      </p>
    );
  if (variant === "c") return null;
  if (variant === "e") return <Statement />;
  const pct = (hour: number) => `${(hour / 24) * 100}%`;
  return (
    <figure className="avail-day avail-day-compact" aria-label={`Shift 4 PM to 11 PM; ${asked.name} unavailable after 5 PM`}>
      <div className="avail-day-row">
        <span>Shift</span>
        <div className="avail-day-track" aria-hidden>
          <span className="avail-day-shift" style={{ left: pct(16), width: pct(7) }}>4 PM – 11 PM</span>
        </div>
      </div>
      <div className="avail-day-row">
        <span>{asked.name}</span>
        <div className="avail-day-track" aria-hidden>
          <span className="avail-day-unavailable" style={{ left: pct(asked.from), width: pct(asked.to - asked.from) }} />
        </div>
      </div>
      <div className="avail-day-row">
        <span />
        <div className="avail-day-scale" aria-hidden>
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour} style={{ left: pct(hour) }}>{clock(hour)}</span>
          ))}
        </div>
      </div>
      <p className="avail-day-legend">6 of 7 hours overlap. {asked.name} asked for this shift anyway.</p>
    </figure>
  );
}

function Statement() {
  return (
    <blockquote className="avail-statement">
      <p>“I can work this shift, even though I marked this time unavailable.”</p>
      <footer>{asked.name} · {asked.at} · marked {asked.hours} unavailable</footer>
    </blockquote>
  );
}
