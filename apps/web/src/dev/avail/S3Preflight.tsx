import { useToast } from "@newfork/ui";
import { ArrowUpRight, Check, ChevronDown, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { scheduleModel } from "./fixtures";
import { LabBanner, useVariant, type LabSet } from "./lab";
import { ScheduleStage } from "./ScheduleStage";

export const s3Set: LabSet = {
  id: "s3",
  title: "Publish pre-flight: availability, no checkbox",
  screen: "Schedule → Publish → step 2 \"Pre-flight\"",
  variants: {
    a: { name: "Same list", hint: "Today's Availability group, row by row, without the \"I've seen these warnings\" checkbox. Next works at once." },
    b: { name: "One line", hint: "A single folded line says how many people; it opens to a short list. Least noise." },
    c: { name: "By person", hint: "One row per person, their days as small chips; each chip opens that shift." },
  },
};

type Row = { readonly person: string; readonly day: string; readonly date: string; readonly hours: string; readonly shift: string };

const rows: readonly Row[] = [
  { person: "KadıköyGarson2", day: "Tue 20", date: "2026-10-20", hours: "unavailable after 5:00 PM", shift: "4:00 PM – 11:00 PM" },
  { person: "KadıköyGarson2", day: "Sat 24", date: "2026-10-24", hours: "unavailable all day", shift: "4:00 PM – 11:00 PM" },
  { person: "KadıköyBarmen1", day: "Fri 23", date: "2026-10-23", hours: "unavailable after 6:00 PM", shift: "4:00 PM – 11:00 PM" },
];
const byPerson = rows.reduce<Record<string, Row[]>>((all, row) => ({ ...all, [row.person]: [...(all[row.person] ?? []), row] }), {});
const peopleCount = Object.keys(byPerson).length;

export function S3Preflight() {
  const variant = useVariant(s3Set);
  const model = useMemo(() => scheduleModel(), []);
  const [open, setOpen] = useState(true);
  const toast = useToast();
  const show = (row: Row) => toast.info(`Opens ${row.person}'s ${row.day} shift in Schedule (unchanged today).`);
  return (
    <>
      <LabBanner set={s3Set} variant={variant}>
        <p>
          Draft "Week 43" for Kadıköy. Three shifts sit on unavailable hours: KadıköyGarson2 Tue and Sat, KadıköyBarmen1 Fri.
          Nothing to tick (M9); the list is a last look.{" "}
          {open ? null : <button type="button" onClick={() => setOpen(true)}>Open the Publish window again</button>}
        </p>
      </LabBanner>
      <ScheduleStage model={model} />
      {open
        ? createPortal(
            <div className="schedule-dialog-layer" role="presentation" data-schedule-quiet-dialog>
              <button type="button" className="schedule-dialog-backdrop" aria-label="Close dialog" onClick={() => setOpen(false)} />
              <section className="schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="avail-pf-title">
                <header>
                  <div className="schedule-quiet-dialog-heading">
                    <h2 id="avail-pf-title">Pre-flight check</h2>
                    <p>Review what needs attention first, then what changes at each location.</p>
                  </div>
                  <button type="button" className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>
                    <X size={18} />
                  </button>
                </header>
                <div className="schedule-publication-form">
                  <div className="schedule-publication-steps" aria-label="Publish steps">
                    {[["1", "Locations"], ["2", "Pre-flight"], ["3", "Notify"]].map(([index, label]) => (
                      <span key={index} aria-current={index === "2" ? "step" : undefined} data-active={index === "2"} data-complete={index === "1"}>
                        <i aria-hidden>{index === "1" ? <Check size={12} /> : index}</i>
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="schedule-publication-summary">
                    <strong>Week 43</strong>
                    <span><strong>1</strong> location</span>
                    <span><strong>14</strong> shifts</span>
                    <span><strong>5</strong> people affected</span>
                  </p>
                  <div className="schedule-publication-review">
                    <section className="schedule-publish-preflight-panel" data-publish-preflight>
                      {variant === "b" ? <FoldedLine onShow={show} /> : (
                        <>
                          <div className="schedule-publish-preflight-summary" data-ready={false}>
                            <ShieldAlert size={17} aria-hidden />
                            <div>
                              <strong>{rows.length} availability warnings</strong>
                              <span>Some people are scheduled when they said they're unavailable. Take a last look; nothing to confirm.</span>
                            </div>
                          </div>
                          {variant === "a" ? <SameList onShow={show} /> : <ByPerson onShow={show} />}
                        </>
                      )}
                    </section>
                    <div className="schedule-publication-diff">
                      <section>
                        <strong>Kadıköy</strong>
                        <span>14 shifts after publish</span>
                        <dl>
                          <div><dt>Added</dt><dd>3</dd></div>
                          <div><dt>Updated</dt><dd>1</dd></div>
                          <div><dt>Removed</dt><dd>0</dd></div>
                          <div><dt>Unchanged</dt><dd>10</dd></div>
                        </dl>
                      </section>
                    </div>
                  </div>
                  <div className="schedule-dialog-actions">
                    <span className="schedule-publication-footer-summary">{variant === "b" ? "No blockers" : `${rows.length} availability warnings`}</span>
                    <button type="button" onClick={() => toast.info("Back goes to step 1, Locations (unchanged).")}>Back</button>
                    <button type="button" onClick={() => setOpen(false)}>Cancel</button>
                    <button type="button" className="primary" onClick={() => toast.success("Next opens step 3, Notify employees (unchanged).")}>Next</button>
                  </div>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Dot() {
  return <span className="schedule-availability-tip-dot" aria-hidden="true">!</span>;
}

function ShowButton({ row, onShow }: { readonly row: Row; readonly onShow: (row: Row) => void }) {
  return (
    <button type="button" aria-label={`Show ${row.person}'s shift on ${row.day}`} title="Show shift" onClick={() => onShow(row)}>
      <ArrowUpRight size={16} aria-hidden />
    </button>
  );
}

function SameList({ onShow }: { readonly onShow: (row: Row) => void }) {
  return (
    <section className="schedule-publish-finding-group risk schedule-publish-weekly-availability">
      <div className="schedule-publish-finding-heading">
        <Dot />
        <strong>Availability</strong>
      </div>
      {rows.map((row) => (
        <div key={`${row.person}-${row.date}`} className="schedule-publish-finding-row schedule-publish-availability-row">
          <div>
            <strong><Dot />{row.person}</strong>
            <small>{row.date} · Kadıköy</small>
            <span>{row.person} shows as unavailable for this shift ({row.hours})</span>
          </div>
          <ShowButton row={row} onShow={onShow} />
        </div>
      ))}
    </section>
  );
}

function FoldedLine({ onShow }: { readonly onShow: (row: Row) => void }) {
  return (
    <>
      <div className="schedule-publish-preflight-summary" data-ready>
        <Check size={17} aria-hidden />
        <div>
          <strong>Ready to publish</strong>
          <span>No blockers. One thing to glance at below.</span>
        </div>
      </div>
      <details className="avail-pf-fold">
        <summary>
          <Dot />
          <span className="avail-pf-fold-text">
            <strong>{peopleCount} people are scheduled while unavailable</strong>
            <small>{rows.length} shifts · KadıköyGarson2, KadıköyBarmen1</small>
          </span>
          <ChevronDown size={16} aria-hidden className="avail-pf-chevron" />
        </summary>
        <ul>
          {rows.map((row) => (
            <li key={`${row.person}-${row.date}`}>
              <span><strong>{row.person}</strong> · {row.day} · {row.shift}</span>
              <small>{row.hours}</small>
              <ShowButton row={row} onShow={onShow} />
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function ByPerson({ onShow }: { readonly onShow: (row: Row) => void }) {
  return (
    <section className="schedule-publish-finding-group risk schedule-publish-weekly-availability">
      <div className="schedule-publish-finding-heading">
        <Dot />
        <strong>Scheduled while unavailable · {peopleCount} people</strong>
      </div>
      <div className="avail-pf-people">
        {Object.entries(byPerson).map(([person, days]) => (
          <div key={person} className="avail-pf-person">
            <strong>{person}</strong>
            <span className="avail-pf-chips">
              {days.map((row) => (
                <button key={row.date} type="button" onClick={() => onShow(row)} title={`${row.shift} · ${row.hours}`}>
                  {row.day} · {row.hours.replace("unavailable ", "")}
                  <ArrowUpRight size={13} aria-hidden />
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
