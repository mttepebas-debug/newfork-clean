import { describe, expect, it, vi } from "vitest";
import { createNotificationSettingsServiceWithClient } from "./notification-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

describe("notification settings service", () => {
  it("binds the authenticated actor when reading organization settings", async () => {
    const response = {
      workspace_id: workspaceId,
      can_write: true,
      catalog: [],
      policies: [],
      roles: [],
      locations: [],
      audit: [],
    };
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const service = createNotificationSettingsServiceWithClient({ rpc });

    await expect(
      service.get({ actorUserId: userId, workspaceId }),
    ).resolves.toEqual(response);
    expect(rpc).toHaveBeenCalledWith("get_notification_settings_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
  });

  it("forwards optimistic version, scope, and audit reason on save", async () => {
    const response = {
      status: "saved",
      policy: {
        id: "a1000000-0000-4000-8000-000000000001",
        scope: { kind: "location", id: "a2000000-0000-4000-8000-000000000001", name: "Main" },
        enabled: true,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        version: 3,
        updated_by: userId,
        updated_at: "2026-09-02T12:00:00.000Z",
        source: "organization_policy",
      },
    };
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const service = createNotificationSettingsServiceWithClient({ rpc });
    const policy = {
      type_key: "schedule.published",
      schema_version: 1,
      scope: {
        kind: "location" as const,
        id: "a2000000-0000-4000-8000-000000000001",
      },
      expected_version: 2,
      enabled: true,
      allowed_channels: ["in_app" as const],
      cadence: "immediate" as const,
      reason: "Enable the Main location",
    };

    await expect(
      service.save({ actorUserId: userId, workspaceId, policy }),
    ).resolves.toEqual(response);
    expect(rpc).toHaveBeenCalledWith("save_notification_policy_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_type_key: "schedule.published",
      target_schema_version: 1,
      target_scope_kind: "location",
      target_scope_id: policy.scope.id,
      target_expected_version: 2,
      target_enabled: true,
      target_allowed_channels: ["in_app"],
      target_cadence: "immediate",
      target_reason: "Enable the Main location",
    });
  });

  it("maps reset and preview operations to actor-bound RPC calls", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { status: "reset", affected: 4 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "previewed",
          delivery_mode: "preview_only",
          redirected_to_user_id: userId,
          decision: "allow",
          reason_code: "allowed",
        },
        error: null,
      });
    const service = createNotificationSettingsServiceWithClient({ rpc });

    await service.reset({
      actorUserId: userId,
      workspaceId,
      reset: {
        target: { kind: "type", value: "schedule.published" },
        reason: "Restore the default",
      },
    });
    await service.preview({
      actorUserId: userId,
      workspaceId,
      test: {
        type_key: "schedule.published",
        channel: "in_app",
        recipient_user_id: null,
      },
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "reset_notification_policies_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_kind: "type",
        target_value: "schedule.published",
        target_reason: "Restore the default",
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "preview_notification_policy_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_type_key: "schedule.published",
        target_channel: "in_app",
        target_recipient_user_id: null,
      },
    );
  });

  it("maps user preference reads and explicit patches to actor-bound RPC calls", async () => {
    const readResponse = {
      workspace_id: workspaceId,
      can_write: true,
      workspaces: [
        {
          id: workspaceId,
          name: "Meyhouse",
          role: "employee",
          isActive: true,
          onboarding: { status: "complete", currentStep: 2 },
        },
      ],
      catalog: [],
      preferences: [],
    };
    const saveResponse = {
      status: "saved",
      preferences: [
        {
          id: "a1000000-0000-4000-8000-000000000001",
          preference_scope: "type",
          scope_key: "schedule.published",
          channel_preferences: { in_app: "disabled" },
          cadence: "daily_digest",
          timezone: "America/Los_Angeles",
          quiet_hours: null,
          safe_preview_enabled: true,
          version: 2,
          updated_at: "2026-09-02T12:00:00.000Z",
        },
      ],
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: readResponse, error: null })
      .mockResolvedValueOnce({ data: saveResponse, error: null });
    const service = createNotificationSettingsServiceWithClient({ rpc });

    await expect(
      service.getUserPreferences({ actorUserId: userId, workspaceId }),
    ).resolves.toEqual(readResponse);
    await expect(
      service.saveUserPreferences({
        actorUserId: userId,
        workspaceId,
        patch: {
          updates: [
            {
              preference_scope: "type",
              scope_key: "schedule.published",
              channel_preferences: { in_app: "disabled" },
              cadence: "daily_digest",
              timezone: "America/Los_Angeles",
              quiet_hours: null,
              safe_preview_enabled: true,
              expected_version: 1,
            },
          ],
        },
      }),
    ).resolves.toEqual(saveResponse);

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "get_notification_user_preferences_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "save_notification_user_preferences_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_updates: [
          {
            preference_scope: "type",
            scope_key: "schedule.published",
            channel_preferences: { in_app: "disabled" },
            cadence: "daily_digest",
            timezone: "America/Los_Angeles",
            quiet_hours: null,
            safe_preview_enabled: true,
            expected_version: 1,
          },
        ],
      },
    );
  });
});
