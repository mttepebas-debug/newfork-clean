import { FileDown, PanelLeftClose, PanelLeftOpen, RotateCcw, X } from "lucide-react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import { AppSidebarPanel } from "../../shell/AppSidebarPanel";
import type { ExportPreferences } from "./preferences";
import type { SnapshotResult } from "./snapshot";
import "./export-v2.css";

export function ExportSettingsPanel({ result, preferences, onChange, onReset, onClose, onPreview, onExport, busy, error, canManageLocations, footer }: {
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
  readonly footer?: ReactNode;
}) {
  const disabled = busy || result.status !== "ready";
  const print = preferences.destination === "print";
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
        <p className="export-v2-intro">Your current preview, filters and display settings. Keep using the grid to choose what to export.</p>
        <fieldset className="export-v2-choices">
          <legend>Format</legend>
          {(["pdf", "png", "xlsx"] as const).map(format => <label key={format}>
            <input type="radio" name="export-v2-format" value={format} checked={preferences.format === format}
              onChange={() => onChange({ ...preferences, format, destination: format === "xlsx" ? "download" : preferences.destination })} />
            {format === "xlsx" ? "Excel" : format.toUpperCase()}
          </label>)}
        </fieldset>
        {preferences.format !== "xlsx" ? <fieldset className="export-v2-choices">
          <legend>Output</legend>
          {(["download", "print"] as const).map(destination => <label key={destination}>
            <input type="radio" name="export-v2-destination" checked={preferences.destination === destination}
              onChange={() => onChange({ ...preferences, destination })} />{destination === "download" ? "Download" : "Print"}
          </label>)}
        </fieldset> : <p>One workbook: Merged, each location, and Veri. Only the day header row is frozen.</p>}
        {preferences.format !== "xlsx" ? <details className="export-v2-details">
          <summary>Page layout</summary>
          {print ? <>
            <label>Paper<select value={preferences.paper} onChange={event => onChange({ ...preferences, paper: event.target.value as "A4" | "LETTER" })}>
              <option value="A4">A4 landscape</option><option value="LETTER">US Letter landscape</option>
            </select></label>
            <p>One location per page. Employee rows continue onto additional pages with repeated headers. Merged locations print separately.</p>
          </> : <>
            {result.status !== "ready" || result.snapshot.layout === "separate" ? <label className="export-v2-checkbox">
              <input type="checkbox" checked={preferences.combineHorizontally} onChange={event => onChange({ ...preferences, combineHorizontally: event.target.checked })} />
              Combine locations across one document width
            </label> : null}
            <label className="export-v2-checkbox"><input type="checkbox" checked={preferences.combineVertically}
              onChange={event => onChange({ ...preferences, combineVertically: event.target.checked })} />One long page; keep rows readable</label>
            <p>The page grows to fit. No tiny rows or text to force a fixed paper size.</p>
          </>}
        </details> : null}
        <div className="export-v2-source" aria-live="polite">
          {result.status === "ready" ? <>
            <strong>{result.snapshot.source.kind === "draft" ? result.snapshot.source.name : "Published schedule"}</strong>
            <span>{result.snapshot.locations.map(location => location.name).join(" + ")}</span>
            <span>{result.snapshot.dates[0]}{result.snapshot.dates.length > 1 ? ` – ${result.snapshot.dates.at(-1)}` : ""}</span>
          </> : result.reason === "short_names" ? <>
            <strong>Add location short names before exporting.</strong>
            <span>{result.locationNames?.join(", ")}</span>
            {canManageLocations ? <Link to="/app/settings/locations">Open Location Settings</Link> : <span>Ask a workspace manager to add them.</span>}
          </> : <span>{result.reason === "edit" ? "Save a draft to export this schedule." : result.reason === "locations" ? "No locations are available to export." : "Waiting for the current preview…"}</span>}
        </div>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <div className="export-v2-actions">
          <button type="button" disabled={disabled} onClick={onPreview}>Preview in new tab</button>
          <button className="export-v2-primary" type="button" disabled={disabled} onClick={onExport}>
            <FileDown size={16} />{busy ? "Preparing…" : print ? "Prepare print" : "Download"}
          </button>
          <button type="button" onClick={onReset}><RotateCcw size={14} />Reset export settings</button>
        </div>
        {footer}
      </> : null}
    </section>
  )}</AppSidebarPanel>;
}
