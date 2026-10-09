import { requestFailure } from "../lib/request-error";
import {
  notificationOrgPolicyInputSchema,
  notificationPolicyResetInputSchema,
  notificationPolicyResetResultSchema,
  notificationPolicySavedResultSchema,
  notificationPolicyTestInputSchema,
  notificationPolicyTestResultSchema,
  notificationSettingsResponseSchema,
  type NotificationOrgPolicyInput,
  type NotificationPolicyResetInput,
  type NotificationPolicyTestInput,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  if (!supabaseClient)
    throw new Error("Notification settings storage is not configured");
  const token =
    (await supabaseClient.auth.getSession()).data.session?.access_token;
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
    throw requestFailure(body, response.status, "Notification settings operation failed");
  }
  return body;
}

export async function getNotificationSettings(workspaceId: string) {
  return notificationSettingsResponseSchema.parse(
    await request(workspaceId, "/notification-settings"),
  );
}

export async function saveNotificationPolicy(
  workspaceId: string,
  input: NotificationOrgPolicyInput,
) {
  const policy = notificationOrgPolicyInputSchema.parse(input);
  return notificationPolicySavedResultSchema.parse(
    await request(workspaceId, "/notification-settings", {
      method: "PATCH",
      body: JSON.stringify(policy),
    }),
  );
}

export async function resetNotificationPolicies(
  workspaceId: string,
  input: NotificationPolicyResetInput,
) {
  const reset = notificationPolicyResetInputSchema.parse(input);
  return notificationPolicyResetResultSchema.parse(
    await request(workspaceId, "/notification-settings/reset", {
      method: "POST",
      body: JSON.stringify(reset),
    }),
  );
}

export async function previewNotificationPolicy(
  workspaceId: string,
  input: NotificationPolicyTestInput,
) {
  const test = notificationPolicyTestInputSchema.parse(input);
  return notificationPolicyTestResultSchema.parse(
    await request(workspaceId, "/notification-settings/test", {
      method: "POST",
      body: JSON.stringify(test),
    }),
  );
}
