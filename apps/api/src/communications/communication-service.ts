import {
  announcementListSchema,
  announcementMutationSchema,
  notificationInboxSchema,
  workspaceDashboardSchema,
  type AnnouncementInput,
  type AnnouncementList,
  type NotificationAction,
  type NotificationInbox,
  type WorkspaceDashboard,
  type WorkspaceLayoutInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const savedResultSchema = z.object({
  status: z.literal("saved"),
  affected: z.coerce.number().int().nonnegative().optional(),
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
    input: ActorInput & {
      category: string | null;
      unreadOnly: boolean;
      cursor: string | null;
      limit: number;
    },
  ): Promise<NotificationInbox>;
  actOnNotification(
    input: ActorInput & { action: NotificationAction },
  ): Promise<z.infer<typeof savedResultSchema>>;
  getWorkspace(input: ActorInput): Promise<WorkspaceDashboard>;
  saveWorkspaceLayout(
    input: ActorInput & { layout: WorkspaceLayoutInput },
  ): Promise<z.infer<typeof savedResultSchema>>;
}

interface ActorInput {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

export function createCommunicationService(options: {
  url: string;
  serviceRoleKey: string;
}): CommunicationService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  const actorArgs = (input: ActorInput) => ({
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
        await rpc("save_announcement_service", {
          ...actorArgs(input),
          target_announcement_id: input.announcementId,
          target_expected_revision: input.expectedRevision,
          target_title: input.announcement.title,
          target_body: input.announcement.body,
          target_category: input.announcement.category,
          target_audience_roles: input.announcement.audience_roles,
          target_location_ids: input.announcement.location_ids,
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
      return notificationInboxSchema.parse(
        await rpc("get_notifications_service", {
          ...actorArgs(input),
          target_category: input.category,
          target_unread_only: input.unreadOnly,
          target_cursor: input.cursor,
          target_limit: input.limit,
        }),
      );
    },
    async actOnNotification(input) {
      return savedResultSchema.parse(
        await rpc("act_on_notification_service", {
          ...actorArgs(input),
          target_notification_id: input.action.notification_id,
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
  };
}
