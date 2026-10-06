import { Check, FileText, Megaphone, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { CockpitKey } from "./landing-content";

const n = (value: number) => ({ "--n": value }) as CSSProperties;

// Decorative product previews for the cockpit tabs; the real screens live in
// the app, these only sketch them.
export function CockpitPreview({ view }: { readonly view: CockpitKey }) {
  if (view === "schedule") {
    const rows = [
      ["Ava R.", [1, 0, 1, 0, 1, 1, 0]],
      ["Marcus T.", [1, 1, 0, 2, 0, 0, 1]],
      ["Priya S.", [0, 1, 0, 1, 1, 1, 0]],
      ["Diego M.", [0, 0, 1, 0, 1, 0, 1]],
    ] as const;
    return (
      <div className="lp-mock lp-mock-schedule">
        <div className="lp-mock-head">
          <strong>Downtown · Week of Oct 12</strong>
          <span className="lp-status is-live">Published</span>
        </div>
        <div className="lp-mock-grid">
          <span />
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <span key={index} className="lp-mock-day">
              {day}
            </span>
          ))}
          {rows.map(([name, cells], row) => (
            <div key={name} className="lp-mock-row">
              <span className="lp-mock-name">{name}</span>
              {cells.map((cell, day) => (
                <span key={day} className="lp-mock-cell">
                  {cell === 1 ? <i className={`lp-mock-chip tone-${row}`} style={n(row * 7 + day)} /> : null}
                  {cell === 2 ? (
                    <i className="lp-mock-chip is-ghost" style={n(row * 7 + day)} title="Uptown" />
                  ) : null}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="lp-mock-foot">
          <i className="lp-mock-chip is-ghost" /> Ghost shift: Marcus works Uptown on Thursday
        </p>
      </div>
    );
  }
  if (view === "requests") {
    const items = [
      ["Swap", "Ava → Marcus · Sat 5–11 PM", "approve"],
      ["Pickup", "Jess picks up open shift · Sun 7–3", "approve"],
      ["Time off", "Diego · Oct 24 – Oct 26", "pending"],
    ] as const;
    return (
      <div className="lp-mock lp-mock-requests">
        <div className="lp-mock-head">
          <strong>Requests</strong>
          <span className="lp-pill">3 waiting on you</span>
        </div>
        {items.map(([kind, text, state], index) => (
          <div key={text} className={`lp-mock-request is-${state}`} style={n(index)}>
            <span className="lp-mock-kind">{kind}</span>
            <span className="lp-mock-text">{text}</span>
            <span className="lp-mock-actions">
              <i className="lp-mock-decline">
                <X size={12} />
              </i>
              <i className="lp-mock-approve">
                <Check size={12} />
              </i>
            </span>
            <span className="lp-mock-approved">
              <Check size={12} /> Approved
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (view === "availability") {
    const people = [
      ["Ava R.", ["ok", "ok", "pref", "ok", "ok", "ok", "pref"]],
      ["Marcus T.", ["ok", "ok", "ok", "ok", "off", "off", "off"]],
      ["Priya S.", ["pref", "ok", "ok", "ok", "ok", "ok", "ok"]],
      ["Diego M.", ["ok", "ok", "ok", "ok", "pref", "ok", "ok"]],
    ] as const;
    return (
      <div className="lp-mock lp-mock-availability">
        <div className="lp-mock-head">
          <strong>Availability</strong>
          <span className="lp-mock-legend">
            <i className="is-ok" /> Available <i className="is-pref" /> Prefers not <i className="is-off" /> Time off
          </span>
        </div>
        {people.map(([name, days], row) => (
          <div key={name} className="lp-mock-avail-row">
            <span className="lp-mock-name">{name}</span>
            <div className="lp-mock-bars">
              {days.map((state, day) => (
                <i key={day} className={`is-${state}`} style={n(row * 7 + day)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (view === "announcements") {
    return (
      <div className="lp-mock lp-mock-announce">
        <div className="lp-mock-card">
          <span className="lp-mock-icon">
            <Megaphone size={18} />
          </span>
          <div>
            <strong>New brunch menu starts Saturday</strong>
            <p>Tasting at 10 AM before service. Please read the allergen sheet.</p>
          </div>
        </div>
        <div className="lp-mock-ack">
          <div className="lp-mock-ack-head">
            <span>Acknowledged</span>
            <strong>18 of 22</strong>
          </div>
          <div className="lp-mock-meter">
            <i />
          </div>
          <div className="lp-mock-faces">
            {["A", "M", "P", "D", "J", "L", "S", "K"].map((letter, index) => (
              <span key={index} className="lp-avatar" style={n(index)}>
                {letter}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-mock-date">
          <span>Nov 26</span>
          Thanksgiving · Closed
        </div>
      </div>
    );
  }
  return (
    <div className="lp-mock lp-mock-docs">
      {[
        ["Food handler card", "Expires Mar 2027", "approved"],
        ["Employee handbook", "Signed today", "signed"],
        ["Alcohol server permit", "Waiting for review", "review"],
      ].map(([title, meta, state], index) => (
        <div key={title} className="lp-mock-doc" style={n(index)}>
          <FileText size={18} />
          <span>
            <strong>{title}</strong>
            <small>{meta}</small>
          </span>
          <em className={`is-${state}`}>{state === "review" ? "In review" : state === "signed" ? "Signed" : "Approved"}</em>
        </div>
      ))}
      <svg className="lp-mock-signature" viewBox="0 0 240 60">
        <path d="M8 42c18-30 30-30 26-6s14 10 22-6 10-20 14 2-6 24 10 8 18-22 30-10-8 26 12 12 20-14 34-8 22 8 46-2" />
      </svg>
    </div>
  );
}
