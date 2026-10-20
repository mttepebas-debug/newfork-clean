import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { rpcFailure } from "../http-error";
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
    access: { employee: false, management: "owner" },
    status: "active",
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
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
};

function organizationSettingsServiceMock(): OrganizationSettingsService {
  return {
    readSchedulingSettings: vi.fn(),
    updateSchedulingSettings: vi.fn(),
    reorderShiftTypes: vi.fn(),
    reorderShiftLabels: vi.fn(),
  };
}

describe("organization settings routes", () => {
  const conflicts = { conflict_rules: { approved_time_off: "block", closed_location: "confirm", minimum_travel: "confirm", minimum_rest: "confirm" }, conflict_rules_revision: 3, minimum_travel_minutes: 30, minimum_rest_minutes: 0 } as const;
  it("reads conflict rules with the schedule rules read, writes them with the conflict permission only, and binds the actor", async () => {
    const service = organizationSettingsServiceMock();
    vi.mocked(service.readSchedulingSettings).mockResolvedValue({ workspace_id: workspaceId, week_start_day: "monday", schedule_deadline_day: "sunday", time_format: "12h", ...conflicts });
    vi.mocked(service.updateSchedulingSettings).mockImplementation(async () => service.readSchedulingSettings({ workspaceId }));
    // Mert 2026-10-20 (K14 S1): the manager reads the conflict rules and changes none of them.
    const cases = [
      { permissions: ["workspace.read"], read: 403, write: 403 },
      { permissions: ["workspace.read", "settings.schedule_rules.read"], read: 200, write: 403 },
      { permissions: ["schedule.conflict_rules.manage", "settings.schedule_rules.read"], read: 200, write: 200 },
    ] as const;
    for (const { permissions, read, write } of cases) {
      const app = buildApp({ organizationSettingsService: service, contextResolver: { resolve: async () => ({ ...context, permissions: [...permissions] }) } });
      for (const method of ["GET", "PUT"] as const) {
        const response = await app.inject({ method, url: `/v1/workspaces/${workspaceId}/scheduling-settings/conflicts`, headers: { authorization: "Bearer valid-token" }, ...(method === "PUT" ? { payload: conflicts } : {}) });
        const expected = method === "GET" ? read : write;
        expect(response.statusCode, `${method} with ${permissions.join(", ")}`).toBe(expected);
        if (expected === 200) expect(response.json()).toEqual(conflicts);
      }
      await app.close();
    }
    expect(service.updateSchedulingSettings).toHaveBeenCalledExactlyOnceWith({ actorUserId: userId, workspaceId, settings: conflicts });
  });
  it("keeps conflict fields out of general settings reads and writes", async () => {
    const service = organizationSettingsServiceMock();
    const general = { workspace_id: workspaceId, week_start_day: "monday", schedule_deadline_day: "sunday", time_format: "12h" } as const;
    vi.mocked(service.readSchedulingSettings).mockResolvedValue({ ...general, ...conflicts });
    vi.mocked(service.updateSchedulingSettings).mockResolvedValue({ ...general, ...conflicts });
    const app = buildApp({ organizationSettingsService: service, contextResolver: { resolve: async () => context } });
    for (const method of ["GET", "PUT"] as const) {
      const response = await app.inject({ method, url: `/v1/workspaces/${workspaceId}/scheduling-settings`, headers: { authorization: "Bearer valid-token" }, ...(method === "PUT" ? { payload: general } : {}) });
      expect(response.statusCode).toBe(200); expect(response.json()).toEqual(general);
    }
    const rejected = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspaceId}/scheduling-settings`, headers: { authorization: "Bearer valid-token" }, payload: { ...general, ...conflicts } });
    expect(rejected.statusCode).toBe(400);
    expect(service.updateSchedulingSettings).toHaveBeenCalledTimes(1);
    await app.close();
  });
  it("rejects a softer approved time off rule before it reaches the database", async () => {
    const service = organizationSettingsServiceMock();
    const app = buildApp({ organizationSettingsService: service, contextResolver: { resolve: async () => ({ ...context, permissions: ["schedule.conflict_rules.manage"] }) } });
    const response = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspaceId}/scheduling-settings/conflicts`, headers: { authorization: "Bearer valid-token" }, payload: { ...conflicts, conflict_rules: { ...conflicts.conflict_rules, approved_time_off: "confirm" } } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Valid conflict settings required" });
    expect(service.updateSchedulingSettings).not.toHaveBeenCalled();
    await app.close();
  });
  it("refuses an availability rule: availability is a preference, not a conflict (BL-186)", async () => {
    const service = organizationSettingsServiceMock();
    const app = buildApp({ organizationSettingsService: service, contextResolver: { resolve: async () => ({ ...context, permissions: ["schedule.conflict_rules.manage"] }) } });
    const response = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspaceId}/scheduling-settings/conflicts`, headers: { authorization: "Bearer valid-token" }, payload: { ...conflicts, conflict_rules: { ...conflicts.conflict_rules, availability: "block" } } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Valid conflict settings required" });
    expect(service.updateSchedulingSettings).not.toHaveBeenCalled();
    await app.close();
  });
  it("returns stale conflict revision as 409 without silently retrying", async () => {
    const service = organizationSettingsServiceMock();
    vi.mocked(service.updateSchedulingSettings).mockRejectedValue(rpcFailure({ message: "Conflict rules changed. Reload the current rules before saving.", code: "PT409" }));
    const app = buildApp({ organizationSettingsService: service, contextResolver: { resolve: async () => ({ ...context, permissions: ["schedule.conflict_rules.manage"] }) } });
    const response = await app.inject({ method: "PUT", url: `/v1/workspaces/${workspaceId}/scheduling-settings/conflicts`, headers: { authorization: "Bearer valid-token" }, payload: conflicts });
    expect(response.statusCode).toBe(409); expect(service.updateSchedulingSettings).toHaveBeenCalledTimes(1);
    await app.close();
  });
  it("returns a retryable 409 when a settings transaction conflicts with staffing", async () => {
    const service = organizationSettingsServiceMock();
    vi.mocked(service.updateSchedulingSettings).mockRejectedValue(
      rpcFailure({ message: "The schedule is being updated", code: "PT409" }),
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
        time_format: "12h",
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "The schedule is being updated", requestId: expect.any(String) });
    await app.close();
  });
  it("loads scheduling settings through the API boundary for workspace members", async () => {
    const readSchedulingSettings = vi.fn(async () => ({
      workspace_id: workspaceId,
      week_start_day: "monday" as const,
      schedule_deadline_day: "sunday" as const,
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
      time_format: "12h" as const,
    };
    const updateSchedulingSettings = vi.fn(async () => ({
      workspace_id: workspaceId,
      ...schedulingSettings,
    }));
    const reorderShiftTypes = vi.fn(async () => undefined);
    const reorderShiftLabels = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: {
        updateSchedulingSettings,
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

  // BL-475: departments and jobs go A to Z; there is no way to move them.
  it("has no route that moves departments or jobs", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      organizationSettingsService: organizationSettingsServiceMock(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/entities/reorder`,
      headers: { authorization: "Bearer valid-token" },
      payload: { entityType: "jobs", orderedIds },
    });

    expect(response.statusCode).toBe(404);
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
    const reorderShiftTypes = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({ ...context, permissions: ["workspace.read"] }),
      },
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

    expect(response.statusCode).toBe(403);
    expect(reorderShiftTypes).not.toHaveBeenCalled();
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
      time_format: "12h",
    };
    const routes = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/scheduling-settings`,
        serviceMethod: "readSchedulingSettings",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/scheduling-settings/conflicts`,
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

  it.each([
    ["suspended", { membership: { ...context.membership, status: "suspended" as const } }],
    ["held back by a document", { documentAccess: { restricted: true } }],
  ])("tells a %s manager who holds the read that the conflict rules are not found", async (_who, held) => {
    const service = organizationSettingsServiceMock();
    const manager = {
      ...context,
      membership: { ...context.membership, access: { employee: false, management: "manager" as const } },
      permissions: ["workspace.read", "settings.schedule_rules.read"],
    };
    const app = buildApp({
      organizationSettingsService: service,
      contextResolver: { resolve: async () => ({ ...manager, ...held }) as ActiveWorkspaceContext },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/scheduling-settings/conflicts`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Workspace not found" });
    expect(service.readSchedulingSettings).not.toHaveBeenCalled();
    await app.close();
  });

  // BL-172: somebody without the right is told no before anything about the
  // body they sent; the order used to be the other way round.
  it.each([
    ["PUT", "scheduling-settings/conflicts"],
    ["PUT", "scheduling-settings"],
    ["POST", "shift-types/reorder"],
    ["POST", "shift-labels/reorder"],
  ])("refuses %s %s before reading a broken body", async (method, path) => {
    const service = organizationSettingsServiceMock();
    const app = buildApp({
      organizationSettingsService: service,
      contextResolver: { resolve: async () => ({ ...context, permissions: ["workspace.read"] }) },
    });
    const response = await app.inject({
      method: method as "PUT" | "POST",
      url: `/v1/workspaces/${workspaceId}/${path}`,
      headers: { authorization: "Bearer valid-token" },
      payload: { nonsense: true },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
