import {
  notificationPolicyResetResultSchema,
  notificationPolicySavedResultSchema,
  notificationPolicyTestResultSchema,
  notificationSettingsResponseSchema,
  notificationUserPreferencePatchSchema,
  notificationUserPreferenceSavedResultSchema,
  notificationUserPreferencesResponseSchema,
  type NotificationOrgPolicyInput,
  type NotificationPolicyResetInput,
  type NotificationPolicyTestInput,
  type NotificationPolicyTestResult,
  type NotificationSettingsResponse,
  type NotificationUserPreferencePatch,
  type NotificationUserPreferencesResponse,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { rpcFailure } from "../http-error";

interface ActorInput {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

type SavedResult = z.infer<typeof notificationPolicySavedResultSchema>;
type ResetResult = z.infer<typeof notificationPolicyResetResultSchema>;
type UserPreferenceSavedResult = z.infer<
  typeof notificationUserPreferenceSavedResultSchema
>;

export interface NotificationSettingsService {
  get(input: ActorInput): Promise<NotificationSettingsResponse>;
  save(
    input: ActorInput & { policy: NotificationOrgPolicyInput },
  ): Promise<SavedResult>;
  reset(
    input: ActorInput & { reset: NotificationPolicyResetInput },
  ): Promise<ResetResult>;
  preview(
    input: ActorInput & { test: NotificationPolicyTestInput },
  ): Promise<NotificationPolicyTestResult>;
  getUserPreferences(input: ActorInput): Promise<NotificationUserPreferencesResponse>;
  saveUserPreferences(
    input: ActorInput & { patch: NotificationUserPreferencePatch },
  ): Promise<UserPreferenceSavedResult>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createNotificationSettingsService(options: {
  url: string;
  serviceRoleKey: string;
}): NotificationSettingsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createNotificationSettingsServiceWithClient(client);
}

export function createNotificationSettingsServiceWithClient(
  client: RpcClient,
): NotificationSettingsService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  const actorArgs = (input: ActorInput) => ({
    actor_user_id: input.actorUserId,
    target_workspace_id: input.workspaceId,
  });

  return {
    async get(input) {
      return notificationSettingsResponseSchema.parse(
        await rpc("get_notification_settings_service", actorArgs(input)),
      );
    },
    async save(input) {
      return notificationPolicySavedResultSchema.parse(
        await rpc("save_notification_policy_service", {
          ...actorArgs(input),
          target_type_key: input.policy.type_key,
          target_schema_version: input.policy.schema_version,
          target_scope_kind: input.policy.scope.kind,
          target_scope_id: input.policy.scope.id,
          target_expected_version: input.policy.expected_version,
          target_enabled: input.policy.enabled,
          target_allowed_channels: input.policy.allowed_channels,
          target_cadence: input.policy.cadence,
          target_reason: input.policy.reason,
        }),
      );
    },
    async reset(input) {
      return notificationPolicyResetResultSchema.parse(
        await rpc("reset_notification_policies_service", {
          ...actorArgs(input),
          target_kind: input.reset.target.kind,
          target_value:
            input.reset.target.kind === "all"
              ? null
              : input.reset.target.value,
          target_reason: input.reset.reason,
        }),
      );
    },
    async preview(input) {
      return notificationPolicyTestResultSchema.parse(
        await rpc("preview_notification_policy_service", {
          ...actorArgs(input),
          target_type_key: input.test.type_key,
          target_channel: input.test.channel,
          target_recipient_user_id: input.test.recipient_user_id,
        }),
      );
    },
    async getUserPreferences(input) {
      return notificationUserPreferencesResponseSchema.parse(
        await rpc("get_notification_user_preferences_service", actorArgs(input)),
      );
    },
    async saveUserPreferences(input) {
      const patch = notificationUserPreferencePatchSchema.parse(input.patch);
      return notificationUserPreferenceSavedResultSchema.parse(
        await rpc("save_notification_user_preferences_service", {
          ...actorArgs(input),
          target_updates: patch.updates,
        }),
      );
    },
  };
}
