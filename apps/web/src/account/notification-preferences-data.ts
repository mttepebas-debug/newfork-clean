import {
  notificationUserPreferencePatchSchema,
  notificationUserPreferenceSavedResultSchema,
  notificationUserPreferencesResponseSchema,
  type NotificationUserPreferencePatch,
} from "@newfork/shared";
import { developmentBearerToken, supabaseClient } from "../lib/supabase";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  if (!supabaseClient)
    throw new Error("Notification preferences storage is not configured");
  const token =
    (await supabaseClient.auth.getSession()).data.session?.access_token ??
    developmentBearerToken();
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/v1/workspaces/${workspaceId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Notification preferences operation failed",
    );
  }
  return body;
}

export async function getNotificationPreferences(workspaceId: string) {
  return notificationUserPreferencesResponseSchema.parse(
    await request(workspaceId, "/me/notification-preferences"),
  );
}

export async function saveNotificationPreferences(
  workspaceId: string,
  input: NotificationUserPreferencePatch,
) {
  const patch = notificationUserPreferencePatchSchema.parse(input);
  return notificationUserPreferenceSavedResultSchema.parse(
    await request(workspaceId, "/me/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );
}
