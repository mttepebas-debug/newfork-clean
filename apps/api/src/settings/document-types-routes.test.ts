import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { DocumentTypesService } from "./document-types-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const documentTypeId = "dc000000-0000-4000-8000-000000000001";
const spoofedIdentity = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "11111111-1111-4111-8111-111111111111",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: otherWorkspaceId,
  workspace_id: otherWorkspaceId,
  documentTypeId: "22222222-2222-4222-8222-222222222222",
  document_type_id: "22222222-2222-4222-8222-222222222222",
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
  permissions: ["documents.read", "documents.manage"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
};

const documentTypeInput = {
  title: "Food handler card",
  description: "Required certificate",
  required_at_onboarding: true,
  requires_review: true,
  accepted_formats: ["pdf"],
  tracks_expiry: true,
  expiry_warning_days: 30,
  expiry_schedule_impact: "warn",
};

function documentTypesServiceMock(): DocumentTypesService {
  return {
    save: vi.fn(),
    setArchived: vi.fn(),
    reorder: vi.fn(),
  };
}

describe("document type routes", () => {
  it("forwards document type saves through the authenticated API boundary", async () => {
    const save = vi.fn(async () => documentTypeId);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      documentTypesService: {
        save,
      } as unknown as DocumentTypesService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/document-types`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...documentTypeInput, ...spoofedIdentity },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ id: documentTypeId });
    expect(save).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      documentType: documentTypeInput,
    });
  });

  it("forwards explicit document type ordering", async () => {
    const reorder = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      documentTypesService: {
        reorder,
      } as unknown as DocumentTypesService,
    });

    const orderedIds = [
      "dc000000-0000-4000-8000-000000000001",
      "dc000000-0000-4000-8000-000000000002",
    ];
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/document-types/reorder`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...spoofedIdentity, orderedIds },
    });

    expect(response.statusCode).toBe(204);
    expect(reorder).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      orderedIds,
    });
  });

  it("forwards document type archive state from the path document type id", async () => {
    const setArchived = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      documentTypesService: {
        setArchived,
      } as unknown as DocumentTypesService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/document-types/${documentTypeId}/archive`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...spoofedIdentity, archived: true },
    });

    expect(response.statusCode).toBe(204);
    expect(setArchived).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      documentTypeId,
      archived: true,
    });
  });


  it("requires document management permission before archiving", async () => {
    const setArchived = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({ ...context, permissions: ["documents.read"] }),
      },
      documentTypesService: {
        setArchived,
      } as unknown as DocumentTypesService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/document-types/${documentTypeId}/archive`,
      headers: { authorization: "Bearer valid-token" },
      payload: { archived: true },
    });

    expect(response.statusCode).toBe(403);
    expect(setArchived).not.toHaveBeenCalled();
  });

  it("returns a generic not found for every route when the active workspace mismatches the path", async () => {
    const service = documentTypesServiceMock();
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
      documentTypesService: service,
    });
    const orderedIds = [
      "dc000000-0000-4000-8000-000000000001",
      "dc000000-0000-4000-8000-000000000002",
    ];
    const routes = [
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/document-types`,
        payload: documentTypeInput,
        serviceMethod: "save",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/document-types/${documentTypeId}`,
        payload: documentTypeInput,
        serviceMethod: "save",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/document-types/${documentTypeId}/archive`,
        payload: { archived: true },
        serviceMethod: "setArchived",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/document-types/reorder`,
        payload: { orderedIds },
        serviceMethod: "reorder",
      },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: "Bearer valid-token" },
        payload: route.payload,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Workspace not found" });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
  });
});
