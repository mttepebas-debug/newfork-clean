// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createExportDocument, exportPagePlan, exportPageTitle } from "./document";
import { createScheduleWorkbook, exportSheetName, renderScheduleExcel } from "./excel";
import { renderSchedulePdf } from "./pdf";
import { assertSafeExportCanvas, ExportImageTooLargeError } from "./png";
import { defaultExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot } from "./snapshot";
import { requestErrorText } from "../../lib/request-error";

function fixture(employeeCount = 2): ScheduleExportSnapshot {
  return {
    version: 1, workspaceId: "workspace", workspaceName: "Örnek İşletme", weekStart: "2026-09-14", source: { kind: "published" },
    dates: Array.from({ length: 7 }, (_, day) => `2026-09-${14 + day}`), layout: "unified",
    filename: "MRK_SHL_2026-09-14_2026-09-20",
    locations: [{ id: "a", name: "Merkez", shortName: "MRK" }, { id: "b", name: "Sahil", shortName: "SHL" }],
    rows: Array.from({ length: employeeCount }, (_, employee) => ({ id: `person-${employee}`, name: `Çalışan ${employee}`, group: null, total: null })),
    shifts: Array.from({ length: employeeCount }, (_, employee) => [0, 1, 2].map(index => ({
      id: `shift-${employee}-${index}`, employeeId: `person-${employee}`, locationId: index === 2 ? "b" : "a",
      date: "2026-09-14", title: `AM-Server ${employee}-${index}`, position: "Server", shiftType: "AM",
      label: "Açılış", location: index === 2 ? "Sahil" : "Merkez", color: "#15803d",
      time: "09:00 - 13:00", start: "09:00", end: "13:00", overnight: false, focused: false,
    }))).flat(),
  };
}

async function readPdf(blob: Blob) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false });
  const pdf = await task.promise;
  const pages: { text: string; lines: string[]; width: number; height: number; belowPage: boolean }[] = [];
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter(item => "str" in item);
      pages.push({ text: items.map(item => item.str).join(" "), lines: items.map(item => item.str), width: viewport.width, height: viewport.height,
        belowPage: items.some(item => item.transform[5] < 0) });
    }
    return pages;
  } finally { await task.destroy(); }
}

describe("Export v2 real output engines", () => {
  it("carries closures, important days, ghost references and total footer into PDF/Excel without ghost data rows", async () => {
    const base = fixture(1);
    const source: ScheduleExportSnapshot = { ...base, layout: "separate", rows: [{ ...base.rows[0]!, total: "12h" }],
      ghosts: [{ ...base.shifts[2]!, ghost: true, sourceLocationId: "b", locationId: "a" }],
      dayDecorations: [null, "a"].map(locationId => ({ locationId, date: base.dates[0]!, closed: true, lines: ["Closed: Maintenance", "event: Opening"] })),
      totals: { week: "12h", cells: [null, "a", "b"].map(locationId => ({ locationId, date: base.dates[0]!, text: "12h" })) } };
    const pages = await readPdf(await renderSchedulePdf(source, defaultExportPreferences));
    expect(pages[0]!.text).toContain("Closed: Maintenance"); expect(pages[0]!.text).toContain("event: Opening");
    expect(pages[0]!.text).toContain("Reference:"); expect(pages[0]!.text).toContain("Total");
    const workbook = await createScheduleWorkbook(source, defaultExportPreferences);
    expect(workbook.getWorksheet("Merged")!.getCell("B4").value).toBe("Closed: Maintenance\nevent: Opening");
    const localText = JSON.stringify(workbook.getWorksheet("Merkez")!.getSheetValues());
    expect(localText).toContain("Reference:"); expect(localText).toContain("Total");
    expect(JSON.stringify(workbook.getWorksheet("Merged")!.getSheetValues())).not.toContain("Reference:");
    expect(workbook.getWorksheet("Data")!.rowCount).toBe(source.shifts.length + 1);
  }, 30000);
  it.skipIf(!process.env.NEWFORK_EXPORT_QA_OUTPUT)("writes synthetic visual QA PDFs when explicitly requested", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const directory = process.env.NEWFORK_EXPORT_QA_OUTPUT!;
    await mkdir(directory, { recursive: true });
    const source = fixture(8);
    for (const destination of ["download", "print"] as const) {
      const pdf = await renderSchedulePdf(source, { ...defaultExportPreferences, destination });
      await writeFile(join(directory, `export-v2-${destination}-qa.pdf`), new Uint8Array(await pdf.arrayBuffer()));
    }
  }, 30000);

  it("renders one expandable PDF with selectable Unicode, every shift and embedded fonts", async () => {
    const source = fixture(48);
    const blob = await renderSchedulePdf(source, defaultExportPreferences);
    const pages = await readPdf(blob);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.height).toBeGreaterThan(5000);
    expect(pages[0]!.belowPage).toBe(false);
    expect(pages[0]!.text).toContain("Örnek İşletme");
    for (const shift of source.shifts) expect(pages[0]!.text).toContain(shift.title);
    expect(await blob.text()).toContain("/FontFile2");
  }, 30000);

  it("prints a unified grid as one combined table on every page", async () => {
    const pages = await readPdf(await renderSchedulePdf(fixture(16), { ...defaultExportPreferences, destination: "print" }));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.text).toContain("Merkez + Sahil");
      expect(page.belowPage).toBe(false);
    }
  }, 30000);

  it.each(["A4", "LETTER"] as const)("prints %s with repeated headers and at most one location on each page", async paper => {
    const source = { ...fixture(16), layout: "separate" as const };
    const pages = await readPdf(await renderSchedulePdf(source, { ...defaultExportPreferences, destination: "print", paper }));
    expect(pages.length).toBeGreaterThan(2);
    const text = pages.map(page => page.text).join(" ");
    for (const shift of source.shifts) expect(text).toContain(shift.title);
    for (const page of pages) {
      expect(page.text).toContain("Employee");
      expect(page.text.includes("Merkez")).not.toBe(page.text.includes("Sahil"));
      expect(page.width).toBeCloseTo(paper === "A4" ? 841.89 : 792);
      expect(page.height).toBeCloseTo(paper === "A4" ? 595.28 : 612);
      expect(page.belowPage).toBe(false);
    }
  }, 30000);

  it("separates location download pages without shrinking their contents", async () => {
    const source = { ...fixture(3), layout: "separate" as const };
    const pages = await readPdf(await renderSchedulePdf(source, { ...defaultExportPreferences, combineHorizontally: false }));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.text).toContain("Merkez");
    expect(pages[1]!.text).toContain("Sahil");
    expect(pages.every(page => !page.belowPage)).toBe(true);
    const combined = createExportDocument(source, defaultExportPreferences);
    expect(combined.pageSize).toEqual({ width: 1586, height: "auto" });
    // Side by side: a labelled band per location above the day headers, split by a heavier rule.
    const table = (combined.content as { table: { headerRows: number; body: { text?: string; colSpan?: number }[][] }; layout: { vLineWidth: (index: number) => number; vLineColor: (index: number) => string } }[])[0]!;
    expect(table.table.headerRows).toBe(3);
    expect(table.table.body[1]![1]).toMatchObject({ text: "Merkez", colSpan: 7 });
    expect(table.table.body[1]![8]).toMatchObject({ text: "Sahil", colSpan: 7 });
    expect(table.table.body[2]![1]!.text).not.toContain("Merkez");
    expect(table.layout.vLineWidth(8)).toBeGreaterThan(1); expect(table.layout.vLineWidth(7)).toBeLessThan(1);
    expect(table.layout.vLineWidth(1)).toBeLessThan(1); expect(table.layout.vLineWidth(15)).toBeLessThan(1);
  }, 30000);

  it("says how a four-location week splits into pages and names every page after its own locations (3P #62)", async () => {
    const base = fixture(14);
    const locations = ["Merkez", "Sahil", "Moda", "Kadıköy"].map((name, index) => ({ id: String.fromCharCode(97 + index), name, shortName: name.slice(0, 3).toUpperCase() }));
    const source: ScheduleExportSnapshot = { ...base, layout: "separate", locations,
      shifts: base.shifts.map((shift, index) => ({ ...shift, locationId: locations[index % 4]!.id })) };
    const print = { ...defaultExportPreferences, destination: "print" as const };
    const plan = exportPagePlan(source, print);
    expect(plan.summary).toBe("One location per page · rows continue onto more pages");
    expect(plan.titles).toEqual(["Merkez", "Sahil", "Moda", "Kadıköy"]);
    const pages = await readPdf(await renderSchedulePdf(source, print));
    expect(pages.length).toBeGreaterThan(4);
    const titles = pages.map(page => exportPageTitle(plan.titles, page.lines));
    expect(new Set(titles)).toEqual(new Set(plan.titles));
    for (const [index, page] of pages.entries()) expect(page.text).toContain(titles[index]!);
    expect(exportPagePlan(source, defaultExportPreferences)).toEqual({ summary: "4 locations side by side · one long page", titles: ["Merkez + Sahil + Moda + Kadıköy"] });
    expect(exportPagePlan({ ...source, layout: "unified" }, defaultExportPreferences).summary).toBe("All 4 locations in one table · one long page");
    expect(exportPagePlan(source, { ...defaultExportPreferences, combineHorizontally: false, combineVertically: false }).summary)
      .toBe("One location per page · rows continue onto more pages");
    expect(exportPagePlan({ ...source, locations: [locations[0]!] }, defaultExportPreferences).summary).toBe("1 location · one long page");
    expect(exportPageTitle(plan.titles, ["Örnek İşletme", "Employee"])).toBeNull();
  }, 30000);

  it("keeps every shift readable when one employee exceeds a print page", async () => {
    const base = fixture(1);
    const source = { ...base, locations: [base.locations[0]!], shifts: Array.from({ length: 24 }, (_, index) => ({
      ...base.shifts[0]!, id: `oversized-${index}`, title: `Continuation shift ${index}`,
    })) };
    const pages = await readPdf(await renderSchedulePdf(source, { ...defaultExportPreferences, destination: "print" }));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(page => !page.belowPage)).toBe(true);
    for (const shift of source.shifts) expect(pages.map(page => page.text).join(" ")).toContain(shift.title);
  }, 30000);

  it("fails explicitly instead of dropping a single badge taller than paper", async () => {
    const base = fixture(1);
    const source = { ...base, locations: [base.locations[0]!], shifts: [{ ...base.shifts[0]!, label: "Very long label ".repeat(200) }] };
    await expect(renderSchedulePdf(source, { ...defaultExportPreferences, destination: "print" })).rejects.toThrow("taller than a printable page");
    // BL-395: the export panel shows this sentence, not a generic one.
    const failure = await renderSchedulePdf(source, { ...defaultExportPreferences, destination: "print" }).catch((error: unknown) => error);
    expect(requestErrorText(failure)).toMatch(/taller than a printable page/);
    expect(requestErrorText(new ExportImageTooLargeError())).toMatch(/exceeds safe browser limits/);
  }, 30000);

  it("round trips an XLSX with all sheets, shift subrows, row-only freeze and numeric dates/clocks", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const blob = await renderScheduleExcel(fixture(), defaultExportPreferences);
    const book = await new ExcelJS.Workbook().xlsx.load(await blob.arrayBuffer());
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["Merged", "Merkez", "Sahil", "Data"]);
    const sheet = book.getWorksheet("Merged")!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 3, xSplit: 0, topLeftCell: "A4" });
    // Grid-style heading: workspace, location band over the day columns, then source and range.
    expect(sheet.getCell("A1").value).toBe("Örnek İşletme");
    expect(sheet.getCell("B1").value).toBe("Merkez + Sahil"); expect(sheet.getCell("H1").master.address).toBe("B1");
    expect(sheet.getCell("A2").value).toBe("Published · Mon, Sep 14 – Sun, Sep 20, 2026");
    expect(book.getWorksheet("Merkez")!.getCell("B1").value).toBe("Merkez");
    expect(sheet.getCell("B3").value).toBeInstanceOf(Date);
    expect(sheet.getCell("A6").master.address).toBe("A4");
    expect(sheet.getCell("B6").value).toContain("@Sahil");
    expect(sheet.getCell("B4").value).toContain("AM-Server 0-0\nAçılış\n@Merkez\n09:00 - 13:00");
    const data = book.getWorksheet("Data")!;
    expect(data.rowCount).toBe(7);
    expect(data.getCell("B2").value).toBeInstanceOf(Date);
    // ExcelJS decodes date-formatted numeric time cells back to Date objects.
    expect(data.getCell("G2").numFmt).toBe("hh:mm");
    expect(data.getTable("ScheduleData")).toBeDefined();
    expect(book.getWorksheet("Merkez")!.pageSetup).toMatchObject({ fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3", paperSize: 9 });
  });

  it("keeps hidden fields absent and treats untrusted names as plain strings", async () => {
    const source = fixture(1);
    const book = await createScheduleWorkbook({ ...source,
      rows: source.rows.map(row => ({ ...row, name: '=HYPERLINK("https://example.com")' })),
      shifts: source.shifts.map(shift => ({ ...shift, title: "Server", shiftType: null, label: null, time: null, start: null, end: null, overnight: null })),
    }, { ...defaultExportPreferences, paper: "LETTER" });
    expect(book.getWorksheet("Merged")!.getCell("A4").type).toBe(3);
    expect(book.getWorksheet("Data")!.getRow(1).values).toEqual([, "Employee", "Date", "Location", "Position"]);
    expect(book.getWorksheet("Merkez")!.pageSetup.paperSize).toBe(1);
  });

  it("allocates safe distinct sheet names", () => {
    const used = new Set(["merged", "veri"]);
    expect(exportSheetName("Merged", used)).toBe("Merged (2)");
    expect(exportSheetName("MERGED", used)).toBe("MERGED (3)");
    expect(exportSheetName("'A/B:*?'", used)).toBe("A-B---");
    expect(exportSheetName("history", used)).toBe("history (2)");
    expect(exportSheetName("x".repeat(50), used)).toHaveLength(31);
    const unicode = exportSheetName("🌴".repeat(30), used);
    expect(unicode.length).toBeLessThanOrEqual(31);
    expect(Array.from(unicode).every(character => character === "🌴")).toBe(true);
  });

  it("does not silently truncate a shift beyond Excel row-height limits", async () => {
    const base = fixture(1);
    await expect(createScheduleWorkbook({ ...base, shifts: [{ ...base.shifts[0]!, label: "Label ".repeat(500) }] }, defaultExportPreferences))
      .rejects.toThrow("maximum readable row height");
  });

  it("rejects unsafe PNG dimensions explicitly without resizing or splitting", () => {
    expect(() => assertSafeExportCanvas(2325, 7438)).not.toThrow();
    for (const [width, height] of [[0, 1], [20000, 50], [8001, 8000], [NaN, 3], [1, Infinity]]) {
      expect(() => assertSafeExportCanvas(width!, height!)).toThrow(ExportImageTooLargeError);
    }
  });
});
