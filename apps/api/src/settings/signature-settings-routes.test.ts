import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { SignatureSettingsService } from "./signature-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const policyId = "da000000-0000-4000-8000-000000000001";
const templateId = "db000000-0000-4000-8000-000000000001";
const otherPolicyId = "da000000-0000-4000-8000-000000000002";
const otherTemplateId = "db000000-0000-4000-8000-000000000002";
const spoofedIdentity = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "11111111-1111-4111-8111-111111111111",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: otherWorkspaceId,
  workspace_id: otherWorkspaceId,
  policyId: otherPolicyId,
  policy_id: otherPolicyId,
  templateId: otherTemplateId,
  template_id: otherTemplateId,
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
  permissions: ["signature_templates.read", "signature_templates.manage"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
};

const policyInput = {
  name: "Policy acknowledgements",
  retention_trigger: "employment_end",
  duration_days: 1095,
  jurisdiction_scope: "Workspace policy",
  authority_reference: "Internal records schedule v1",
} as const;

const templateInput = {
  title: "Team handbook acknowledgement",
  summary: "Confirms receipt.",
  content_text: "Team handbook",
  intent_statement: "I acknowledge that I received this policy.",
  locale: "en-US",
  effective_date: "2026-08-17",
  required_at_onboarding: true,
  blocks_activation: true,
  retention_policy_id: policyId,
} as const;

function signatureSettingsServiceMock(): SignatureSettingsService {
  return {
    saveRetentionPolicy: vi.fn(),
    approveRetentionPolicy: vi.fn(),
    unapproveRetentionPolicy: vi.fn(),
    setRetentionPolicyArchived: vi.fn(),
    saveTemplateDraft: vi.fn(),
    publishTemplate: vi.fn(),
    unpublishTemplate: vi.fn(),
    setTemplateArchived: vi.fn(),
  };
}

describe("signature settings routes", () => {
  it("forwards retention policy saves through the API boundary", async () => {
    const saveRetentionPolicy = vi.fn(async () => policyId);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      signatureSettingsService: {
        saveRetentionPolicy,
      } as unknown as SignatureSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/signature-retention-policies`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...policyInput, ...spoofedIdentity },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ id: policyId });
    expect(saveRetentionPolicy).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      policy: policyInput,
    });
  });

  it("forwards template draft publication through the API boundary", async () => {
    const publishTemplate = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      signatureSettingsService: {
        publishTemplate,
      } as unknown as SignatureSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/publish`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(204);
    expect(publishTemplate).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      templateId,
    });
  });

  it("ignores spoofed actor, workspace and path resource fields in signature write bodies", async () => {
    const saveRetentionPolicy = vi.fn(async () => policyId);
    const approveRetentionPolicy = vi.fn(async () => undefined);
    const unapproveRetentionPolicy = vi.fn(async () => undefined);
    const setRetentionPolicyArchived = vi.fn(async () => undefined);
    const saveTemplateDraft = vi.fn(async () => templateId);
    const publishTemplate = vi.fn(async () => undefined);
    const unpublishTemplate = vi.fn(async () => undefined);
    const setTemplateArchived = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      signatureSettingsService: {
        saveRetentionPolicy,
        approveRetentionPolicy,
        unapproveRetentionPolicy,
        setRetentionPolicyArchived,
        saveTemplateDraft,
        publishTemplate,
        unpublishTemplate,
        setTemplateArchived,
      } as unknown as SignatureSettingsService,
    });

    const requests = [
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}`,
        payload: { ...policyInput, ...spoofedIdentity },
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}/approve`,
        payload: spoofedIdentity,
        expectedStatus: 204,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}/unapprove`,
        payload: spoofedIdentity,
        expectedStatus: 204,
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}/archive`,
        payload: { ...spoofedIdentity, archived: true },
        expectedStatus: 204,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-templates`,
        payload: { ...templateInput, ...spoofedIdentity },
        expectedStatus: 201,
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/draft`,
        payload: { ...templateInput, ...spoofedIdentity },
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/publish`,
        payload: spoofedIdentity,
        expectedStatus: 204,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/unpublish`,
        payload: spoofedIdentity,
        expectedStatus: 204,
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/archive`,
        payload: { ...spoofedIdentity, archived: true },
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
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(
        request.expectedStatus,
      );
    }

    expect(saveRetentionPolicy).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      policyId,
      policy: policyInput,
    });
    expect(approveRetentionPolicy).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      policyId,
    });
    expect(unapproveRetentionPolicy).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      policyId,
    });
    expect(setRetentionPolicyArchived).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      policyId,
      archived: true,
    });
    expect(saveTemplateDraft).toHaveBeenNthCalledWith(1, {
      actorUserId: userId,
      workspaceId,
      template: templateInput,
    });
    expect(saveTemplateDraft).toHaveBeenNthCalledWith(2, {
      actorUserId: userId,
      workspaceId,
      templateId,
      template: templateInput,
    });
    expect(publishTemplate).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      templateId,
    });
    expect(unpublishTemplate).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      templateId,
    });
    expect(setTemplateArchived).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      templateId,
      archived: true,
    });
  });

  it("requires template management permission before saving drafts", async () => {
    const saveTemplateDraft = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          permissions: ["signature_templates.read"],
        }),
      },
      signatureSettingsService: {
        saveTemplateDraft,
      } as unknown as SignatureSettingsService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/signature-templates`,
      headers: { authorization: "Bearer valid-token" },
      payload: templateInput,
    });

    expect(response.statusCode).toBe(403);
    expect(saveTemplateDraft).not.toHaveBeenCalled();
  });

  it("returns a generic not found for every route when the active workspace mismatches the path", async () => {
    const service = signatureSettingsServiceMock();
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
      signatureSettingsService: service,
    });
    const routes = [
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies`,
        payload: policyInput,
        serviceMethod: "saveRetentionPolicy",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}`,
        payload: policyInput,
        serviceMethod: "saveRetentionPolicy",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}/approve`,
        serviceMethod: "approveRetentionPolicy",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}/unapprove`,
        serviceMethod: "unapproveRetentionPolicy",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/signature-retention-policies/${policyId}/archive`,
        payload: { archived: true },
        serviceMethod: "setRetentionPolicyArchived",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-templates`,
        payload: templateInput,
        serviceMethod: "saveTemplateDraft",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/draft`,
        payload: templateInput,
        serviceMethod: "saveTemplateDraft",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/publish`,
        serviceMethod: "publishTemplate",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/unpublish`,
        serviceMethod: "unpublishTemplate",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/signature-templates/${templateId}/archive`,
        payload: { archived: true },
        serviceMethod: "setTemplateArchived",
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
