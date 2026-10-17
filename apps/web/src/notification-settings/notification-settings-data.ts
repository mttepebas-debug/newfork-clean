import {
  notificationPreferencesSchema,
  notificationWorkspaceSettingsSchema,
  type NotificationPreferences,
  type NotificationPreferencesInput,
  type NotificationWorkspaceSettings,
  type NotificationWorkspaceSettingsInput,
} from "@newfork/shared";
import { apiRequest, supabaseClient } from "../lib/supabase";

// Account > Notifications and Settings > Notifications read and write through
// the API (BILDIRIM-11); the database decides what is a choice (S-123).

export const notificationPreferencesKey = (workspaceId: string) =>
  ["notification-preferences", workspaceId] as const;
export const notificationWorkspaceSettingsKey = (workspaceId: string) =>
  ["notification-settings", workspaceId] as const;

function client() {
  if (!supabaseClient) throw new Error("Notification settings are not configured");
  return supabaseClient;
}

const base = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}`;

export async function loadNotificationPreferences(workspaceId: string): Promise<NotificationPreferences> {
  return notificationPreferencesSchema.parse(await apiRequest(client(), `${base(workspaceId)}/notification-preferences`));
}

export async function saveNotificationPreferences(
  workspaceId: string,
  choices: NotificationPreferencesInput["choices"],
): Promise<NotificationPreferences> {
  return notificationPreferencesSchema.parse(
    await apiRequest(client(), `${base(workspaceId)}/notification-preferences`, {
      method: "PUT",
      body: JSON.stringify({ choices }),
    }),
  );
}

export async function loadNotificationWorkspaceSettings(workspaceId: string): Promise<NotificationWorkspaceSettings> {
  return notificationWorkspaceSettingsSchema.parse(await apiRequest(client(), `${base(workspaceId)}/settings/notifications`));
}

export async function saveNotificationWorkspaceSettings(
  workspaceId: string,
  settings: NotificationWorkspaceSettingsInput,
): Promise<NotificationWorkspaceSettings> {
  return notificationWorkspaceSettingsSchema.parse(
    await apiRequest(client(), `${base(workspaceId)}/settings/notifications`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  );
}

/** A display name for a catalog area; the catalog itself stays in the database. */
const areaNames: Record<string, string> = {
  schedule: "Schedule",
  shift_changes: "Shift changes",
  time_off: "Time off",
  lineup: "Lineup",
  people: "People",
  documents: "Documents",
  announcements: "Announcements",
  account: "Account and security",
  workspace: "Workspace and billing",
};

export function areaName(area: string): string {
  return areaNames[area] ?? area.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}
