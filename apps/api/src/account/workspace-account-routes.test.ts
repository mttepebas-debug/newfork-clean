import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { buildApp } from "../app";
import type { WorkspaceAccountService } from "./workspace-account-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const accessToken = "valid-token";
const freshAccessToken = fakeJwt({
  iat: Math.floor(Date.now() / 1000) - 30,
});
const staleAccessToken = fakeJwt({
  iat: Math.floor(Date.now() / 1000) - 60 * 60,
});
const futureAccessToken = fakeJwt({
  iat: Math.floor(Date.now() / 1000) + 60,
});
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const employeeId = "97f65b16-a7ad-4f50-990e-d89030ac4701";

function fakeJwt(payload: Record<string, unknown>): string {
  return [
    "eyJhbGciOiJub25lIn0",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");
}

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
  permissions: ["workspace.manage"],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

describe("workspace account routes", () => {
  it("searches bounded candidates using only the authenticated actor and path tenant", async () => {
    const searchOwnershipCandidates = vi.fn(async () => []);
    const app = buildApp({ workspaceAccountService: { searchOwnershipCandidates } as unknown as WorkspaceAccountService });
    const response = await app.inject({ method: "GET", url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/candidates?q=Admin&actorUserId=spoofed`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(searchOwnershipCandidates).toHaveBeenCalledWith(accessToken, workspaceId, "Admin");
    const short = await app.inject({ method: "GET", url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/candidates?q=a`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(short.statusCode).toBe(400);
    expect(searchOwnershipCandidates).toHaveBeenCalledTimes(1);
  });

  it.each(["create", "search", "cancel"])("propagates DB owner denial for %s", async operation => {
    const denied = vi.fn(async () => { throw new Error("workspace owner access required"); });
    const app = buildApp({ workspaceAccountService: { createWorkspace: denied, searchOwnershipCandidates: denied, cancelOwnershipTransfer: denied } as unknown as WorkspaceAccountService });
    const response = await app.inject({
      method: operation === "search" ? "GET" : "POST",
      url: `/v1/account/workspaces${operation === "create" ? "" : `/${workspaceId}/ownership-transfer/${operation === "search" ? "candidates?q=Admin" : "cancel"}`}`,
      headers: { authorization: `Bearer ${accessToken}` },
      ...(operation === "create" ? { payload: { name: "Denied" } } : operation === "cancel" ? { payload: { transferId: workspaceId } } : {}),
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns 403 when a pending invitation blocks workspace creation", async () => {
    const message = "pending invitation must be resolved first";
    const createWorkspace = vi.fn(async () => { throw new Error(message); });
    const app = buildApp({ workspaceAccountService: { createWorkspace } as unknown as WorkspaceAccountService });
    const response = await app.inject({ method: "POST", url: "/v1/account/workspaces", headers: { authorization: `Bearer ${accessToken}` }, payload: { name: "Invitee business" } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: message });
  });

  it("rejects with an older authenticated session without requiring a password", async () => {
    const respondOwnershipTransfer = vi.fn(async () => ({ status: "rejected" }));
    const app = buildApp({ workspaceAccountService: { respondOwnershipTransfer } as unknown as WorkspaceAccountService });
    const response = await app.inject({ method: "POST", url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/respond`, headers: { authorization: `Bearer ${staleAccessToken}` }, payload: { transferId: workspaceId, action: "reject" } });
    expect(response.statusCode).toBe(200);
    expect(respondOwnershipTransfer).toHaveBeenCalledWith(staleAccessToken, { workspaceId, transferId: workspaceId, action: "reject" });
  });

  it("cancels a transfer using path workspace and server actor", async () => {
    const cancelOwnershipTransfer = vi.fn(async () => ({ status: "cancelled" }));
    const app = buildApp({ workspaceAccountService: { cancelOwnershipTransfer } as unknown as WorkspaceAccountService });
    const response = await app.inject({ method: "POST", url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/cancel`, headers: { authorization: `Bearer ${accessToken}` }, payload: { transferId: workspaceId, actorUserId: "spoofed" } });
    expect(response.statusCode).toBe(200);
    expect(cancelOwnershipTransfer).toHaveBeenCalledWith(accessToken, workspaceId, workspaceId);
  });

  it("lists account workspaces through the API boundary", async () => {
    const listWorkspaces = vi.fn(async () => [
      {
        id: workspaceId,
        name: "Meyhouse",
        role: "owner",
        isActive: true,
        onboarding: { status: "complete", currentStep: 2, revision: 1 },
      },
    ]);
    const app = buildApp({
      workspaceAccountService: {
        listWorkspaces,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/account/workspaces",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(listWorkspaces).toHaveBeenCalledWith(accessToken);
  });

  it("creates a workspace without accepting body identity", async () => {
    const createWorkspace = vi.fn(async () => workspaceId);
    const app = buildApp({
      workspaceAccountService: {
        createWorkspace,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/account/workspaces",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Meyhouse", actorUserId: "spoofed" },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ id: workspaceId });
    expect(createWorkspace).toHaveBeenCalledWith(accessToken, "Meyhouse");
  });

  it("selects the active workspace from the path only", async () => {
    const selectWorkspace = vi.fn(async () => undefined);
    const app = buildApp({
      workspaceAccountService: {
        selectWorkspace,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/active`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
        actorUserId: "spoofed",
      },
    });

    expect(response.statusCode, response.body).toBe(204);
    expect(selectWorkspace).toHaveBeenCalledWith(accessToken, workspaceId);
  });

  it("saves owner onboarding with the workspace id from the path", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      workspaceAccountService: {
        saveOwnerOnboarding,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "spoofed",
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 2,
      complete: false,
      expectedRevision: null,
    });
  });

  it("returns conflict when owner onboarding revision is stale", async () => {
    const saveOwnerOnboarding = vi.fn(async () => {
      throw new Error("owner onboarding revision conflict");
    });
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      workspaceAccountService: {
        saveOwnerOnboarding,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
        expectedRevision: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "owner onboarding revision conflict",
    });
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 2,
      complete: false,
      expectedRevision: 1,
    });
  });

  it("queues owner onboarding invitation intents through the API boundary", async () => {
    const queueOwnerOnboardingInvitationIntent = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      workspaceAccountService: {
        queueOwnerOnboardingInvitationIntent,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding/invitation-intents`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "spoofed",
        employeeId,
        email: "alex@example.test",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(queueOwnerOnboardingInvitationIntent).toHaveBeenCalledWith(
      accessToken,
      {
        workspaceId,
        employeeId,
        email: "alex@example.test",
      },
    );
  });

  it("does not queue owner onboarding invitation intents when the active workspace context mismatches the path", async () => {
    const queueOwnerOnboardingInvitationIntent = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: {
            ...context.workspace,
            id: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
          membership: {
            ...context.membership,
            workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
        }),
      },
      workspaceAccountService: {
        queueOwnerOnboardingInvitationIntent,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding/invitation-intents`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        employeeId,
        email: "alex@example.test",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Workspace not found" });
    expect(queueOwnerOnboardingInvitationIntent).not.toHaveBeenCalled();
  });

  it("dispatches queued owner onboarding invitations after completion", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const listOwnerOnboardingInvitationIntents = vi.fn(async () => [
      { employeeId, email: "alex@example.test" },
    ]);
    const markOwnerOnboardingInvitationIntentDispatched = vi.fn(
      async () => undefined,
    );
    const prepare = vi.fn(async () => ({
      id: "invite-1",
      expiresAt: "2026-09-12T12:00:00.000Z",
    }));
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      workspaceAccountService: {
        saveOwnerOnboarding,
        listOwnerOnboardingInvitationIntents,
        markOwnerOnboardingInvitationIntentDispatched,
      } as unknown as WorkspaceAccountService,
      invitationService: { prepare } as never,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: true,
      },
    });

    expect(response.statusCode, response.body).toBe(204);
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 4,
      complete: true,
      expectedRevision: null,
    });
    expect(listOwnerOnboardingInvitationIntents).toHaveBeenCalledWith(
      accessToken,
      workspaceId,
    );
    expect(prepare).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employeeId,
      email: "alex@example.test",
      roleId: null,
    });
    expect(markOwnerOnboardingInvitationIntentDispatched).toHaveBeenCalledWith(
      accessToken,
      {
        workspaceId,
        employeeId,
      },
    );
  });

  it("does not roll back owner onboarding when invitation dispatch fails", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const listOwnerOnboardingInvitationIntents = vi.fn(async () => [
      { employeeId, email: "alex@example.test" },
    ]);
    const markOwnerOnboardingInvitationIntentDispatched = vi.fn(
      async () => undefined,
    );
    const prepare = vi.fn(async () => {
      throw new Error("Invitation delivery failed");
    });
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      workspaceAccountService: {
        saveOwnerOnboarding,
        listOwnerOnboardingInvitationIntents,
        markOwnerOnboardingInvitationIntentDispatched,
      } as unknown as WorkspaceAccountService,
      invitationService: { prepare } as never,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: true,
      },
    });

    expect(response.statusCode, response.body).toBe(204);
    expect(markOwnerOnboardingInvitationIntentDispatched).toHaveBeenCalledWith(
      accessToken,
      {
        workspaceId,
        employeeId,
        error: "Invitation delivery failed",
      },
    );
  });

  it("returns forbidden when owner onboarding lacks workspace management permission", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          permissions: ["workspace.read"],
        }),
      },
      workspaceAccountService: {
        saveOwnerOnboarding,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Workspace management required",
    });
    expect(saveOwnerOnboarding).not.toHaveBeenCalled();
  });

  it("resets owner onboarding with the workspace id from the path", async () => {
    const resetOwnerOnboarding = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      workspaceAccountService: {
        resetOwnerOnboarding,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding/reset`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { workspaceId: "spoofed" },
    });

    expect(response.statusCode).toBe(204);
    expect(resetOwnerOnboarding).toHaveBeenCalledWith(accessToken, workspaceId);
  });

  it("does not reset owner onboarding when the active workspace context mismatches the path", async () => {
    const resetOwnerOnboarding = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: {
            ...context.workspace,
            id: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
          membership: {
            ...context.membership,
            workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
        }),
      },
      workspaceAccountService: {
        resetOwnerOnboarding,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding/reset`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(404);
    expect(resetOwnerOnboarding).not.toHaveBeenCalled();
  });

  it("requests workspace closure with the workspace id from the path", async () => {
    const requestClosure = vi.fn(async () => ({ status: "scheduled" }));
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "spoofed",
        mode: "scheduled_end_period",
        acknowledged: true,
        effectiveAt: "2026-09-19T12:00:00.000Z",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(requestClosure).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      mode: "scheduled_end_period",
      typedWorkspaceName: null,
      acknowledged: true,
      effectiveAt: "2026-09-19T12:00:00.000Z",
    });
  });

  it("requires typed name confirmation for immediate workspace closure", async () => {
    const requestClosure = vi.fn(async () => ({ status: "deleted" }));
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "immediate",
        acknowledged: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(requestClosure).not.toHaveBeenCalled();
  });

  it("requires explicit acknowledgement before workspace closure reaches the service", async () => {
    const requestClosure = vi.fn(async () => ({ status: "scheduled" }));
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "scheduled_end_period",
        acknowledged: false,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Valid workspace closure details required",
    });
    expect(requestClosure).not.toHaveBeenCalled();
  });

  it("requires recent reauthentication for immediate workspace closure", async () => {
    const requestClosure = vi.fn(async () => ({ status: "deleted" }));
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: `Bearer ${staleAccessToken}` },
      payload: {
        mode: "immediate",
        typedWorkspaceName: "Meyhouse",
        acknowledged: true,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Recent reauthentication required",
    });
    expect(requestClosure).not.toHaveBeenCalled();
  });

  it("does not treat malformed or future-issued tokens as recent reauthentication", async () => {
    const requestClosure = vi.fn(async () => ({ status: "deleted" }));
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
      } as unknown as WorkspaceAccountService,
    });

    for (const token of ["malformed-token", futureAccessToken]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/account/workspaces/${workspaceId}/closure`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          mode: "immediate",
          typedWorkspaceName: "Meyhouse",
          acknowledged: true,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Recent reauthentication required",
      });
    }
    expect(requestClosure).not.toHaveBeenCalled();
  });

  it("allows development bearer reauthentication bypass outside production only", async () => {
    const requestClosure = vi.fn(async () => ({ status: "deleted" }));
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
      } as unknown as WorkspaceAccountService,
    });

    const developmentResponse = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: "Bearer development-owner-token" },
      payload: {
        mode: "immediate",
        typedWorkspaceName: "Meyhouse",
        acknowledged: true,
      },
    });

    expect(developmentResponse.statusCode, developmentResponse.body).toBe(200);
    expect(requestClosure).toHaveBeenCalledOnce();

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const productionResponse = await app.inject({
        method: "POST",
        url: `/v1/account/workspaces/${workspaceId}/closure`,
        headers: { authorization: "Bearer development-owner-token" },
        payload: {
          mode: "immediate",
          typedWorkspaceName: "Meyhouse",
          acknowledged: true,
        },
      });

      expect(productionResponse.statusCode).toBe(403);
      expect(productionResponse.json()).toEqual({
        error: "Recent reauthentication required",
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
    expect(requestClosure).toHaveBeenCalledOnce();
  });

  it("cancels scheduled workspace closure from the path workspace", async () => {
    const cancelClosure = vi.fn(async () => ({ status: "cancelled" }));
    const app = buildApp({
      workspaceAccountService: {
        cancelClosure,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
        actorUserId: "spoofed",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(cancelClosure).toHaveBeenCalledWith(accessToken, workspaceId);
  });

  it("initiates ownership transfer without accepting body workspace identity", async () => {
    const initiateOwnershipTransfer = vi.fn(async () => ({ status: "pending" }));
    const targetUserId = "10000000-0000-4000-8000-000000000003";
    const app = buildApp({
      workspaceAccountService: {
        initiateOwnershipTransfer,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer`,
      headers: { authorization: `Bearer ${freshAccessToken}` },
      payload: {
        workspaceId: "spoofed",
        targetUserId,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(initiateOwnershipTransfer).toHaveBeenCalledWith(freshAccessToken, {
      workspaceId,
      targetUserId,
    });
  });

  it("requires recent reauthentication before starting ownership transfer", async () => {
    const initiateOwnershipTransfer = vi.fn(async () => ({ status: "pending" }));
    const targetUserId = "10000000-0000-4000-8000-000000000003";
    const app = buildApp({
      workspaceAccountService: {
        initiateOwnershipTransfer,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer`,
      headers: { authorization: `Bearer ${staleAccessToken}` },
      payload: { targetUserId },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Recent reauthentication required",
    });
    expect(initiateOwnershipTransfer).not.toHaveBeenCalled();
  });

  it("responds to ownership transfer with the path workspace", async () => {
    const respondOwnershipTransfer = vi.fn(async () => ({ status: "accepted" }));
    const transferId = "41000000-0000-4000-8000-000000000001";
    const app = buildApp({
      workspaceAccountService: {
        respondOwnershipTransfer,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/respond`,
      headers: { authorization: `Bearer ${freshAccessToken}` },
      payload: {
        workspaceId: "spoofed",
        transferId,
        action: "accept",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(respondOwnershipTransfer).toHaveBeenCalledWith(freshAccessToken, {
      workspaceId,
      transferId,
      action: "accept",
    });
  });

  it("requires recent reauthentication before responding to ownership transfer", async () => {
    const respondOwnershipTransfer = vi.fn(async () => ({ status: "accepted" }));
    const transferId = "41000000-0000-4000-8000-000000000001";
    const app = buildApp({
      workspaceAccountService: {
        respondOwnershipTransfer,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/respond`,
      headers: { authorization: `Bearer ${staleAccessToken}` },
      payload: {
        transferId,
        action: "accept",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Recent reauthentication required",
    });
    expect(respondOwnershipTransfer).not.toHaveBeenCalled();
  });

  it("requests global account deletion from the bearer account only", async () => {
    const requestAccountDeletion = vi.fn(async () => ({ status: "pending" }));
    const app = buildApp({
      workspaceAccountService: {
        requestAccountDeletion,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/account/deletion",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        actorUserId: "spoofed",
        typedEmail: "owner@example.test",
        acknowledged: true,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(requestAccountDeletion).toHaveBeenCalledWith(accessToken, {
      typedEmail: "owner@example.test",
      acknowledged: true,
    });
  });

  it("requires explicit acknowledgement before account deletion reaches the service", async () => {
    const requestAccountDeletion = vi.fn(async () => ({ status: "pending" }));
    const app = buildApp({
      workspaceAccountService: {
        requestAccountDeletion,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/account/deletion",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        typedEmail: "owner@example.test",
        acknowledged: false,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Valid account deletion details required",
    });
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("restores global account deletion from the bearer account only", async () => {
    const restoreAccountDeletion = vi.fn(async () => ({ status: "restored" }));
    const app = buildApp({
      workspaceAccountService: {
        restoreAccountDeletion,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/account/deletion/restore",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        actorUserId: "spoofed",
        workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(restoreAccountDeletion).toHaveBeenCalledWith(accessToken);
  });

  it("does not save owner onboarding when the active workspace context mismatches the path", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: {
            ...context.workspace,
            id: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
          membership: {
            ...context.membership,
            workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
        }),
      },
      workspaceAccountService: {
        saveOwnerOnboarding,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(saveOwnerOnboarding).not.toHaveBeenCalled();
  });

  it("does not dispatch owner onboarding invitations when completion mismatches the active workspace", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const listOwnerOnboardingInvitationIntents = vi.fn(async () => [
      { employeeId, email: "alex@example.test" },
    ]);
    const markOwnerOnboardingInvitationIntentDispatched = vi.fn(
      async () => undefined,
    );
    const prepare = vi.fn(async () => ({
      id: "invite-1",
      expiresAt: "2026-09-12T12:00:00.000Z",
    }));
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: {
            ...context.workspace,
            id: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
          membership: {
            ...context.membership,
            workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
          },
        }),
      },
      workspaceAccountService: {
        saveOwnerOnboarding,
        listOwnerOnboardingInvitationIntents,
        markOwnerOnboardingInvitationIntentDispatched,
      } as unknown as WorkspaceAccountService,
      invitationService: { prepare } as never,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: true,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Workspace not found" });
    expect(saveOwnerOnboarding).not.toHaveBeenCalled();
    expect(listOwnerOnboardingInvitationIntents).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(markOwnerOnboardingInvitationIntentDispatched).not.toHaveBeenCalled();
  });
});
