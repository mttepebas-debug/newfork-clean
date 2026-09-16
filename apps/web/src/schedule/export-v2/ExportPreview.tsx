import { useState } from "react";
import { createPortal } from "react-dom";
import { exportShiftLines } from "./badge-text";
import { dayHeading, exportDayDecoration, exportRowCells } from "./document";
import type { ExportDownload } from "./files";
import type { ExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot } from "./snapshot";

export function ExportPreview({ target, snapshot, preferences, files, loading, error, onDownload, thumbnail = false }: {
  readonly target: HTMLElement; readonly snapshot: ScheduleExportSnapshot | null; readonly preferences: ExportPreferences;
  readonly files: readonly ExportDownload[]; readonly loading: boolean; readonly error: string | null; readonly onDownload: () => void;
  /** Hide the PDF viewer chrome when embedded as a small thumbnail. */ readonly thumbnail?: boolean;
}) {
  const [sheet, setSheet] = useState("merged");
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const selectedLocations = snapshot?.locations.filter(location => sheet === "merged" || location.id === sheet) ?? [];
  const locations = selectedLocations.length ? selectedLocations : snapshot?.locations ?? [];
  const merged = sheet === "merged" || !selectedLocations.length;
  const print = () => {
    const frame = target.querySelector("iframe");
    try {
      if (frame) { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
      else target.ownerDocument.defaultView?.print();
    } catch { setPrintMessage("Use the PDF viewer's Print control to open your browser's print dialog."); }
  };
  return createPortal(<>
    <style>{`
      *{box-sizing:border-box}body{margin:0;background:#f3f6f4;color:#183329;font:14px Arial,sans-serif}
      header{position:sticky;top:0;background:#fff;padding:14px 20px;border-bottom:1px solid #bac9c2;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:1}
      h1{font-size:16px;margin:0 auto 0 0}button{padding:8px 13px;background:white;color:inherit;border:1px solid #aebfb6;border-radius:6px;cursor:pointer}
      button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible{outline:2px solid #285f50;outline-offset:2px}
      .status{padding:24px}iframe{border:0;width:100%;height:calc(100vh - 64px)}.images{padding:20px}.images img{display:block;max-width:100%;height:auto;margin:0 auto 20px;background:white}
      .sheet{padding:20px;overflow:auto}.sheet nav{display:flex;gap:8px;margin:0 0 16px}.sheet table{border-collapse:collapse;background:white;width:100%;min-width:1050px;table-layout:fixed}
      th,td{border:1px solid #bdcdc4;padding:10px;vertical-align:top}th{background:#ebf2ee}td div{white-space:pre-wrap;background:#e4efe8;border:1px solid #bdcdc4;margin:0 0 6px;padding:8px;line-height:1.5;overflow-wrap:anywhere}
      @page{size:${preferences.paper === "A4" ? "A4" : "letter"} landscape;margin:8mm}
      @media print{header,.status,.sheet nav{display:none}body{background:white}.images{padding:0}.images img{width:100%;margin:0;break-after:page}.images img:last-child{break-after:auto}thead{display:table-header-group}tr{break-inside:avoid}}
    `}</style>
    <header><h1>Schedule export preview</h1>
      <button disabled={loading || !files.length} onClick={onDownload}>Download {preferences.format.toUpperCase()}</button>
      {preferences.destination === "print" && preferences.format !== "xlsx" ? <button disabled={loading || !files.length} onClick={print}>Print</button> : null}
      <span>Updates with the active schedule preview.</span>
    </header>
    {loading ? <p role="status" className="status">Updating the current preview…</p> : error ? <p role="alert" className="status">{error}</p> : !snapshot ?
      <p className="status">Waiting for an available schedule preview.</p> : preferences.format === "pdf" ?
      files[0] ? <iframe title="Schedule PDF" src={thumbnail ? `${files[0].url}#toolbar=0&navpanes=0&view=FitH` : files[0].url} /> : null : preferences.format === "png" ?
      <main className="images">{files.map(file => <img key={file.url} src={file.url} alt={file.name} />)}</main> :
      <main className="sheet"><p>Workbook preview. The downloaded file also contains the filterable Veri sheet.</p>
        <nav aria-label="Workbook sheets"><button onClick={() => setSheet("merged")}>Merged</button>
          {snapshot.locations.map(location => <button key={location.id} onClick={() => setSheet(location.id)}>{location.name}</button>)}
        </nav><h2>{locations.map(location => location.name).join(" + ")}</h2>
        <table><thead><tr><th>Employee</th>{snapshot.dates.map(date => <th key={date}>{dayHeading(date)}
          {exportDayDecoration(snapshot, date, merged ? null : locations[0]!.id)?.lines.map(line => <p key={line}>{line}</p>)}</th>)}{snapshot.totals ? <th>Hours</th> : null}</tr></thead>
          <tbody>{snapshot.rows.map(row => <tr key={row.id ?? "unassigned"}><th>{row.name}</th>
            {exportRowCells(snapshot, row, locations.map(location => location.id), !merged && snapshot.layout === "separate").map((shifts, index) => <td key={index}>
              {shifts.map(shift => <div key={shift.id} style={{ background: shift.ghost ? "#eee" : undefined, outline: shift.focused ? "2px solid #183329" : undefined }}>{exportShiftLines(shift, merged).join("\n")}</div>)}
            </td>)}
            {snapshot.totals ? <td>{row.total}</td> : null}
          </tr>)}{snapshot.totals ? <tr><th>Total</th>{snapshot.dates.map(date => <td key={date}>{snapshot.totals!.cells.find(cell => cell.date === date && cell.locationId === (merged ? null : locations[0]!.id))?.text}</td>)}<td>{snapshot.totals.week}</td></tr> : null}</tbody></table>
      </main>}
    {printMessage ? <p className="status" role="status">{printMessage}</p> : null}
  </>, target);
}
