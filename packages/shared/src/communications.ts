import { z } from "zod";

// Archive is archived_at, from any status (Mert, 2026-10-02: unpublish and
// archive are two things, and both come back).
export const announcementStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "unpublished",
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

export const appActionUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/app(?:[/?#]|$)/, "Action URL must stay inside the app");

export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(5_000),
    category: announcementCategorySchema,
    audience_roles: z.array(announcementAudienceRoleSchema).max(4),
    location_ids: z.array(z.string().uuid()).max(100),
    department_ids: z.array(z.string().uuid()).max(100).optional(),
    job_ids: z.array(z.string().uuid()).max(100).optional(),
    publish_at: z.string().datetime({ offset: true }).nullable(),
    expires_at: z.string().datetime({ offset: true }).nullable(),
    action_url: appActionUrlSchema.nullable(),
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
  /**
   * What the list shows: "expired" once past its end (K12), "publish_failed"
   * when the scheduled release could not publish it (KK-98); otherwise status.
   */
  display_status: z.enum(["draft", "scheduled", "published", "unpublished", "expired", "publish_failed"]).optional(),
  /** Why a scheduled release failed: the author may no longer publish there, or it failed. */
  publish_error_code: z.enum(["not_allowed", "failed"]).nullable().optional(),
  audience_roles: z.array(announcementAudienceRoleSchema),
  location_ids: z.array(z.string().uuid()),
  location_names: z.array(z.string()),
  department_ids: z.array(z.string().uuid()).optional(),
  department_names: z.array(z.string()).optional(),
  job_ids: z.array(z.string().uuid()).optional(),
  job_names: z.array(z.string()).optional(),
  archived_at: z.string().datetime({ offset: true }).nullable().optional(),
  publish_at: z.string().datetime({ offset: true }).nullable(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  action_url: appActionUrlSchema.nullable(),
  author_name: z.string(),
  author_user_id: z.string().uuid().nullable().optional(),
  revision: z.coerce.number().int().positive(),
  /** Goes up when the title, text, category or link changes; acknowledgements reset then (K4). */
  content_revision: z.coerce.number().int().positive().optional(),
  acknowledged_count: z.coerce.number().int().nonnegative().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  read_at: z.string().datetime({ offset: true }).nullable(),
  acknowledged_at: z.string().datetime({ offset: true }).nullable().optional(),
  can_edit: z.boolean(),
  /** Publish a draft, or republish an unpublished one. */
  can_publish: z.boolean(),
  can_unpublish: z.boolean().optional(),
  can_archive: z.boolean().optional(),
  can_restore: z.boolean().optional(),
});
export type AnnouncementRecord = z.infer<typeof announcementRecordSchema>;

export const announcementListSchema = z.object({
  workspace_id: z.string().uuid(),
  can_manage: z.boolean(),
  /** May write for several locations or the whole workspace (K1: admin and owner). */
  can_target_workspace: z.boolean().optional(),
  /** Where this person may write a one-location announcement. */
  locations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  departments: z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .optional(),
  jobs: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        department_id: z.string().uuid().nullable(),
      }),
    )
    .optional(),
  announcements: z.array(announcementRecordSchema),
});
export type AnnouncementList = z.infer<typeof announcementListSchema>;

export const announcementMutationSchema = z.object({
  status: announcementStatusSchema,
  announcement_id: z.string().uuid(),
  revision: z.coerce.number().int().positive(),
  recipient_count: z.coerce.number().int().nonnegative().default(0),
  archived_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/** Unpublish, archive, restore (Mert, 2026-10-02). Republish is publish. */
export const announcementStateActionSchema = z.enum(["unpublish", "archive", "restore"]);
export type AnnouncementStateAction = z.infer<typeof announcementStateActionSchema>;

export const notificationCategorySchema = z.enum([
  "announcement",
  "request",
  "schedule",
  "security",
  "requests",
  "payroll",
  "people",
  "communications",
  "system",
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export const notificationRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid().nullable(),
  scope: z.enum(["account", "workspace"]).optional(),
  category: notificationCategorySchema,
  type_key: z.string().min(1).optional(),
  severity: z
    .enum(["info", "success", "warning", "action_required"])
    .optional(),
  safe_preview: z.string().default(""),
  title: z.string(),
  body: z.string(),
  action_url: appActionUrlSchema.nullable(),
  group_key: z.string().nullable().optional(),
  source_type: z.string(),
  source_id: z.string().uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
  seen_at: z.string().datetime({ offset: true }).nullable().optional(),
  read_at: z.string().datetime({ offset: true }).nullable(),
  visibility_state: z
    .enum(["visible", "superseded", "cancelled"])
    .default("visible"),
}).superRefine((item, context) => {
  if ((item.workspace_id === null) !== (item.scope === "account")) {
    context.addIssue({ code: "custom", path: ["scope"], message: "Account notifications must have account scope and no workspace" });
  }
});
export type NotificationRecord = z.infer<typeof notificationRecordSchema>;

export const notificationInboxSchema = z.object({
  workspace_id: z.string().uuid().nullable(),
  unread_count: z.coerce.number().int().nonnegative(),
  next_cursor: z.string().min(1).nullable(),
  notifications: z.array(notificationRecordSchema),
});
export type NotificationInbox = z.infer<typeof notificationInboxSchema>;

export const notificationActionSchema = z.object({
  notification_id: z.string().uuid().nullable(),
  action: z.enum(["seen", "read", "unread", "dismiss", "read_all"]),
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
  "todos",
  "notifications",
  "quick_actions",
]);
export type WorkspaceWidgetId = z.infer<typeof workspaceWidgetIdSchema>;

const workspaceWidgetCount = workspaceWidgetIdSchema.options.length;

export const workspaceLayoutInputSchema = z
  .object({
    widget_order: z.array(workspaceWidgetIdSchema).length(workspaceWidgetCount),
    hidden_widget_ids: z
      .array(workspaceWidgetIdSchema)
      .max(workspaceWidgetCount),
  })
  .superRefine((value, issue) => {
    if (new Set(value.widget_order).size !== workspaceWidgetCount) {
      issue.addIssue({
        code: "custom",
        path: ["widget_order"],
        message: "Each workspace widget must appear exactly once",
      });
    }
  });
export type WorkspaceLayoutInput = z.infer<typeof workspaceLayoutInputSchema>;

export const ownerSetupChecklistItemIdSchema = z.enum([
  "app_tour",
  "scheduling_preferences",
  "employees",
  "documents",
  "schedule",
  "billing",
]);
export type OwnerSetupChecklistItemId = z.infer<
  typeof ownerSetupChecklistItemIdSchema
>;

export const ownerSetupChecklistProgressSchema = z.object({
  workspace_id: z.string().uuid(),
  user_id: z.string().uuid(),
  completed_item_ids: z.array(ownerSetupChecklistItemIdSchema),
  closed_at: z.string().datetime({ offset: true }).nullable(),
});
export type OwnerSetupChecklistProgress = z.infer<
  typeof ownerSetupChecklistProgressSchema
>;

export const workspaceTodoSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  severity: z.enum(["info", "warning", "action_required"]),
  status: z.enum(["open", "resolved"]),
  system_generated: z.boolean(),
  source_type: z.string(),
  source_id: z.string().uuid(),
  source_key: z.string(),
  employee_id: z.string().uuid().nullable(),
  due_at: z.string().datetime({ offset: true }).nullable(),
  action_url: appActionUrlSchema.nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type WorkspaceTodo = z.infer<typeof workspaceTodoSchema>;

export const workspaceManualTodoInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(1000).default(""),
  employee_id: z.string().uuid().nullable().default(null),
  due_at: z.string().datetime({ offset: true }).nullable().default(null),
});
export type WorkspaceManualTodoInput = z.infer<
  typeof workspaceManualTodoInputSchema
>;

export const workspaceDashboardSchema = z.object({
  workspace_id: z.string().uuid(),
  display_name: z.string(),
  metrics: z.object({
    today_shift_count: z.coerce.number().int().nonnegative(),
    today_open_shift_count: z.coerce.number().int().nonnegative(),
    pending_time_off_count: z.coerce.number().int().nonnegative(),
    unread_notification_count: z.coerce.number().int().nonnegative(),
  }),
  announcements: z.array(announcementRecordSchema).max(5),
  notifications: z.array(notificationRecordSchema).max(5),
  todos: z.array(workspaceTodoSchema).max(5),
  layout: workspaceLayoutInputSchema,
});
export type WorkspaceDashboard = z.infer<typeof workspaceDashboardSchema>;
