import {
  announcementListSchema,
  announcementMutationSchema,
  communicationSavedResultSchema,
  notificationInboxSchema,
  workspaceDashboardSchema,
  type AnnouncementInput,
  type NotificationAction,
  type WorkspaceLayoutInput,
} from "@newfork/shared";
import { developmentBearerToken, supabaseClient } from "../lib/supabase";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient)
    throw new Error("Communication storage is not configured");
  const token =
    (await supabaseClient.auth.getSession()).data.session?.access_token ??
    developmentBearerToken();
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/v1/workspaces/${workspaceId}${path}`,
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
        : "Communication operation failed",
    );
  }
  return body;
}

export async function getWorkspaceDashboard(workspaceId: string) {
  return workspaceDashboardSchema.parse(
    await request(workspaceId, "/workspace"),
  );
}
export async function saveWorkspaceLayout(
  workspaceId: string,
  layout: WorkspaceLayoutInput,
) {
  return communicationSavedResultSchema.parse(
    await request(workspaceId, "/workspace/layout", {
      method: "PUT",
      body: JSON.stringify(layout),
    }),
  );
}
export async function getAnnouncements(workspaceId: string) {
  return announcementListSchema.parse(
    await request(workspaceId, "/communications/announcements"),
  );
}
export async function saveAnnouncement(
  workspaceId: string,
  input: {
    announcement_id: string | null;
    expected_revision: number | null;
    announcement: AnnouncementInput;
  },
) {
  return announcementMutationSchema.parse(
    await request(workspaceId, "/communications/announcements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
export async function transitionAnnouncement(
  workspaceId: string,
  announcementId: string,
  action: "publish" | "cancel",
  expectedRevision: number,
) {
  return announcementMutationSchema.parse(
    await request(
      workspaceId,
      `/communications/announcements/${announcementId}/${action}`,
      {
        method: "POST",
        body: JSON.stringify({ expected_revision: expectedRevision }),
      },
    ),
  );
}
export async function getNotifications(
  workspaceId: string,
  options: {
    category?: "announcement" | "request" | "schedule";
    unreadOnly?: boolean;
    cursor?: string;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams({
    unread_only: String(options.unreadOnly ?? false),
    limit: String(options.limit ?? 30),
  });
  if (options.category) query.set("category", options.category);
  if (options.cursor) query.set("cursor", options.cursor);
  return notificationInboxSchema.parse(
    await request(
      workspaceId,
      `/communications/notifications?${query.toString()}`,
    ),
  );
}
export async function actOnNotification(
  workspaceId: string,
  action: NotificationAction,
) {
  return communicationSavedResultSchema.parse(
    await request(workspaceId, "/communications/notifications/action", {
      method: "POST",
      body: JSON.stringify(action),
    }),
  );
}
