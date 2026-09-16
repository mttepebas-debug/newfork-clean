import { createExportDocument, type ExportRowMeasurement } from "./document";
import type { ExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot } from "./snapshot";

export async function renderSchedulePdf(snapshot: ScheduleExportSnapshot, preferences: ExportPreferences): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  const splitRows = new Set<string>();
  if (preferences.destination === "print" || !preferences.combineVertically) {
    const measure = async () => {
      const measurements: ExportRowMeasurement[] = [];
      await pdfMake.createPdf(createExportDocument(snapshot, preferences, { splitRows, measurements })).getBuffer();
      return oversizedRows(measurements, preferences.paper === "A4" ? 595.28 : 612);
    };
    for (const key of await measure()) splitRows.add(key);
    // Only oversized employee groups become continued shift subrows. Normal groups
    // stay unbreakable. A single badge too tall for paper must never disappear.
    if (splitRows.size && (await measure()).length) {
      throw new Error("One shift badge is taller than a printable page. Choose Download with one long page; no content has been removed or reduced.");
    }
  }
  return pdfMake.createPdf(createExportDocument(snapshot, preferences, { splitRows })).getBlob();
}

function oversizedRows(rows: readonly ExportRowMeasurement[], paperHeight: number): string[] {
  const firstTop = new Map<number, number>();
  const result: string[] = [];
  for (let index = 0; index < rows.length - 1; index++) {
    const row = rows[index]!, next = rows[index + 1]!;
    if (!firstTop.has(row.group)) firstTop.set(row.group, row.top);
    if (row.group !== next.group || row.key.includes(":end:")) continue;
    const usableHeight = paperHeight - 24 - firstTop.get(row.group)! - 12;
    if (next.top - row.top > usableHeight) result.push(row.key.split(":").slice(0, 2).join(":"));
  }
  return result;
}
