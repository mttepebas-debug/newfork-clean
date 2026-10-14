// Stands in for apps/web/src/schedule/export-v2/ExportSettingsPanel. Original:
// main's side panel. A and B: the panel draws nothing; it hands its props (the
// real ExportController's preferences, preview, download and print) to the New
// Schedule window, which shows the export step inside itself.
import { Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { formatDateNumber } from "../../../src/schedule/lib/scheduleDateTime";
import { ExportSettingsPanel as Original, type ExportSettingsPanelProps } from "../../../src/schedule/export-v2/ExportSettingsPanel";
import type { ExportPreferences } from "../../../src/schedule/export-v2/preferences";
import { exportSlot } from "./bridge";
import { plural } from "./common";
import { useChoice } from "./store";
import "./variants.css";

export type ExportProps = ExportSettingsPanelProps;
type Props = ExportProps;
type Format = ExportPreferences["format"];

export function ExportSettingsPanel(props: Props) {
  const choice = useChoice("newSchedule");
  useLayoutEffect(() => {
    if (choice === "original") return;
    exportSlot.set(props);
  });
  useLayoutEffect(() => () => exportSlot.set(null), []);
  return choice === "original" ? <Original {...props} /> : null;
}

export const formats: { value: Format; label: string; hint: string; icon: typeof FileText }[] = [
  { value: "pdf", label: "PDF", hint: "Print-ready pages", icon: FileText },
  { value: "png", label: "Image", hint: "PNG, one per page", icon: FileImage },
  { value: "xlsx", label: "Excel", hint: "Merged, per location, Data", icon: FileSpreadsheet },
];
export const formatName = (format: Format) => (format === "xlsx" ? "Excel" : format.toUpperCase());

/** Runs an action after a preferences change has re-rendered the controller. */
export function useLatest(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  return (change: Partial<ExportPreferences> | null, action: "export" | "preview") => {
    if (change) latest.current.onChange({ ...latest.current.preferences, ...change });
    window.setTimeout(() => (action === "export" ? latest.current.onExport() : latest.current.onPreview()), 60);
  };
}

export function sourceLine(props: Props): string {
  const { result } = props;
  if (result.status !== "ready") return result.reason === "edit" ? "Save a draft to export this schedule." : "Getting the schedule ready…";
  const { source, dates, locations, rows, shifts } = result.snapshot;
  const first = dates[0]!, last = dates.at(-1)!;
  const range = first === last ? formatDateNumber(first) : `${formatDateNumber(first)} – ${formatDateNumber(last)}`;
  return `${source.kind === "draft" ? `Draft “${source.name}”` : "Published"} · ${range} · ${plural(locations.length, "location")} · ${plural(rows.filter((row) => row.id !== null).length, "employee")} · ${plural(shifts.length, "shift")}`;
}

export function SourceChip(props: Props) {
  const ready = props.result.status === "ready";
  const draft = ready && props.result.status === "ready" && props.result.snapshot.source.kind === "draft";
  return <p className="stv-ex-source" data-draft={draft} aria-live="polite"><i aria-hidden />{sourceLine(props)}</p>;
}

/** The real thumbnail: the controller renders ExportPreview into this frame. */
export function Preview({ props, height, scale, onOpen }: { readonly props: Props; readonly height: number; readonly scale: number; readonly onOpen?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { onInlineTarget } = props;
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.head.innerHTML = "<style>header{display:none!important}html,body{overflow:hidden;margin:0}iframe{height:100vh!important}</style>";
    const root = doc.createElement("main");
    doc.body.replaceChildren(root);
    onInlineTarget(root);
    return () => onInlineTarget(null);
  }, [onInlineTarget]);
  const files = props.inline.files.filter((file) => file.name.endsWith(`.${props.preferences.format}`));
  const status = props.result.status !== "ready" ? "Waiting…" : props.inline.loading ? "Updating…"
    : props.preferences.format === "xlsx" ? `Workbook · ${props.result.snapshot.locations.length + 2} sheets`
    : props.preferences.format === "png" ? plural(files.length || 1, "image") : "PDF";
  return (
    <div className="stv-ex-preview" style={{ height }}>
      <iframe ref={frame} title="Export preview" tabIndex={-1} style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})` }} />
      <span className="stv-ex-preview-status">{status}</span>
      {onOpen ? <button type="button" className="stv-ex-preview-open" disabled={props.result.status !== "ready"} onClick={onOpen}><ExternalLink size={13} aria-hidden />Open full preview</button> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  readonly value: T; readonly label: string; readonly onChange: (value: T) => void;
  readonly options: readonly { value: T; label: ReactNode; disabled?: boolean }[];
}) {
  return (
    <div className="stv-seg is-tight" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} aria-selected={value === option.value} disabled={option.disabled} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}

export function Switch({ on, label, hint, onChange, disabled }: { readonly on: boolean; readonly label: string; readonly hint?: string; readonly onChange: () => void; readonly disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="stv-switch" disabled={disabled} onClick={onChange}>
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
      <i aria-hidden />
    </button>
  );
}

export function Layout({ props }: { readonly props: Props }) {
  const { preferences: prefs, onChange, result } = props;
  if (prefs.format === "xlsx") return <p className="stv-muted">One workbook: a Merged sheet, one sheet per location, and a Data sheet.</p>;
  const unified = result.status === "ready" && result.snapshot.layout === "unified";
  if (prefs.destination === "print") {
    return (
      <Segmented label="Paper" value={prefs.paper} onChange={(paper) => onChange({ ...prefs, paper })}
        options={[{ value: "LETTER", label: "US Letter" }, { value: "A4", label: "A4" }]} />
    );
  }
  return (
    <div className="stv-switches">
      {!unified ? <Switch on={prefs.combineHorizontally} label="Locations side by side" hint="All on one page width" onChange={() => onChange({ ...prefs, combineHorizontally: !prefs.combineHorizontally })} /> : null}
      <Switch on={prefs.combineVertically} label="One long page" hint="No page breaks between rows" onChange={() => onChange({ ...prefs, combineVertically: !prefs.combineVertically })} />
    </div>
  );
}

export function MainButton({ props, wide = true }: { readonly props: Props; readonly wide?: boolean }) {
  const { preferences: prefs, busy, result } = props;
  const print = prefs.destination === "print" && prefs.format !== "xlsx";
  return (
    <button type="button" className={`stv-ex-main${wide ? " is-wide" : ""}`} disabled={busy || result.status !== "ready"} onClick={props.onExport}>
      {print ? <Printer size={15} aria-hidden /> : <Download size={15} aria-hidden />}
      {busy ? "Preparing…" : `${print ? "Print" : "Download"} ${formatName(prefs.format)}`}
    </button>
  );
}

export function ErrorLine({ props }: { readonly props: Props }) {
  return props.error ? <p role="alert" className="stv-un-error">{props.error}</p> : null;
}

/** The export step inside the New Schedule window: file, destination, layout, live preview. */
export function ExportPane({ props }: { readonly props: Props }) {
  const { preferences: prefs, onChange } = props;
  return (
    <div className="stv-nx">
      <div className="stv-nx-preview"><Preview props={props} height={300} scale={0.5} /></div>
      <div className="stv-nx-side">
        <div className="stv-ex2-block">
          <strong>File</strong>
          <div className="stv-ex3-formats">
            {formats.map(({ value, label, hint, icon: Icon }) => (
              <button key={value} type="button" role="radio" aria-checked={prefs.format === value} onClick={() => onChange({ ...prefs, format: value, destination: value === "xlsx" ? "download" : prefs.destination })}>
                <Icon size={18} aria-hidden /><b>{label}</b><small>{hint}</small>
              </button>
            ))}
          </div>
        </div>
        {prefs.format !== "xlsx" ? (
          <div className="stv-ex2-block">
            <strong>Send to</strong>
            <Segmented label="Send to" value={prefs.destination} onChange={(destination) => onChange({ ...prefs, destination })}
              options={[{ value: "download", label: "Download" }, { value: "print", label: "Printer" }]} />
          </div>
        ) : null}
        <div className="stv-ex2-block"><strong>{prefs.destination === "print" && prefs.format !== "xlsx" ? "Paper" : "Layout"}</strong><Layout props={props} /></div>
        <ErrorLine props={props} />
        <div className="stv-nx-foot">
          <button type="button" className="secondary-button stv-btn" onClick={props.onPreview} disabled={props.result.status !== "ready"}><ExternalLink size={14} aria-hidden />Open in a tab</button>
          <MainButton props={props} wide={false} />
        </div>
        {props.footer}
      </div>
    </div>
  );
}
