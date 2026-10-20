import { requestFailure } from "../lib/request-error";
import {
  announcementDetailSchema,
  announcementListSchema,
  announcementPreviewSchema,
  announcementSavedSchema,
  announcementStateResultSchema,
  communicationSavedResultSchema,
  importantDateListSchema,
  managerHomeSchema,
  ownerSetupChecklistItemIdSchema,
  ownerSetupChecklistProgressSchema,
  workspaceDashboardSchema,
  workspaceManualTodoInputSchema,
  workspaceTodoSchema,
  type AnnouncementDraft,
  type AnnouncementIntent,
  type AnnouncementStateAction,
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
    `${newforkApiUrl}${workspaceId ? `/v1/workspaces/${workspaceId}${path}` : `/v1/account${path.replace("/communications", "")}`}`,
    {
      ...init,
      headers,
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw requestFailure(body, response.status, "Communication operation failed");
  }
  return body;
}

export async function getWorkspaceDashboard(workspaceId: string) {
  return workspaceDashboardSchema.parse(
    await request(workspaceId, "/workspace"),
  );
}
/** The managers' Home, "Locations first": each location's day (YONETICI-HOME). */
export async function getManagerHome(workspaceId: string) {
  return managerHomeSchema.parse(await request(workspaceId, "/workspace/home"));
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
export async function getAnnouncement(
  workspaceId: string,
  announcementId: string,
) {
  return announcementDetailSchema.parse(
    await request(
      workspaceId,
      `/communications/announcements/${announcementId}`,
    ),
  );
}
/** Important Dates, under Announcements (EKRAN-08). */
export async function getImportantDates(workspaceId: string) {
  return importantDateListSchema.parse(
    await request(workspaceId, "/communications/important-dates"),
  );
}
/** What keeps it from going out, and which shifts the new days reach. */
export async function previewAnnouncement(
  workspaceId: string,
  input: {
    announcement_id: string | null;
    intent: AnnouncementIntent;
    announcement: AnnouncementDraft;
  },
) {
  return announcementPreviewSchema.parse(
    await request(workspaceId, "/communications/announcements/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
/** Save draft, Schedule, Publish, or Save changes. */
export async function saveAnnouncement(
  workspaceId: string,
  input: {
    announcement_id: string | null;
    expected_revision: number | null;
    intent: AnnouncementIntent;
    announcement: AnnouncementDraft;
  },
) {
  return announcementSavedSchema.parse(
    await request(workspaceId, "/communications/announcements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
/** Unschedule, Unpublish, Archive, Bring back, Remind. */
export async function setAnnouncementState(
  workspaceId: string,
  announcementId: string,
  action: AnnouncementStateAction,
  expectedRevision: number,
  bringBack: readonly string[] = [],
) {
  return announcementStateResultSchema.parse(
    await request(
      workspaceId,
      `/communications/announcements/${announcementId}/${action.replace("_", "-")}`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_revision: expectedRevision,
          bring_back: bringBack,
        }),
      },
    ),
  );
}
export async function acknowledgeAnnouncement(
  workspaceId: string,
  announcementId: string,
) {
  return request(
    workspaceId,
    `/communications/announcements/${announcementId}/acknowledge`,
    { method: "POST" },
  );
}
