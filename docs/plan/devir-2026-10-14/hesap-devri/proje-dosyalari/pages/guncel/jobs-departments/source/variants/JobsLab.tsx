// The lab page's Settings → Jobs: today's real page (Original) or the chosen
// V1 design, plus the switcher bar and decision legend.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OriginalJobsSettingsPage from "lab-original-jobs";
import { JobsV1Page } from "./JobsV1Page";
import { decisions, stateLabel } from "./decisions";
import { setLab, useLab, type Variant } from "./lab-state";
import "./jobs-lab.css";

declare const __ATLAS_SHA__: string;

const variants: { id: Variant; label: string; text: string }[] = [
  {
    id: "original",
    label: "Original",
    text: `Bugünkü uygulama, main ${__ATLAS_SHA__}: Settings → Jobs & departments olduğu gibi (All / Departments / Jobs, Show archived, sağ üstte Add).`,
  },
  {
    id: "A",
    label: "Yeni · seçilen",
    text: "Bütün kararlar seçildi (2026-10-13): Departments sekmesi A sade tablo, gruplar hep açık, Archived'de departmanlar ve işler ayrı gruplarda. Numaralara basınca her kararın tarihi ve kaynağı açılır.",
  },
];

export default function JobsLab() {
  const lab = useLab();
  return (
    <>
      {lab.variant === "original" ? <OriginalJobsSettingsPage /> : <JobsV1Page key="v1" />}
      {createPortal(<LabBar />, document.body)}
    </>
  );
}

function LabBar() {
  const lab = useLab();
  const [legend, setLegend] = useState(false);
  const [small, setSmall] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const current = variants.find((item) => item.id === lab.variant) ?? variants[0]!;

  // A marker on the page opens its legend line.
  useEffect(() => {
    if (lab.focus === null) return;
    setSmall(false);
    setLegend(true);
    requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-n="${lab.focus}"]`)?.scrollIntoView({ block: "nearest" }),
    );
  }, [lab.focus]);

  if (small)
    return (
      <div className="jobs-lab-bar jobs-lab-bar--small">
        <button type="button" className="lab-open" onClick={() => setSmall(false)}>
          Varyantlar · {current.label}
        </button>
      </div>
    );
  return (
    <div className="jobs-lab-bar" role="region" aria-label="Varyant seçici">
      {legend && (
        <div className="lab-legend" id="lab-legend">
          <div className="lab-legend-head">
            <strong>Bu sayfadaki kararlar</strong>
            <button type="button" className="lab-ghost" onClick={() => { setLegend(false); setLab({ focus: null }); }} aria-label="Kararları kapat">
              Kapat
            </button>
          </div>
          <ol ref={listRef}>
            {decisions.map((item) => (
              <li key={item.n} data-n={item.n} className={lab.focus === item.n ? "lab-focus" : ""}>
                <span className={`lab-marker lab-marker--${item.state} lab-marker--static`}>{item.n}</span>
                <div>
                  <span className={`lab-pill lab-pill--${item.state}`}>{stateLabel[item.state]}</span>
                  <p>{item.what}</p>
                  <small>{item.source}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="lab-row">
        <div className="lab-segment" role="radiogroup" aria-label="Sürüm">
          {variants.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={lab.variant === item.id}
              onClick={() => setLab({ variant: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="lab-tools">
          <button type="button" className="lab-ghost" aria-expanded={legend} aria-controls="lab-legend" onClick={() => setLegend(!legend)}>
            Kararlar
          </button>
          <label className="lab-switch">
            <input type="checkbox" checked={lab.notes} onChange={(event) => setLab({ notes: event.target.checked })} />
            Numaralar
          </label>
          <button type="button" className="lab-ghost" onClick={() => setSmall(true)} aria-label="Çubuğu küçült">
            Küçült
          </button>
        </div>
      </div>
      <p className="lab-text">{current.text}</p>
    </div>
  );
}
