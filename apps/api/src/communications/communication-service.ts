import {
  announcementListSchema,
  announcementMutationSchema,
  notificationInboxSchema,
  ownerSetupChecklistProgressSchema,
  workspaceDashboardSchema,
  workspaceManualTodoInputSchema,
  workspaceTodoSchema,
  type AnnouncementInput,
  type AnnouncementList,
  type NotificationAction,
  type NotificationInbox,
  type OwnerSetupChecklistItemId,
  type OwnerSetupChecklistProgress,
  type WorkspaceDashboard,
  type WorkspaceLayoutInput,
  type WorkspaceManualTodoInput,
  type WorkspaceTodo,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const savedResultSchema = z.object({
  status: z.literal("saved"),
  affected: z.coerce.number().int().nonnegative().optional(),
});

const notificationCursorSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

const notificationInboxRpcSchema = notificationInboxSchema
  .omit({ next_cursor: true })
  .extend({
    next_cursor: notificationCursorSchema.nullable(),
  });

export interface CommunicationService {
  getAnnouncements(input: ActorInput): Promise<AnnouncementList>;
  saveAnnouncement(
    input: ActorInput & {
      announcementId: string | null;
      expectedRevision: number | null;
      announcement: AnnouncementInput;
    },
  ): Promise<z.infer<typeof announcementMutationSchema>>;
  publishAnnouncement(
    input: ActorInput & { announcementId: string; expectedRevision: number },
  ): Promise<z.infer<typeof announcementMutationSchema>>;
  cancelAnnouncement(
    input: ActorInput & { announcementId: string; expectedRevision: number },
  ): Promise<z.infer<typeof announcementMutationSchema>>;
  getNotifications(
    input: Omit<ActorInput, "workspaceId"> & {
      workspaceId: string | null;
      category: string | null;
      severity: string | null;
      readState: "all" | "seen" | "unseen" | "read" | "unread" | null;
      cursor: string | null;
      limit: number;
    },
  ): Promise<NotificationInbox>;
  actOnNotification(
    input: Omit<ActorInput, "workspaceId"> & { workspaceId: string | null; action: NotificationAction },
  ): Promise<z.infer<typeof savedResultSchema>>;
  getWorkspace(input: ActorInput): Promise<WorkspaceDashboard>;
  saveWorkspaceLayout(
    input: ActorInput & { layout: WorkspaceLayoutInput },
  ): Promise<z.infer<typeof savedResultSchema>>;
  createWorkspaceTodo(
    input: ActorInput & { todo: WorkspaceManualTodoInput },
  ): Promise<WorkspaceTodo>;
  resolveWorkspaceTodo(
    input: ActorInput & { todoId: string },
  ): Promise<WorkspaceTodo>;
  getOwnerSetupChecklistProgress(
    input: ActorInput,
  ): Promise<OwnerSetupChecklistProgress>;
  markOwnerSetupChecklistItem(
    input: ActorInput & { itemId: OwnerSetupChecklistItemId },
  ): Promise<OwnerSetupChecklistProgress>;
  setOwnerSetupChecklistClosed(
    input: ActorInput & { closed: boolean },
  ): Promise<OwnerSetupChecklistProgress>;
}

interface ActorInput {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createCommunicationService(options: {
  url: string;
  serviceRoleKey: string;
}): CommunicationService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createCommunicationServiceWithClient(client);
}

export function createCommunicationServiceWithClient(
  client: RpcClient,
): CommunicationService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  const actorArgs = (input: { actorUserId: string; workspaceId: string | null }) => ({
    actor_user_id: input.actorUserId,
    target_workspace_id: input.workspaceId,
  });
  return {
    async getAnnouncements(input) {
      return announcementListSchema.parse(
        await rpc("get_announcements_service", actorArgs(input)),
      );
    },
    async saveAnnouncement(input) {
      return announcementMutationSchema.parse(
        await rpc("save_announcement_audience_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_expected_revision: input.expectedRevision,
          target_title: input.announcement.title,
          target_body: input.announcement.body,
          target_category: input.announcement.category,
          target_audience_roles: input.announcement.audience_roles,
          target_location_ids: input.announcement.location_ids,
          target_department_ids: input.announcement.department_ids ?? [],
          target_job_ids: input.announcement.job_ids ?? [],
          target_publish_at: input.announcement.publish_at,
          target_expires_at: input.announcement.expires_at,
          target_action_url: input.announcement.action_url,
        }),
      );
    },
    async publishAnnouncement(input) {
      return announcementMutationSchema.parse(
        await rpc("publish_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_expected_revision: input.expectedRevision,
        }),
      );
    },
    async cancelAnnouncement(input) {
      return announcementMutationSchema.parse(
        await rpc("cancel_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_expected_revision: input.expectedRevision,
        }),
      );
    },
    async getNotifications(input) {
      const cursor = decodeNotificationCursor(input.cursor);
      const response = notificationInboxRpcSchema.parse(
        await rpc("get_notification_inbox_v2_service", {
          ...actorArgs(input),
          target_category: input.category,
          target_severity: input.severity,
          target_read_state:
            input.readState && input.readState !== "all"
              ? input.readState
              : null,
          target_cursor_created_at: cursor?.created_at ?? null,
          target_cursor_id: cursor?.id ?? null,
          target_limit: input.limit,
        }),
      );
      return notificationInboxSchema.parse({
        ...response,
        next_cursor: response.next_cursor
          ? encodeNotificationCursor(response.next_cursor)
          : null,
      });
    },
    async actOnNotification(input) {
      return savedResultSchema.parse(
        await rpc("act_on_notification_inbox_item_v2_service", {
          ...actorArgs(input),
          target_item_id: input.action.notification_id,
          target_action: input.action.action,
        }),
      );
    },
    async getWorkspace(input) {
      return workspaceDashboardSchema.parse(
        await rpc("get_workspace_dashboard_service", actorArgs(input)),
      );
    },
    async saveWorkspaceLayout(input) {
      return savedResultSchema.parse(
        await rpc("save_workspace_layout_service", {
          ...actorArgs(input),
          target_widget_order: input.layout.widget_order,
          target_hidden_widget_ids: input.layout.hidden_widget_ids,
        }),
      );
    },
    async createWorkspaceTodo(input) {
      const todo = workspaceManualTodoInputSchema.parse(input.todo);
      return workspaceTodoSchema.parse(
        await rpc("create_workspace_todo_service", {
          ...actorArgs(input),
          todo_title: todo.title,
          todo_body: todo.body,
          target_employee_id: todo.employee_id,
          target_due_at: todo.due_at,
        }),
      );
    },
    async resolveWorkspaceTodo(input) {
      return workspaceTodoSchema.parse(
        await rpc("resolve_workspace_todo_service", {
          ...actorArgs(input),
          target_todo_id: input.todoId,
        }),
      );
    },
    async getOwnerSetupChecklistProgress(input) {
      return ownerSetupChecklistProgressSchema.parse(
        await rpc(
          "get_owner_setup_checklist_progress_service",
          actorArgs(input),
        ),
      );
    },
    async markOwnerSetupChecklistItem(input) {
      return ownerSetupChecklistProgressSchema.parse(
        await rpc("mark_owner_setup_checklist_item_service", {
          ...actorArgs(input),
          target_item_id: input.itemId,
        }),
      );
    },
    async setOwnerSetupChecklistClosed(input) {
      return ownerSetupChecklistProgressSchema.parse(
        await rpc("set_owner_setup_checklist_closed_service", {
          ...actorArgs(input),
          should_close: input.closed,
        }),
      );
    },
  };
}

function encodeNotificationCursor(
  cursor: z.infer<typeof notificationCursorSchema>,
): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeNotificationCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    return notificationCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new Error("invalid notification cursor");
  }
}
