import {
  employeeAccessChangeInputSchema,
  employeeAccessChangeResultSchema,
  employeeAccessImpactSchema,
  employeeAccessPreviewInputSchema,
  type EmployeeAccessChangeInput,
  type EmployeeAccessChangeResult,
  type EmployeeAccessImpact,
  type EmployeeAccessPreviewInput,
  employeeDetailSchema,
  employeeInputSchema,
  employeeProfilePhotoBucket,
  employeeProfilePhotoSignedUrlTtlSeconds,
  employeeLocationRemovalSchema,
  employeeReferenceDataSchema,
  type EmployeeReferenceDataRecord,
  employeeSummarySchema,
  pendingPreferredNameFromRow,
  preferredNameOutcomeSchema,
  type EmployeeDetail,
  type EmployeeDisplayStatus,
  type EmployeeInput,
  type EmployeeLocationRemoval,
  type EmployeeSummary,
  type PendingPreferredName,
  type PreferredNameOutcome,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rpcFailure } from "../http-error";

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
  references(input: { readonly actorUserId: string; readonly workspaceId: string }): Promise<EmployeeReferenceDataRecord>;
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
  previewAccessChange(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly access: EmployeeAccessPreviewInput;
  }): Promise<EmployeeAccessImpact>;
  changeAccess(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly access: EmployeeAccessChangeInput;
  }): Promise<EmployeeAccessChangeResult>;
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
  /** Takes somebody off one location; the record stays (FB-6.2 S1). */
  removeFromLocation(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly locationId: string;
  }): Promise<EmployeeLocationRemoval>;
  /** The person asks for their own; it waits for who may decide it (KARARLAR S-131). */
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
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; hint?: string | null; details?: string | null } | null;
  }>;
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

// The list's tabs (KARARLAR S-256) that are not one status of their own.
// Needs you is who sent their onboarding in. Joining is everybody on the way
// in: one read of the whole list, kept to those statuses here, rather than a
// read per status; the database orders it by name already. Any other value
// (Active, an old link's Invited) is one status, as the database matches it.
const listTabs: Record<string, { readonly filter: string; readonly keeps?: ReadonlySet<EmployeeDisplayStatus> }> = {
  needs_you: { filter: "needs_attention" },
  joining: {
    filter: "all",
    keeps: new Set<EmployeeDisplayStatus>(["not_invited", "invited", "onboarding", "changes_requested"]),
  },
};

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
    if (error) throw rpcFailure(error);
    return data;
  }

  return {
    // ponytail: only this read is on rpcFailure; the rest of the file moves with BL-134.
    async references(input) {
      const { data, error } = await client.rpc("read_employee_references_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
      });
      if (error) throw rpcFailure(error);
      return employeeReferenceDataSchema.parse(data);
    },
    // EMP-LIMIT (P09): every person, page after page (ordered by name then id),
    // until an empty one; one call used to stop at 100 without a word. The
    // offset follows what came back, so a smaller database cap loses nobody.
    async list(input) {
      const tab = input.archived ? undefined : listTabs[input.status];
      const statusFilter = input.archived ? "all" : tab ? tab.filter : input.status;
      const people: EmployeeSummary[] = [];
      for (;;) {
        const page = employeeSummarySchema.array().parse(
          await rpc("list_employees_service", {
            actor_user_id: input.actorUserId,
            target_workspace_id: input.workspaceId,
            include_archived: input.archived,
            search_text: input.search,
            status_filter: statusFilter,
            page_limit: 200,
            page_offset: people.length,
          }),
        );
        if (page.length === 0) break;
        people.push(...page);
      }
      const keeps = tab?.keeps;
      return keeps ? people.filter((person) => keeps.has(person.display_status)) : people;
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
    async previewAccessChange(input) {
      const value = employeeAccessPreviewInputSchema.parse(input.access);
      return employeeAccessImpactSchema.parse(
        await rpc("preview_employee_access_change_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
          next_employee_role_id: value.employee_role_id,
          next_management_role_id: value.management_role_id,
        }),
      );
    },
    async changeAccess(input) {
      const value = employeeAccessChangeInputSchema.parse(input.access);
      return employeeAccessChangeResultSchema.parse(
        await rpc("change_employee_access_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
          next_employee_role_id: value.employee_role_id,
          next_management_role_id: value.management_role_id,
          managed_location_ids: value.managed_location_ids,
          management_job_ids: value.management_job_ids ?? null,
          expected_impact: value.expected_impact,
        }),
      );
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
    async getAvatar(input) {
      // AVATAR-IKON: only a photo the person uploaded; a drawing or no avatar reads as null.
      const path = await rpc("get_member_avatar_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
      });
      if (typeof path !== "string" || !path)
        return { present: false, url: null };
      const signed = await client.storage
        ?.from(employeeProfilePhotoBucket)
        .createSignedUrl(path, employeeProfilePhotoSignedUrlTtlSeconds);
      return {
        present: true,
        url: signed?.error ? null : (signed?.data?.signedUrl ?? null),
      };
    },
    async removeAvatar(input) {
      // AVATAR-IKON: a manager removes only a photo (PT409 avatarReasons.notPhoto otherwise), never a drawing.
      const path = await rpc("remove_member_photo_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_employee_id: input.employeeId,
      });
      if (typeof path === "string" && path) {
        await client.storage?.from(employeeProfilePhotoBucket).remove([path]);
      }
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
    async removeFromLocation(input) {
      const answer = z
        .object({ released_shift_count: z.number(), locations_left: z.number() })
        .parse(
          await rpc("remove_employee_from_location_service", {
            actor_user_id: input.actorUserId,
            target_workspace_id: input.workspaceId,
            target_employee_id: input.employeeId,
            target_location_id: input.locationId,
          }),
        );
      return employeeLocationRemovalSchema.parse({
        releasedShiftCount: answer.released_shift_count,
        locationsLeft: answer.locations_left,
      });
    },
  };
}
