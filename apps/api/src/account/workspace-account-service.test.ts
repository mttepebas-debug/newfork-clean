import { describe, expect, it, vi } from "vitest";
import { createWorkspaceAccountServiceWithClients } from "./workspace-account-service";

const accessToken = "fresh-access-token";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

describe("workspace account service", () => {
  it("checks the password with the verifier it was built with, and fails closed without one (SEC-003)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const verifyPassword = vi.fn(async () => undefined);
    const service = createWorkspaceAccountServiceWithClients({ rpcClient: { rpc }, resolveActorUserId: async () => userId, verifyPassword });
    await expect(service.verifyPassword(accessToken, "pass word ")).resolves.toBeUndefined();
    expect(verifyPassword).toHaveBeenCalledWith(accessToken, "pass word ");
    const unconfigured = createWorkspaceAccountServiceWithClients({ rpcClient: { rpc }, resolveActorUserId: async () => userId });
    await expect(unconfigured.verifyPassword(accessToken, "pass word ")).rejects.toMatchObject({ statusCode: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("forwards candidate search and cancellation with the resolved actor", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const service = createWorkspaceAccountServiceWithClients({ rpcClient: { rpc }, resolveActorUserId: async () => userId });
    await service.searchOwnershipCandidates(accessToken, workspaceId, "Admin");
    expect(rpc).toHaveBeenLastCalledWith("search_workspace_ownership_candidates_service", { actor_user_id: userId, target_workspace_id: workspaceId, search_text: "Admin" });
    await service.cancelOwnershipTransfer(accessToken, workspaceId, workspaceId);
    expect(rpc).toHaveBeenLastCalledWith("cancel_workspace_ownership_transfer_service", { actor_user_id: userId, target_workspace_id: workspaceId, transfer_id: workspaceId });
  });
  it("maps account workspace rows through the service RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          workspace_id: workspaceId,
          workspace_name: "Meyhouse",
          workspace_role: "owner",
          membership_status: "active",
          is_active: true,
          onboarding_status: "complete",
          onboarding_current_step: 4,
        },
      ],
      error: null,
    }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });

    await expect(service.listWorkspaces(accessToken)).resolves.toEqual([
      expect.objectContaining({
        id: workspaceId,
        name: "Meyhouse",
        role: "owner",
        status: "active",
        isActive: true,
      }),
    ]);

    expect(rpc).toHaveBeenCalledWith("list_my_workspaces_service", {
      actor_user_id: userId,
    });
  });

  it("forwards workspace lifecycle and transfer transitions through service RPCs", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === "create_owner_workspace_service"
          ? workspaceId
          : { status: "ok" },
      error: null,
    }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });
    const targetUserId = "10000000-0000-4000-8000-000000000003";
    const transferId = "41000000-0000-4000-8000-000000000001";

    await expect(service.createWorkspace(accessToken, "Meyhouse")).resolves.toBe(
      workspaceId,
    );
    await expect(service.selectWorkspace(accessToken, workspaceId)).resolves.toBeUndefined();
    await expect(
      service.requestClosure(accessToken, {
        workspaceId,
        mode: "scheduled_end_period",
        typedWorkspaceName: null,
        acknowledged: true,
        effectiveAt: "2026-09-19T12:00:00.000Z",
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(service.cancelClosure(accessToken, workspaceId)).resolves.toEqual({
      status: "ok",
    });
    await expect(
      service.initiateOwnershipTransfer(accessToken, {
        workspaceId,
        targetUserId,
      }),
    ).resolves.toEqual({ status: "ok" });
    await expect(
      service.respondOwnershipTransfer(accessToken, {
        workspaceId,
        transferId,
        action: "accept",
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(rpc).toHaveBeenCalledWith("create_owner_workspace_service", {
      actor_user_id: userId,
      workspace_name: "Meyhouse",
    });
    expect(rpc).toHaveBeenCalledWith("set_active_workspace_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
    expect(rpc).toHaveBeenCalledWith("request_workspace_closure_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      closure_mode: "scheduled_end_period",
      typed_workspace_name: null,
      acknowledged: true,
      target_effective_at: "2026-09-19T12:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("cancel_workspace_closure_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
    expect(rpc).toHaveBeenCalledWith(
      "initiate_workspace_ownership_transfer_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_user_id: targetUserId,
      },
    );
    expect(rpc).toHaveBeenCalledWith(
      "respond_workspace_ownership_transfer_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        transfer_id: transferId,
        transfer_action: "accept",
      },
    );
  });

  it("saves owner onboarding with an expected revision through the service RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });

    await expect(
      service.saveOwnerOnboarding(accessToken, {
        workspaceId,
        workspaceName: "Meyhouse",
        nextStep: 2,
        complete: false,
        expectedRevision: 3,
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("update_owner_onboarding_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      workspace_name: "Meyhouse",
      next_step: 2,
      mark_complete: false,
      expected_revision: 3,
      owner_first_name: null,
      owner_middle_name: null,
      owner_last_name: null,
    });
  });

  it("queues owner onboarding invitation intents through the service RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });

    await expect(
      service.queueOwnerOnboardingInvitationIntent(accessToken, {
        workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        employeeId: "97f65b16-a7ad-4f50-990e-d89030ac4701",
        email: "Alex@Example.Test ",
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith(
      "queue_owner_onboarding_invitation_intent_service",
      {
        actor_user_id: userId,
        target_workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        target_employee_id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
        employee_email: "alex@example.test",
      },
    );
  });

  it("maps owner onboarding invitation intents from the service RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          employee_id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
          email: "alex@example.test",
        },
      ],
      error: null,
    }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });

    await expect(
      service.listOwnerOnboardingInvitationIntents(
        accessToken,
        "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      ),
    ).resolves.toEqual([
      {
        employeeId: "97f65b16-a7ad-4f50-990e-d89030ac4701",
        email: "alex@example.test",
      },
    ]);

    expect(rpc).toHaveBeenCalledWith(
      "list_owner_onboarding_invitation_intents_service",
      {
        actor_user_id: userId,
        target_workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      },
    );
  });

  it("marks owner onboarding invitation intents as dispatched through the service RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });

    await expect(
      service.markOwnerOnboardingInvitationIntentDispatched(accessToken, {
        workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        employeeId: "97f65b16-a7ad-4f50-990e-d89030ac4701",
        error: "Invitation delivery failed",
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith(
      "mark_owner_onboarding_invitation_intent_dispatched_service",
      {
        actor_user_id: userId,
        target_workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        target_employee_id: "97f65b16-a7ad-4f50-990e-d89030ac4701",
        dispatch_failure_message: "Invitation delivery failed",
      },
    );
  });
});
