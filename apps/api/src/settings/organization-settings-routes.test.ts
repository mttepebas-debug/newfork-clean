import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { OrganizationSettingsService } from "./organization-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const orderedIds = [
  "51000000-0000-4000-8000-000000000002",
  "51000000-0000-4000-8000-000000000001",
];
const spoofedIdentity = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "11111111-1111-4111-8111-111111111111",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: otherWorkspaceId,
  workspace_id: otherWorkspaceId,
};

const context: ActiveWorkspaceContext = {
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
    "workspace.manage",
    "settings.schedule_rules.read",
    "settings.schedule_rules.manage",
    "settings.jobs.read",
    "settings.jobs.manage",
    "settings.shift_catalog.read",
    "settings.shift_catalog.manage",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
};

function organizationSettingsServiceMock(): OrganizationSettingsService {
  return {
    readSchedulingSettings: vi.fn(),
    updateSchedulingSettings: vi.fn(),
    reorderEntities: vi.fn(),
    reorderShiftTypes: vi.fn(),
    reorderShiftLabels: vi.fn(),
  };
}

describe("organization settings routes", () => {
  it("returns a retryable 409 when a settings transaction conflicts with staffing", async () => {
    const service = organizationSettingsServiceMock();
    vi.mocked(service.updateSchedulingSettings).mockRejectedValue(
      Object.assign(new Error("The schedule is being updated"), {
        code: "PT409",
      }),
    );
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: service,
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        week_start_day: "monday",
        schedule_deadline_day: "sunday",
        conflict_policy: "warn",
        availability_enforcement: "soft",
        time_format: "12h",
        minimum_travel_minutes: 30,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "The schedule is being updated" });
    await app.close();
  });
  it("loads scheduling settings through the API boundary for workspace members", async () => {
    const readSchedulingSettings = vi.fn(async () => ({
      workspace_id: workspaceId,
      week_start_day: "monday" as const,
      schedule_deadline_day: "sunday" as const,
      conflict_policy: "warn" as const,
      availability_enforcement: "soft" as const,
      time_format: "12h" as const,
    }));
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: {
        readSchedulingSettings,
      } as unknown as OrganizationSettingsService,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(readSchedulingSettings).toHaveBeenCalledWith({ workspaceId });
    expect(response.json()).toMatchObject({ time_format: "12h" });
  });

  it("requires workspace management before updating scheduling settings", async () => {
    const updateSchedulingSettings = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({ ...context, permissions: ["workspace.read"] }),
      },
      organizationSettingsService: {
        updateSchedulingSettings,
      } as unknown as OrganizationSettingsService,
    });

    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        week_start_day: "monday",
        schedule_deadline_day: "sunday",
        conflict_policy: "warn",
        availability_enforcement: "soft",
        time_format: "12h",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(updateSchedulingSettings).not.toHaveBeenCalled();
  });

  it("ignores spoofed actor and workspace fields in settings write bodies", async () => {
    const schedulingSettings = {
      week_start_day: "monday" as const,
      schedule_deadline_day: "sunday" as const,
      conflict_policy: "warn" as const,
      availability_enforcement: "soft" as const,
      time_format: "12h" as const,
    };
    const updateSchedulingSettings = vi.fn(async () => ({
      workspace_id: workspaceId,
      ...schedulingSettings,
    }));
    const reorderEntities = vi.fn(async () => undefined);
    const reorderShiftTypes = vi.fn(async () => undefined);
    const reorderShiftLabels = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: {
        updateSchedulingSettings,
        reorderEntities,
        reorderShiftTypes,
        reorderShiftLabels,
      } as unknown as OrganizationSettingsService,
    });

    const requests = [
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
        payload: { ...schedulingSettings, ...spoofedIdentity },
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/organization/entities/reorder`,
        payload: { ...spoofedIdentity, entityType: "departments", orderedIds },
        expectedStatus: 204,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/shift-types/reorder`,
        payload: { ...spoofedIdentity, orderedIds },
        expectedStatus: 204,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/shift-labels/reorder`,
        payload: { ...spoofedIdentity, orderedIds },
        expectedStatus: 204,
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({
        method: request.method,
        url: request.url,
        headers: { authorization: "Bearer valid-token" },
        payload: request.payload,
      });
      expect(response.statusCode).toBe(request.expectedStatus);
    }

    expect(updateSchedulingSettings).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      settings: schedulingSettings,
    });
    expect(reorderEntities).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      entityType: "departments",
      orderedIds,
    });
    expect(reorderShiftTypes).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      orderedIds,
    });
    expect(reorderShiftLabels).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      orderedIds,
    });
  });

  it("forwards department and job ordering through the API boundary", async () => {
    const reorderEntities = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: {
        reorderEntities,
      } as unknown as OrganizationSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/entities/reorder`,
      headers: { authorization: "Bearer valid-token" },
      payload: { entityType: "departments", orderedIds },
    });

    expect(response.statusCode).toBe(204);
    expect(reorderEntities).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      entityType: "departments",
      orderedIds,
    });
  });

  it("forwards shift type ordering through the API boundary", async () => {
    const reorderShiftTypes = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: {
        reorderShiftTypes,
      } as unknown as OrganizationSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/shift-types/reorder`,
      headers: { authorization: "Bearer valid-token" },
      payload: { orderedIds },
    });

    expect(response.statusCode).toBe(204);
    expect(reorderShiftTypes).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      orderedIds,
    });
  });

  it("forwards shift label ordering through the API boundary", async () => {
    const reorderShiftLabels = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: {
        reorderShiftLabels,
      } as unknown as OrganizationSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/shift-labels/reorder`,
      headers: { authorization: "Bearer valid-token" },
      payload: { orderedIds },
    });

    expect(response.statusCode).toBe(204);
    expect(reorderShiftLabels).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      orderedIds,
    });
  });

  it("requires workspace management permission before reordering", async () => {
    const reorderEntities = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({ ...context, permissions: ["workspace.read"] }),
      },
      organizationSettingsService: {
        reorderEntities,
      } as unknown as OrganizationSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/entities/reorder`,
      headers: { authorization: "Bearer valid-token" },
      payload: { entityType: "jobs", orderedIds },
    });

    expect(response.statusCode).toBe(403);
    expect(reorderEntities).not.toHaveBeenCalled();
  });

  it("returns a generic not found for every route when the active workspace mismatches the path", async () => {
    const service = organizationSettingsServiceMock();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: { ...context.workspace, id: otherWorkspaceId },
          membership: {
            ...context.membership,
            workspaceId: otherWorkspaceId,
          },
        }),
      },
      organizationSettingsService: service,
    });
    const settings = {
      week_start_day: "monday",
      schedule_deadline_day: "sunday",
      conflict_policy: "warn",
      availability_enforcement: "soft",
      time_format: "12h",
    };
    const routes = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
        serviceMethod: "readSchedulingSettings",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
        payload: settings,
        serviceMethod: "updateSchedulingSettings",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/organization/entities/reorder`,
        payload: { entityType: "jobs", orderedIds },
        serviceMethod: "reorderEntities",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/shift-types/reorder`,
        payload: { orderedIds },
        serviceMethod: "reorderShiftTypes",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/shift-labels/reorder`,
        payload: { orderedIds },
        serviceMethod: "reorderShiftLabels",
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
