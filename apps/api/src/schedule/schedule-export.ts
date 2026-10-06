import type {
  ScheduleExportPreview,
  ScheduleExportSettings,
} from "@newfork/shared/schedule";
import ExcelJS from "exceljs";

type ScheduleExportRow = ScheduleExportPreview["rows"][number];
type ScheduleExportRoleGroup = {
  readonly jobName: string;
  readonly rows: ScheduleExportRow[];
};
type ScheduleExportColumnKey =
  | "date"
  | "location"
  | "employee"
  | "job"
  | "shiftType"
  | "labels"
  | "start"
  | "end"
  | "overnight"
  | "note"
  | "scheduledHours";
type ScheduleExportColumn = {
  readonly key: ScheduleExportColumnKey;
  readonly label: string;
};

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
    warnings: buildScheduleExportWarnings(settings),
  };
}

function buildScheduleExportWarnings(
  settings: ScheduleExportSettings,
): ScheduleExportPreview["warnings"] {
  if (
    settings.format !== "pdf" ||
    settings.layout === "daily_roster" ||
    settings.fit_mode !== "fit_to_page"
  ) {
    return [];
  }
  return [
    {
      code: "pdf_fit_to_page_readability",
      severity: "warning",
      message:
        "One-page PDF exports can be hard to read when the schedule has many rows.",
    },
  ];
}

export function renderScheduleCsv(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): string {
  const labels = localizedExportLabels(settings);
  const columns = buildScheduleExportColumns(settings, labels);
  const lines = [
    columns
      .map((column) => csvCell(column.label, settings.csv_delimiter))
      .join(settings.csv_delimiter),
  ];
  const rowGroups = settings.show_role_separators
    ? buildRoleGroups(preview.rows)
    : [{ jobName: "", rows: preview.rows }];
  for (const group of rowGroups) {
    if (settings.show_role_separators) {
      lines.push(
        buildCsvRoleSeparator(
          group.jobName,
          columns.length,
          settings.csv_delimiter,
          labels,
        ),
      );
    }
    for (const row of group.rows) {
      const values = [
        row.scheduled_date,
        row.location_name,
        row.employee_name ?? labels.openShift,
        row.job_name,
      ];
      if (settings.show_shift_type !== false) values.push(row.shift_type_name ?? "");
      if (settings.show_labels !== false)
        values.push((row.label_names ?? []).join(" · "));
      if (settings.show_clock_in_out !== false) {
        values.push(
          formatRowTime(row, row.start_time, settings.time_format),
          formatRowTime(row, row.end_time, settings.time_format),
          row.crosses_midnight ? labels.yes : labels.no,
        );
      }
      if (settings.include_notes) values.push(row.note);
      if (settings.include_scheduled_hours)
        values.push(formatRowHours(row));
      lines.push(
        values
          .map((value) => csvCell(value, settings.csv_delimiter))
          .join(settings.csv_delimiter),
      );
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function renderScheduleWorkbook(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Newfork";
  workbook.created = new Date();
  const labels = localizedExportLabels(settings);
  addScheduleSummarySheet(workbook, preview, labels);
  addScheduleRowsSheet(workbook, preview, settings, labels);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function renderSchedulePdf(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): Buffer {
  const labels = localizedExportLabels(settings);
  const rows = preview.rows.slice(0, 42).map((row) =>
    [
      row.scheduled_date,
      row.location_name,
      row.employee_name ?? labels.openShift,
      row.job_name,
      settings.show_clock_in_out === false
        ? ""
        : `${formatRowTime(row, row.start_time, settings.time_format)}-${formatRowTime(
            row, row.end_time,
            settings.time_format,
          )}`,
    ]
      .filter(Boolean)
      .join("  "),
  );
  const lines = [
    `${preview.workspace_name} ${labels.scheduleNoun}`,
    `${labels.weekOf} ${preview.week_start}`,
    `${preview.summary.shift_count} ${labels.shifts} - ${formatExportTotal(preview)} ${labels.scheduledHours.toLowerCase()}`,
    "",
    ...rows,
  ];
  return buildSimplePdf(lines);
}

export function renderSchedulePrintHtml(
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
): string {
  const labels = localizedExportLabels(settings);
  const paperSize = settings.paper_size ?? "a4";
  const orientation =
    settings.layout === "daily_roster"
      ? "portrait"
      : settings.orientation === "portrait"
      ? "portrait"
      : settings.orientation === "landscape" || settings.layout === "weekly"
        ? "landscape"
        : "portrait";
  const fitClass =
    settings.layout === "daily_roster"
      ? ""
      : settings.fit_mode === "fit_to_page"
      ? " schedule-export-fit-page"
      : settings.fit_mode === "one_location_per_page"
        ? " schedule-export-location-pages"
        : "";
  const body =
    settings.layout === "daily" || settings.layout === "daily_roster"
      ? [...new Set(preview.rows.map((row) => row.scheduled_date))]
          .map(
            (date) =>
              `<section><h2>${escapeHtml(date)}</h2>${renderPrintTable(
                preview.rows.filter((row) => row.scheduled_date === date),
                settings,
                labels,
                false,
              )}</section>`,
          )
          .join("")
      : renderPrintTable(preview.rows, settings, labels, true);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(preview.workspace_name)} ${escapeHtml(labels.scheduleNoun)}</title><style>@page{size:${paperSize} ${orientation};margin:12mm}body{font:12px system-ui;color:#17211d}body.schedule-export-fit-page{font-size:10px}body.schedule-export-fit-page table{font-size:10px}body.schedule-export-location-pages section{break-after:page}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}p{color:#52615a;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aeb9b4;padding:6px;text-align:left}body.schedule-export-fit-page th,body.schedule-export-fit-page td{padding:4px}th{background:#edf1ef}.schedule-export-role-separator td{background:#f6f8f7;color:#24342e;font-weight:700}.schedule-export-shift-type-badge{display:inline-block;border:1px solid #b7c7bf;border-radius:999px;background:#eef4f1;padding:2px 7px;font-size:11px;font-weight:700}section{break-inside:avoid}@media print{button{display:none}}</style></head><body class="${fitClass.trim()}"><button onclick="window.print()">${escapeHtml(labels.printButton)}</button><h1>${escapeHtml(preview.workspace_name)} ${escapeHtml(labels.scheduleNoun)}</h1><p>${escapeHtml(labels.weekOf)} ${escapeHtml(preview.week_start)} · ${preview.summary.shift_count} ${escapeHtml(labels.shifts)} · ${formatExportTotal(preview)} ${escapeHtml(labels.scheduledHours.toLowerCase())}</p>${body}</body></html>`;
}

function addScheduleSummarySheet(
  workbook: ExcelJS.Workbook,
  preview: ScheduleExportPreview,
  labels: ReturnType<typeof localizedExportLabels>,
): void {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: labels.metric, key: "metric", width: 24 },
    { header: labels.value, key: "value", width: 32 },
  ];
  sheet.addRows([
    { metric: labels.workspace, value: preview.workspace_name },
    { metric: labels.weekStart, value: preview.week_start },
    { metric: labels.locations, value: preview.locations.map((item) => item.name).join(", ") },
    { metric: labels.shifts, value: preview.summary.shift_count },
    { metric: labels.employees, value: preview.summary.employee_count },
    {
      metric: labels.scheduledHours,
      value: formatExportTotal(preview),
    },
  ]);
  styleWorkbookHeader(sheet);
}

function addScheduleRowsSheet(
  workbook: ExcelJS.Workbook,
  preview: ScheduleExportPreview,
  settings: ScheduleExportSettings,
  labels: ReturnType<typeof localizedExportLabels>,
): void {
  const sheet = workbook.addWorksheet("Schedule");
  const columns = buildScheduleExportColumns(settings, labels);
  sheet.columns = columns.map((header) => ({
    header: header.label,
    key: header.key,
    width: header.key === "note" ? 30 : 18,
  }));
  for (const row of preview.rows) {
    const values: Record<string, string | number> = {
      date: row.scheduled_date,
      location: row.location_name,
      employee: row.employee_name ?? labels.openShift,
      job: row.job_name,
    };
    if (settings.show_shift_type !== false)
      values.shiftType = row.shift_type_name ?? "";
    if (settings.show_labels !== false)
      values.labels = (row.label_names ?? []).join(" · ");
    if (settings.show_clock_in_out !== false) {
      values.start = formatRowTime(row, row.start_time, settings.time_format);
      values.end = formatRowTime(row, row.end_time, settings.time_format);
      values.overnight = row.crosses_midnight ? labels.yes : labels.no;
    }
    if (settings.include_notes) values.note = row.note;
    if (settings.include_scheduled_hours)
      values.scheduledHours = (row.time_basis && row.time_basis != "explicit" ? formatRowHours(row) : Number(formatRowHours(row)));
    sheet.addRow(values);
  }
  if (preview.rows.length === 0) {
    sheet.addRow({ date: labels.emptyState });
  }
  styleWorkbookHeader(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function buildScheduleExportColumns(
  settings: ScheduleExportSettings,
  labels: ReturnType<typeof localizedExportLabels>,
): ScheduleExportColumn[] {
  const columns: ScheduleExportColumn[] = [
    { key: "date", label: labels.date },
    { key: "location", label: labels.location },
    { key: "employee", label: labels.employee },
    { key: "job", label: labels.job },
  ];
  if (settings.show_shift_type !== false)
    columns.push({ key: "shiftType", label: labels.shiftType });
  if (settings.show_labels !== false)
    columns.push({ key: "labels", label: labels.labels });
  if (settings.show_clock_in_out !== false)
    columns.push(
      { key: "start", label: labels.start },
      { key: "end", label: labels.end },
      { key: "overnight", label: labels.overnight },
    );
  if (settings.include_notes) columns.push({ key: "note", label: labels.note });
  if (settings.include_scheduled_hours)
    columns.push({ key: "scheduledHours", label: labels.scheduledHours });
  return columns;
}

function styleWorkbookHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF4F1" },
  };
  header.eachCell((cell) => {
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFB8C4BE" } },
    };
  });
}

function buildSimplePdf(lines: readonly string[]): Buffer {
  const pageWidth = 612;
  const pageHeight = 792;
  const content = [
    "BT",
    "/F1 10 Tf",
    "14 TL",
    "48 744 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? "/F1 16 Tf" : index === 1 ? "/F1 11 Tf" : "/F1 10 Tf",
      `(${escapePdfText(line).slice(0, 130)}) Tj`,
      "T*",
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function escapePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function renderPrintTable(
  rows: readonly ScheduleExportRow[],
  settings: ScheduleExportSettings,
  labels: ReturnType<typeof localizedExportLabels>,
  includeDate: boolean,
): string {
  const heading = `${includeDate ? `<th>${escapeHtml(labels.date)}</th>` : ""}<th>${escapeHtml(labels.location)}</th><th>${escapeHtml(labels.employee)}</th><th>${escapeHtml(labels.job)}</th>${settings.show_shift_type !== false ? `<th>${escapeHtml(labels.shiftType)}</th>` : ""}${settings.show_labels !== false ? `<th>${escapeHtml(labels.labels)}</th>` : ""}${settings.show_clock_in_out !== false ? `<th>${escapeHtml(labels.time)}</th>` : ""}${settings.include_notes ? `<th>${escapeHtml(labels.note)}</th>` : ""}${settings.include_scheduled_hours ? `<th>${escapeHtml(labels.hours)}</th>` : ""}`;
  const columnCount = countPrintColumns(settings, includeDate);
  const content = (
    settings.show_role_separators
      ? buildRoleGroups(rows).flatMap((group) => [
          renderPrintRoleSeparator(group.jobName, columnCount),
          ...group.rows.map((row) =>
            renderPrintRow(row, settings, labels, includeDate),
          ),
        ])
      : rows.map((row) => renderPrintRow(row, settings, labels, includeDate))
  ).join("");
  return `<table><thead><tr>${heading}</tr></thead><tbody>${content}</tbody></table>`;
}

function renderPrintRow(
  row: ScheduleExportRow,
  settings: ScheduleExportSettings,
  labels: ReturnType<typeof localizedExportLabels>,
  includeDate: boolean,
): string {
  return `<tr>${includeDate ? `<td>${escapeHtml(row.scheduled_date)}</td>` : ""}<td>${escapeHtml(row.location_name)}</td><td>${escapeHtml(row.employee_name ?? labels.openShift)}</td><td>${escapeHtml(row.job_name)}</td>${settings.show_shift_type !== false ? `<td>${renderShiftType(row.shift_type_name, settings)}</td>` : ""}${settings.show_labels !== false ? `<td>${escapeHtml((row.label_names ?? []).join(" · "))}</td>` : ""}${settings.show_clock_in_out !== false ? `<td>${escapeHtml(`${formatRowTime(row, row.start_time, settings.time_format)}-${formatRowTime(row, row.end_time, settings.time_format)}${row.crosses_midnight ? " +1" : ""}`)}</td>` : ""}${settings.include_notes ? `<td>${escapeHtml(row.note)}</td>` : ""}${settings.include_scheduled_hours ? `<td>${formatRowHours(row)}</td>` : ""}</tr>`;
}

function renderShiftType(
  shiftTypeName: string | null,
  settings: ScheduleExportSettings,
): string {
  const name = escapeHtml(shiftTypeName ?? "");
  return settings.show_preset_shift_badges && name
    ? `<span class="schedule-export-shift-type-badge">${name}</span>`
    : name;
}

function buildRoleGroups(rows: readonly ScheduleExportRow[]): ScheduleExportRoleGroup[] {
  const groupMap = new Map<string, ScheduleExportRow[]>();
  for (const row of rows) {
    const group = groupMap.get(row.job_name);
    if (group) group.push(row);
    else groupMap.set(row.job_name, [row]);
  }
  return Array.from(groupMap, ([jobName, groupRows]) => ({
    jobName,
    rows: groupRows,
  }));
}

function buildCsvRoleSeparator(
  jobName: string,
  columnCount: number,
  delimiter: string,
  labels: ReturnType<typeof localizedExportLabels>,
): string {
  const values = Array.from({ length: columnCount }, () => "");
  values[2] = labels.role;
  values[3] = jobName;
  return values.map((value) => csvCell(value, delimiter)).join(delimiter);
}

function renderPrintRoleSeparator(jobName: string, columnCount: number): string {
  return `<tr class="schedule-export-role-separator"><td colspan="${columnCount}">${escapeHtml(jobName)}</td></tr>`;
}

function countPrintColumns(
  settings: ScheduleExportSettings,
  includeDate: boolean,
): number {
  return (
    3 +
    (includeDate ? 1 : 0) +
    (settings.show_shift_type !== false ? 1 : 0) +
    (settings.show_labels !== false ? 1 : 0) +
    (settings.show_clock_in_out !== false ? 1 : 0) +
    (settings.include_notes ? 1 : 0) +
    (settings.include_scheduled_hours ? 1 : 0)
  );
}

// B-6: a cell a spreadsheet would read as a formula opens as text (OWASP CSV injection).
function csvCell(raw: string, delimiter: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
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
  if (!value) return "—";
  if (format === "24h") return value;
  const [hour, minute] = value.split(":").map(Number);
  return `${hour! % 12 || 12}:${String(minute).padStart(2, "0")} ${hour! >= 12 ? "PM" : "AM"}`;
}

function formatRowTime(row: ScheduleExportRow, time: string, format: "12h" | "24h"): string {
  return `${row.time_basis === "type_default" ? "~" : ""}${formatTime(time, format)}`;
}

function formatRowHours(row: ScheduleExportRow): string {
  return `${row.time_basis === "type_default" ? "~" : ""}${(row.scheduled_minutes / 60).toFixed(2)}`;
}

function formatExportTotal(preview: ScheduleExportPreview): string {
  const prefix = preview.rows.some((row) => row.time_basis === "type_default") ? "~" : "";
  return `${prefix}${(preview.summary.scheduled_minutes / 60).toFixed(2)}`;
}

function localizedExportLabels(settings: ScheduleExportSettings) {
  const locale = settings.locale ?? "en";
  if (locale === "tr") {
    return {
      date: "Tarih",
      location: "Lokasyon",
      employee: "Çalışan",
      job: "Görev",
      shiftType: "Vardiya tipi",
      labels: "Etiketler",
      start: "Başlangıç",
      end: "Bitiş",
      overnight: "Geceye taşar",
      note: "Not",
      scheduledHours: "Planlanan saat",
      time: "Saat",
      hours: "Saat",
      openShift: "Açık vardiya",
      yes: "Evet",
      no: "Hayır",
      role: "Rol",
      metric: "Metrik",
      value: "Değer",
      workspace: "Çalışma alanı",
      weekStart: "Hafta başlangıcı",
      locations: "Lokasyonlar",
      shifts: "vardiya",
      employees: "Çalışanlar",
      scheduleNoun: "programı",
      weekOf: "Hafta",
      printButton: "Yazdır / PDF olarak kaydet",
      emptyState: "Bu export için eşleşen vardiya yok.",
    };
  }
  if (locale === "es") {
    return {
      date: "Fecha",
      location: "Ubicación",
      employee: "Empleado",
      job: "Puesto",
      shiftType: "Tipo de turno",
      labels: "Etiquetas",
      start: "Inicio",
      end: "Fin",
      overnight: "Cruza medianoche",
      note: "Nota",
      scheduledHours: "Horas programadas",
      time: "Hora",
      hours: "Horas",
      openShift: "Turno abierto",
      yes: "Sí",
      no: "No",
      role: "Rol",
      metric: "Métrica",
      value: "Valor",
      workspace: "Espacio de trabajo",
      weekStart: "Inicio de semana",
      locations: "Ubicaciones",
      shifts: "turnos",
      employees: "Empleados",
      scheduleNoun: "horario",
      weekOf: "Semana de",
      printButton: "Imprimir / Guardar como PDF",
      emptyState: "No hay turnos que coincidan con esta exportación.",
    };
  }
  return {
    date: "Date",
    location: "Location",
    employee: "Employee",
    job: "Job",
    shiftType: "Shift type",
    labels: "Labels",
    start: "Start",
    end: "End",
    overnight: "Overnight",
    note: "Note",
    scheduledHours: "Scheduled hours",
    time: "Time",
    hours: "Hours",
    openShift: "Open shift",
    yes: "Yes",
    no: "No",
    role: "Role",
    metric: "Metric",
    value: "Value",
    workspace: "Workspace",
    weekStart: "Week start",
    locations: "Locations",
    shifts: "shifts",
    employees: "Employees",
    scheduleNoun: "schedule",
    weekOf: "Week of",
    printButton: "Print / Save as PDF",
    emptyState: "No shifts match this export.",
  };
}
