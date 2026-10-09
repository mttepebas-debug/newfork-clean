import {
  settingsReadSchemas,
  type SettingsRead,
  type SettingsReadKind,
} from "@newfork/shared";
import { apiRequest, supabaseClient } from "./supabase";

/**
 * One Settings page's read, through the API (FB-6.1.9). The service behind it
 * decides who may read; a refusal arrives as RequestError with its authz.*
 * reason, so the page can show the no-access card.
 */
export async function readSettings<K extends SettingsReadKind>(
  workspaceId: string,
  kind: K,
): Promise<SettingsRead<K>> {
  if (!supabaseClient) throw new Error("Settings storage is not configured");
  return settingsReadSchemas[kind].parse(
    await apiRequest(supabaseClient, `/v1/workspaces/${workspaceId}/settings/${kind}`),
  ) as SettingsRead<K>;
}
