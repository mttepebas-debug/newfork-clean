import {
  notificationPreferencesSchema,
  notificationWorkspaceSettingsSchema,
  type NotificationPreferences,
  type NotificationPreferencesInput,
  type NotificationWorkspaceSettings,
  type NotificationWorkspaceSettingsInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { rpcFailure } from "../http-error";

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

export interface NotificationSettingsService {
  readPreferences(input: Actor): Promise<NotificationPreferences>;
  savePreferences(input: Actor & { readonly choices: NotificationPreferencesInput["choices"] }): Promise<NotificationPreferences>;
  readWorkspaceSettings(input: Actor): Promise<NotificationWorkspaceSettings>;
  saveWorkspaceSettings(input: Actor & { readonly settings: NotificationWorkspaceSettingsInput }): Promise<NotificationWorkspaceSettings>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string; hint?: string | null } | null }>;
}

// The notification core's own services (BILDIRIM-07); each asks the core
// itself: notifications.read_own / write_own for one's choices,
// settings.organization.write for the workspace's.
export function createNotificationSettingsService(options: {
  url: string;
  serviceRoleKey: string;
}): NotificationSettingsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;

  async function call(name: string, input: Actor, extra: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc(name, {
      actor_user_id: input.actorUserId,
      target_workspace_id: input.workspaceId,
      ...extra,
    });
    if (error) throw rpcFailure(error);
    return data;
  }

  return {
    async readPreferences(input) {
      return notificationPreferencesSchema.parse(await call("get_notification_preferences_service", input));
    },
    async savePreferences(input) {
      return notificationPreferencesSchema.parse(
        await call("save_notification_preferences_service", input, { target_choices: input.choices }),
      );
    },
    async readWorkspaceSettings(input) {
      return notificationWorkspaceSettingsSchema.parse(await call("get_notification_workspace_settings_service", input));
    },
    async saveWorkspaceSettings(input) {
      return notificationWorkspaceSettingsSchema.parse(
        await call("save_notification_workspace_settings_service", input, {
          // Text messages stay off (S-123); the database refuses anything else.
          target_settings: { ...input.settings, sms_enabled: false },
        }),
      );
    },
  };
}

export function createNotificationSettingsServiceFromEnvironment(): NotificationSettingsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createNotificationSettingsService({ url, serviceRoleKey }) : null;
}
