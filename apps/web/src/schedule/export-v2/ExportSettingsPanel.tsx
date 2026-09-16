import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Check, Columns3, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, PanelLeftClose, PanelLeftOpen,
  Printer, RotateCcw, StretchVertical, X,
} from "lucide-react";
import { AppSidebarPanel } from "../../shell/AppSidebarPanel";
import { formatDateNumber } from "../lib/scheduleDateTime";
import type { ExportDownload } from "./files";
import type { ExportPreferences } from "./preferences";
import type { SnapshotResult } from "./snapshot";
import "./export-v2.css";

type Format = ExportPreferences["format"];
type Destination = ExportPreferences["destination"];
const formats: readonly { value: Format; label: string; hint: string; icon: typeof FileText }[] = [
  { value: "pdf", label: "PDF", hint: "Print-ready pages", icon: FileText },
  { value: "png", label: "PNG", hint: "One image per page", icon: FileImage },
  { value: "xlsx", label: "Excel", hint: "Merged, per location, Data", icon: FileSpreadsheet },
];
const destinations: readonly { value: Destination; label: string; hint: string; icon: typeof Download }[] = [
  { value: "download", label: "Download", hint: "Save the file", icon: Download },
  { value: "print", label: "Print", hint: "Fixed paper, print dialog", icon: Printer },
];
const formatLabel = (format: Format) => formats.find(item => item.value === format)!.label;

export interface ExportSettingsPanelProps {
  readonly result: SnapshotResult;
  readonly preferences: ExportPreferences;
  readonly onChange: (value: ExportPreferences) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
  readonly onPreview: () => void;
  readonly onExport: () => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly canManageLocations: boolean;
  /** Files of the last completed preview render and whether a newer one is in flight. */
  readonly inline: { readonly files: readonly ExportDownload[]; readonly loading: boolean };
  /** Receives the thumbnail's document root; the controller portals ExportPreview into it. */
  readonly onInlineTarget: (target: HTMLElement | null) => void;
  readonly footer?: ReactNode;
}

/** Sidebar export panel in the schedule settings-menu voice: rows with a trailing check. */
export function ExportSettingsPanel(props: ExportSettingsPanelProps) {
  const { result, preferences, onChange, onReset, onClose, onPreview, onExport, busy, error, footer, inline, onInlineTarget } = props;
  const disabled = busy || result.status !== "ready";
  const excel = preferences.format === "xlsx";
  const print = preferences.destination === "print" && !excel;
  const setFormat = (format: Format) => onChange({ ...preferences, format, destination: format === "xlsx" ? "download" : preferences.destination });
  const PrimaryIcon = print ? Printer : Download;
  return <AppSidebarPanel>{({ collapsed, onToggle }) => (
    <section className="schedule-export-v2" data-schedule-export-v2="true" aria-label="Export settings"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="export-v2-heading">
        {!collapsed ? <h2>Export</h2> : null}
        <button type="button" className="icon-button" aria-label={collapsed ? "Expand export settings" : "Minimize export settings"} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button type="button" className="icon-button" aria-label="Close export" onClick={onClose}><X size={18} /></button>
      </header>
      {!collapsed ? <>
        <InlinePreview result={result} preferences={preferences} files={inline.files} loading={inline.loading} onTarget={onInlineTarget} onOpen={onPreview} />
        <SourceTable {...props} />
        <Section title="Format"><MenuRows options={formats} value={preferences.format} onChange={setFormat} /></Section>
        {excel ? <p className="export-v2-hint">One workbook: Merged, each location, and Data. Only the heading rows are frozen.</p> : <>
          <Section title="Output"><MenuRows options={destinations} value={preferences.destination} onChange={destination => onChange({ ...preferences, destination })} /></Section>
          <Section title="Page layout"><LayoutControls {...props} /></Section>
        </>}
        {error ? <p role="alert" className="form-error export-v2-error">{error}</p> : null}
        <div className="export-v2-footer">
          <button type="button" className="export-v2-primary" disabled={disabled} onClick={onExport}>
            <PrimaryIcon size={15} aria-hidden="true" />{busy ? "Preparing…" : `${print ? "Print" : "Download"} ${formatLabel(preferences.format)}`}
          </button>
          <div className="export-v2-pair">
            <button type="button" className="export-v2-secondary" disabled={disabled} onClick={onPreview}><ExternalLink size={14} aria-hidden="true" />Preview</button>
            <button type="button" className="export-v2-secondary" onClick={onReset}><RotateCcw size={14} aria-hidden="true" />Reset</button>
          </div>
        </div>
        {footer}
      </> : null}
    </section>
  )}</AppSidebarPanel>;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <div className="export-v2-section" role="group" aria-label={title}><strong>{title}</strong>{children}</div>;
}

function SourceTable({ result, canManageLocations }: ExportSettingsPanelProps) {
  if (result.status !== "ready") {
    return <div className="export-v2-blocked" aria-live="polite">
      {result.reason === "short_names" ? <>
        <strong>Add location short names before exporting.</strong>
        <span>{result.locationNames?.join(", ")}</span>
        {canManageLocations ? <Link to="/app/settings/locations">Open Location Settings</Link> : <span>Ask a workspace manager to add them.</span>}
      </> : <span>{result.reason === "edit" ? "Save a draft to export this schedule." : result.reason === "locations" ? "No locations are available to export." : "Waiting for the current preview…"}</span>}
    </div>;
  }
  const { source, dates, locations, rows, shifts } = result.snapshot;
  const first = dates[0]!, last = dates.at(-1)!;
  const employees = rows.filter(row => row.id !== null).length;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const cells: [string, ReactNode][] = [
    ["Source", <span className={`export-v2-state${source.kind === "draft" ? " is-draft" : ""}`}>{source.kind === "draft" ? `Draft · ${source.name}` : "Published"}</span>],
    ["Range", `${first === last ? formatDateNumber(first) : `${formatDateNumber(first)} – ${formatDateNumber(last)}`}, ${new Date(`${last}T12:00:00Z`).getUTCFullYear()}`],
    ["Scope", `${plural(locations.length, "location")} · ${plural(employees, "employee")} · ${plural(shifts.length, "shift")}`],
  ];
  return <dl className="export-v2-table" aria-live="polite">
    {cells.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function MenuRows<T extends string>({ options, value, onChange }: {
  readonly options: readonly { value: T; label: string; hint: string; icon: typeof FileText }[]; readonly value: T; readonly onChange: (value: T) => void;
}) {
  return <div className="export-v2-menu" role="radiogroup">
    {options.map(({ value: option, label, hint, icon: Icon }) => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
      <Icon size={15} aria-hidden="true" /><span>{label}<small>{hint}</small></span>{value === option ? <Check size={15} aria-hidden="true" /> : null}
    </button>)}
  </div>;
}

function LayoutControls({ result, preferences, onChange }: ExportSettingsPanelProps) {
  const unified = result.status === "ready" && result.snapshot.layout === "unified";
  if (preferences.destination === "print") {
    const papers = [["A4", "A4 landscape"], ["LETTER", "US Letter landscape"]] as const;
    return <>
      <div className="export-v2-menu" role="radiogroup" aria-label="Paper">
        {papers.map(([paper, text]) => <button key={paper} type="button" role="radio" aria-checked={preferences.paper === paper} onClick={() => onChange({ ...preferences, paper })}>
          <FileText size={15} aria-hidden="true" /><span>{text}</span>{preferences.paper === paper ? <Check size={15} aria-hidden="true" /> : null}
        </button>)}
      </div>
      <p className="export-v2-hint">{unified ? "All locations in one table." : "One location per page."} Employee rows continue onto additional pages with repeated headers.</p>
    </>;
  }
  const options: { key: "combineHorizontally" | "combineVertically"; text: string; hint: string; icon: typeof Columns3 }[] = [
    ...(unified ? [] : [{ key: "combineHorizontally" as const, text: "Combine locations", hint: "Side by side across one page width", icon: Columns3 }]),
    { key: "combineVertically", text: "One long page", hint: "The page grows to fit; rows stay readable", icon: StretchVertical },
  ];
  return <div className="export-v2-menu">
    {options.map(({ key, text, hint, icon: Icon }) => <button key={key} type="button" role="checkbox" aria-checked={preferences[key]}
      onClick={() => onChange({ ...preferences, [key]: !preferences[key] })}>
      <Icon size={15} aria-hidden="true" /><span>{text}<small>{hint}</small></span>{preferences[key] ? <Check size={15} aria-hidden="true" /> : null}
    </button>)}
  </div>;
}

/** Thumbnail of ExportPreview in an isolated iframe so the preview page's styles stay out of the app. */
function InlinePreview({ result, preferences, files, loading, onTarget, onOpen }: {
  readonly result: SnapshotResult; readonly preferences: ExportPreferences; readonly files: readonly ExportDownload[];
  readonly loading: boolean; readonly onTarget: (target: HTMLElement | null) => void; readonly onOpen: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [pages, setPages] = useState<number | null>(null);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
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
  const count = preferences.format === "xlsx"
    ? ready ? `${result.snapshot.locations.length + 2} sheets` : "Workbook"
    : loading ? "Rendering…" : pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : "—";
  return <div className="export-v2-preview">
    <div className="export-v2-thumb" aria-hidden="true">
      <iframe ref={frame} title="Export thumbnail" tabIndex={-1} />
      {loading ? <span className="export-v2-thumb-status">Updating…</span> : null}
    </div>
    <div className="export-v2-preview-bar">
      <span aria-live="polite">{formatLabel(preferences.format)} · {count}</span>
      <button type="button" className="export-v2-secondary" disabled={!ready} onClick={onOpen}><ExternalLink size={14} aria-hidden="true" />Open</button>
    </div>
  </div>;
}

async function pdfPageCount(pdf: Blob): Promise<number> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  try { return (await task.promise).numPages; } finally { await task.destroy(); }
}
