import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router";
import {
  CalendarRange, Download, ExternalLink, Eye, FileImage, FileSpreadsheet, FileText, PanelLeftClose, PanelLeftOpen,
  Printer, RotateCcw, Users, X,
} from "lucide-react";
import { AppSidebarPanel } from "../../shell/AppSidebarPanel";
import { formatDateNumber } from "../lib/scheduleDateTime";
import type { ExportSettingsPanel } from "./ExportSettingsPanel";
import type { ExportDownload } from "./files";
import type { ExportPreferences } from "./preferences";
import type { SnapshotResult } from "./snapshot";
import "./export-v2.css";
import "./export-variants.css";

// ponytail: DEV-only mockup variants (EXP-000). EXP-001 keeps one and deletes the rest.
export type ExportVariant = "A" | "B" | "C";
export function readExportVariant(): ExportVariant | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get("exportVariant")?.toUpperCase();
  return value === "A" || value === "B" || value === "C" ? value : null;
}

type PanelProps = ComponentProps<typeof ExportSettingsPanel>;
type Format = ExportPreferences["format"];
const formats: readonly { value: Format; label: string; hint: string; icon: typeof FileText }[] = [
  { value: "pdf", label: "PDF", hint: "Print-ready pages", icon: FileText },
  { value: "png", label: "PNG", hint: "Image per page", icon: FileImage },
  { value: "xlsx", label: "Excel", hint: "Editable workbook", icon: FileSpreadsheet },
];
const formatLabel = (format: Format) => formats.find(item => item.value === format)!.label;
const excelCopy = "One workbook: Merged, each location, and Data. Only the day header row is frozen.";

export function ExportVariantPanel({ variant, inline, onInlineTarget, ...props }: PanelProps & {
  readonly variant: ExportVariant;
  readonly inline: { readonly files: readonly ExportDownload[]; readonly loading: boolean };
  readonly onInlineTarget: (target: HTMLElement | null) => void;
}) {
  const { result, preferences, onChange, onReset, onClose, onPreview, onExport, busy, error, footer } = props;
  const disabled = busy || result.status !== "ready";
  const print = preferences.destination === "print" && preferences.format !== "xlsx";
  const setFormat = (format: Format) => onChange({ ...preferences, format, destination: format === "xlsx" ? "download" : preferences.destination });
  const primaryLabel = busy ? "Preparing…" : print ? `Print ${formatLabel(preferences.format)}` : `Download ${formatLabel(preferences.format)}`;
  const PrimaryIcon = print ? Printer : Download;
  const primary = <button type="button" className="export-x-primary" disabled={disabled} onClick={onExport}>
    <PrimaryIcon size={16} aria-hidden="true" />{primaryLabel}
  </button>;

  return <AppSidebarPanel>{({ collapsed, onToggle }) => (
    <section className="schedule-export-v2 export-x" data-schedule-export-v2="true" data-export-variant={variant} aria-label="Export settings"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="export-v2-heading">
        {!collapsed ? <h2>Export</h2> : null}
        <button type="button" className="icon-button" aria-label={collapsed ? "Expand export settings" : "Minimize export settings"} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button type="button" className="icon-button" aria-label="Close export" onClick={onClose}><X size={18} /></button>
      </header>
      {!collapsed ? <>
        <ExportSummary {...props} />
        {variant === "C" ? <InlinePreview result={result} preferences={preferences} files={inline.files} loading={inline.loading}
          onTarget={onInlineTarget} onOpen={onPreview} /> : null}
        {variant === "A" ? <>
          <div className="export-x-field">
            <span className="export-x-label" id="export-x-format">Format</span>
            <div className="export-x-cards" role="radiogroup" aria-labelledby="export-x-format">
              {formats.map(({ value, label, hint, icon: Icon }) => <button key={value} type="button" role="radio"
                aria-checked={preferences.format === value} className="export-x-card" onClick={() => setFormat(value)}>
                <Icon size={20} aria-hidden="true" /><strong>{label}</strong><small>{hint}</small>
              </button>)}
            </div>
          </div>
          {preferences.format !== "xlsx" ? <Segmented label="Output" value={preferences.destination}
            options={[["download", "Download"], ["print", "Print"]]} onChange={destination => onChange({ ...preferences, destination })} />
            : <p className="export-x-note">{excelCopy}</p>}
          {preferences.format !== "xlsx" ? <details className="export-x-layout">
            <summary>Page layout <span>{layoutSummary(preferences, result)}</span></summary>
            <LayoutControls {...props} kind="checkbox" />
          </details> : null}
          <Alerts {...props} />
          <div className="export-x-actions">
            {primary}
            <div className="export-x-links">
              <button type="button" className="export-x-link" disabled={disabled} onClick={onPreview}><Eye size={14} aria-hidden="true" />Preview</button>
              <button type="button" className="export-x-link" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Reset</button>
            </div>
          </div>
        </> : null}
        {variant === "B" ? <>
          <div className="export-x-rows">
            <label className="export-x-row"><span>Format</span>
              <select value={preferences.format} onChange={event => setFormat(event.target.value as Format)}>
                {formats.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {preferences.format !== "xlsx" ? <label className="export-x-row"><span>Output</span>
              <select value={preferences.destination} onChange={event => onChange({ ...preferences, destination: event.target.value as ExportPreferences["destination"] })}>
                <option value="download">Download</option><option value="print">Print</option>
              </select>
            </label> : null}
            {preferences.format !== "xlsx" ? <LayoutControls {...props} kind="switch" /> : null}
          </div>
          {preferences.format === "xlsx" ? <p className="export-x-note">{excelCopy}</p> : null}
          <Alerts {...props} />
          <div className="export-x-actions export-x-actions-row">
            <button type="button" className="export-x-icon" aria-label="Preview in new tab" title="Preview in new tab" disabled={disabled} onClick={onPreview}>
              <Eye size={18} aria-hidden="true" />
            </button>
            {primary}
          </div>
          <button type="button" className="export-x-link export-x-reset" onClick={onReset}>Reset export settings</button>
        </> : null}
        {variant === "C" ? <>
          <Segmented label="Format" value={preferences.format}
            options={formats.map(item => [item.value, item.label] as const)} onChange={setFormat} />
          {preferences.format !== "xlsx" ? <Segmented label="Output" value={preferences.destination}
            options={[["download", "Download"], ["print", "Print"]]} onChange={destination => onChange({ ...preferences, destination })} />
            : <p className="export-x-note">{excelCopy}</p>}
          {preferences.format !== "xlsx" ? <div className="export-x-field">
            <span className="export-x-label">Page layout</span>
            <LayoutControls {...props} kind="chip" />
          </div> : null}
          <Alerts {...props} />
          <div className="export-x-actions">
            {primary}
            <button type="button" className="export-x-link export-x-reset" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Reset export settings</button>
          </div>
        </> : null}
        {footer}
      </> : null}
    </section>
  )}</AppSidebarPanel>;
}

function ExportSummary({ result, canManageLocations }: PanelProps) {
  if (result.status !== "ready") {
    return <div className="export-x-summary is-blocked" aria-live="polite">
      {result.reason === "short_names" ? <>
        <strong>Add location short names before exporting.</strong>
        <span>{result.locationNames?.join(", ")}</span>
        {canManageLocations ? <Link to="/app/settings/locations">Open Location Settings</Link> : <span>Ask a workspace manager to add them.</span>}
      </> : <span>{result.reason === "edit" ? "Save a draft to export this schedule." : result.reason === "locations" ? "No locations are available to export." : "Waiting for the current preview…"}</span>}
    </div>;
  }
  const { source, dates, locations, rows, shifts } = result.snapshot;
  const first = dates[0]!, last = dates.at(-1)!;
  const year = new Date(`${last}T12:00:00Z`).getUTCFullYear();
  const employees = rows.filter(row => row.id !== null).length;
  return <div className="export-x-summary" aria-live="polite">
    <span className={`export-x-badge${source.kind === "draft" ? " is-draft" : ""}`}>{source.kind === "draft" ? `Draft · ${source.name}` : "Published"}</span>
    <p className="export-x-range"><CalendarRange size={15} aria-hidden="true" />
      {first === last ? formatDateNumber(first) : `${formatDateNumber(first)} – ${formatDateNumber(last)}`}, {year}</p>
    <ul className="export-x-chips" aria-label="Locations">
      {locations.slice(0, 2).map(location => <li key={location.id} title={location.name}>{location.name}</li>)}
      {locations.length > 2 ? <li title={locations.slice(2).map(location => location.name).join(", ")}>+{locations.length - 2}</li> : null}
    </ul>
    <p className="export-x-counts"><Users size={15} aria-hidden="true" />
      {employees} {employees === 1 ? "employee" : "employees"} · {shifts.length} {shifts.length === 1 ? "shift" : "shifts"}</p>
  </div>;
}

function Alerts({ error }: PanelProps) {
  return error ? <p role="alert" className="form-error export-x-error">{error}</p> : null;
}

function Segmented<T extends string>({ label, value, options, onChange }: {
  readonly label: string; readonly value: T; readonly options: readonly (readonly [T, string])[]; readonly onChange: (value: T) => void;
}) {
  return <div className="export-x-field">
    <span className="export-x-label" id={`export-x-${label}`}>{label}</span>
    <div className="export-x-segmented" role="radiogroup" aria-labelledby={`export-x-${label}`}>
      {options.map(([option, text]) => <button key={option} type="button" role="radio" aria-checked={value === option}
        onClick={() => onChange(option)}>{text}</button>)}
    </div>
  </div>;
}

function layoutSummary(preferences: ExportPreferences, result: SnapshotResult): string {
  if (preferences.destination === "print") return preferences.paper === "A4" ? "A4 landscape" : "US Letter landscape";
  const parts = [
    ...(preferences.combineHorizontally && (result.status !== "ready" || result.snapshot.layout === "separate") ? ["Combined"] : []),
    ...(preferences.combineVertically ? ["One long page"] : []),
  ];
  return parts.join(" · ") || "Standard pages";
}

/** Same options as the current panel, rendered as checkboxes, switches or chips. */
function LayoutControls({ result, preferences, onChange, kind }: PanelProps & { readonly kind: "checkbox" | "switch" | "chip" }) {
  if (preferences.destination === "print") {
    const papers = [["A4", "A4 landscape"], ["LETTER", "US Letter landscape"]] as const;
    const hint = <p className="export-x-hint">One location per page. Employee rows continue onto additional pages with repeated headers.</p>;
    if (kind === "chip") return <>
      <div className="export-x-chip-row">{papers.map(([paper, text]) => <button key={paper} type="button" className="export-x-toggle"
        aria-pressed={preferences.paper === paper} onClick={() => onChange({ ...preferences, paper })}>{text}</button>)}</div>{hint}
    </>;
    return <>
      <label className={kind === "switch" ? "export-x-row" : "export-x-select"}><span>Paper</span>
        <select value={preferences.paper} onChange={event => onChange({ ...preferences, paper: event.target.value as ExportPreferences["paper"] })}>
          {papers.map(([paper, text]) => <option key={paper} value={paper}>{text}</option>)}
        </select>
      </label>{hint}
    </>;
  }
  const options: { key: "combineHorizontally" | "combineVertically"; text: string; hint: string }[] = [
    ...(result.status !== "ready" || result.snapshot.layout === "separate"
      ? [{ key: "combineHorizontally" as const, text: "Combine locations", hint: "Across one document width" }] : []),
    { key: "combineVertically", text: "One long page", hint: "Keep rows readable; the page grows to fit" },
  ];
  if (kind === "chip") return <div className="export-x-chip-row">{options.map(option => <button key={option.key} type="button"
    className="export-x-toggle" aria-pressed={preferences[option.key]} title={option.hint}
    onClick={() => onChange({ ...preferences, [option.key]: !preferences[option.key] })}>{option.text}</button>)}</div>;
  return <>{options.map(option => <label key={option.key} className={kind === "switch" ? "export-x-row export-x-switch" : "export-x-check"}>
    <span>{option.text}<small>{option.hint}</small></span>
    <input type="checkbox" role={kind === "switch" ? "switch" : undefined} checked={preferences[option.key]}
      onChange={event => onChange({ ...preferences, [option.key]: event.target.checked })} />
  </label>)}</>;
}

/** Thumbnail of the existing ExportPreview, rendered into an isolated iframe so its page styles stay out of the app. */
function InlinePreview({ result, preferences, files, loading, onTarget, onOpen }: {
  readonly result: SnapshotResult; readonly preferences: ExportPreferences; readonly files: readonly ExportDownload[];
  readonly loading: boolean; readonly onTarget: (target: HTMLElement | null) => void; readonly onOpen: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [pages, setPages] = useState<number | null>(null);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    // ponytail: hide the preview page's own toolbar; the thumbnail is display-only.
    doc.head.innerHTML = "<style>header{display:none!important}html,body{overflow:hidden}iframe{height:100vh!important}</style>";
    const root = doc.createElement("main"); doc.body.replaceChildren(root);
    onTarget(root);
    return () => onTarget(null);
  }, [onTarget]);
  useEffect(() => {
    setPages(null);
    if (preferences.format === "png") { setPages(files.length || null); return; }
    if (preferences.format === "xlsx" || !files[0]) return;
    let cancelled = false;
    void pdfPageCount(files[0].blob).then(count => { if (!cancelled) setPages(count); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [files, preferences.format]);
  const ready = result.status === "ready";
  const count: ReactNode = preferences.format === "xlsx"
    ? ready ? `${result.snapshot.locations.length + 2} sheets` : "Workbook"
    : loading ? "Rendering…" : pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : "—";
  return <div className="export-x-preview">
    <div className="export-x-thumb" aria-hidden="true">
      <iframe ref={frame} title="Export thumbnail" tabIndex={-1} />
      {loading ? <span className="export-x-thumb-status">Updating preview…</span> : null}
    </div>
    <div className="export-x-preview-bar">
      <span aria-live="polite">{formatLabel(preferences.format)} · {count}</span>
      <button type="button" className="export-x-link" disabled={!ready} onClick={onOpen}>
        <ExternalLink size={14} aria-hidden="true" />Enlarge
      </button>
    </div>
  </div>;
}

async function pdfPageCount(pdf: Blob): Promise<number> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  try { return (await task.promise).numPages; } finally { await task.destroy(); }
}
