import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Maximize2, Printer } from "lucide-react";
import { formatDateNumber } from "../lib/scheduleDateTime";
import { exportPagePlan, exportPageTitle } from "./document";
import type { ExportDownload } from "./files";
import { renderPdfPreviewPages } from "./png";
import type { ExportPreferences } from "./preferences";
import type { SnapshotResult } from "./snapshot";
import "./export-v2.css";
import { WindowAlert } from "../../shell/WindowAlert";

type Format = ExportPreferences["format"];
const formats: readonly { value: Format; label: string; hint: string; icon: typeof FileText }[] = [
  { value: "pdf", label: "PDF", hint: "Print-ready pages", icon: FileText },
  { value: "png", label: "Image", hint: "PNG, one per page", icon: FileImage },
  { value: "xlsx", label: "Excel", hint: "Merged, per location, Data", icon: FileSpreadsheet },
];
const formatLabel = (format: Format) => (format === "xlsx" ? "Excel" : format.toUpperCase());

export interface ExportSettingsPanelProps {
  readonly result: SnapshotResult;
  readonly preferences: ExportPreferences;
  readonly onChange: (value: ExportPreferences) => void;
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

/**
 * Export inside the New Schedule window (Mert, 2026-10-12): what is on the
 * grid now, preview on the left, file, destination and layout on the right.
 */
export function ExportSettingsPanel(props: ExportSettingsPanelProps) {
  const { result, preferences, onChange, onPreview, onExport, busy, error, footer, inline, onInlineTarget } = props;
  const disabled = busy || result.status !== "ready";
  const excel = preferences.format === "xlsx";
  const print = preferences.destination === "print" && !excel;
  const setFormat = (format: Format) => onChange({ ...preferences, format, destination: format === "xlsx" ? "download" : preferences.destination });
  const PrimaryIcon = print ? Printer : Download;
  return (
    <section className="schedule-export-v2" data-schedule-export-v2="true" aria-label="Export settings">
      <SourceLine {...props} />
      <div className="export-v2-grid">
        <InlinePreview result={result} preferences={preferences} files={inline.files} loading={inline.loading} onTarget={onInlineTarget} />
        <div className="export-v2-side">
          <Section title="File">
            <div className="export-v2-formats" role="radiogroup" aria-label="File">
              {formats.map(({ value, label, hint, icon: Icon }) => (
                <button key={value} type="button" role="radio" aria-checked={preferences.format === value} onClick={() => setFormat(value)}>
                  <Icon size={18} aria-hidden="true" /><b>{label}</b><small>{hint}</small>
                </button>
              ))}
            </div>
          </Section>
          {!excel ? (
            <Section title="Send to">
              <Segmented label="Send to" value={preferences.destination} onChange={(destination) => onChange({ ...preferences, destination })}
                options={[{ value: "download", label: "Download" }, { value: "print", label: "Printer" }]} />
            </Section>
          ) : null}
          <Section title={print ? "Paper" : "Layout"}><LayoutControls {...props} /></Section>
          <div className="export-v2-footer">
            {/* Over the settings' bottom edge, above the buttons (UI-FIELDMSG). */}
            <WindowAlert message={error} />
            <button type="button" className="export-v2-secondary" disabled={disabled} onClick={onPreview}>
              <ExternalLink size={14} aria-hidden="true" />Open in a tab
            </button>
            <button type="button" className="export-v2-primary" disabled={disabled} onClick={onExport}>
              <PrimaryIcon size={15} aria-hidden="true" />{busy ? "Preparing…" : `${print ? "Print" : "Download"} ${formatLabel(preferences.format)}`}
            </button>
          </div>
          {footer}
        </div>
      </div>
    </section>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <div className="export-v2-section" role="group" aria-label={title}><strong>{title}</strong>{children}</div>;
}

/** One line over the preview: what is exported. Export takes the grid as it is; it has no source choice. */
function SourceLine({ result, canManageLocations }: ExportSettingsPanelProps) {
  if (result.status !== "ready") {
    return <div className="export-v2-blocked" aria-live="polite">
      {result.reason === "short_names" ? <>
        <strong>Add location short names before exporting.</strong>
        <span>{result.locationNames?.join(", ")}</span>
        {canManageLocations ? <Link to="/app/settings/locations">Open Location Settings</Link> : <span>Ask a workspace manager to add them.</span>}
      </> : <span>{result.reason === "locations" ? "No locations are available to export." : "Waiting for the current preview…"}</span>}
    </div>;
  }
  const { source, dates, locations, rows, shifts } = result.snapshot;
  const first = dates[0]!, last = dates.at(-1)!;
  const employees = rows.filter(row => row.id !== null).length;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const range = first === last ? formatDateNumber(first) : `${formatDateNumber(first)} – ${formatDateNumber(last)}`;
  return <p className="export-v2-source" data-source={source.kind} aria-live="polite">
    <span className="export-v2-state">{source.kind === "draft" ? `Draft · ${source.name}` : source.kind === "edit_session" ? "Editing · not saved" : "Published"}</span>
    <span>{` · ${range} · ${plural(locations.length, "location")} · ${plural(employees, "employee")} · ${plural(shifts.length, "shift")}`}</span>
  </p>;
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  readonly value: T; readonly label: string; readonly onChange: (value: T) => void;
  readonly options: readonly { value: T; label: string }[];
}) {
  return <div className="export-v2-segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

function Switch({ on, label, hint, onChange }: { readonly on: boolean; readonly label: string; readonly hint: string; readonly onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={on} className="export-v2-switch" onClick={onChange}>
    <span><b>{label}</b><small>{hint}</small></span><i aria-hidden="true" />
  </button>;
}

function LayoutControls({ result, preferences, onChange }: ExportSettingsPanelProps) {
  const unified = result.status === "ready" && result.snapshot.layout === "unified";
  if (preferences.format === "xlsx") return <p className="export-v2-hint">One workbook: Merged, each location, and Data. Only the heading rows are frozen.</p>;
  if (preferences.destination === "print") {
    return <>
      <Segmented label="Paper" value={preferences.paper} onChange={paper => onChange({ ...preferences, paper })}
        options={[{ value: "LETTER", label: "US Letter" }, { value: "A4", label: "A4" }]} />
      <p className="export-v2-hint">Landscape. {unified ? "All locations in one table." : "One location per page."} Employee rows continue onto more pages with repeated headers.</p>
    </>;
  }
  return <div className="export-v2-switches">
    {!unified ? <Switch on={preferences.combineHorizontally} label="Locations side by side" hint="All on one page width"
      onChange={() => onChange({ ...preferences, combineHorizontally: !preferences.combineHorizontally })} /> : null}
    <Switch on={preferences.combineVertically} label="One long page" hint="No page breaks between rows"
      onChange={() => onChange({ ...preferences, combineVertically: !preferences.combineVertically })} />
  </div>;
}

interface PreviewPage { readonly url: string; readonly width: number; readonly title: string | null }

/**
 * The file as it comes out (3P #62): one page at a time, whole, named after its
 * locations, with how the week splits into pages; Actual size makes it readable.
 * Excel keeps its sheet thumbnail: ExportPreview in an isolated iframe, so the
 * preview page's styles stay out of the app.
 */
function InlinePreview({ result, preferences, files, loading, onTarget }: {
  readonly result: SnapshotResult; readonly preferences: ExportPreferences; readonly files: readonly ExportDownload[];
  readonly loading: boolean; readonly onTarget: (target: HTMLElement | null) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<readonly PreviewPage[] | null>(null);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const excel = preferences.format === "xlsx";
  const plan = result.status === "ready" ? exportPagePlan(result.snapshot, preferences) : null;
  const titles = JSON.stringify(plan?.titles ?? []);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.head.innerHTML = "<style>header{display:none!important}html,body{overflow:hidden;margin:0}iframe{height:100vh!important}</style>";
    const root = doc.createElement("main"); doc.body.replaceChildren(root);
    onTarget(root);
    return () => onTarget(null);
  }, [onTarget]);
  useEffect(() => {
    setPages(null);
    const own = files.filter(file => file.name.endsWith(`.${preferences.format}`));
    if (excel || !own.length) return;
    let cancelled = false;
    const urls: string[] = [];
    // One group (side by side, or all in one table): the summary already says it; no page title to repeat.
    const named = (JSON.parse(titles) as string[]).filter((_, at, all) => all.length > 1);
    const read = preferences.format === "pdf"
      ? renderPdfPreviewPages(own[0]!.blob).then(rendered => rendered.map(page => ({ blob: page.blob, width: page.width, title: exportPageTitle(named, page.lines) })))
      // A PNG has no text: a page is named only when there is exactly one page per location group.
      : Promise.all(own.map(async (file, at) => ({ blob: file.blob, width: await pngWidth(file.blob), title: own.length === named.length ? named[at]! : null })));
    void read.then(rendered => {
      if (cancelled) return;
      setPages(rendered.map(page => { const url = URL.createObjectURL(page.blob); urls.push(url); return { url, width: page.width, title: page.title }; }));
      setIndex(at => Math.min(at, rendered.length - 1));
    }).catch(() => { if (!cancelled) setPages([]); });
    return () => { cancelled = true; for (const url of urls) URL.revokeObjectURL(url); };
  }, [excel, files, preferences.format, titles]);
  useEffect(() => { stage.current?.scrollTo?.({ top: 0, left: 0 }); }, [index, zoomed]);
  if (excel) {
    const count = result.status === "ready" ? `${result.snapshot.locations.length + 2} sheets` : "Workbook";
    return <div className="export-v2-preview" aria-hidden="true">
      <iframe ref={frame} title="Export thumbnail" tabIndex={-1} />
      <span className="export-v2-thumb-status">{loading ? "Updating…" : `Excel · ${count}`}</span>
    </div>;
  }
  const page = pages?.[index];
  const label = page && pages ? `Page ${index + 1} of ${pages.length}${page.title ? ` · ${page.title}` : ""}` : loading || !pages ? "Rendering…" : "No preview";
  return <div className="export-v2-preview export-v2-pages" role="group" aria-label="Export preview" data-zoomed={zoomed}>
    {/* The thumbnail target stays mounted for Excel; ExportController renders into it only then. */}
    <iframe ref={frame} title="Export thumbnail" tabIndex={-1} hidden />
    <div className="export-v2-stage" ref={stage}>
      {/* A click on the page zooms too; keyboard and screen readers use Actual size. */}
      {page ? <div className="export-v2-page" onClick={() => setZoomed(value => !value)}>
        <img src={page.url} alt={label} style={zoomed ? { width: `${page.width}px` } : undefined} />
      </div> : null}
      {loading ? <span className="export-v2-thumb-status">Updating…</span> : null}
    </div>
    <div className="export-v2-pager">
      <button type="button" aria-label="Previous page" disabled={!pages || index === 0} onClick={() => setIndex(at => at - 1)}><ChevronLeft size={15} aria-hidden="true" /></button>
      <button type="button" aria-label="Next page" disabled={!pages || index >= pages.length - 1} onClick={() => setIndex(at => at + 1)}><ChevronRight size={15} aria-hidden="true" /></button>
      <span className="export-v2-pager-text"><b>{label}</b>{plan ? <small>{plan.summary}</small> : null}</span>
      <button type="button" className="export-v2-zoom" aria-pressed={zoomed} disabled={!page} onClick={() => setZoomed(value => !value)}>
        <Maximize2 size={13} aria-hidden="true" />Actual size
      </button>
    </div>
  </div>;
}

/** A preview PNG is drawn at 2.5x (png.ts); its actual size is 96 DPI. */
async function pngWidth(png: Blob): Promise<number> {
  const bitmap = await createImageBitmap(png);
  try { return Math.round(bitmap.width / 2.5 * 4 / 3); } finally { bitmap.close(); }
}
