import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type {
  ScheduleExportPreview,
  ScheduleExportSettings,
} from "@newfork/shared/schedule";
import {
  prepareScheduleExport,
  renderScheduleCsv,
  renderSchedulePdf,
  renderSchedulePrintHtml,
  renderScheduleWorkbook,
} from "./schedule-export";

const settings: ScheduleExportSettings = {
  format: "csv",
  layout: "weekly",
  time_format: "12h",
  include_unassigned: true,
  include_notes: true,
  include_scheduled_hours: true,
  csv_delimiter: ",",
};

const preview: ScheduleExportPreview = {
  status: "export_ready",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  workspace_name: "Meyhouse & <Partners>",
  week_start: "2026-08-17",
  source: { type: "published" },
  source_revision: 1,
  fingerprint: "a".repeat(64),
  locations: [
    { id: "11000000-0000-4000-8000-000000000001", name: "Main, Dining" },
  ],
  rows: [
    {
      shift_id: "82000000-0000-4000-8000-000000000001",
      scheduled_date: "2026-08-17",
      location_name: "Main, Dining",
      employee_name: 'Avery "Ace" Stone',
      job_name: "Server",
      shift_type_name: "Dinner",
      label_names: ["Trainer", "Close"],
      start_time: "17:05",
      end_time: "23:30",
      crosses_midnight: false,
      note: "Window\n<script>alert(1)</script>",
      scheduled_minutes: 385,
    },
    {
      shift_id: "82000000-0000-4000-8000-000000000002",
      scheduled_date: "2026-08-18",
      location_name: "Main, Dining",
      employee_name: null,
      job_name: "Host",
      shift_type_name: null,
      label_names: [],
      start_time: "09:00",
      end_time: "12:00",
      crosses_midnight: false,
      note: "",
      scheduled_minutes: 180,
    },
  ],
  summary: { shift_count: 2, employee_count: 1, scheduled_minutes: 565 },
};

describe("schedule export rendering", () => {
  it("marks reference estimates and never exports invented hours for unknown shifts", () => {
    const source: ScheduleExportPreview = { ...preview, rows: [
      { ...preview.rows[0]!, time_basis: "type_default", scheduled_minutes: 240 },
      { ...preview.rows[1]!, time_basis: "unresolved", start_time: "", end_time: "", scheduled_minutes: 0 },
    ] };
    const prepared = prepareScheduleExport(source, settings);
    const csv = renderScheduleCsv(prepared, settings);
    expect(csv).toContain("~5:05 PM");
    expect(csv).toContain("~4.00");
    expect(csv).toContain("—,—");
    expect(csv).not.toContain("NaN");
    expect(renderSchedulePrintHtml(prepared, settings)).toContain("~4.00");
  });
  it("renders deterministic UTF-8 CSV with escaped cells and CRLF rows", () => {
    const csv = renderScheduleCsv(preview, settings);

    expect(csv.startsWith("\uFEFFDate,Location,Employee")).toBe(true);
    expect(csv).toContain("Shift type,Labels,Start");
    expect(csv).toContain('"Main, Dining","Avery ""Ace"" Stone"');
    expect(csv).toContain("Trainer · Close");
    expect(csv).toContain('"Window\n<script>alert(1)</script>"');
    expect(csv).toContain("5:05 PM,11:30 PM,No");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "").includes("\r")).toBe(false);
  });

  it("renders a valid XLSX workbook with summary and schedule sheets", async () => {
    const buffer = await renderScheduleWorkbook(preview, {
      ...settings,
      format: "xlsx",
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
    );

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Schedule",
    ]);
    expect(workbook.getWorksheet("Summary")?.getCell("B2").value).toBe(
      preview.workspace_name,
    );
    expect(workbook.getWorksheet("Schedule")?.getCell("A2").value).toBe(
      "2026-08-17",
    );
    expect(workbook.getWorksheet("Schedule")?.getCell("C3").value).toBe(
      "Open shift",
    );
  });

  it("renders a valid PDF file for server-side PDF exports", () => {
    const buffer = renderSchedulePdf(preview, {
      ...settings,
      format: "pdf",
    });

    expect(buffer.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
    expect(buffer.toString("utf8")).toContain("/Type /Catalog");
    expect(buffer.toString("utf8")).toContain("startxref");
  });

  it("filters open shifts and recomputes summary before rendering", () => {
    const result = prepareScheduleExport(preview, {
      ...settings,
      include_unassigned: false,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.summary).toEqual({
      shift_count: 1,
      employee_count: 1,
      scheduled_minutes: 385,
    });
  });

  it("adds the reference PDF fit readability warning to prepared previews", () => {
    const result = prepareScheduleExport(preview, {
      ...settings,
      format: "pdf",
      fit_mode: "fit_to_page",
    });

    expect(result.warnings).toEqual([
      {
        code: "pdf_fit_to_page_readability",
        severity: "warning",
        message:
          "One-page PDF exports can be hard to read when the schedule has many rows.",
      },
    ]);

    expect(
      prepareScheduleExport(preview, {
        ...settings,
        format: "csv",
        fit_mode: "fit_to_page",
      }).warnings,
    ).toEqual([]);
  });

  it("escapes schedule content in printable HTML", () => {
    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
    });

    expect(html).toContain("Meyhouse &amp; &lt;Partners&gt;");
    expect(html).toContain("<th>Labels</th>");
    expect(html).toContain("Trainer · Close");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Print / Save as PDF");
  });

  it("renders daily print output as date sections without duplicate date columns", () => {
    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
      layout: "daily",
    });

    expect(html).toContain("<h2>2026-08-17</h2>");
    expect(html).toContain("<h2>2026-08-18</h2>");
    expect(html).not.toContain("<th>Date</th>");
  });

  it("renders daily roster output as portrait date sections without fit scaling", () => {
    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
      layout: "daily_roster",
      orientation: "landscape",
      fit_mode: "fit_to_page",
    });

    expect(html).toContain("@page{size:a4 portrait;margin:12mm}");
    expect(html).toContain("<h2>2026-08-17</h2>");
    expect(html).toContain("<h2>2026-08-18</h2>");
    expect(html).not.toContain("<th>Date</th>");
    expect(html).not.toContain('body class="schedule-export-fit-page"');
  });

  it("honors print paper, orientation, and fit settings", () => {
    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
      paper_size: "letter",
      orientation: "portrait",
      fit_mode: "fit_to_page",
    });

    expect(html).toContain("@page{size:letter portrait;margin:12mm}");
    expect(html).toContain('body class="schedule-export-fit-page"');
    expect(html).toContain("body.schedule-export-fit-page th");
  });

  it("honors reference-style shift type, label, and clock visibility flags", () => {
    const csv = renderScheduleCsv(preview, {
      ...settings,
      show_shift_type: false,
      show_labels: false,
      show_clock_in_out: false,
    });

    expect(csv).not.toContain("Shift type");
    expect(csv).not.toContain("Labels");
    expect(csv).not.toContain("Start");
    expect(csv).not.toContain("End");
    expect(csv).not.toContain("Dinner");
    expect(csv).not.toContain("Trainer");
    expect(csv).not.toContain("5:05 PM");

    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
      show_shift_type: false,
      show_labels: false,
      show_clock_in_out: false,
    });

    expect(html).not.toContain("<th>Shift type</th>");
    expect(html).not.toContain("<th>Labels</th>");
    expect(html).not.toContain("<th>Time</th>");
    expect(html).not.toContain("<td>Dinner</td>");
    expect(html).not.toContain("Trainer");
    expect(html).not.toContain("5:05 PM-11:30 PM");
  });

  it("renders role separator groups and preset shift type badges when enabled", () => {
    const csv = renderScheduleCsv(preview, {
      ...settings,
      show_role_separators: true,
    });

    expect(csv).toContain("\r\n,,Role,Server,,,,,,,\r\n");
    expect(csv).toContain("\r\n,,Role,Host,,,,,,,\r\n");
    expect(csv.indexOf("Role,Server")).toBeLessThan(csv.indexOf("Avery"));

    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
      show_role_separators: true,
      show_preset_shift_badges: true,
    });

    expect(html).toContain('class="schedule-export-role-separator"');
    expect(html).toContain('colspan="9">Server</td>');
    expect(html).toContain(
      '<span class="schedule-export-shift-type-badge">Dinner</span>',
    );
  });

  it("localizes export labels across CSV, HTML, PDF, and XLSX output", async () => {
    const csv = renderScheduleCsv(preview, {
      ...settings,
      locale: "tr",
      csv_delimiter: ";",
    });
    expect(csv.startsWith("\uFEFFTarih;Lokasyon;Çalışan")).toBe(true);
    expect(csv).toContain("Açık vardiya");

    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
      locale: "es",
    });
    expect(html).toContain("<th>Ubicación</th>");
    expect(html).toContain("Semana de 2026-08-17");
    expect(html).toContain("Turno abierto");

    const pdf = renderSchedulePdf(preview, {
      ...settings,
      format: "pdf",
      locale: "es",
    });
    expect(pdf.toString("utf8")).toContain("Semana de 2026-08-17");

    const buffer = await renderScheduleWorkbook(preview, {
      ...settings,
      format: "xlsx",
      locale: "tr",
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
    );
    expect(workbook.getWorksheet("Schedule")?.getCell("A1").value).toBe(
      "Tarih",
    );
    expect(workbook.getWorksheet("Schedule")?.getCell("C3").value).toBe(
      "Açık vardiya",
    );
  });
});
