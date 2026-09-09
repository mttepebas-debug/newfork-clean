import { z } from "zod";
import {
  notificationCatalogEntrySchema,
  notificationChannelSchema,
  notificationEventClassSchema,
} from "./notification-catalog";
import { appActionUrlSchema } from "./communications";

export const notificationCadenceSchema = z.enum([
  "immediate",
  "daily_digest",
  "weekly_digest",
]);

export const notificationPolicyScopeInputSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("global"), id: z.null() }),
    z.object({ kind: z.literal("role"), id: z.string().uuid() }),
    z.object({ kind: z.literal("location"), id: z.string().uuid() }),
  ],
);
export type NotificationPolicyScopeInput = z.infer<
  typeof notificationPolicyScopeInputSchema
>;

export const notificationOrgPolicyInputSchema = z
  .object({
    type_key: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
    schema_version: z.number().int().positive(),
    scope: notificationPolicyScopeInputSchema,
    expected_version: z.number().int().positive().nullable(),
    enabled: z.boolean(),
    allowed_channels: z.array(notificationChannelSchema).min(1),
    cadence: notificationCadenceSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) =>
      new Set(value.allowed_channels).size === value.allowed_channels.length,
    { message: "Allowed channels must be unique", path: ["allowed_channels"] },
  );
export type NotificationOrgPolicyInput = z.infer<
  typeof notificationOrgPolicyInputSchema
>;

export const notificationPolicyViewSchema = z.object({
  id: z.string().uuid().nullable(),
  scope: z.object({
    kind: z.enum(["global", "role", "location"]),
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(1),
  }),
  enabled: z.boolean(),
  allowed_channels: z.array(notificationChannelSchema).min(1),
  cadence: notificationCadenceSchema,
  version: z.number().int().positive().nullable(),
  updated_by: z.string().uuid().nullable(),
  updated_at: z.string().datetime({ offset: true }).nullable(),
  source: z.enum(["catalog_default", "organization_policy"]),
});
export type NotificationPolicyView = z.infer<
  typeof notificationPolicyViewSchema
>;

export const notificationSettingsCatalogEntrySchema = z.object({
  type_key: z.string(),
  schema_version: z.number().int().positive(),
  category: notificationEventClassSchema,
  severity: z.enum(["info", "success", "warning", "action_required"]),
  sensitivity: z.enum(["internal", "confidential", "restricted"]),
  supported_channels: z.array(notificationChannelSchema).min(1),
  default_cadence: notificationCadenceSchema,
  action_route: appActionUrlSchema,
  mandatory_in_app: z.boolean(),
  policy: notificationPolicyViewSchema,
});

export const notificationSettingsScopeOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
});

export const notificationOrgPolicyViewSchema = notificationPolicyViewSchema.extend({
  type_key: z.string().min(1),
  schema_version: z.number().int().positive(),
});

export const notificationSettingsAuditEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string().min(1),
  target_type: z.string().min(1),
  target_id: z.string().nullable(),
  actor_user_id: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  before_version: z.number().int().positive().nullable(),
  after_version: z.number().int().positive().nullable(),
  occurred_at: z.string().datetime({ offset: true }),
});

export const notificationSettingsResponseSchema = z.object({
  workspace_id: z.string().uuid(),
  can_write: z.boolean(),
  catalog: z.array(notificationSettingsCatalogEntrySchema),
  policies: z.array(notificationOrgPolicyViewSchema),
  roles: z.array(notificationSettingsScopeOptionSchema),
  locations: z.array(notificationSettingsScopeOptionSchema),
  audit: z.array(notificationSettingsAuditEntrySchema),
});
export type NotificationSettingsResponse = z.infer<
  typeof notificationSettingsResponseSchema
>;

export const notificationPolicySavedResultSchema = z.object({
  status: z.literal("saved"),
  policy: notificationPolicyViewSchema,
});

export const notificationPolicyResetInputSchema = z.object({
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("type"), value: z.string().min(1) }),
    z.object({ kind: z.literal("category"), value: notificationEventClassSchema }),
    z.object({ kind: z.literal("all") }),
  ]),
  reason: z.string().trim().min(3).max(500),
});
export type NotificationPolicyResetInput = z.infer<
  typeof notificationPolicyResetInputSchema
>;

export const notificationPolicyResetResultSchema = z.object({
  status: z.literal("reset"),
  affected: z.number().int().nonnegative(),
});

export const notificationPolicyTestInputSchema = z.object({
  type_key: z.string().min(1),
  channel: notificationChannelSchema,
  recipient_user_id: z.string().uuid().nullable().default(null),
});
export type NotificationPolicyTestInput = z.infer<
  typeof notificationPolicyTestInputSchema
>;

export const notificationPolicyTestResultSchema = z.object({
  status: z.literal("previewed"),
  delivery_mode: z.literal("preview_only"),
  redirected_to_user_id: z.string().uuid(),
  decision: z.enum(["allow", "deny"]),
  reason_code: z.string().min(1),
});
export type NotificationPolicyTestResult = z.infer<
  typeof notificationPolicyTestResultSchema
>;

export const notificationPreferenceStateSchema = z.enum([
  "enabled",
  "disabled",
  "inherit",
]);

export const notificationChannelPreferenceSchema = z
  .object({
    in_app: notificationPreferenceStateSchema.optional(),
    email: notificationPreferenceStateSchema.optional(),
    push: notificationPreferenceStateSchema.optional(),
  })
  .strict();
export type NotificationChannelPreference = z.infer<
  typeof notificationChannelPreferenceSchema
>;

const notificationTimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const notificationQuietHoursSchema = z
  .object({
    enabled: z.boolean(),
    start: notificationTimeOfDaySchema,
    end: notificationTimeOfDaySchema,
  })
  .strict();
export type NotificationQuietHours = z.infer<
  typeof notificationQuietHoursSchema
>;

export const notificationUserPreferenceScopeSchema = z.enum([
  "category",
  "type",
]);

export const notificationUserPreferenceSchema = z.object({
  id: z.string().uuid().nullable(),
  preference_scope: notificationUserPreferenceScopeSchema,
  scope_key: z.string().trim().min(1).max(160),
  channel_preferences: notificationChannelPreferenceSchema,
  cadence: notificationCadenceSchema.nullable(),
  timezone: z.string().trim().min(1).max(80).nullable(),
  quiet_hours: notificationQuietHoursSchema.nullable(),
  safe_preview_enabled: z.boolean(),
  version: z.number().int().positive().nullable(),
  updated_at: z.string().datetime({ offset: true }).nullable(),
});
export type NotificationUserPreference = z.infer<
  typeof notificationUserPreferenceSchema
>;

export const notificationUserPreferenceUpdateSchema =
  notificationUserPreferenceSchema
    .pick({
      preference_scope: true,
      scope_key: true,
      channel_preferences: true,
      cadence: true,
      timezone: true,
      quiet_hours: true,
      safe_preview_enabled: true,
    })
    .extend({
      expected_version: z.number().int().positive().nullable(),
    });
export type NotificationUserPreferenceUpdate = z.infer<
  typeof notificationUserPreferenceUpdateSchema
>;

export const notificationUserPreferencePatchSchema = z
  .object({
    updates: z.array(notificationUserPreferenceUpdateSchema).min(1).max(50),
  })
  .superRefine((value, issue) => {
    const seen = new Set<string>();
    for (const [index, update] of value.updates.entries()) {
      const key = `${update.preference_scope}:${update.scope_key}`;
      if (seen.has(key)) {
        issue.addIssue({
          code: "custom",
          path: ["updates", index, "scope_key"],
          message: "Duplicate notification preference scope",
        });
      }
      seen.add(key);
    }
  });
export type NotificationUserPreferencePatch = z.infer<
  typeof notificationUserPreferencePatchSchema
>;

export const notificationPreferenceWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["owner", "admin", "manager", "employee"]),
  isActive: z.boolean(),
  onboarding: z.object({
    status: z.enum(["incomplete", "complete"]),
    currentStep: z.number().int().min(1).max(4),
  }),
});

export const notificationUserCatalogEntrySchema =
  notificationCatalogEntrySchema
    .pick({
      type_key: true,
      schema_version: true,
      category: true,
      severity: true,
      sensitivity: true,
      supported_channels: true,
      default_cadence: true,
      mandatory_in_app: true,
    })
    .extend({
      channel_controls: z.array(
        z.object({
          channel: notificationChannelSchema,
          locked: z.boolean(),
          reason_code: z.string().trim().min(1).max(120),
        }),
      ),
    });
export type NotificationUserCatalogEntry = z.infer<
  typeof notificationUserCatalogEntrySchema
>;

export const notificationUserPreferenceSavedResultSchema = z.object({
  status: z.literal("saved"),
  preferences: z.array(notificationUserPreferenceSchema),
});

export const notificationUserPreferencesResponseSchema = z.object({
  workspace_id: z.string().uuid(),
  can_write: z.boolean(),
  workspaces: z.array(notificationPreferenceWorkspaceSchema),
  catalog: z.array(notificationUserCatalogEntrySchema),
  preferences: z.array(notificationUserPreferenceSchema),
});
export type NotificationUserPreferencesResponse = z.infer<
  typeof notificationUserPreferencesResponseSchema
>;
