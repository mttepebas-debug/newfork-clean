import type { PaperSize, Workbook, Worksheet } from "exceljs";
import { exportDayDecoration, exportRowCells, exportSubtitle, exportTitleLines, lightBadgeColor } from "./document";
import { exportShiftLines } from "./badge-text";
import type { ScheduleExportSnapshot } from "./snapshot";
import type { ExportPreferences } from "./preferences";
import { ScreenError } from "../../lib/request-error";

export function exportSheetName(name: string, used: Set<string>): string {
  const base = truncateSheetName(name.replace(/[\x00-\x1f*?:/\\[\]]/g, "-").replace(/^'+|'+$/g, "").trim() || "Location", 31);
  let candidate = base, index = 2;
  while (used.has(candidate.toLowerCase()) || candidate.toLowerCase() === "history") {
    const suffix = ` (${index++})`;
    candidate = truncateSheetName(base, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function truncateSheetName(name: string, limit: number): string {
  let value = "";
  for (const character of name) {
    if (value.length + character.length > limit) break;
    value += character;
  }
  return value;
}

export async function createScheduleWorkbook(snapshot: ScheduleExportSnapshot, preferences: ExportPreferences): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = snapshot.workspaceName;
  workbook.subject = exportSubtitle(snapshot);
  const used = new Set(["merged", "data"]);
  const groups = [
    { name: "Merged", locations: snapshot.locations, merged: true },
    ...snapshot.locations.map(location => ({ name: exportSheetName(location.name, used), locations: [location], merged: false })),
  ];
  const showTotals = snapshot.rows.some(row => row.total !== null);
  for (const group of groups) {
    const sheet = workbook.addWorksheet(group.name);
    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 3, topLeftCell: "A4", activeCell: "A4" }];
    sheet.columns = [{ width: 18 }, ...snapshot.dates.map(() => ({ width: 22 })), ...(showTotals ? [{ width: 14 }] : [])];
    // Same heading as the grid: location(s) above the day columns, then source and date range.
    const { title, subtitle } = exportTitleLines(snapshot, group.locations);
    const titleRow = sheet.addRow([snapshot.workspaceName, title]);
    titleRow.height = 30;
    sheet.mergeCells(1, 2, 1, snapshot.dates.length + 1);
    titleRow.eachCell({ includeEmpty: true }, (cell, index) => {
      cell.font = { name: "Arial", size: 12, bold: true, color: { argb: "FF183329" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3ECE7" } };
      cell.alignment = { vertical: "middle", horizontal: index === 1 ? "left" : "center", indent: index === 1 ? 1 : 0 };
    });
    const subtitleRow = sheet.addRow([subtitle]);
    subtitleRow.height = 22;
    sheet.mergeCells(2, 1, 2, sheet.columnCount);
    subtitleRow.getCell(1).font = { name: "Arial", size: 11, color: { argb: "FF183329" } };
    subtitleRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
    const header = sheet.addRow(["Employee", ...snapshot.dates.map(excelDate), ...(showTotals ? ["Hours"] : [])]);
    header.height = 27;
    header.eachCell((cell, index) => {
      cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF183329" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBF2EE" } };
      cell.alignment = { vertical: "middle", horizontal: index === 1 ? "left" : "center" };
      if (index > 1 && index <= snapshot.dates.length + 1) cell.numFmt = "ddd dd mmm";
    });
    const dayNotes = snapshot.dates.map(date => exportDayDecoration(snapshot, date, group.merged ? null : group.locations[0]!.id)?.lines.join("\n") ?? "");
    if (dayNotes.some(Boolean)) {
      const notes = sheet.addRow(["", ...dayNotes]);
      notes.height = Math.max(25, ...dayNotes.map(value => value.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 24)), 0) * 14 + 12));
      if (notes.height > 409) throw new ScreenError("Day annotations exceed Excel's readable row height. Choose PDF with one long page.");
      notes.eachCell({ includeEmpty: true }, cell => { cell.alignment = { wrapText: true, vertical: "middle" }; cell.font = { name: "Arial", size: 10, bold: true }; });
    }
    let previousGroup: string | null = null;
    for (const employee of snapshot.rows) {
      if (employee.group && employee.group !== previousGroup) {
        const separator = sheet.addRow([employee.group]);
        separator.height = 23;
        sheet.mergeCells(separator.number, 1, separator.number, sheet.columnCount);
        separator.getCell(1).font = { name: "Arial", size: 11, bold: true };
        previousGroup = employee.group;
      }
      const cells = exportRowCells(snapshot, employee, group.locations.map(location => location.id), !group.merged && snapshot.layout === "separate");
      const count = Math.max(1, ...cells.map(cell => cell.length));
      const start = sheet.rowCount + 1;
      for (let index = 0; index < count; index++) {
        const values = cells.map(cell => cell[index] ? exportShiftLines(cell[index]!, group.merged).join("\n") : "");
        const row = sheet.addRow([index === 0 ? employee.name : "", ...values, ...(showTotals ? [index === 0 ? employee.total ?? "" : ""] : [])]);
        row.height = Math.max(group.merged ? 64 : 50, ...values.map(value => value.split("\n").reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / 24)), 0) * 14 + 12));
        if (row.height > 409) throw new ScreenError("One shift exceeds Excel's maximum readable row height. Choose PDF with one long page; no content has been clipped or reduced.");
        row.eachCell({ includeEmpty: true }, (cell, column) => {
          cell.font = { name: "Arial", size: 11, bold: column === 1, color: { argb: "FF183329" } };
          cell.alignment = { vertical: "middle", wrapText: true, indent: 1 };
          cell.border = { top: { style: "thin", color: { argb: "FFBDCDC4" } }, bottom: { style: "thin", color: { argb: "FFBDCDC4" } }, left: { style: "thin", color: { argb: "FFBDCDC4" } }, right: { style: "thin", color: { argb: "FFBDCDC4" } } };
          const shift = cells[column - 2]?.[index];
          if (shift) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: shift.ghost ? "FFEEEEEE" : "FF" + lightBadgeColor(shift.color).slice(1).toUpperCase() } };
            if (shift.focused) cell.border = { ...cell.border, top: { style: "medium", color: { argb: "FF183329" } }, bottom: { style: "medium", color: { argb: "FF183329" } } };
          } else if (column > 1 && column <= snapshot.dates.length + 1 && exportDayDecoration(snapshot, snapshot.dates[column - 2]!, group.merged ? null : group.locations[0]!.id)?.closed) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0ED" } };
          }
        });
      }
      if (count > 1) {
        sheet.mergeCells(start, 1, sheet.rowCount, 1);
        if (showTotals) sheet.mergeCells(start, sheet.columnCount, sheet.rowCount, sheet.columnCount);
      }
    }
    if (snapshot.totals) {
      const total = sheet.addRow(["Total", ...snapshot.dates.map(date => snapshot.totals!.cells.find(cell => cell.date === date &&
        cell.locationId === (group.merged ? null : group.locations[0]!.id))?.text ?? ""), ...(showTotals ? [snapshot.totals.week] : [])]);
      total.height = 30; total.font = { name: "Arial", size: 11, bold: true }; total.alignment = { wrapText: true, vertical: "middle" };
    }
    configurePrint(sheet, `${snapshot.workspaceName} · ${group.locations.map(location => location.name).join(" + ")}`, exportSubtitle(snapshot), preferences);
  }
  const data = workbook.addWorksheet("Data");
  const { showTypes, showLabels, showTimes, headers } = exportDataColumns(snapshot);
  const employees = new Map(snapshot.rows.map(employee => [employee.id, employee.name]));
  const rows = snapshot.shifts.map(shift => [employees.get(shift.employeeId) ?? "Unassigned", excelDate(shift.date), shift.location, shift.position,
    ...(showTypes ? [shift.shiftType ?? ""] : []), ...(showLabels ? [shift.label ?? ""] : []),
    ...(showTimes ? [excelTime(shift.start), excelTime(shift.end), shift.overnight === null ? "" : shift.overnight ? "Yes" : "No"] : []),
  ]);
  if (rows.length) data.addTable({ name: "ScheduleData", ref: "A1", headerRow: true, totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: headers.map(name => ({ name, filterButton: true })), rows });
  else data.addRow(headers);
  data.columns.forEach((column, index) => { column.width = index === 0 ? 25 : 20; });
  data.eachRow((row, index) => {
    row.font = { name: "Arial", size: 11, bold: index === 1 };
    if (index > 1) {
      row.getCell(2).numFmt = "yyyy-mm-dd";
      if (showTimes) { row.getCell(headers.indexOf("Start") + 1).numFmt = "hh:mm"; row.getCell(headers.indexOf("End") + 1).numFmt = "hh:mm"; }
    }
  });
  return workbook;
}

export async function renderScheduleExcel(snapshot: ScheduleExportSnapshot, preferences: ExportPreferences): Promise<Blob> {
  const workbook = await createScheduleWorkbook(snapshot, preferences);
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Data sheet columns; optional columns appear only when the snapshot shows that field. */
export function exportDataColumns(snapshot: ScheduleExportSnapshot) {
  const showTypes = snapshot.shifts.some(shift => shift.shiftType !== null);
  const showLabels = snapshot.shifts.some(shift => shift.label !== null);
  const showTimes = snapshot.shifts.some(shift => shift.start !== null);
  return { showTypes, showLabels, showTimes,
    headers: ["Employee", "Date", "Location", "Position", ...(showTypes ? ["Shift type"] : []), ...(showLabels ? ["Label"] : []), ...(showTimes ? ["Start", "End", "Next day"] : [])] };
}
function excelDate(date: string): Date { return new Date(`${date}T00:00:00Z`); }
function excelTime(value: string | null): number | null {
  if (value === null) return null;
  const [hour = 0, minute = 0, second = 0] = value.split(":").map(Number);
  return (hour * 3600 + minute * 60 + second) / 86400;
}
function configurePrint(sheet: Worksheet, heading: string, subtitle: string, prefs: ExportPreferences): void {
  // OOXML paperSize 1 is US Letter; ExcelJS 4.4 omits it from its TypeScript enum.
  sheet.pageSetup = { paperSize: (prefs.paper === "A4" ? 9 : 1) as PaperSize, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: "1:3", printArea: `A1:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`,
    margins: { left: .25, right: .25, top: .5, bottom: .4, header: .2, footer: .2 } };
  sheet.headerFooter.oddHeader = `&L${heading.replace(/&/g, "&&")}\n${subtitle.replace(/&/g, "&&")}`;
  sheet.headerFooter.oddFooter = "&RPage &P of &N";
}
