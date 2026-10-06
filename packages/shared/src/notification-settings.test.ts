import { notificationRecordSchema } from "./communications";
import { describe, expect, it } from "vitest";
import {
  notificationUserPreferencePatchSchema,
  accountNotificationTypeKeys,
  notificationUserPreferencesResponseSchema,
  notificationOrgPolicyInputSchema,
  notificationSettingsResponseSchema,
} from "./notification-settings";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

describe("notification settings contracts", () => {
  it("rejects account rows mislabeled as workspace notifications", () => {
    const item = { id: workspaceId, workspace_id: null, scope: "account", category: "security", title: "Security update", body: "Safe update", action_url: "/app/account/security", source_type: "account_security", source_id: null, created_at: "2026-09-14T12:00:00Z", read_at: null };
    expect(notificationRecordSchema.safeParse(item).success).toBe(true);
    expect(notificationRecordSchema.safeParse({ ...item, workspace_id: workspaceId }).success).toBe(false);
    expect(notificationRecordSchema.safeParse({ ...item, scope: "workspace" }).success).toBe(false);
  });

  it("accepts mandatory account delivery separately from editable workspace catalog", () => {
    const data = { workspace_id: null, can_write: false, workspaces: [], catalog: [], preferences: [],
      email_channel_reason: "delivery_unavailable", account_catalog: accountNotificationTypeKeys.map(type_key => ({
        type_key, scope: "account", title: "Security event", description: "A safe account update", mandatory_in_app: true, delivery: "transactional_in_app",
      })),
    };
    expect(notificationUserPreferencesResponseSchema.parse(data).account_catalog).toHaveLength(6);
    expect(notificationUserPreferencesResponseSchema.safeParse({ ...data, account_catalog: [{ ...data.account_catalog[0], mandatory_in_app: false }] }).success).toBe(false);
    expect(notificationUserPreferencesResponseSchema.safeParse({ ...data, account_catalog: [{ ...data.account_catalog[0], type_key: "account.unobserved_login" }] }).success).toBe(false);
  });

  it("accepts an active catalog entry with its effective organization policy", () => {
    const parsed = notificationSettingsResponseSchema.parse({
      workspace_id: workspaceId,
      can_write: true,
      catalog: [
        {
          type_key: "schedule.published",
          schema_version: 1,
          category: "schedule",
          severity: "info",
          sensitivity: "confidential",
          supported_channels: ["in_app"],
          default_cadence: "immediate",
          action_route: "/app/employee-hub",
          mandatory_in_app: false,
          policy: {
            id: null,
            scope: { kind: "global", id: null, name: "Organization" },
            enabled: true,
            allowed_channels: ["in_app"],
            cadence: "immediate",
            version: null,
            updated_by: null,
            updated_at: null,
            source: "catalog_default",
          },
        },
      ],
      policies: [
        {
          type_key: "schedule.published",
          schema_version: 1,
          id: "a1000000-0000-4000-8000-000000000001",
          scope: {
            kind: "location",
            id: "a2000000-0000-4000-8000-000000000001",
            name: "Main",
          },
          enabled: false,
          allowed_channels: ["in_app"],
          cadence: "immediate",
          version: 1,
          updated_by: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
          updated_at: "2026-09-02T12:00:00.000Z",
          source: "organization_policy",
        },
      ],
      roles: [],
      locations: [],
      audit: [],
    });

    expect(parsed.catalog[0]?.policy.source).toBe("catalog_default");
    expect(parsed.policies[0]?.scope.kind).toBe("location");
  });

  it("keeps catalog action routes inside exact app routes", () => {
    const response = {
      workspace_id: workspaceId,
      can_write: true,
      catalog: [
        {
          type_key: "schedule.published",
          schema_version: 1,
          category: "schedule",
          severity: "info",
          sensitivity: "confidential",
          supported_channels: ["in_app"],
          default_cadence: "immediate",
          action_route: "/app/employee-hub?tab=schedule",
          mandatory_in_app: false,
          policy: {
            id: null,
            scope: { kind: "global", id: null, name: "Organization" },
            enabled: true,
            allowed_channels: ["in_app"],
            cadence: "immediate",
            version: null,
            updated_by: null,
            updated_at: null,
            source: "catalog_default",
          },
        },
      ],
      policies: [],
      roles: [],
      locations: [],
      audit: [],
    };

    expect(
      notificationSettingsResponseSchema.parse(response).catalog[0]
        ?.action_route,
    ).toBe("/app/employee-hub?tab=schedule");
    for (const actionRoute of [
      "https://outside.example/settings",
      "//outside.example/app",
      "/application/settings",
      "/welcome/profile",
    ]) {
      expect(() =>
        notificationSettingsResponseSchema.parse({
          ...response,
          catalog: [{ ...response.catalog[0], action_route: actionRoute }],
        }),
      ).toThrow("Action URL must stay inside the app");
    }
  });

  it("requires a reason and an explicit optimistic version", () => {
    expect(() =>
      notificationOrgPolicyInputSchema.parse({
        type_key: "schedule.published",
        schema_version: 1,
        scope: { kind: "global", id: null },
        expected_version: null,
        enabled: false,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        reason: "",
      }),
    ).toThrow();
  });

  it("rejects a scoped role without a role id", () => {
    expect(() =>
      notificationOrgPolicyInputSchema.parse({
        type_key: "schedule.published",
        schema_version: 1,
        scope: { kind: "role", id: null },
        expected_version: null,
        enabled: true,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        reason: "Enable for managers",
      }),
    ).toThrow();
  });

  it("accepts a workspace-scoped user preference response with managed channel reasons", () => {
    const parsed = notificationUserPreferencesResponseSchema.parse({
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
      catalog: [
        {
          type_key: "schedule.published",
          schema_version: 1,
          category: "schedule",
          severity: "info",
          sensitivity: "confidential",
          supported_channels: ["in_app"],
          default_cadence: "immediate",
          mandatory_in_app: false,
          channel_controls: [
            {
              channel: "in_app",
              locked: false,
              reason_code: "available",
            },
            {
              channel: "email",
              locked: true,
              reason_code: "catalog_channel_unsupported",
            },
          ],
        },
      ],
      preferences: [
        {
          id: "a1000000-0000-4000-8000-000000000001",
          preference_scope: "type",
          scope_key: "schedule.published",
          channel_preferences: { in_app: "disabled" },
          cadence: "daily_digest",
          timezone: "America/Los_Angeles",
          quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
          safe_preview_enabled: true,
          version: 2,
          updated_at: "2026-09-02T12:00:00.000Z",
        },
      ],
    });

    expect(parsed.catalog[0]?.channel_controls[1]?.locked).toBe(true);
    expect(parsed.preferences[0]?.channel_preferences.in_app).toBe("disabled");
  });

  it("rejects duplicate preference scopes in one explicit patch", () => {
    expect(() =>
      notificationUserPreferencePatchSchema.parse({
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
      }),
    ).toThrow();
  });
});
