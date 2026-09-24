import {
  employeeDetailSchema,
  employeeInputSchema,
  employeeRoleUpdateInputSchema,
  employeeSummarySchema,
  pendingPreferredNameFromRow,
  preferredNameApprovalSchema,
  preferredNameOutcomeSchema,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeRoleUpdateInput,
  type EmployeeSummary,
  type PendingPreferredName,
  type PreferredNameApproval,
  type PreferredNameOutcome,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface EmployeeTerminationInput {
  readonly effectiveLocal: string;
  readonly worksiteTimezone: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface EmployeeTerminationResult {
  readonly terminationId: string;
  readonly effectiveAt: string;
  readonly releasedShiftCount: number;
  readonly idempotentReplay: boolean;
}

export interface EmployeeAvatarStatus {
  readonly present: boolean;
  readonly url: string | null;
}

export interface EmployeeDirectoryService {
  getOwnAvatar?(input: { readonly actorUserId: string; readonly workspaceId: string }): Promise<EmployeeAvatarStatus>;
  list(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly archived: boolean;
    readonly search: string;
    readonly status: string;
  }): Promise<EmployeeSummary[]>;
  get(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
  }): Promise<EmployeeDetail>;
  save(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId?: string;
    readonly employee: EmployeeInput;
  }): Promise<string>;
  updateRole(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly role: EmployeeRoleUpdateInput;
  }): Promise<void>;
  setArchived(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly archived: boolean;
    readonly restoreAccess: boolean;
  }): Promise<void>;
  terminate(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly termination: EmployeeTerminationInput;
  }): Promise<EmployeeTerminationResult>;
  getAvatar(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
  }): Promise<EmployeeAvatarStatus>;
  removeAvatar(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
  }): Promise<void>;
  removeAccess(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
  }): Promise<void>;
  /** How this workspace answers a preferred name. */
  getPreferredNameApproval(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
  }): Promise<PreferredNameApproval>;
  setPreferredNameApproval(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly approval: PreferredNameApproval;
  }): Promise<void>;
  /** The person asks for their own. What happens next is the setting's answer. */
  requestPreferredName(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly preferredName: string;
  }): Promise<PreferredNameOutcome>;
  listPendingPreferredNames(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
  }): Promise<PendingPreferredName[]>;
  decidePreferredName(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly requestId: string;
    readonly approve: boolean;
  }): Promise<void>;
  /**
   * A person's own emergency contact and personal phone. Onboarding asks for
   * them once and never comes back; the owner is never asked at all. One way
   * in, whoever is writing.
   */
  saveOwnEmploymentContact(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly name: string;
    readonly relationship: string;
    readonly phone: string;
    readonly email: string;
    readonly personalPhone?: string | null;
  }): Promise<void>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  readonly storage?: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): PromiseLike<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
      remove(paths: string[]): PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
}

const terminationResultSchema = z
  .object({
    termination_id: z.string().uuid(),
    effective_at: z.string().datetime({ offset: true }),
    released_shift_count: z.coerce.number().int().nonnegative().default(0),
    idempotent_replay: z.boolean().default(false),
  })
  .transform((row) => ({
    terminationId: row.termination_id,
    effectiveAt: row.effective_at,
    releasedShiftCount: row.released_shift_count,
    idempotentReplay: row.idempotent_replay,
  }));

export function createEmployeeDirectoryService(options: {
  url: string;
  serviceRoleKey: string;
}): EmployeeDirectoryService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createEmployeeDirectoryServiceWithClient(client);
}

export function createEmployeeDirectoryServiceWithClient(
  client: RpcClient,
): EmployeeDirectoryService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    async list(input) {
      return employeeSummarySchema.array().parse(
        await rpc("list_employees_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          include_archived: input.archived,
          search_text: input.search,
          status_filter: input.archived ? "all" : input.status,
          page_limit: 100,
          page_offset: 0,
        }),
      );
    },
    async get(input) {
      return employeeDetailSchema.parse(
        await rpc("get_employee_detail_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
        }),
      );
    },
    async save(input) {
      const value = employeeInputSchema.parse(input.employee);
      return String(
        await rpc("save_employee_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId ?? null,
          employee_first_name: value.first_name,
          employee_last_name: value.last_name,
          employee_middle_name: value.middle_name ?? "",
          employee_preferred_name: value.preferred_name,
          employee_invitation_email: value.invitation_email,
          employee_start_date: value.start_date || null,
          employee_internal_note: value.internal_note,
          location_ids: value.location_ids,
          primary_location_id: value.primary_location_id,
          job_ids: value.job_ids,
          primary_job_id: value.primary_job_id,
          employee_is_remote: value.is_remote ?? false,
          employee_is_excluded_from_schedule:
            value.is_excluded_from_schedule ?? false,
          expected_revision: value.expected_revision,
        }),
      );
    },
    async updateRole(input) {
      const value = employeeRoleUpdateInputSchema.parse(input.role);
      await rpc("update_employee_membership_role_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
        target_role_id: value.role_id,
      });
    },
    async setArchived(input) {
      await rpc("set_employee_archived_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
        should_archive: input.archived,
        restore_access: input.restoreAccess,
      });
    },
    async terminate(input) {
      return terminationResultSchema.parse(
        await rpc("terminate_employee_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
          effective_local: input.termination.effectiveLocal,
          worksite_timezone: input.termination.worksiteTimezone,
          termination_reason: input.termination.reason,
          target_idempotency_key: input.termination.idempotencyKey,
        }),
      );
    },
    async getOwnAvatar(input) {
      const path = await rpc("get_own_employee_avatar_path_service", {
        actor_user_id: input.actorUserId, target_workspace_id: input.workspaceId,
      });
      if (typeof path !== "string" || !path) return { present: false, url: null };
      const signed = await client.storage?.from("employee-profile-photos").createSignedUrl(path, 5 * 60);
      return { present: true, url: signed?.error ? null : (signed?.data?.signedUrl ?? null) };
    },
    async getAvatar(input) {
      const path = await rpc("get_employee_avatar_path_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
      });
      if (typeof path !== "string" || !path)
        return { present: false, url: null };
      const signed = await client.storage
        ?.from("employee-profile-photos")
        .createSignedUrl(path, 5 * 60);
      return {
        present: true,
        url: signed?.error ? null : (signed?.data?.signedUrl ?? null),
      };
    },
    async removeAvatar(input) {
      const path = await rpc("remove_employee_avatar_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
      });
      if (typeof path === "string" && path) {
        await client.storage?.from("employee-profile-photos").remove([path]);
      }
    },
    async getPreferredNameApproval(input) {
      return preferredNameApprovalSchema.parse(
        await rpc("get_employee_name_settings_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
        }),
      );
    },
    async setPreferredNameApproval(input) {
      await rpc("set_employee_name_settings_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        approval: input.approval,
      });
    },
    async requestPreferredName(input) {
      return preferredNameOutcomeSchema.parse(
        await rpc("request_employee_preferred_name_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
          preferred_name: input.preferredName,
        }),
      );
    },
    async listPendingPreferredNames(input) {
      return (
        (await rpc("list_pending_preferred_names_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
        })) as unknown[]
      ).map(pendingPreferredNameFromRow);
    },
    async decidePreferredName(input) {
      await rpc("decide_employee_preferred_name_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_request_id: input.requestId,
        approve: input.approve,
      });
    },
    async saveOwnEmploymentContact(input) {
      await rpc("save_own_employment_contact_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
        contact_name: input.name,
        contact_relationship: input.relationship,
        contact_phone: input.phone,
        contact_email: input.email,
        personal_phone: input.personalPhone ?? null,
      });
    },
    async removeAccess(input) {
      await rpc("remove_employee_access_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
      });
    },
  };
}
