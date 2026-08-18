import type {
  ScheduleExportPreview,
  ScheduleExportSettings,
} from "@newfork/shared";

export function prepareScheduleExport(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): ScheduleExportPreview {
  const rows = settings.include_unassigned
    ? preview.rows
    : preview.rows.filter((row) => row.employee_name !== null);
  return {
    ...preview,
    rows,
    summary: {
      shift_count: rows.length,
      employee_count: new Set(
        rows.flatMap((row) => (row.employee_name ? [row.employee_name] : [])),
      ).size,
      scheduled_minutes: rows.reduce(
        (total, row) => total + row.scheduled_minutes,
        0,
      ),
    },
  };
}

export function renderScheduleCsv(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): string {
  const columns = [
    "Date",
    "Location",
    "Employee",
    "Job",
    "Shift type",
    "Start",
    "End",
    "Overnight",
  ];
  if (settings.include_notes) columns.push("Note");
  if (settings.include_scheduled_hours) columns.push("Scheduled hours");
  const lines = [
    columns
      .map((value) => csvCell(value, settings.csv_delimiter))
      .join(settings.csv_delimiter),
  ];
  for (const row of preview.rows) {
    const values = [
      row.scheduled_date,
      row.location_name,
      row.employee_name ?? "Open shift",
      row.job_name,
      row.shift_type_name ?? "",
      formatTime(row.start_time, settings.time_format),
      formatTime(row.end_time, settings.time_format),
      row.crosses_midnight ? "Yes" : "No",
    ];
    if (settings.include_notes) values.push(row.note);
    if (settings.include_scheduled_hours)
      values.push((row.scheduled_minutes / 60).toFixed(2));
    lines.push(
      values
        .map((value) => csvCell(value, settings.csv_delimiter))
        .join(settings.csv_delimiter),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function renderSchedulePrintHtml(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): string {
  const body =
    settings.layout === "daily"
      ? [...new Set(preview.rows.map((row) => row.scheduled_date))]
          .map(
            (date) =>
              `<section><h2>${escapeHtml(date)}</h2>${renderPrintTable(
                preview.rows.filter((row) => row.scheduled_date === date),
                settings,
                false,
              )}</section>`,
          )
          .join("")
      : renderPrintTable(preview.rows, settings, true);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(preview.workspace_name)} schedule</title><style>@page{size:landscape;margin:12mm}body{font:12px system-ui;color:#17211d}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}p{color:#52615a;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aeb9b4;padding:6px;text-align:left}th{background:#edf1ef}section{break-inside:avoid}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(preview.workspace_name)} schedule</h1><p>Week of ${escapeHtml(preview.week_start)} · ${preview.summary.shift_count} shifts · ${(preview.summary.scheduled_minutes / 60).toFixed(2)} scheduled hours</p>${body}</body></html>`;
}

function renderPrintTable(
  rows: ScheduleExportPreview["rows"],
  settings: ScheduleExportSettings,
  includeDate: boolean,
): string {
  const heading = `${includeDate ? "<th>Date</th>" : ""}<th>Location</th><th>Employee</th><th>Job</th><th>Shift type</th><th>Time</th>${settings.include_notes ? "<th>Note</th>" : ""}${settings.include_scheduled_hours ? "<th>Hours</th>" : ""}`;
  const content = rows
    .map(
      (row) =>
        `<tr>${includeDate ? `<td>${escapeHtml(row.scheduled_date)}</td>` : ""}<td>${escapeHtml(row.location_name)}</td><td>${escapeHtml(row.employee_name ?? "Open shift")}</td><td>${escapeHtml(row.job_name)}</td><td>${escapeHtml(row.shift_type_name ?? "")}</td><td>${escapeHtml(`${formatTime(row.start_time, settings.time_format)}-${formatTime(row.end_time, settings.time_format)}${row.crosses_midnight ? " +1" : ""}`)}</td>${settings.include_notes ? `<td>${escapeHtml(row.note)}</td>` : ""}${settings.include_scheduled_hours ? `<td>${(row.scheduled_minutes / 60).toFixed(2)}</td>` : ""}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${heading}</tr></thead><tbody>${content}</tbody></table>`;
}

function csvCell(value: string, delimiter: string): string {
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function formatTime(value: string, format: "12h" | "24h"): string {
  if (format === "24h") return value;
  const [hour, minute] = value.split(":").map(Number);
  return `${hour! % 12 || 12}:${String(minute).padStart(2, "0")} ${hour! >= 12 ? "PM" : "AM"}`;
}
