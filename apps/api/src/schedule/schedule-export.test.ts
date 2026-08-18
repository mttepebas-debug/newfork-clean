import { describe, expect, it } from "vitest";
import type {
  ScheduleExportPreview,
  ScheduleExportSettings,
} from "@newfork/shared";
import {
  prepareScheduleExport,
  renderScheduleCsv,
  renderSchedulePrintHtml,
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
  it("renders deterministic UTF-8 CSV with escaped cells and CRLF rows", () => {
    const csv = renderScheduleCsv(preview, settings);

    expect(csv.startsWith("\uFEFFDate,Location,Employee")).toBe(true);
    expect(csv).toContain('"Main, Dining","Avery ""Ace"" Stone"');
    expect(csv).toContain('"Window\n<script>alert(1)</script>"');
    expect(csv).toContain("5:05 PM,11:30 PM,No");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "").includes("\r")).toBe(false);
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

  it("escapes schedule content in printable HTML", () => {
    const html = renderSchedulePrintHtml(preview, {
      ...settings,
      format: "print",
    });

    expect(html).toContain("Meyhouse &amp; &lt;Partners&gt;");
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
});
