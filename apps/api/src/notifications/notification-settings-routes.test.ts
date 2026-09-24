import type { ActiveWorkspaceContext } from "@newfork/shared";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerNotificationSettingsRoutes } from "./notification-settings-routes";
import type { NotificationSettingsService } from "./notification-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

const context = {
  userId,
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId,
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "notifications.settings.read",
    "notifications.settings.write",
    "notifications.test_send",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

function build(
  service: NotificationSettingsService,
  actor: ActiveWorkspaceContext = context,
) {
  const app = Fastify();
  registerNotificationSettingsRoutes(app, {
    service,
    contextResolver: { resolve: async () => actor },
  });
  return app;
}

function notificationSettingsServiceMock(): NotificationSettingsService {
  return {
    get: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
    preview: vi.fn(),
    getUserPreferences: vi.fn(),
    saveUserPreferences: vi.fn(),
  };
}

describe("notification settings routes", () => {
  it("allows a read-only administrator to view settings", async () => {
    const get = vi.fn().mockResolvedValue({
      workspace_id: workspaceId,
      can_write: false,
      catalog: [],
      roles: [],
      locations: [],
      audit: [],
    });
    const app = build(
      { get } as unknown as NotificationSettingsService,
      { ...context, permissions: ["notifications.settings.read"] },
    );

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/notification-settings`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(get).toHaveBeenCalledWith({ actorUserId: userId, workspaceId });
  });

  it("prevents a read-only administrator from mutating policy", async () => {
    const app = build(
      {} as NotificationSettingsService,
      { ...context, permissions: ["notifications.settings.read"] },
    );
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/notification-settings`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        type_key: "schedule.published",
        schema_version: 1,
        scope: { kind: "global", id: null },
        expected_version: null,
        enabled: false,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        reason: "Pause organization delivery",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("forwards an optimistic policy update for an authorized writer", async () => {
    const save = vi.fn().mockResolvedValue({
      status: "saved",
      policy: {
        id: "a1000000-0000-4000-8000-000000000001",
        scope: { kind: "global", id: null, name: "Organization" },
        enabled: false,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        version: 1,
        updated_by: userId,
        updated_at: "2026-09-02T12:00:00.000Z",
        source: "organization_policy",
      },
    });
    const app = build({ save } as unknown as NotificationSettingsService);
    const policy = {
      type_key: "schedule.published",
      schema_version: 1,
      scope: { kind: "global", id: null },
      expected_version: null,
      enabled: false,
      allowed_channels: ["in_app"],
      cadence: "immediate",
      reason: "Pause organization delivery",
    };

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/notification-settings`,
      headers: { authorization: "Bearer valid-token" },
      payload: policy,
    });

    expect(response.statusCode).toBe(200);
    expect(save).toHaveBeenCalledWith({ actorUserId: userId, workspaceId, policy });
  });

  it("returns a conflict when the policy version is stale", async () => {
    const app = build({
      save: async () => {
        throw new Error("notification policy stale version");
      },
    } as unknown as NotificationSettingsService);
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/notification-settings`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        type_key: "schedule.published",
        schema_version: 1,
        scope: { kind: "global", id: null },
        expected_version: 2,
        enabled: true,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        reason: "Resume organization delivery",
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it("supports category resets for writers", async () => {
    const reset = vi.fn().mockResolvedValue({ status: "reset", affected: 2 });
    const app = build({ reset } as unknown as NotificationSettingsService);
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/notification-settings/reset`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        target: { kind: "category", value: "schedule" },
        reason: "Restore schedule defaults",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(reset).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      reset: {
        target: { kind: "category", value: "schedule" },
        reason: "Restore schedule defaults",
      },
    });
  });

  it("requires the dedicated test-send permission for safe previews", async () => {
    const preview = vi.fn().mockResolvedValue({
      status: "previewed",
      delivery_mode: "preview_only",
      redirected_to_user_id: userId,
      decision: "allow",
      reason_code: "allowed",
    });
    const app = build({ preview } as unknown as NotificationSettingsService);
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/notification-settings/test`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        type_key: "schedule.published",
        channel: "in_app",
        recipient_user_id: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(preview).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      test: {
        type_key: "schedule.published",
        channel: "in_app",
        recipient_user_id: null,
      },
    });
  });

  it("ignores spoofed actor and workspace fields in write bodies", async () => {
    const service = notificationSettingsServiceMock();
    vi.mocked(service.save).mockResolvedValue({
      status: "saved",
      policy: {
        id: "a1000000-0000-4000-8000-000000000001",
        scope: { kind: "global", id: null, name: "Organization" },
        enabled: false,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        version: 1,
        updated_by: userId,
        updated_at: "2026-09-02T12:00:00.000Z",
        source: "organization_policy",
      },
    });
    vi.mocked(service.reset).mockResolvedValue({ status: "reset", affected: 1 });
    vi.mocked(service.preview).mockResolvedValue({
      status: "previewed",
      delivery_mode: "preview_only",
      redirected_to_user_id: userId,
      decision: "allow",
      reason_code: "allowed",
    });
    vi.mocked(service.saveUserPreferences).mockResolvedValue({
      status: "saved",
      preferences: [],
    });
    const app = build(service);
    const spoofedActorUserId = "11111111-1111-4111-8111-111111111111";

    await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/notification-settings`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        type_key: "schedule.published",
        schema_version: 1,
        scope: { kind: "global", id: null },
        expected_version: null,
        enabled: false,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        reason: "Pause organization delivery",
      },
    });
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );

    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/notification-settings/reset`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        target: { kind: "category", value: "schedule" },
        reason: "Restore schedule defaults",
      },
    });
    expect(service.reset).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );

    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/notification-settings/test`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        type_key: "schedule.published",
        channel: "in_app",
        recipient_user_id: null,
      },
    });
    expect(service.preview).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );

    await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/me/notification-preferences`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        updates: [
          {
            preference_scope: "category",
            scope_key: "schedule",
            channel_preferences: { in_app: "enabled" },
            cadence: null,
            timezone: "America/Los_Angeles",
            quiet_hours: null,
            safe_preview_enabled: true,
            expected_version: null,
          },
        ],
      },
    });
    expect(service.saveUserPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );
  });

  it("allows any active member to read their own notification preferences", async () => {
    const getUserPreferences = vi.fn().mockResolvedValue({
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
    });
    const app = build(
      { getUserPreferences } as unknown as NotificationSettingsService,
      {
        ...context,
        membership: { ...context.membership, role: "employee" },
        permissions: ["workspace.read"],
      },
    );

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/me/notification-preferences`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(getUserPreferences).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
    });
  });

  it("rejects duplicate user preference entries before the service boundary", async () => {
    const saveUserPreferences = vi.fn();
    const app = build(
      { saveUserPreferences } as unknown as NotificationSettingsService,
    );

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/me/notification-preferences`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        updates: [
          {
            preference_scope: "category",
            scope_key: "schedule",
            channel_preferences: { in_app: "enabled" },
            cadence: null,
            timezone: "America/Los_Angeles",
            quiet_hours: null,
            safe_preview_enabled: true,
            expected_version: null,
          },
          {
            preference_scope: "category",
            scope_key: "schedule",
            channel_preferences: { in_app: "disabled" },
            cadence: null,
            timezone: "America/Los_Angeles",
            quiet_hours: null,
            safe_preview_enabled: true,
            expected_version: null,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(saveUserPreferences).not.toHaveBeenCalled();
  });

  it("returns a generic not found for every route when the active workspace mismatches the path", async () => {
    const service = notificationSettingsServiceMock();
    const app = build(
      service,
      {
        ...context,
        workspace: { ...context.workspace, id: otherWorkspaceId },
        membership: { ...context.membership, workspaceId: otherWorkspaceId },
      },
    );
    const routes = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/notification-settings`,
        serviceMethod: "get",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/notification-settings`,
        payload: {
          type_key: "schedule.published",
          schema_version: 1,
          scope: { kind: "global", id: null },
          expected_version: null,
          enabled: false,
          allowed_channels: ["in_app"],
          cadence: "immediate",
          reason: "Pause organization delivery",
        },
        serviceMethod: "save",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/notification-settings/reset`,
        payload: {
          target: { kind: "category", value: "schedule" },
          reason: "Restore schedule defaults",
        },
        serviceMethod: "reset",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/notification-settings/test`,
        payload: {
          type_key: "schedule.published",
          channel: "in_app",
          recipient_user_id: null,
        },
        serviceMethod: "preview",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/me/notification-preferences`,
        serviceMethod: "getUserPreferences",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/me/notification-preferences`,
        payload: {
          updates: [
            {
              preference_scope: "category",
              scope_key: "schedule",
              channel_preferences: { in_app: "enabled" },
              cadence: null,
              timezone: "America/Los_Angeles",
              quiet_hours: null,
              safe_preview_enabled: true,
              expected_version: null,
            },
          ],
        },
        serviceMethod: "saveUserPreferences",
      },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: "Bearer valid-token" },
        payload: "payload" in route ? route.payload : undefined,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Workspace not found" });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
  });
});
