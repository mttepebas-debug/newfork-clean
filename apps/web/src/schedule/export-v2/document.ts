import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { ExportPreferences } from "./preferences";
import { exportShiftLines } from "./badge-text";
import type { ExportEmployeeRow, ExportShift, ExportSource, ScheduleExportSnapshot } from "./snapshot";

export function lightBadgeColor(color: string): string {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "54736a";
  return "#" + [0, 2, 4].map(index => Math.round(parseInt(hex.slice(index, index + 2), 16) * .16 + 255 * .84).toString(16).padStart(2, "0")).join("");
}
export function dayHeading(date: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
/** What the file says it shows. An unsaved edit reads as a draft; the file carries no "not saved" note. */
export function exportSourceTitle(source: ExportSource): string {
  if (source.kind === "draft") return `Draft: ${source.name}`;
  if (source.kind === "edit_session") return source.draftName ? `Draft: ${source.draftName}` : "Draft";
  return "Published";
}
export function exportSubtitle(snapshot: ScheduleExportSnapshot): string {
  return `${snapshot.dates[0]}${snapshot.dates.length > 1 ? ` – ${snapshot.dates.at(-1)}` : ""} · ${exportSourceTitle(snapshot.source)}`;
}
/** Human-readable heading shared by PDF, Excel sheets and the preview page. */
export function exportTitleLines(snapshot: ScheduleExportSnapshot, locations: readonly { readonly name: string }[]): { title: string; subtitle: string } {
  const first = snapshot.dates[0]!, last = snapshot.dates.at(-1)!;
  const year = new Date(`${last}T12:00:00Z`).getUTCFullYear();
  const range = `${dayHeading(first)}${first === last ? "" : ` – ${dayHeading(last)}`}, ${year}`;
  return { title: locations.map(location => location.name).join(" + "),
    subtitle: `${exportSourceTitle(snapshot.source)} · ${range}` };
}

export function exportCellShifts(snapshot: ScheduleExportSnapshot, row: ExportEmployeeRow, locationIds: readonly string[], date: string, includeGhosts = snapshot.layout === "separate"): ExportShift[] {
  return [...snapshot.shifts, ...(includeGhosts ? snapshot.ghosts ?? [] : [])].filter(shift => shift.employeeId === row.id && shift.date === date && locationIds.includes(shift.locationId))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}
export function exportRowCells(snapshot: ScheduleExportSnapshot, row: ExportEmployeeRow, locationIds: readonly string[], includeGhosts = snapshot.layout === "separate"): readonly ExportShift[][] {
  return snapshot.dates.map(date => exportCellShifts(snapshot, row, locationIds, date, includeGhosts));
}
export function exportDayDecoration(snapshot: ScheduleExportSnapshot, date: string, locationId: string | null) {
  return snapshot.dayDecorations?.find(item => item.date === date && item.locationId === locationId);
}

export interface ExportRowMeasurement { readonly key: string; readonly group: number; readonly top: number }
export interface ExportDocumentLayout {
  readonly splitRows?: ReadonlySet<string>;
  /** Discarded layout probe. Positions come from pdfmake's own embedded-font layout. */
  readonly measurements?: ExportRowMeasurement[];
}

function pageGroups(snapshot: ScheduleExportSnapshot, prefs: ExportPreferences) {
  // The output follows the grid: a unified grid always exports one combined table, even to print.
  const merged = snapshot.layout === "unified";
  const separatePages = !merged && (prefs.destination === "print" || !prefs.combineHorizontally);
  const groups = separatePages ? snapshot.locations.map(location => [location]) : [[...snapshot.locations]];
  return { merged, separatePages, groups };
}

/** How the file splits into pages, in words, and the heading title of each location group (3P #62). */
export function exportPagePlan(snapshot: ScheduleExportSnapshot, prefs: ExportPreferences): { readonly summary: string; readonly titles: readonly string[] } {
  const { merged, separatePages, groups } = pageGroups(snapshot, prefs);
  const count = snapshot.locations.length;
  const across = count === 1 ? "1 location" : merged ? `All ${count} locations in one table` : separatePages ? "One location per page" : `${count} locations side by side`;
  const down = prefs.destination !== "print" && prefs.combineVertically ? "one long page" : "rows continue onto more pages";
  return { summary: `${across} · ${down}`, titles: groups.map(locations => exportTitleLines(snapshot, locations).title) };
}
/** Which group a rendered page belongs to: its repeated heading carries the group's title as its own line. */
export function exportPageTitle(titles: readonly string[], lines: readonly string[]): string | null {
  return titles.find(title => lines.some(line => line.trim() === title)) ?? null;
}

export function createExportDocument(snapshot: ScheduleExportSnapshot, prefs: ExportPreferences, options: ExportDocumentLayout = {}): TDocumentDefinitions {
  const print = prefs.destination === "print";
  const { merged, separatePages, groups } = pageGroups(snapshot, prefs);
  const dayColumns = snapshot.dates.length * (merged || separatePages ? 1 : snapshot.locations.length);
  const showTotals = snapshot.rows.some(row => row.total !== null);
  const paper = prefs.paper === "A4" ? { width: 841.89, height: 595.28 } : { width: 792, height: 612 };
  // Employee column stays narrow (110pt) so single-day exports do not stretch the name column.
  const width = print ? paper.width : Math.max(520, 48 + 110 + dayColumns * 102 + (showTotals ? 70 : 0));
  const content: Content[] = [];
  for (const [groupIndex, locations] of groups.entries()) {
    const columns = merged
      ? snapshot.dates.map(date => ({ date, locationIds: locations.map(location => location.id) }))
      : locations.flatMap(location => snapshot.dates.map(date => ({ date, locationIds: [location.id] })));
    const { title, subtitle } = exportTitleLines(snapshot, locations);
    const sideBySide = !merged && locations.length > 1;
    const heading: TableCell[] = [
      { text: `${snapshot.workspaceName}\n${title}\n${subtitle}`, colSpan: columns.length + 1 + (showTotals ? 1 : 0), bold: true, fontSize: 12, margin: [5, 4, 5, 7], fillColor: "#eef3f0" },
      ...Array.from({ length: columns.length + (showTotals ? 1 : 0) }, () => ""),
    ];
    // Side by side: each location owns a labelled band of day columns, closed by a heavier rule.
    const locationRow: TableCell[] = [{ text: "" }, ...locations.flatMap(location => [
      { text: location.name, colSpan: snapshot.dates.length, bold: true, fontSize: 10.5, alignment: "center" as const, fillColor: "#e3ece7", margin: [2, 4, 2, 4] as [number, number, number, number] },
      ...Array.from({ length: snapshot.dates.length - 1 }, () => ""),
    ]), ...(showTotals ? [""] : [])];
    const headers: TableCell[] = [{ text: "Employee", bold: true }, ...columns.map(column => ({
      text: `${dayHeading(column.date)}${exportDayDecoration(snapshot, column.date, merged ? null : column.locationIds[0]!)?.lines.map(line => `\n${line}`).join("") ?? ""}`,
      bold: true,
    })), ...(showTotals ? [{ text: "Hours", bold: true }] : [])];
    const body: TableCell[][] = sideBySide ? [heading, locationRow, headers] : [heading, headers];
    const headerRows = body.length;
    const bandEdge = (index: number) => sideBySide && index > 1 && index < 1 + columns.length && (index - 1) % snapshot.dates.length === 0;
    let previousGroup: string | null = null;
    for (const [rowIndex, row] of snapshot.rows.entries()) {
      if (row.group && row.group !== previousGroup) {
        body.push([{ text: row.group, bold: true, fillColor: "#eef3f0", colSpan: headers.length }, ...Array.from({ length: headers.length - 1 }, () => "")]);
        previousGroup = row.group;
      }
      const cells = columns.map(column => exportCellShifts(snapshot, row, column.locationIds, column.date, !merged && snapshot.layout === "separate"));
      const rowKey = `${groupIndex}:${rowIndex}`;
      const split = options.splitRows?.has(rowKey);
      const parts = split ? Math.max(1, ...cells.map(cell => cell.length)) : 1;
      for (let part = 0; part < parts; part++) {
        body.push([
          { id: `export-row:${rowKey}:${part}`, text: `${row.name}${part ? " (continued)" : ""}`, bold: true, margin: [3, 6, 3, 6] },
          ...cells.map<TableCell>((shifts, columnIndex) => {
            const visible = split ? shifts.slice(part, part + 1) : shifts;
            const column = columns[columnIndex]!;
            const fillColor = exportDayDecoration(snapshot, column.date, merged ? null : column.locationIds[0]!)?.closed ? "#f0f0ed" : "#ffffff";
            return visible.length ? { stack: visible.map(shift => badge(shift, merged)), fillColor } : { text: "", margin: [0, 18, 0, 18], fillColor };
          }),
          ...(showTotals ? [{ text: part === 0 ? row.total ?? "" : "", fontSize: 9 }] : []),
        ]);
      }
    }
    if (snapshot.totals) body.push([{ text: "Total", bold: true }, ...columns.map(column => ({ text: snapshot.totals!.cells.find(cell =>
      cell.date === column.date && cell.locationId === (merged ? null : column.locationIds[0]))?.text ?? "", bold: true, fontSize: 9 })),
      ...(showTotals ? [{ text: snapshot.totals.week, bold: true, fontSize: 9 }] : [])]);
    if (options.measurements) body.push([
      { id: `export-row:${groupIndex}:end:0`, text: ".", margin: [3, 6, 3, 6] },
      ...columns.map(() => ""), ...(showTotals ? [""] : []),
    ]);
    content.push({
      ...(groupIndex > 0 ? { pageBreak: "before" as const } : {}),
      table: { headerRows, keepWithHeaderRows: 1, dontBreakRows: true,
        widths: [110, ...columns.map(() => "*" as const), ...(showTotals ? [62] : [])], body },
      layout: {
        hLineWidth: index => index <= headerRows ? .8 : .55,
        vLineWidth: index => bandEdge(index) ? 1.8 : .55, hLineColor: () => "#bac9c2", vLineColor: index => bandEdge(index) ? "#5f7a6f" : "#bac9c2",
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 5, paddingBottom: () => 5,
      },
    });
  }
  return {
    info: { title: snapshot.filename, author: snapshot.workspaceName, subject: "Schedule export" },
    pageSize: { width, height: options.measurements || (!print && prefs.combineVertically) ? "auto" : paper.height },
    pageMargins: [20, 20, 20, 24],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#183329", lineHeight: 1.15 },
    content,
    ...(options.measurements ? { pageBreakBefore: (node: Parameters<NonNullable<TDocumentDefinitions["pageBreakBefore"]>>[0]) => {
      if (node.id?.startsWith("export-row:") && node.startPosition) {
        const [, group, row, part] = node.id.split(":");
        options.measurements!.push({ key: `${group}:${row}:${part}`, group: Number(group), top: node.startPosition.top });
      }
      return false;
    } } : {}),
  };
}

function badge(shift: ExportShift, merged: boolean): Content {
  const lines = exportShiftLines(shift, merged);
  return {
    margin: [0, 2, 0, 4],
    table: { widths: ["*"], body: [[{
      stack: lines.map((text, index) => ({ text, bold: index === 0 || text === shift.time, fontSize: index === 0 ? 9.5 : 9,
        margin: [0, 1, 0, 1] as [number, number, number, number] })),
      fillColor: shift.ghost ? "#eeeeee" : lightBadgeColor(shift.color),
    }]] },
    layout: { hLineWidth: () => .45, vLineWidth: () => .45,
      hLineColor: () => shift.focused ? "#183329" : "#b8c9c0", vLineColor: () => shift.focused ? "#183329" : "#b8c9c0",
      paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 4, paddingBottom: () => 4 },
  };
}
