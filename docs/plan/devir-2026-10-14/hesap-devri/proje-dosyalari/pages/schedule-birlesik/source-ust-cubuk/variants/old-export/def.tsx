import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Check, Columns3, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, PanelLeftClose, PanelLeftOpen,
  Printer, RotateCcw, StretchVertical, X,
} from "lucide-react";
import { AppSidebarPanel } from "../../../../src/shell/AppSidebarPanel";
import { formatDateNumber } from "../../../../src/schedule/lib/scheduleDateTime";
import type { ExportSettingsPanel } from "../../../../src/schedule/export-v2/ExportSettingsPanel";
import type { ExportDownload } from "../../../../src/schedule/export-v2/files";
import type { ExportPreferences } from "../../../../src/schedule/export-v2/preferences";
import type { SnapshotResult } from "../../../../src/schedule/export-v2/snapshot";
import "../../../../src/schedule/export-v2/export-v2.css";
import "./def.css";

// ponytail: DEV-only mockup variants (EXP-000). EXP-001 keeps one and deletes the rest.
export type ExportVariant = "D" | "E" | "F";
export function readExportVariant(): ExportVariant | null {
  if (!import.meta.env.DEV) return null;
  const value = new URLSearchParams(window.location.search).get("exportVariant")?.toUpperCase();
  return value === "D" || value === "E" || value === "F" ? value : null;
}

type PanelProps = ComponentProps<typeof ExportSettingsPanel>;
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
const excelCopy = "One workbook: Merged, each location, and Data. Only the day header row is frozen.";

export function OldExportDEF({ variant, inline, onInlineTarget, ...props }: PanelProps & {
  readonly variant: ExportVariant;
  readonly inline: { readonly files: readonly ExportDownload[]; readonly loading: boolean };
  readonly onInlineTarget: (target: HTMLElement | null) => void;
}) {
  const { result, preferences, onChange, onReset, onClose, onPreview, onExport, busy, error, footer } = props;
  const disabled = busy || result.status !== "ready";
  const excel = preferences.format === "xlsx";
  const print = preferences.destination === "print" && !excel;
  const setFormat = (format: Format) => onChange({ ...preferences, format, destination: format === "xlsx" ? "download" : preferences.destination });
  const setDestination = (destination: Destination) => onChange({ ...preferences, destination });
  const PrimaryIcon = print ? Printer : Download;
  const primary = <button type="button" className="export-xd-primary" disabled={disabled} onClick={onExport}>
    <PrimaryIcon size={15} aria-hidden="true" />{busy ? "Preparing…" : `${print ? "Print" : "Download"} ${formatLabel(preferences.format)}`}
  </button>;
  const previewButton = <button type="button" className="export-xd-secondary" disabled={disabled} onClick={onPreview}>
    <ExternalLink size={14} aria-hidden="true" />Preview
  </button>;
  const resetButton = <button type="button" className="export-xd-secondary" onClick={onReset}>
    <RotateCcw size={14} aria-hidden="true" />Reset
  </button>;
  const alert = error ? <p role="alert" className="form-error export-xd-error">{error}</p> : null;

  return <AppSidebarPanel>{({ collapsed, onToggle }) => (
    <section className="schedule-export-v2 export-xd" data-schedule-export-v2="true" data-export-variant={variant} aria-label="Export settings"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <header className="export-v2-heading">
        {!collapsed ? <h2>Export</h2> : null}
        <button type="button" className="icon-button" aria-label={collapsed ? "Expand export settings" : "Minimize export settings"} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button type="button" className="icon-button" aria-label="Close export" onClick={onClose}><X size={18} /></button>
      </header>
      {collapsed ? null : variant === "D" ? <>
        <Section title="Source"><SourceLine {...props} /></Section>
        <Section title="Format">
          <MenuRows options={formats} value={preferences.format} onChange={setFormat} />
        </Section>
        {excel ? <p className="export-xd-hint">{excelCopy}</p> : <>
          <Section title="Output"><MenuRows options={destinations} value={preferences.destination} onChange={setDestination} /></Section>
          <Section title="Page layout"><LayoutControls {...props} kind="menu" /></Section>
        </>}
        {alert}
        <div className="export-xd-footer">{primary}<div className="export-xd-pair">{previewButton}{resetButton}</div></div>
        {footer}
      </> : variant === "E" ? <>
        <SourceTable {...props} />
        <Section title="Format"><Segmented options={formats} value={preferences.format} onChange={setFormat} /></Section>
        {excel ? <p className="export-xd-hint">{excelCopy}</p> : <>
          <Section title="Output"><Segmented options={destinations} value={preferences.destination} onChange={setDestination} /></Section>
          <Section title="Page layout"><LayoutControls {...props} kind="switch" /></Section>
        </>}
        {alert}
        <div className="export-xd-footer">
          <Filename {...props} />
          <div className="export-xd-pair export-xd-pair-primary">{previewButton}{primary}</div>
          <button type="button" className="export-xd-link" onClick={onReset}>Reset export settings</button>
        </div>
        {footer}
      </> : <>
        <InlinePreview result={result} preferences={preferences} files={inline.files} loading={inline.loading} onTarget={onInlineTarget} onOpen={onPreview} />
        <SourceTable {...props} compact />
        <Section title="Format"><Segmented options={formats} value={preferences.format} onChange={setFormat} /></Section>
        {excel ? <p className="export-xd-hint">{excelCopy}</p> : <>
          <Section title="Output"><Segmented options={destinations} value={preferences.destination} onChange={setDestination} /></Section>
          <details className="export-xd-details">
            <summary>Page layout<span>{layoutSummary(preferences, result)}</span></summary>
            <LayoutControls {...props} kind="check" />
          </details>
        </>}
        {alert}
        <div className="export-xd-footer">{primary}<button type="button" className="export-xd-link" onClick={onReset}>Reset export settings</button></div>
        {footer}
      </>}
    </section>
  )}</AppSidebarPanel>;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <div className="export-xd-section" role="group" aria-label={title}><strong>{title}</strong>{children}</div>;
}

function counts(result: Extract<SnapshotResult, { status: "ready" }>) {
  const { locations, rows, shifts } = result.snapshot;
  const employees = rows.filter(row => row.id !== null).length;
  return {
    locations: `${locations.length} ${locations.length === 1 ? "location" : "locations"}`,
    employees: `${employees} ${employees === 1 ? "employee" : "employees"}`,
    shifts: `${shifts.length} ${shifts.length === 1 ? "shift" : "shifts"}`,
  };
}
function range(dates: readonly string[]) {
  const first = dates[0]!, last = dates.at(-1)!;
  const year = new Date(`${last}T12:00:00Z`).getUTCFullYear();
  return `${first === last ? formatDateNumber(first) : `${formatDateNumber(first)} – ${formatDateNumber(last)}`}, ${year}`;
}
function locationList(locations: readonly { name: string }[]) {
  const shown = locations.slice(0, 2).map(location => location.name).join(", ");
  return locations.length > 2 ? `${shown} +${locations.length - 2}` : shown;
}

function Blocked({ result, canManageLocations }: PanelProps) {
  if (result.status === "ready") return null;
  return <div className="export-xd-blocked" aria-live="polite">
    {result.reason === "short_names" ? <>
      <strong>Add location short names before exporting.</strong>
      <span>{result.locationNames?.join(", ")}</span>
      {canManageLocations ? <Link to="/app/settings/locations">Open Location Settings</Link> : <span>Ask a workspace manager to add them.</span>}
    </> : <span>{result.reason === "edit" ? "Save a draft to export this schedule." : result.reason === "locations" ? "No locations are available to export." : "Waiting for the current preview…"}</span>}
  </div>;
}

/** D: two-line summary in the settings-menu voice. */
function SourceLine(props: PanelProps) {
  const { result } = props;
  if (result.status !== "ready") return <Blocked {...props} />;
  const { source, dates, locations } = result.snapshot;
  const count = counts(result);
  return <div className="export-xd-source" aria-live="polite">
    <p><span className={`export-xd-state${source.kind === "draft" ? " is-draft" : ""}`}>{source.kind === "draft" ? "Draft" : "Published"}</span>
      {source.kind === "draft" ? <span className="export-xd-draft-name">{source.name}</span> : null}</p>
    <p className="export-xd-source-range">{range(dates)}</p>
    <p className="export-xd-muted" title={locations.map(location => location.name).join(", ")}>{locationList(locations)}</p>
    <p className="export-xd-muted">{count.employees} · {count.shifts}</p>
  </div>;
}

/** E/F: key-value rows. */
function SourceTable({ compact, ...props }: PanelProps & { readonly compact?: boolean }) {
  const { result } = props;
  if (result.status !== "ready") return <Blocked {...props} />;
  const { source, dates, locations } = result.snapshot;
  const count = counts(result);
  const rows: [string, ReactNode][] = [
    ["Source", <span className={`export-xd-state${source.kind === "draft" ? " is-draft" : ""}`}>{source.kind === "draft" ? `Draft · ${source.name}` : "Published"}</span>],
    ["Range", range(dates)],
    ...(compact ? [["Scope", `${count.locations} · ${count.employees} · ${count.shifts}`] as [string, ReactNode]] : [
      ["Locations", <span title={locations.map(location => location.name).join(", ")}>{locationList(locations)}</span>],
      ["Employees", count.employees.split(" ")[0]],
      ["Shifts", count.shifts.split(" ")[0]],
    ] as [string, ReactNode][]),
  ];
  return <dl className="export-xd-table" aria-live="polite">
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function Filename({ result, preferences }: PanelProps) {
  if (result.status !== "ready") return null;
  const extension = preferences.format === "xlsx" ? "xlsx" : preferences.format;
  const many = preferences.format === "png";
  return <p className="export-xd-filename" title="File name">{result.snapshot.filename}{many ? "_01" : ""}.{extension}{many ? " …" : ""}</p>;
}

/** D: settings-menu rows with a trailing check. */
function MenuRows<T extends string>({ options, value, onChange }: {
  readonly options: readonly { value: T; label: string; hint: string; icon: typeof FileText }[]; readonly value: T; readonly onChange: (value: T) => void;
}) {
  return <div className="export-xd-menu" role="radiogroup">
    {options.map(({ value: option, label, hint, icon: Icon }) => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
      <Icon size={15} aria-hidden="true" /><span>{label}<small>{hint}</small></span>{value === option ? <Check size={15} aria-hidden="true" /> : null}
    </button>)}
  </div>;
}

/** E/F: top-bar button group. */
function Segmented<T extends string>({ options, value, onChange }: {
  readonly options: readonly { value: T; label: string; icon: typeof FileText }[]; readonly value: T; readonly onChange: (value: T) => void;
}) {
  return <div className="export-xd-segmented" role="radiogroup">
    {options.map(({ value: option, label, icon: Icon }) => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
      <Icon size={14} aria-hidden="true" />{label}
    </button>)}
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

/** Same options as the current panel, rendered as menu rows, switch rows or checkbox rows. */
function LayoutControls({ result, preferences, onChange, kind }: PanelProps & { readonly kind: "menu" | "switch" | "check" }) {
  if (preferences.destination === "print") {
    const papers = [["A4", "A4 landscape"], ["LETTER", "US Letter landscape"]] as const;
    const hint = <p className="export-xd-hint">One location per page. Employee rows continue onto additional pages with repeated headers.</p>;
    if (kind === "menu") return <>
      <div className="export-xd-menu" role="radiogroup" aria-label="Paper">
        {papers.map(([paper, text]) => <button key={paper} type="button" role="radio" aria-checked={preferences.paper === paper} onClick={() => onChange({ ...preferences, paper })}>
          <FileText size={15} aria-hidden="true" /><span>{text}</span>{preferences.paper === paper ? <Check size={15} aria-hidden="true" /> : null}
        </button>)}
      </div>{hint}
    </>;
    return <>
      <label className="export-xd-row"><span>Paper</span>
        <select value={preferences.paper} onChange={event => onChange({ ...preferences, paper: event.target.value as ExportPreferences["paper"] })}>
          {papers.map(([paper, text]) => <option key={paper} value={paper}>{text}</option>)}
        </select>
      </label>{hint}
    </>;
  }
  const options: { key: "combineHorizontally" | "combineVertically"; text: string; hint: string; icon: typeof Columns3 }[] = [
    ...(result.status !== "ready" || result.snapshot.layout === "separate"
      ? [{ key: "combineHorizontally" as const, text: "Combine locations", hint: "Side by side across one page width", icon: Columns3 }] : []),
    { key: "combineVertically", text: "One long page", hint: "The page grows to fit; rows stay readable", icon: StretchVertical },
  ];
  if (kind === "menu") return <div className="export-xd-menu">
    {options.map(({ key, text, hint, icon: Icon }) => <button key={key} type="button" role="checkbox" aria-checked={preferences[key]}
      onClick={() => onChange({ ...preferences, [key]: !preferences[key] })}>
      <Icon size={15} aria-hidden="true" /><span>{text}<small>{hint}</small></span>{preferences[key] ? <Check size={15} aria-hidden="true" /> : null}
    </button>)}
  </div>;
  return <>{options.map(({ key, text, hint }) => <label key={key} className={kind === "switch" ? "export-xd-row export-xd-switch" : "export-xd-check"}>
    <span>{text}<small>{hint}</small></span>
    <input type="checkbox" role={kind === "switch" ? "switch" : undefined} checked={preferences[key]}
      onChange={event => onChange({ ...preferences, [key]: event.target.checked })} />
  </label>)}</>;
}

/** F: thumbnail of the existing ExportPreview inside an isolated iframe so its page styles stay out of the app. */
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
  const count = preferences.format === "xlsx"
    ? ready ? `${result.snapshot.locations.length + 2} sheets` : "Workbook"
    : loading ? "Rendering…" : pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : "—";
  return <div className="export-xd-preview">
    <div className="export-xd-thumb" aria-hidden="true">
      <iframe ref={frame} title="Export thumbnail" tabIndex={-1} />
      {loading ? <span className="export-xd-thumb-status">Updating…</span> : null}
    </div>
    <div className="export-xd-preview-bar">
      <span aria-live="polite">{formatLabel(preferences.format)} · {count}</span>
      <button type="button" className="export-xd-secondary" disabled={!ready} onClick={onOpen}><ExternalLink size={14} aria-hidden="true" />Open</button>
    </div>
  </div>;
}

async function pdfPageCount(pdf: Blob): Promise<number> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
  try { return (await task.promise).numPages; } finally { await task.destroy(); }
}
