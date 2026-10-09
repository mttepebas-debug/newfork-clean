import type { ScheduleExportV2Scope } from "@newfork/shared";
import type { ExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot } from "./snapshot";

export interface ExportFile { readonly name: string; readonly blob: Blob }
export function exportAuthorizationScope(snapshot: ScheduleExportSnapshot): ScheduleExportV2Scope {
  return { week_start: snapshot.weekStart, dates: [...snapshot.dates], location_ids: snapshot.locations.map(location => location.id),
    employee_ids: snapshot.rows.flatMap(row => row.id ? [row.id] : []), shift_ids: snapshot.shifts.map(shift => shift.id),
    ...(snapshot.ghosts?.length ? { ghost_shift_ids: [...new Set(snapshot.ghosts.map(shift => shift.id))] } : {}),
    source: snapshot.source.kind === "draft" ? { kind: "draft", id: snapshot.source.id, revision: snapshot.source.revision } : { kind: "published" } };
}
export async function renderExportFiles(snapshot: ScheduleExportSnapshot, preferences: ExportPreferences): Promise<readonly ExportFile[]> {
  if (preferences.format === "xlsx") {
    const { renderScheduleExcel } = await import("./excel");
    return [{ name: `${snapshot.filename}.xlsx`, blob: await renderScheduleExcel(snapshot, preferences) }];
  }
  const { renderSchedulePdf } = await import("./pdf");
  const pdf = await renderSchedulePdf(snapshot, preferences);
  if (preferences.format === "pdf") return [{ name: `${snapshot.filename}.pdf`, blob: pdf }];
  const { renderPdfPngs } = await import("./png");
  const pages = await renderPdfPngs(pdf);
  return pages.map((blob, index) => ({ name: `${snapshot.filename}${pages.length > 1 ? `_${String(index + 1).padStart(2, "0")}` : ""}.png`, blob }));
}

export interface ExportDownload extends ExportFile { readonly url: string }
export function downloadExportFile(file: ExportDownload): void {
  const link = document.createElement("a"); link.href = file.url; link.download = file.name; link.rel = "noopener";
  document.body.append(link); link.click(); link.remove();
}
