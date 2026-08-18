import { z } from "zod";

export const announcementStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "cancelled",
]);
export const announcementCategorySchema = z.enum([
  "general",
  "operations",
  "schedule",
]);
export const announcementAudienceRoleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "employee",
]);
export type AnnouncementAudienceRole = z.infer<
  typeof announcementAudienceRoleSchema
>;

export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(5_000),
    category: announcementCategorySchema,
    audience_roles: z.array(announcementAudienceRoleSchema).min(1).max(4),
    location_ids: z.array(z.string().uuid()).max(100),
    publish_at: z.string().datetime({ offset: true }).nullable(),
    expires_at: z.string().datetime({ offset: true }).nullable(),
    action_url: z
      .string()
      .trim()
      .max(500)
      .regex(/^\/app(?:\/|$)/, "Action URL must stay inside the app")
      .nullable(),
  })
  .superRefine((value, issue) => {
    if (
      value.publish_at &&
      value.expires_at &&
      Date.parse(value.expires_at) <= Date.parse(value.publish_at)
    ) {
      issue.addIssue({
        code: "custom",
        path: ["expires_at"],
        message: "Expiry must be after publication",
      });
    }
  });
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const announcementRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  category: announcementCategorySchema,
  status: announcementStatusSchema,
  audience_roles: z.array(announcementAudienceRoleSchema),
  location_ids: z.array(z.string().uuid()),
  location_names: z.array(z.string()),
  publish_at: z.string().datetime({ offset: true }).nullable(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  action_url: z.string().nullable(),
  author_name: z.string(),
  revision: z.coerce.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  read_at: z.string().datetime({ offset: true }).nullable(),
  can_edit: z.boolean(),
  can_publish: z.boolean(),
  can_cancel: z.boolean(),
});
export type AnnouncementRecord = z.infer<typeof announcementRecordSchema>;

export const announcementListSchema = z.object({
  workspace_id: z.string().uuid(),
  can_manage: z.boolean(),
  locations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  announcements: z.array(announcementRecordSchema),
});
export type AnnouncementList = z.infer<typeof announcementListSchema>;

export const announcementMutationSchema = z.object({
  status: announcementStatusSchema,
  announcement_id: z.string().uuid(),
  revision: z.coerce.number().int().positive(),
  recipient_count: z.coerce.number().int().nonnegative().default(0),
});

export const notificationCategorySchema = z.enum([
  "announcement",
  "request",
  "schedule",
]);
export const notificationRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  category: notificationCategorySchema,
  title: z.string(),
  body: z.string(),
  action_url: z.string().nullable(),
  source_type: z.string(),
  source_id: z.string().uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
  read_at: z.string().datetime({ offset: true }).nullable(),
});
export type NotificationRecord = z.infer<typeof notificationRecordSchema>;

export const notificationInboxSchema = z.object({
  workspace_id: z.string().uuid(),
  unread_count: z.coerce.number().int().nonnegative(),
  next_cursor: z.string().datetime({ offset: true }).nullable(),
  notifications: z.array(notificationRecordSchema),
});
export type NotificationInbox = z.infer<typeof notificationInboxSchema>;

export const notificationActionSchema = z.object({
  notification_id: z.string().uuid().nullable(),
  action: z.enum(["read", "unread", "dismiss", "read_all"]),
});
export type NotificationAction = z.infer<typeof notificationActionSchema>;

export const communicationSavedResultSchema = z.object({
  status: z.literal("saved"),
  affected: z.coerce.number().int().nonnegative().optional(),
});
export type CommunicationSavedResult = z.infer<
  typeof communicationSavedResultSchema
>;

export const workspaceWidgetIdSchema = z.enum([
  "operations",
  "pending_requests",
  "open_shifts",
  "announcements",
  "notifications",
  "quick_actions",
]);
export type WorkspaceWidgetId = z.infer<typeof workspaceWidgetIdSchema>;

export const workspaceLayoutInputSchema = z
  .object({
    widget_order: z.array(workspaceWidgetIdSchema).length(6),
    hidden_widget_ids: z.array(workspaceWidgetIdSchema).max(6),
  })
  .superRefine((value, issue) => {
    if (new Set(value.widget_order).size !== 6) {
      issue.addIssue({
        code: "custom",
        path: ["widget_order"],
        message: "Each workspace widget must appear exactly once",
      });
    }
  });
export type WorkspaceLayoutInput = z.infer<typeof workspaceLayoutInputSchema>;

export const workspaceDashboardSchema = z.object({
  workspace_id: z.string().uuid(),
  display_name: z.string(),
  metrics: z.object({
    today_shift_count: z.coerce.number().int().nonnegative(),
    today_open_shift_count: z.coerce.number().int().nonnegative(),
    pending_time_off_count: z.coerce.number().int().nonnegative(),
    pending_shift_change_count: z.coerce.number().int().nonnegative(),
    unread_notification_count: z.coerce.number().int().nonnegative(),
  }),
  announcements: z.array(announcementRecordSchema).max(5),
  notifications: z.array(notificationRecordSchema).max(5),
  layout: workspaceLayoutInputSchema,
});
export type WorkspaceDashboard = z.infer<typeof workspaceDashboardSchema>;
