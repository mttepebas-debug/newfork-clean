import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { buildApp } from "../app";
import { HttpError, rpcFailure } from "../http-error.js";
import type { WorkspaceAccountService } from "./workspace-account-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const accessToken = "valid-token";
// A token signed a moment ago: it used to open the password gate on its own.
const freshAccessToken = fakeJwt({
  iat: Math.floor(Date.now() / 1000) - 30,
});
const password = "correct horse battery staple";
const passwordOk = () => vi.fn(async () => undefined);
const passwordWrong = () =>
  vi.fn(async () => {
    throw new HttpError("Current password is incorrect", 403, {
      reason: "session.password_incorrect",
    });
  });
const passwordRequired = {
  error: "Current password required",
  reason: "session.password_required",
};
const passwordIncorrect = {
  error: "Current password is incorrect",
  reason: "session.password_incorrect",
  requestId: expect.any(String),
};
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const employeeId = "97f65b16-a7ad-4f50-990e-d89030ac4701";
const employeeRoleId = "26000000-0000-4000-8000-0000000000aa";

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
    access: { employee: false, management: "owner" },
    status: "active",
  },
  permissions: ["workspace.manage"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  documentAccess: { restricted: false },
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
    const denied = vi.fn(async () => { throw rpcFailure({ message: "workspace owner access required", code: "42501", hint: "workspace.owner_required" }); });
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
    const createWorkspace = vi.fn(async () => { throw rpcFailure({ message, code: "42501" }); });
    const app = buildApp({ workspaceAccountService: { createWorkspace } as unknown as WorkspaceAccountService });
    const response = await app.inject({ method: "POST", url: "/v1/account/workspaces", headers: { authorization: `Bearer ${accessToken}` }, payload: { name: "Invitee business" } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: message, requestId: expect.any(String) });
  });

  it("rejects a transfer without asking for the password", async () => {
    const respondOwnershipTransfer = vi.fn(async () => ({ status: "rejected" }));
    const verifyPassword = passwordWrong();
    const app = buildApp({ workspaceAccountService: { respondOwnershipTransfer, verifyPassword } as unknown as WorkspaceAccountService });
    const response = await app.inject({ method: "POST", url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/respond`, headers: { authorization: `Bearer ${accessToken}` }, payload: { transferId: workspaceId, action: "reject" } });
    expect(response.statusCode).toBe(200);
    expect(respondOwnershipTransfer).toHaveBeenCalledWith(accessToken, { workspaceId, transferId: workspaceId, action: "reject" });
    expect(verifyPassword).not.toHaveBeenCalled();
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

  // BL-503: Create workspace takes the name the way owner setup does.
  it("refuses Turkish-only letters in a new workspace's name", async () => {
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
      payload: { name: "Kadıköy Cafe" },
    });

    expect(response.statusCode).toBe(400);
    expect(createWorkspace).not.toHaveBeenCalled();
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
      ownerFirstName: null,
      ownerMiddleName: null,
      ownerLastName: null,
    });
  });

  // BL-503: the workspace and the owner's own names follow the US letter rule.
  it.each([
    [{ workspaceName: "Kadıköy Cafe", nextStep: 2, complete: false }],
    [{ workspaceName: "Meyhouse", nextStep: 2, complete: false, ownerFirstName: "Mert", ownerLastName: "Tepebaş" }],
  ])("refuses Turkish-only letters in owner onboarding: %j", async (payload) => {
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
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(saveOwnerOnboarding).not.toHaveBeenCalled();
  });

  it("returns conflict when owner onboarding revision is stale", async () => {
    const saveOwnerOnboarding = vi.fn(async () => {
      throw rpcFailure({
        message: "owner onboarding revision conflict",
        code: "PT409",
        hint: "workspace.onboarding_changed",
      });
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
      // BL-1046: the setup screen reloads on this key, not on the sentence.
      reason: "workspace.onboarding_changed",
      requestId: expect.any(String),
    });
    expect(saveOwnerOnboarding).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      workspaceName: "Meyhouse",
      nextStep: 2,
      complete: false,
      expectedRevision: 1,
      ownerFirstName: null,
      ownerMiddleName: null,
      ownerLastName: null,
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

  // U37: a caller without the right hears no before anything about the body.
  it("refuses an invitation intent before reading a broken body", async () => {
    const queueOwnerOnboardingInvitationIntent = vi.fn();
    const app = buildApp({
      contextResolver: { resolve: async () => ({ ...context, permissions: ["workspace.read"] }) },
      workspaceAccountService: { queueOwnerOnboardingInvitationIntent } as unknown as WorkspaceAccountService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/owner-onboarding/invitation-intents`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { email: "not an email" },
    });
    expect(response.statusCode).toBe(403);
    expect(queueOwnerOnboardingInvitationIntent).not.toHaveBeenCalled();
  });

  it("dispatches queued owner onboarding invitations after completion", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const listOwnerOnboardingInvitationIntents = vi.fn(async () => [
      { employeeId, email: "alex@example.test", employeeRoleId },
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
      ownerFirstName: null,
      ownerMiddleName: null,
      ownerLastName: null,
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
      access: {
        employee_role_id: employeeRoleId,
        management_role_id: null,
        managed_location_ids: [],
      },
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
      { employeeId, email: "alex@example.test", employeeRoleId },
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

  it("closes a workspace once the server has checked the password", async () => {
    const requestClosure = vi.fn(async () => ({ status: "scheduled" }));
    const verifyPassword = passwordOk();
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
        verifyPassword,
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
        password,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith(accessToken, password);
    expect(requestClosure).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      mode: "scheduled_end_period",
      typedWorkspaceName: null,
      acknowledged: true,
      effectiveAt: "2026-09-19T12:00:00.000Z",
    });
  });

  it("sends the machine key alongside the sentence a refusal came with", async () => {
    const requestClosure = vi.fn(async () => {
      throw rpcFailure({
        message: "pending ownership transfer must be resolved before workspace closure",
        code: "23514",
        hint: "workspace.closure.transfer_pending",
      });
    });
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
        verifyPassword: passwordOk(),
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "scheduled_end_period",
        acknowledged: true,
        effectiveAt: "2026-09-19T12:00:00.000Z",
        password,
      },
    });

    // The screen reads the key. The sentence rides along for the log.
    expect(response.json()).toEqual({
      error: "pending ownership transfer must be resolved before workspace closure",
      reason: "workspace.closure.transfer_pending",
      requestId: expect.any(String),
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

  it("refuses to close a set-up workspace without a password, a fresh token or not", async () => {
    // Scheduling used to be the way round the password, and then a token
    // signed a moment ago was. Neither proves who is at the keyboard.
    const requestClosure = vi.fn(async () => ({ status: "scheduled" }));
    const verifyPassword = passwordOk();
    const listWorkspaces = vi.fn(async () => [
      {
        id: workspaceId,
        name: "Meyhouse",
        role: "owner",
        status: "active",
        isActive: true,
        onboarding: { status: "complete", currentStep: 4 },
      },
    ]);
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
        listWorkspaces,
        verifyPassword,
      } as unknown as WorkspaceAccountService,
    });

    for (const payload of [
      { mode: "scheduled_end_period", acknowledged: true, effectiveAt: "2026-09-19T12:00:00.000Z" },
      { mode: "immediate", typedWorkspaceName: "Meyhouse", acknowledged: true },
      { mode: "immediate", typedWorkspaceName: "Meyhouse", acknowledged: true, password: "" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/account/workspaces/${workspaceId}/closure`,
        headers: { authorization: `Bearer ${freshAccessToken}` },
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual(passwordRequired);
    }
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(requestClosure).not.toHaveBeenCalled();
  });

  it("refuses to close a workspace with a wrong password", async () => {
    const requestClosure = vi.fn(async () => ({ status: "deleted" }));
    const verifyPassword = passwordWrong();
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
        verifyPassword,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/closure`,
      headers: { authorization: `Bearer ${freshAccessToken}` },
      payload: {
        mode: "immediate",
        typedWorkspaceName: "Meyhouse",
        acknowledged: true,
        password: "not it",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(passwordIncorrect);
    expect(verifyPassword).toHaveBeenCalledWith(freshAccessToken, "not it");
    expect(requestClosure).not.toHaveBeenCalled();
  });

  it("closes a setup its owner never finished without a password, either way", async () => {
    // The exemption is about the workspace, not the mode: nothing is in there
    // to lose.
    const requestClosure = vi.fn(async () => ({ status: "deleted" }));
    const verifyPassword = passwordWrong();
    const listWorkspaces = vi.fn(async () => [
      {
        id: workspaceId,
        name: "Meyhouse",
        role: "owner",
        status: "active",
        isActive: false,
        onboarding: { status: "incomplete", currentStep: 2 },
      },
    ]);
    const app = buildApp({
      workspaceAccountService: {
        requestClosure,
        listWorkspaces,
        verifyPassword,
      } as unknown as WorkspaceAccountService,
    });

    for (const payload of [
      { mode: "scheduled_end_period", acknowledged: true, effectiveAt: "2026-09-19T12:00:00.000Z" },
      { mode: "immediate", typedWorkspaceName: "Meyhouse", acknowledged: true },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/account/workspaces/${workspaceId}/closure`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload,
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    expect(requestClosure).toHaveBeenCalledTimes(2);
    expect(verifyPassword).not.toHaveBeenCalled();
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

  it("starts an ownership transfer once the server has checked the password", async () => {
    const initiateOwnershipTransfer = vi.fn(async () => ({ status: "pending" }));
    const verifyPassword = passwordOk();
    const targetUserId = "10000000-0000-4000-8000-000000000003";
    const app = buildApp({
      workspaceAccountService: {
        initiateOwnershipTransfer,
        verifyPassword,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "spoofed",
        targetUserId,
        password,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith(accessToken, password);
    expect(initiateOwnershipTransfer).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      targetUserId,
    });
  });

  it("refuses to start an ownership transfer without the right password", async () => {
    const initiateOwnershipTransfer = vi.fn(async () => ({ status: "pending" }));
    const targetUserId = "10000000-0000-4000-8000-000000000003";
    for (const [payload, status, body] of [
      [{ targetUserId }, 400, passwordRequired],
      [{ targetUserId, password: "" }, 400, passwordRequired],
      [{ targetUserId, password: "not it" }, 403, passwordIncorrect],
    ] as const) {
      const app = buildApp({
        workspaceAccountService: {
          initiateOwnershipTransfer,
          verifyPassword: passwordWrong(),
        } as unknown as WorkspaceAccountService,
      });
      const response = await app.inject({
        method: "POST",
        url: `/v1/account/workspaces/${workspaceId}/ownership-transfer`,
        headers: { authorization: `Bearer ${freshAccessToken}` },
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(status);
      expect(response.json()).toEqual(body);
    }
    expect(initiateOwnershipTransfer).not.toHaveBeenCalled();
  });

  it("accepts an ownership transfer once the server has checked the password", async () => {
    const respondOwnershipTransfer = vi.fn(async () => ({ status: "accepted" }));
    const verifyPassword = passwordOk();
    const transferId = "41000000-0000-4000-8000-000000000001";
    const app = buildApp({
      workspaceAccountService: {
        respondOwnershipTransfer,
        verifyPassword,
      } as unknown as WorkspaceAccountService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/respond`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workspaceId: "spoofed",
        transferId,
        action: "accept",
        password,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith(accessToken, password);
    expect(respondOwnershipTransfer).toHaveBeenCalledWith(accessToken, {
      workspaceId,
      transferId,
      action: "accept",
    });
  });

  it("refuses to accept an ownership transfer without the right password", async () => {
    const respondOwnershipTransfer = vi.fn(async () => ({ status: "accepted" }));
    const transferId = "41000000-0000-4000-8000-000000000001";
    for (const [payload, status, body] of [
      [{ transferId, action: "accept" }, 400, passwordRequired],
      [{ transferId, action: "accept", password: "" }, 400, passwordRequired],
      [{ transferId, action: "accept", password: "not it" }, 403, passwordIncorrect],
    ] as const) {
      const app = buildApp({
        workspaceAccountService: {
          respondOwnershipTransfer,
          verifyPassword: passwordWrong(),
        } as unknown as WorkspaceAccountService,
      });
      const response = await app.inject({
        method: "POST",
        url: `/v1/account/workspaces/${workspaceId}/ownership-transfer/respond`,
        headers: { authorization: `Bearer ${freshAccessToken}` },
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(status);
      expect(response.json()).toEqual(body);
    }
    expect(respondOwnershipTransfer).not.toHaveBeenCalled();
  });

  it("no longer answers the retired account deletion path (SEC-003 #4)", async () => {
    const retired = vi.fn(async () => ({ status: "pending" }));
    const app = buildApp({
      workspaceAccountService: {
        requestAccountDeletion: retired,
        restoreAccountDeletion: retired,
      } as unknown as WorkspaceAccountService,
    });
    for (const url of ["/v1/account/deletion", "/v1/account/deletion/restore"]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { typedEmail: "owner@example.test", acknowledged: true },
      });
      expect(response.statusCode, url).toBe(404);
    }
    expect(retired).not.toHaveBeenCalled();
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
      { employeeId, email: "alex@example.test", employeeRoleId },
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
