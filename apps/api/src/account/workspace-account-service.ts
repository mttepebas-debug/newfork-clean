import {
  employmentContactRecordFromRow,
  workspaceIdentitySchema,
  workspaceSummaryFromRow,
  type EmploymentContactRecord,
  type WorkspaceIdentity,
  type WorkspaceSummary,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

import { rpcFailure } from "../http-error.js";

export interface WorkspaceAccountService {
  listWorkspaces(accessToken: string): Promise<WorkspaceSummary[]>;
  /** The caller's own employment record in each workspace they are in. */
  listEmploymentRecords(
    accessToken: string,
  ): Promise<EmploymentContactRecord[]>;
  createWorkspace(accessToken: string, workspaceName: string): Promise<string>;
  selectWorkspace(accessToken: string, workspaceId: string): Promise<void>;
  requestClosure(
    accessToken: string,
    input: {
      readonly workspaceId: string;
      readonly mode: "scheduled_end_period" | "immediate";
      readonly typedWorkspaceName?: string | null;
      readonly acknowledged: boolean;
      readonly effectiveAt?: string | null;
    },
  ): Promise<unknown>;
  cancelClosure(accessToken: string, workspaceId: string): Promise<unknown>;
  searchOwnershipCandidates(accessToken: string, workspaceId: string, query: string): Promise<unknown>;
  cancelOwnershipTransfer(accessToken: string, workspaceId: string, transferId: string): Promise<unknown>;
  initiateOwnershipTransfer(
    accessToken: string,
    input: {
      readonly workspaceId: string;
      readonly targetUserId: string;
    },
  ): Promise<unknown>;
  respondOwnershipTransfer(
    accessToken: string,
    input: {
      readonly workspaceId: string;
      readonly transferId: string;
      readonly action: "accept" | "reject";
    },
  ): Promise<unknown>;
  requestAccountDeletion(
    accessToken: string,
    input: {
      readonly typedEmail: string;
      readonly acknowledged: boolean;
    },
  ): Promise<unknown>;
  restoreAccountDeletion(accessToken: string): Promise<unknown>;
  saveOwnerOnboarding(
    accessToken: string,
    input: {
      readonly workspaceId: string;
      readonly workspaceName: string;
      readonly nextStep: 1 | 2 | 3 | 4;
      readonly complete: boolean;
      readonly expectedRevision?: number | null;
      readonly ownerFirstName?: string | null;
      readonly ownerMiddleName?: string | null;
      readonly ownerLastName?: string | null;
    },
  ): Promise<void>;
  /** Records that this account just opened this workspace. */
  touchWorkspace(accessToken: string, workspaceId: string): Promise<void>;
  /** How each workspace this account belongs to has it on file. */
  listWorkspaceIdentities(accessToken: string): Promise<WorkspaceIdentity[]>;
  queueOwnerOnboardingInvitationIntent(
    accessToken: string,
    input: {
      readonly workspaceId: string;
      readonly employeeId: string;
      readonly email: string;
    },
  ): Promise<void>;
  listOwnerOnboardingInvitationIntents(
    accessToken: string,
    workspaceId: string,
  ): Promise<OwnerOnboardingInvitationIntent[]>;
  markOwnerOnboardingInvitationIntentDispatched(
    accessToken: string,
    input: {
      readonly workspaceId: string;
      readonly employeeId: string;
      readonly error?: string | null;
    },
  ): Promise<void>;
  resetOwnerOnboarding(accessToken: string, workspaceId: string): Promise<void>;
}

export interface OwnerOnboardingInvitationIntent {
  readonly employeeId: string;
  readonly email: string;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

interface AccountLifecycleAuthAdmin {
  auth: {
    admin: {
      updateUserById(
        userId: string,
        attributes: { ban_duration: string | "none" },
      ): PromiseLike<{ error: { message: string } | null }>;
      signOut(
        accessToken: string,
        scope: "global",
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

const deletedAccountBanDuration = "876000h";
const developmentBearerPattern =
  /^development-(owner|admin|manager|employee)-token$/;

export function createWorkspaceAccountService(options: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): WorkspaceAccountService {
  const authClient = createClient(options.url, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rpcClient = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return createWorkspaceAccountServiceWithClients({
    rpcClient,
    authAdminClient: rpcClient,
    resolveActorUserId: async (accessToken) => {
      const developmentMatch = developmentBearerPattern.exec(accessToken);
      if (process.env.NODE_ENV !== "production" && developmentMatch) {
        return "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
      }
      const { data, error } = await authClient.auth.getUser(accessToken);
      if (error || !data.user) throw new Error("Valid bearer session required");
      return data.user.id;
    },
  });
}

export function createWorkspaceAccountServiceWithClients(options: {
  rpcClient: RpcClient;
  authAdminClient?: AccountLifecycleAuthAdmin | null;
  resolveActorUserId(accessToken: string): Promise<string>;
}): WorkspaceAccountService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await options.rpcClient.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }

  async function actorArgs(accessToken: string) {
    return { actor_user_id: await options.resolveActorUserId(accessToken) };
  }

  async function disableAccountSession(
    actorUserId: string,
    accessToken: string,
  ) {
    if (!options.authAdminClient) return;
    if (
      process.env.NODE_ENV !== "production" &&
      developmentBearerPattern.test(accessToken)
    ) {
      return;
    }
    const ban = await options.authAdminClient.auth.admin.updateUserById(
      actorUserId,
      { ban_duration: deletedAccountBanDuration },
    );
    if (ban.error)
      throw new Error(`Account disable failed: ${ban.error.message}`);

    const signOut = await options.authAdminClient.auth.admin.signOut(
      accessToken,
      "global",
    );
    if (signOut.error)
      throw new Error(`Account session revoke failed: ${signOut.error.message}`);
  }

  async function restoreAccountSession(actorUserId: string) {
    if (!options.authAdminClient) return;
    const result = await options.authAdminClient.auth.admin.updateUserById(
      actorUserId,
      { ban_duration: "none" },
    );
    if (result.error)
      throw new Error(`Account restore failed: ${result.error.message}`);
  }

  return {
    async listWorkspaces(accessToken) {
      return (
        (await rpc("list_my_workspaces_service", {
          ...(await actorArgs(accessToken)),
        })) as unknown[]
      ).map(workspaceSummaryFromRow);
    },
    async listEmploymentRecords(accessToken) {
      return (
        (await rpc("list_own_employment_records_service", {
          ...(await actorArgs(accessToken)),
        })) as unknown[]
      ).map(employmentContactRecordFromRow);
    },
    async createWorkspace(accessToken, workspaceName) {
      return String(
        await rpc("create_owner_workspace_service", {
          ...(await actorArgs(accessToken)),
          workspace_name: workspaceName,
        }),
      );
    },
    async selectWorkspace(accessToken, workspaceId) {
      await rpc("set_active_workspace_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: workspaceId,
      });
    },
    async requestClosure(accessToken, input) {
      return rpc("request_workspace_closure_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: input.workspaceId,
        closure_mode: input.mode,
        typed_workspace_name: input.typedWorkspaceName ?? null,
        acknowledged: input.acknowledged,
        target_effective_at: input.effectiveAt ?? null,
      });
    },
    async cancelClosure(accessToken, workspaceId) {
      return rpc("cancel_workspace_closure_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: workspaceId,
      });
    },
    async initiateOwnershipTransfer(accessToken, input) {
      return rpc("initiate_workspace_ownership_transfer_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: input.workspaceId,
        target_user_id: input.targetUserId,
      });
    },
    async searchOwnershipCandidates(accessToken, workspaceId, query) {
      return rpc("search_workspace_ownership_candidates_service", {
        ...(await actorArgs(accessToken)), target_workspace_id: workspaceId, search_text: query,
      });
    },
    async cancelOwnershipTransfer(accessToken, workspaceId, transferId) {
      return rpc("cancel_workspace_ownership_transfer_service", {
        ...(await actorArgs(accessToken)), target_workspace_id: workspaceId, transfer_id: transferId,
      });
    },
    async respondOwnershipTransfer(accessToken, input) {
      return rpc("respond_workspace_ownership_transfer_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: input.workspaceId,
        transfer_id: input.transferId,
        transfer_action: input.action,
      });
    },
    async requestAccountDeletion(accessToken, input) {
      const actor = await actorArgs(accessToken);
      const result = await rpc("request_account_deletion_service", {
        ...actor,
        typed_email: input.typedEmail,
        acknowledged: input.acknowledged,
      });
      await disableAccountSession(String(actor.actor_user_id), accessToken);
      return result;
    },
    async restoreAccountDeletion(accessToken) {
      const actor = await actorArgs(accessToken);
      const result = await rpc("restore_account_deletion_request_service", {
        ...actor,
      });
      await restoreAccountSession(String(actor.actor_user_id));
      return result;
    },
    async saveOwnerOnboarding(accessToken, input) {
      await rpc("update_owner_onboarding_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: input.workspaceId,
        workspace_name: input.workspaceName,
        next_step: input.nextStep,
        mark_complete: input.complete,
        expected_revision: input.expectedRevision ?? null,
        owner_first_name: input.ownerFirstName ?? null,
        owner_middle_name: input.ownerMiddleName ?? null,
        owner_last_name: input.ownerLastName ?? null,
      });
    },
    async listWorkspaceIdentities(accessToken) {
      const rows = (await rpc("list_my_workspace_identities_service", {
        ...(await actorArgs(accessToken)),
      })) as readonly {
        workspace_id: string;
        workspace_name: string;
        workspace_role: string;
        employee_name: string | null;
        employee_code: string | null;
      }[];
      return workspaceIdentitySchema.array().parse(
        (rows ?? []).map((row) => ({
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          role: row.workspace_role,
          employeeName: row.employee_name,
          employeeCode: row.employee_code,
        })),
      );
    },
    async touchWorkspace(accessToken, workspaceId) {
      await rpc("touch_workspace_membership_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: workspaceId,
      });
    },
    async queueOwnerOnboardingInvitationIntent(accessToken, input) {
      await rpc("queue_owner_onboarding_invitation_intent_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
        employee_email: input.email.trim().toLowerCase(),
      });
    },
    async listOwnerOnboardingInvitationIntents(accessToken, workspaceId) {
      return (
        (await rpc("list_owner_onboarding_invitation_intents_service", {
          ...(await actorArgs(accessToken)),
          target_workspace_id: workspaceId,
        })) as Array<{ employee_id: string; email: string }>
      ).map((row) => ({
        employeeId: row.employee_id,
        email: row.email,
      }));
    },
    async markOwnerOnboardingInvitationIntentDispatched(accessToken, input) {
      await rpc("mark_owner_onboarding_invitation_intent_dispatched_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
        dispatch_failure_message: input.error ?? null,
      });
    },
    async resetOwnerOnboarding(accessToken, workspaceId) {
      await rpc("reset_owner_onboarding_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: workspaceId,
      });
    },
  };
}
