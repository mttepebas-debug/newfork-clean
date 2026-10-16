import { z } from "zod";

// Account > Notifications and Settings > Notifications (BILDIRIM-11, KARARLAR S-123).
// Who gets what is the database's (notification_route); these are only the
// shapes its services answer and take. The catalog lives in the database (S-91):
// no type or topic is listed here.

const topicKey = z.string().regex(/^[a-z_]+$/);
const typeKey = z.string().regex(/^[a-z_]+\.[a-z_]+$/);

/** The two outside channels a person or an owner chooses; the list is never one. */
export const notificationChoiceChannelSchema = z.enum(["email", "push"]);
export type NotificationChoiceChannel = z.infer<typeof notificationChoiceChannelSchema>;

const topicChannelSchema = z.object({
  /** The person's own choice; null is the product's default. */
  choice: z.boolean().nullable(),
  default: z.boolean(),
});

export const notificationTopicPreferenceSchema = z.object({
  key: topicKey,
  name: z.string().min(1),
  email: topicChannelSchema,
  push: topicChannelSchema,
});
export type NotificationTopicPreference = z.infer<typeof notificationTopicPreferenceSchema>;

/**
 * One person's choices in one workspace. Topics the owner turned off and the
 * required ones are not here: they are no choice.
 */
export const notificationPreferencesSchema = z.object({
  channels: z.object({
    in_app: z.object({ locked: z.literal(true) }),
    email: z.object({
      workspace_enabled: z.boolean(),
      address_on_file: z.boolean(),
      suppressed: z.boolean(),
    }),
    push: z.object({
      workspace_enabled: z.boolean(),
      devices: z.number().int().nonnegative(),
    }),
    sms: z.object({ available: z.boolean(), workspace_enabled: z.boolean() }),
  }),
  topics: z.array(notificationTopicPreferenceSchema),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** Only what changed; enabled null goes back to the default. */
export const notificationPreferencesInputSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            topic: topicKey,
            channel: notificationChoiceChannelSchema,
            enabled: z.boolean().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesInputSchema>;

export const notificationOptionalTypeSchema = z.object({
  key: typeKey,
  area: z.string().min(1),
  description: z.string().min(1),
  enabled: z.boolean(),
});
export type NotificationOptionalType = z.infer<typeof notificationOptionalTypeSchema>;

export const notificationAlwaysSentTypeSchema = z.object({
  key: typeKey,
  area: z.string().min(1),
  level: z.enum(["required", "important"]),
  description: z.string().min(1),
});
export type NotificationAlwaysSentType = z.infer<typeof notificationAlwaysSentTypeSchema>;

/** A workspace's channels, the optional types the owner may turn off and what always goes. */
export const notificationWorkspaceSettingsSchema = z.object({
  email_enabled: z.boolean(),
  push_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  sms_available: z.boolean(),
  optional: z.array(notificationOptionalTypeSchema),
  always_sent: z.array(notificationAlwaysSentTypeSchema),
});
export type NotificationWorkspaceSettings = z.infer<typeof notificationWorkspaceSettingsSchema>;

/**
 * The whole setting at once. Text messages are paid and stay off (S-123), so a
 * body cannot name them; the API sends the database its false.
 */
export const notificationWorkspaceSettingsInputSchema = z
  .object({
    email_enabled: z.boolean(),
    push_enabled: z.boolean(),
    muted_types: z.array(typeKey).max(100),
  })
  .strict();
export type NotificationWorkspaceSettingsInput = z.infer<typeof notificationWorkspaceSettingsInputSchema>;
