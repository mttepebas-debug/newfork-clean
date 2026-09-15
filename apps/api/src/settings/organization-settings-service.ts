import { createClient } from "@supabase/supabase-js";
import { createJobsManagementService, type JobsManagementService } from "./jobs-management-service";
import {
  schedulingSettingsSchema,
  type SchedulingSettings,
  type SchedulingSettingsInput,
} from "@newfork/shared";

export interface OrganizationSettingsService {
  readonly jobs?: JobsManagementService;
  readSchedulingSettings(input: {
    readonly workspaceId: string;
  }): Promise<SchedulingSettings>;
  updateSchedulingSettings(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly settings: Partial<SchedulingSettingsInput>;
  }): Promise<SchedulingSettings>;
  reorderEntities(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly entityType: "departments" | "jobs";
    readonly orderedIds: readonly string[];
  }): Promise<void>;
  reorderShiftTypes(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly orderedIds: readonly string[];
  }): Promise<void>;
  reorderShiftLabels(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly orderedIds: readonly string[];
  }): Promise<void>;
}

interface RpcClient {
  from(table: "workspace_scheduling_settings"): {
    select(columns: string): {
      eq(column: "workspace_id", value: string): {
        single(): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export function createOrganizationSettingsService(options: {
  url: string;
  serviceRoleKey: string;
}): OrganizationSettingsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  return createOrganizationSettingsServiceWithClient(client);
}

export function createOrganizationSettingsServiceWithClient(
  client: RpcClient,
): OrganizationSettingsService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
  }

  return {
    jobs: createJobsManagementService(client),
    async readSchedulingSettings(input) {
      const { data, error } = await client
        .from("workspace_scheduling_settings")
        .select(
          "workspace_id,week_start_day,schedule_deadline_day,conflict_policy,availability_enforcement,time_format,availability_ownership,availability_approval,availability_initial_review,availability_notice_days,availability_policy_revision,minimum_travel_minutes,minimum_rest_minutes,conflict_rules,conflict_rules_revision",
        )
        .eq("workspace_id", input.workspaceId)
        .single();
      if (error) throw new Error(error.message);
      return schedulingSettingsSchema.parse(data);
    },
    async updateSchedulingSettings(input) {
      const { data, error } = await client.rpc("update_scheduling_settings_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        settings: input.settings,
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return schedulingSettingsSchema.parse(data);
    },
    async reorderEntities(input) {
      await rpc("reorder_organization_entities_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        entity_type: input.entityType,
        ordered_ids: [...input.orderedIds],
      });
    },
    async reorderShiftTypes(input) {
      await rpc("reorder_shift_types_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        ordered_ids: [...input.orderedIds],
      });
    },
    async reorderShiftLabels(input) {
      await rpc("reorder_shift_labels_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        ordered_ids: [...input.orderedIds],
      });
    },
  };
}
