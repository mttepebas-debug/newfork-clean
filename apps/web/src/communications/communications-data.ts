import {
  announcementListSchema,
  announcementMutationSchema,
  communicationSavedResultSchema,
  notificationCategorySchema,
  notificationInboxSchema,
  ownerSetupChecklistItemIdSchema,
  ownerSetupChecklistProgressSchema,
  workspaceDashboardSchema,
  workspaceManualTodoInputSchema,
  workspaceTodoSchema,
  type AnnouncementInput,
  type NotificationAction,
  type NotificationCategory,
  type OwnerSetupChecklistItemId,
  type WorkspaceManualTodoInput,
  type WorkspaceLayoutInput,
} from "@newfork/shared";
import {
  getApiAccessToken,
  getTabWorkspaceId,
  newforkApiUrl,
  supabaseClient,
} from "../lib/supabase";

export const notificationChangeStorageKey = "newfork.notifications.changed";
export const notificationChangeEventName = "newfork:notifications-changed";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient)
    throw new Error("Communication storage is not configured");
  const token = await getApiAccessToken(supabaseClient);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}${path}`,
    {
      ...init,
      headers,
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
export async function createWorkspaceTodo(
  workspaceId: string,
  input: WorkspaceManualTodoInput,
) {
  return workspaceTodoSchema.parse(
    await request(workspaceId, "/workspace/todos", {
      method: "POST",
      body: JSON.stringify(workspaceManualTodoInputSchema.parse(input)),
    }),
  );
}
export async function resolveWorkspaceTodo(
  workspaceId: string,
  todoId: string,
) {
  return workspaceTodoSchema.parse(
    await request(workspaceId, `/workspace/todos/${todoId}/resolve`, {
      method: "POST",
    }),
  );
}
export async function getOwnerSetupChecklistProgress(workspaceId: string) {
  return ownerSetupChecklistProgressSchema.parse(
    await request(workspaceId, "/workspace/setup-checklist"),
  );
}
export async function markOwnerSetupChecklistItem(
  workspaceId: string,
  itemId: OwnerSetupChecklistItemId,
) {
  return ownerSetupChecklistProgressSchema.parse(
    await request(workspaceId, "/workspace/setup-checklist", {
      method: "PATCH",
      body: JSON.stringify({
        itemId: ownerSetupChecklistItemIdSchema.parse(itemId),
      }),
    }),
  );
}
export async function setOwnerSetupChecklistClosed(
  workspaceId: string,
  closed: boolean,
) {
  return ownerSetupChecklistProgressSchema.parse(
    await request(workspaceId, "/workspace/setup-checklist", {
      method: "PATCH",
      body: JSON.stringify({ closed }),
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
    category?: NotificationCategory;
    readState?: "all" | "seen" | "unseen" | "read" | "unread";
    severity?: "info" | "success" | "warning" | "action_required";
    unreadOnly?: boolean;
    cursor?: string;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams({
    unread_only: String(options.unreadOnly ?? false),
    limit: String(options.limit ?? 30),
  });
  if (options.category)
    query.set("category", notificationCategorySchema.parse(options.category));
  if (options.readState) query.set("read_state", options.readState);
  if (options.severity) query.set("severity", options.severity);
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
  const result = communicationSavedResultSchema.parse(
    await request(workspaceId, "/communications/notifications/action", {
      method: "POST",
      body: JSON.stringify(action),
    }),
  );
  announceNotificationChange(workspaceId);
  return result;
}

export function announceNotificationChange(workspaceId: string): void {
  if (typeof window === "undefined") return;
  const detail = { workspaceId, changedAt: Date.now() };
  window.dispatchEvent(
    new CustomEvent(notificationChangeEventName, { detail }),
  );
  try {
    window.localStorage.setItem(
      notificationChangeStorageKey,
      JSON.stringify(detail),
    );
  } catch {
    // Best-effort cross-tab invalidation. The custom event updates this tab.
  }
}
