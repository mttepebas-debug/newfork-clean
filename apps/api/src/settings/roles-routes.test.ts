import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { RolesService } from "./roles-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const roleId = "cb000000-0000-4000-8000-000000000001";
const spoofedIdentity = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "11111111-1111-4111-8111-111111111111",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: otherWorkspaceId,
  workspace_id: otherWorkspaceId,
  roleId: "22222222-2222-4222-8222-222222222222",
  role_id: "22222222-2222-4222-8222-222222222222",
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
  permissions: ["roles.read", "roles.manage"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
};

const roleInput = {
  name: "Floor lead",
  description: "Runs service",
  access_class: "manager",
  permission_keys: ["workspace.read", "schedule.read"],
} as const;

function rolesServiceMock(): RolesService {
  return {
    save: vi.fn(),
    delete: vi.fn(),
  };
}

describe("roles routes", () => {
  it("forwards role saves through the authenticated API boundary", async () => {
    const save = vi.fn(async () => roleId);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      rolesService: {
        save,
      } as unknown as RolesService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/roles`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...roleInput, ...spoofedIdentity },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ id: roleId });
    expect(save).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      role: roleInput,
    });
  });

  it("forwards role updates from the path role id", async () => {
    const save = vi.fn(async () => roleId);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      rolesService: {
        save,
      } as unknown as RolesService,
    });

    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/roles/${roleId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...roleInput, ...spoofedIdentity },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ id: roleId });
    expect(save).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      roleId,
      role: roleInput,
    });
  });


  it("forwards role deletes without accepting body identity", async () => {
    const deleteRole = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      rolesService: {
        delete: deleteRole,
      } as unknown as RolesService,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/roles/${roleId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: spoofedIdentity,
    });

    expect(response.statusCode).toBe(204);
    expect(deleteRole).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      roleId,
    });
  });

  it("requires role management permission before saving", async () => {
    const save = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({ ...context, permissions: ["roles.read"] }),
      },
      rolesService: {
        save,
      } as unknown as RolesService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/roles`,
      headers: { authorization: "Bearer valid-token" },
      payload: roleInput,
    });

    expect(response.statusCode).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns a generic not found for every route when the active workspace mismatches the path", async () => {
    const service = rolesServiceMock();
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
      rolesService: service,
    });
    const routes = [
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/roles`,
        payload: roleInput,
        serviceMethod: "save",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/roles/${roleId}`,
        payload: roleInput,
        serviceMethod: "save",
      },
      {
        method: "DELETE",
        url: `/v1/workspaces/${workspaceId}/roles/${roleId}`,
        serviceMethod: "delete",
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
