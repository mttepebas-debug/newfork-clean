import {
  accountAttentionSchema,
  employmentContactRecordFromRow,
  workspaceIdentitySchema,
  workspaceSummaryFromRow,
  type AccountAttention,
  type EmploymentContactRecord,
  type OwnerLegalName,
  type WorkspaceIdentity,
  type WorkspaceSummary,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

import { HttpError, rpcFailure } from "../http-error.js";
import { createUserVerifier } from "../auth/verify-user.js";
import { createPasswordVerifier } from "../auth/verify-password.js";

export interface WorkspaceAccountService {
  /**
   * Signs in as the bearer with this password. Throws 403
   * session.password_incorrect when it is not theirs (SEC-003).
   */
  verifyPassword(accessToken: string, password: string): Promise<void>;
  listWorkspaces(accessToken: string): Promise<WorkspaceSummary[]>;
  /** What the account area is waiting for, per tab. */
  countAttention(accessToken: string): Promise<AccountAttention>;
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
  /** The owner's own legal name in this workspace; null when none is on file. */
  getOwnLegalName(
    accessToken: string,
    workspaceId: string,
  ): Promise<OwnerLegalName | null>;
  /** Changes it; the database writes the audit line when something changed. */
  saveOwnLegalName(
    accessToken: string,
    workspaceId: string,
    name: OwnerLegalName,
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
  /** The employee app's role: setup invites to it (DAVET-ERISIM). */
  readonly employeeRoleId: string;
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

  const verifyUser = createUserVerifier(authClient);
  const verifyPasswordFor = createPasswordVerifier(rpcClient);
  return createWorkspaceAccountServiceWithClients({
    rpcClient,
    resolveActorUserId: async (accessToken) => {
      const user = await verifyUser(accessToken);
      if (!user) throw new HttpError("Valid bearer session required", 401);
      return user.id;
    },
    verifyPassword: async (accessToken, password) => {
      const user = await verifyUser(accessToken);
      if (!user) throw new HttpError("Valid bearer session required", 401);
      await verifyPasswordFor(user.id, password);
    },
  });
}

export function createWorkspaceAccountServiceWithClients(options: {
  rpcClient: RpcClient;
  resolveActorUserId(accessToken: string): Promise<string>;
  /** Signs in as the bearer with this password; left out, every check fails. */
  verifyPassword?(accessToken: string, password: string): Promise<void>;
}): WorkspaceAccountService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await options.rpcClient.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }

  async function actorArgs(accessToken: string) {
    return { actor_user_id: await options.resolveActorUserId(accessToken) };
  }

  return {
    async verifyPassword(accessToken, password) {
      if (!options.verifyPassword)
        throw new HttpError("Password check is not configured", 503);
      await options.verifyPassword(accessToken, password);
    },
    async listWorkspaces(accessToken) {
      return (
        (await rpc("list_my_workspaces_service", {
          ...(await actorArgs(accessToken)),
        })) as unknown[]
      ).map(workspaceSummaryFromRow);
    },
    async countAttention(accessToken) {
      const rows = (await rpc("count_account_attention_service", {
        ...(await actorArgs(accessToken)),
      })) as unknown[];
      return accountAttentionSchema.parse(
        rows[0] ?? { documents: 0, workspaces: 0 },
      );
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
    async getOwnLegalName(accessToken, workspaceId) {
      const rows = (await rpc("get_own_legal_name_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: workspaceId,
      })) as readonly {
        legal_first_name: string | null;
        legal_middle_name: string | null;
        legal_last_name: string | null;
      }[];
      const row = rows?.[0];
      if (!row?.legal_first_name || !row.legal_last_name) return null;
      return {
        firstName: row.legal_first_name,
        middleName: row.legal_middle_name ?? "",
        lastName: row.legal_last_name,
      };
    },
    async saveOwnLegalName(accessToken, workspaceId, name) {
      await rpc("save_owner_legal_name_service", {
        ...(await actorArgs(accessToken)),
        target_workspace_id: workspaceId,
        legal_first_name: name.firstName,
        legal_middle_name: name.middleName,
        legal_last_name: name.lastName,
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
        })) as Array<{ employee_id: string; email: string; employee_role_id: string }>
      ).map((row) => ({
        employeeId: row.employee_id,
        email: row.email,
        employeeRoleId: row.employee_role_id,
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
