import { scheduleExportV2PreferencesSchema as exportPreferencesSchema, type ScheduleExportV2Preferences } from "@newfork/shared";
export type ExportPreferences = ScheduleExportV2Preferences;
export const defaultExportPreferences: ExportPreferences = exportPreferencesSchema.parse({});

export function exportPreferencesKey(userId: string, workspaceId: string): string {
  return `newfork:export-v2:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
}

export function loadExportPreferences(storage: Pick<Storage, "getItem">, key: string): ExportPreferences {
  try {
    const parsed = exportPreferencesSchema.safeParse(JSON.parse(storage.getItem(key) ?? "{}"));
    return parsed.success ? parsed.data : { ...defaultExportPreferences };
  } catch { return { ...defaultExportPreferences }; }
}

export function saveExportPreferences(storage: Pick<Storage, "setItem">, key: string, value: ExportPreferences): void {
  // Parsing strips unknown keys: scope/source/data must never be persisted here.
  storage.setItem(key, JSON.stringify(exportPreferencesSchema.parse(value)));
}
