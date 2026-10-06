import { z } from "zod";

export const notificationEventClassSchema = z.enum([
  "security",
  "schedule",
  "requests",
  "payroll",
  "people",
  "communications",
  "system",
]);
export type NotificationEventClass = z.infer<
  typeof notificationEventClassSchema
>;

export const notificationChannelSchema = z.enum(["in_app", "email", "push"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationLifecycleSchema = z.enum([
  "defined",
  "active",
  "retired",
]);
export type NotificationLifecycle = z.infer<typeof notificationLifecycleSchema>;

export const notificationCatalogEntrySchema = z.object({
  type_key: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
  category: notificationEventClassSchema,
  schema_version: z.number().int().positive(),
  severity: z.enum(["info", "success", "warning", "action_required"]),
  sensitivity: z.enum(["internal", "confidential", "restricted"]),
  supported_channels: z.array(notificationChannelSchema).min(1),
  default_cadence: z.enum(["immediate", "daily_digest", "weekly_digest"]),
  audience_contract: z.enum([
    "announcement_targeted_members",
    "schedule_request_reviewers",
    "time_off_requester",
    "shift_change_participants",
    "published_shift_assignees",
    "employee_document_expiry_reviewers",
    "workspace_employee_access_managers",
    "availability_scoped_recipients",
  ]),
  action_route_contract: z.object({
    route: z.string().regex(/^\/app(?:\/|$)/),
    // Database contracts use camelCase keys such as employeeId.
    allowed_query_keys: z.array(z.string().regex(/^[a-z][A-Za-z0-9_]*$/)),
  }),
  dedupe_policy: z.object({
    strategy: z.enum(["keep_first", "refresh", "new_revision"]),
    scope: z.enum(["event_recipient", "subject_recipient"]),
    key_fields: z.array(z.string().min(1)).min(1),
  }),
  retention_class: z.enum(["standard_90d", "sensitive_30d", "regulated_1y"]),
  template_key: z.string().regex(/^[a-z][a-z0-9_.-]+\.v\d+$/),
  lifecycle: notificationLifecycleSchema,
  mandatory_in_app: z.boolean(),
});
export type NotificationCatalogEntry = z.infer<
  typeof notificationCatalogEntrySchema
>;

function definedEntry(
  entry: Omit<NotificationCatalogEntry, "lifecycle" | "schema_version">,
): NotificationCatalogEntry {
  return notificationCatalogEntrySchema.parse({
    ...entry,
    schema_version: 1,
    lifecycle: "defined",
  });
}

function activeEntry(
  entry: Omit<NotificationCatalogEntry, "lifecycle" | "schema_version">,
): NotificationCatalogEntry {
  return {
    ...definedEntry(entry),
    lifecycle: "active",
  };
}

const inAppOnly = ["in_app"] as const;

export const notificationCatalog = {
  "security.account_invitation_cancelled": activeEntry({
    type_key: "security.account_invitation_cancelled",
    category: "security",
    severity: "warning",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "workspace_employee_access_managers",
    action_route_contract: {
      route: "/app/employees",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "security.account_invitation_cancelled.v1",
    mandatory_in_app: true,
  }),
  "communications.announcement.available": activeEntry({
    type_key: "communications.announcement.available",
    category: "communications",
    severity: "info",
    sensitivity: "internal",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "announcement_targeted_members",
    action_route_contract: {
      route: "/app/announcements",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "new_revision",
      scope: "subject_recipient",
      key_fields: ["announcement_id", "revision", "recipient_user_id"],
    },
    retention_class: "standard_90d",
    template_key: "communications.announcement.available.v1",
    mandatory_in_app: false,
  }),
  // Availability rows mirror migrations 20260909005001 and 20260909042000.
  "availability.status_changed": activeEntry({
    type_key: "availability.status_changed",
    category: "requests",
    severity: "info",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "availability_scoped_recipients",
    action_route_contract: {
      route: "/app/employee-hub/my-availability",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "availability.status_changed.v1",
    mandatory_in_app: false,
  }),
  "availability.weekly_updated": activeEntry({
    type_key: "availability.weekly_updated",
    category: "requests",
    severity: "info",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "availability_scoped_recipients",
    action_route_contract: {
      route: "/app/employees",
      allowed_query_keys: ["employeeId", "section"],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "availability.weekly_updated.v1",
    mandatory_in_app: false,
  }),
  "requests.time_off.submitted": activeEntry({
    type_key: "requests.time_off.submitted",
    category: "requests",
    severity: "action_required",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "schedule_request_reviewers",
    action_route_contract: {
      route: "/app/schedule/requests",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "requests.time_off.submitted.v1",
    mandatory_in_app: false,
  }),
  "requests.time_off.status_changed": activeEntry({
    type_key: "requests.time_off.status_changed",
    category: "requests",
    severity: "info",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "time_off_requester",
    action_route_contract: {
      route: "/app/employee-hub/my-availability",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "requests.time_off.status_changed.v1",
    mandatory_in_app: false,
  }),
  "requests.shift_change.submitted": activeEntry({
    type_key: "requests.shift_change.submitted",
    category: "requests",
    severity: "action_required",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "schedule_request_reviewers",
    action_route_contract: {
      route: "/app/schedule/requests",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "requests.shift_change.submitted.v1",
    mandatory_in_app: false,
  }),
  "requests.shift_change.status_changed": activeEntry({
    type_key: "requests.shift_change.status_changed",
    category: "requests",
    severity: "info",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "shift_change_participants",
    action_route_contract: {
      route: "/app/employee-hub/shift-hub",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "keep_first",
      scope: "event_recipient",
      key_fields: ["event_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "requests.shift_change.status_changed.v1",
    mandatory_in_app: false,
  }),
  "schedule.published": activeEntry({
    type_key: "schedule.published",
    category: "schedule",
    severity: "info",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "published_shift_assignees",
    action_route_contract: {
      route: "/app/employee-hub",
      allowed_query_keys: ["tab"],
    },
    dedupe_policy: {
      strategy: "refresh",
      scope: "subject_recipient",
      key_fields: ["week_start", "publication_id", "recipient_user_id"],
    },
    retention_class: "standard_90d",
    template_key: "schedule.published.v1",
    mandatory_in_app: false,
  }),
  "people.employee_document.expiring": activeEntry({
    type_key: "people.employee_document.expiring",
    category: "people",
    severity: "warning",
    sensitivity: "confidential",
    supported_channels: [...inAppOnly],
    default_cadence: "immediate",
    audience_contract: "employee_document_expiry_reviewers",
    action_route_contract: {
      route: "/app/employees",
      allowed_query_keys: [],
    },
    dedupe_policy: {
      strategy: "refresh",
      scope: "subject_recipient",
      key_fields: ["document_id", "recipient_user_id"],
    },
    retention_class: "sensitive_30d",
    template_key: "people.employee_document.expiring.v1",
    mandatory_in_app: false,
  }),
} as const satisfies Record<string, NotificationCatalogEntry>;

export type NotificationTypeKey = keyof typeof notificationCatalog;

export const notificationCatalogSeed = [
  ["availability.status_changed", 1, "active"],
  ["availability.weekly_updated", 1, "active"],
  ["communications.announcement.available", 1, "active"],
  ["people.employee_document.expiring", 1, "active"],
  ["requests.shift_change.status_changed", 1, "active"],
  ["requests.shift_change.submitted", 1, "active"],
  ["requests.time_off.status_changed", 1, "active"],
  ["requests.time_off.submitted", 1, "active"],
  ["schedule.published", 1, "active"],
  ["security.account_invitation_cancelled", 1, "active"],
] as const;

export const notificationTemplateManifest = [
  "availability.status_changed.v1",
  "availability.weekly_updated.v1",
  "security.account_invitation_cancelled.v1",
  "communications.announcement.available.v1",
  "people.employee_document.expiring.v1",
  "requests.shift_change.status_changed.v1",
  "requests.shift_change.submitted.v1",
  "requests.time_off.status_changed.v1",
  "requests.time_off.submitted.v1",
  "schedule.published.v1",
] as const;

export type NotificationProducerInventoryEntry = {
  producer_id: string;
  type_key: NotificationTypeKey;
  source_migration: string;
  source_function: string;
  source_statement: string;
  integration_status: "legacy_inline" | "outbox_v1";
};

export const notificationProducerInventory: readonly NotificationProducerInventoryEntry[] =
  [
    {
      // "Check your availability": the entry mode changed and saved weeks were converted.
      producer_id: "weekly_preference_settings_v1",
      type_key: "availability.status_changed",
      source_migration: "20260922180000_changing_the_entry_mode_converts_every_saved_week.sql",
      source_function: "weekly_preference_settings_save_service",
      source_statement: "availability-settings-outbox-enqueue",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "weekly_preferences_v1",
      type_key: "availability.weekly_updated",
      source_migration: "20260909042000_weekly_preference_settings.sql",
      source_function: "weekly_preferences_save_service",
      source_statement: "weekly-preferences-outbox-enqueue",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "account-deletion-invitation-cancellation",
      type_key: "security.account_invitation_cancelled",
      source_migration: "20260914115233_account_security_deletion_lifecycle.sql",
      source_function: "request_account_deletion_v2_service",
      source_statement: "account-deletion-invitation-cancelled-outbox",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "announcement-publish",
      type_key: "communications.announcement.available",
      source_migration:
        "20260908122000_notification_announcement_producer_v1.sql",
      source_function: "publish_announcement_service",
      source_statement: "announcement-published-insert",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "employee-document-expiry-sync",
      type_key: "people.employee_document.expiring",
      source_migration:
        "20260908175000_document_expiry_schedule_conflict_preview.sql",
      source_function: "sync_expiring_document_todos_service",
      source_statement: "employee-document-expiry-outbox-enqueue",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "time-off-submit",
      type_key: "requests.time_off.submitted",
      source_migration: "20260908121000_notification_request_producers_v1.sql",
      source_function: "notify_schedule_request_event_service",
      source_statement: "schedule-request-submitted-insert",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "time-off-status-change",
      type_key: "requests.time_off.status_changed",
      source_migration: "20260908121000_notification_request_producers_v1.sql",
      source_function: "notify_schedule_request_event_service",
      source_statement: "time-off-status-insert",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "shift-change-submit",
      type_key: "requests.shift_change.submitted",
      source_migration: "20260908121000_notification_request_producers_v1.sql",
      source_function: "notify_schedule_request_event_service",
      source_statement: "schedule-request-submitted-insert",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "shift-change-status-change",
      type_key: "requests.shift_change.status_changed",
      source_migration: "20260908121000_notification_request_producers_v1.sql",
      source_function: "notify_schedule_request_event_service",
      source_statement: "shift-change-status-insert",
      integration_status: "outbox_v1",
    },
    {
      producer_id: "schedule-publish",
      type_key: "schedule.published",
      source_migration: "20260908112000_notification_outbox_relay.sql",
      source_function: "publish_schedule_draft_service",
      source_statement: "schedule-published-outbox-enqueue",
      integration_status: "outbox_v1",
    },
  ];

export function activeNotificationCatalogEntries(): NotificationCatalogEntry[] {
  return Object.values(notificationCatalog).filter(
    (entry) => entry.lifecycle === "active",
  );
}
