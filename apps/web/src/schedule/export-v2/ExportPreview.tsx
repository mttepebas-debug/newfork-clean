import { useState } from "react";
import { createPortal } from "react-dom";
import { exportShiftLines } from "./badge-text";
import { dayHeading, exportDayDecoration, exportRowCells, exportTitleLines } from "./document";
import { exportDataColumns } from "./excel";
import type { ExportDownload } from "./files";
import type { ExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot } from "./snapshot";

export function ExportPreview({ target, snapshot, preferences, files: rendered, loading, error, onDownload }: {
  readonly target: HTMLElement; readonly snapshot: ScheduleExportSnapshot | null; readonly preferences: ExportPreferences;
  readonly files: readonly ExportDownload[]; readonly loading: boolean; readonly error: string | null; readonly onDownload: () => void;
}) {
  // The last completed render may belong to the previous format; an XLSX blob in the PDF iframe would download instead of display.
  const files = rendered.filter(file => file.name.endsWith(`.${preferences.format}`));
  const [sheet, setSheet] = useState("merged");
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const selectedLocations = snapshot?.locations.filter(location => sheet === "merged" || location.id === sheet) ?? [];
  const locations = selectedLocations.length ? selectedLocations : snapshot?.locations ?? [];
  const merged = sheet === "merged" || !selectedLocations.length;
  const heading = snapshot ? exportTitleLines(snapshot, snapshot.locations) : null;
  const print = () => {
    const frame = target.querySelector("iframe");
    try {
      if (frame) { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
      else target.ownerDocument.defaultView?.print();
    } catch { setPrintMessage("Use the PDF viewer's Print control to open your browser's print dialog."); }
  };
  const body = error ? <p role="alert" className="status error">{error}</p>
    : !snapshot ? <p className="status">Waiting for an available schedule preview.</p>
    : !files.length && preferences.format !== "xlsx" ? (loading ? <p role="status" className="status">Preparing the preview…</p> : null)
    : preferences.format === "pdf" ? <iframe title="Schedule PDF" src={`${files[0]!.url}#view=FitH`} />
    : preferences.format === "png" ? <main className="images">
      {files.map((file, index) => <figure key={file.url}><img src={file.url} alt={file.name} /><figcaption>Page {index + 1} of {files.length}</figcaption></figure>)}
    </main>
    : <main className="sheet">
      <nav aria-label="Workbook sheets">
        <button aria-pressed={sheet === "merged"} onClick={() => setSheet("merged")}>Merged</button>
        {snapshot.locations.map(location => <button key={location.id} aria-pressed={sheet === location.id} onClick={() => setSheet(location.id)}>{location.name}</button>)}
        <button aria-pressed={sheet === "data"} onClick={() => setSheet("data")}>Data</button>
      </nav>
      {sheet === "data" ? <DataTable snapshot={snapshot} /> : <>
        <h2>{exportTitleLines(snapshot, locations).title}</h2>
        <p className="subtitle">{heading!.subtitle}</p>
        <table><colgroup><col className="employee" />{snapshot.dates.map(date => <col key={date} />)}{snapshot.totals ? <col style={{ width: 90 }} /> : null}</colgroup><thead><tr><th>Employee</th>{snapshot.dates.map(date => <th key={date}>{dayHeading(date)}
          {exportDayDecoration(snapshot, date, merged ? null : locations[0]!.id)?.lines.map(line => <p key={line}>{line}</p>)}</th>)}{snapshot.totals ? <th>Hours</th> : null}</tr></thead>
          <tbody>{snapshot.rows.map(row => <tr key={row.id ?? "unassigned"}><th>{row.name}</th>
            {exportRowCells(snapshot, row, locations.map(location => location.id), !merged && snapshot.layout === "separate").map((shifts, index) => <td key={index}>
              {shifts.map(shift => <div key={shift.id} className={`badge${shift.ghost ? " ghost" : ""}${shift.focused ? " focused" : ""}`}>{exportShiftLines(shift, merged).join("\n")}</div>)}
            </td>)}
            {snapshot.totals ? <td>{row.total}</td> : null}
          </tr>)}{snapshot.totals ? <tr><th>Total</th>{snapshot.dates.map(date => <td key={date}>{snapshot.totals!.cells.find(cell => cell.date === date && cell.locationId === (merged ? null : locations[0]!.id))?.text}</td>)}<td>{snapshot.totals.week}</td></tr> : null}</tbody></table>
      </>}
    </main>;
  return createPortal(<>
    <style>{`
      *{box-sizing:border-box}body{margin:0;background:#f3f6f4;color:#183329;font:14px Arial,sans-serif}
      header{position:sticky;top:0;background:#fff;padding:12px 20px;border-bottom:1px solid #bac9c2;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:1}
      header hgroup{margin:0 auto 0 0;min-width:0}h1{font-size:16px;margin:0}header hgroup p{margin:2px 0 0;font-size:12px;color:#5c6863}
      button{padding:8px 13px;background:white;color:inherit;border:1px solid #aebfb6;border-radius:6px;cursor:pointer;font:inherit;font-size:13px;font-weight:700}
      button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible{outline:2px solid #285f50;outline-offset:2px}
      .chip{padding:4px 10px;border-radius:999px;background:#fdf4dc;color:#8a5a00;font-size:12px;font-weight:700}
      .status{padding:24px}.status.error{color:#9f352a}iframe{border:0;width:100%;height:calc(100vh - 64px)}
      .images{padding:24px;display:flex;flex-direction:column;gap:24px;align-items:center}.images figure{margin:0;max-width:100%}.images img{display:block;max-width:100%;height:auto;background:white;border:1px solid #bdcdc4;box-shadow:0 1px 4px rgba(24,51,41,.12)}
      .images figcaption{margin-top:6px;text-align:center;font-size:12px;color:#5c6863}
      .sheet{padding:20px;overflow:auto}.sheet nav{display:flex;gap:6px;margin:0 0 16px;flex-wrap:wrap}.sheet nav button[aria-pressed="true"]{background:#e7f1ed;border-color:#6c9b8c;color:#155f4d}
      .sheet h2{margin:0;font-size:15px}.sheet .subtitle{margin:2px 0 12px;font-size:12px;color:#5c6863}
      .sheet table{border-collapse:collapse;background:white;width:100%;min-width:${snapshot && snapshot.dates.length > 3 ? "1050px" : "0"};table-layout:fixed}.sheet col.employee{width:170px}
      th,td{border:1px solid #bdcdc4;padding:10px;vertical-align:top}th{background:#ebf2ee;text-align:left}th p{margin:4px 0 0;font-weight:400;font-size:12px}
      td .badge{white-space:pre-wrap;background:#e4efe8;border:1px solid #bdcdc4;margin:0 0 6px;padding:8px;line-height:1.5;overflow-wrap:anywhere}td .badge.ghost{background:#eee}td .badge.focused{outline:2px solid #183329}
      .data td,.data th{padding:6px 10px;white-space:nowrap}.data table{min-width:0;width:auto}
      @page{size:${preferences.paper === "A4" ? "A4" : "letter"} landscape;margin:8mm}
      @media print{header,.status,.sheet nav{display:none}body{background:white}.images{padding:0;gap:0}.images figure{width:100%;break-after:page}.images figure:last-child{break-after:auto}.images img{width:100%;border:0;box-shadow:none}.images figcaption{display:none}thead{display:table-header-group}tr{break-inside:avoid}}
    `}</style>
    <header>
      <hgroup><h1>Schedule export preview</h1>{heading ? <p>{heading.subtitle} · {heading.title}</p> : null}</hgroup>
      {loading ? <span className="chip" role="status">Updating…</span> : null}
      <button disabled={loading || !files.length} onClick={onDownload}>Download {preferences.format.toUpperCase()}</button>
      {preferences.destination === "print" && preferences.format !== "xlsx" ? <button disabled={loading || !files.length} onClick={print}>Print</button> : null}
    </header>
    {body}
    {printMessage ? <p className="status" role="status">{printMessage}</p> : null}
  </>, target);
}

function DataTable({ snapshot }: { readonly snapshot: ScheduleExportSnapshot }) {
  const { showTypes, showLabels, showTimes, headers } = exportDataColumns(snapshot);
  const employees = new Map(snapshot.rows.map(row => [row.id, row.name]));
  return <div className="data">
    <p className="subtitle">Filterable shift list. Excel adds it as the Data sheet.</p>
    <table><thead><tr>{headers.map(name => <th key={name}>{name}</th>)}</tr></thead>
      <tbody>{snapshot.shifts.map(shift => <tr key={shift.id}>
        <td>{employees.get(shift.employeeId) ?? "Unassigned"}</td><td>{shift.date}</td><td>{shift.location}</td><td>{shift.position}</td>
        {showTypes ? <td>{shift.shiftType ?? ""}</td> : null}{showLabels ? <td>{shift.label ?? ""}</td> : null}
        {showTimes ? <><td>{shift.start ?? ""}</td><td>{shift.end ?? ""}</td><td>{shift.overnight === null ? "" : shift.overnight ? "Yes" : "No"}</td></> : null}
      </tr>)}</tbody></table>
  </div>;
}
