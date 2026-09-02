import {
  scheduleRequestMutationResultSchema,
  scheduleRequestsReadModelSchema,
  type ScheduleRequestMutationResult,
  type ScheduleRequestsReadModel,
  type ShiftChangeDecisionInput,
  type TimeOffDecisionInput,
} from "@newfork/shared/schedule";
import { createClient } from "@supabase/supabase-js";

export interface ScheduleRequestsService {
  get(input: {
    actorUserId: string;
    workspaceId: string;
    timeOffQueue: "needs_review" | "closed";
    shiftQueue: "needs_review" | "history";
    locationId: string | null;
    search: string;
    timeOffCursor: string | null;
    shiftCursor: string | null;
    limit: number;
  }): Promise<ScheduleRequestsReadModel>;
  markTimeOffViewed(input: {
    actorUserId: string;
    workspaceId: string;
    requestId: string;
  }): Promise<ScheduleRequestMutationResult>;
  resolveTimeOff(input: {
    actorUserId: string;
    workspaceId: string;
    requestId: string;
    decision: TimeOffDecisionInput;
  }): Promise<ScheduleRequestMutationResult>;
  resolveShiftChange(input: {
    actorUserId: string;
    workspaceId: string;
    requestId: string;
    decision: ShiftChangeDecisionInput;
  }): Promise<ScheduleRequestMutationResult>;
}

export function createScheduleRequestsService(options: {
  url: string;
  serviceRoleKey: string;
}): ScheduleRequestsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async get(input) {
      return scheduleRequestsReadModelSchema.parse(
        await rpc("get_schedule_requests_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_time_off_queue: input.timeOffQueue,
          target_shift_queue: input.shiftQueue,
          target_location_id: input.locationId,
          target_search: input.search,
          target_time_off_cursor: input.timeOffCursor,
          target_shift_cursor: input.shiftCursor,
          target_limit: input.limit,
        }),
      );
    },
    async markTimeOffViewed(input) {
      return scheduleRequestMutationResultSchema.parse(
        await rpc("mark_schedule_time_off_viewed_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_request_id: input.requestId,
        }),
      );
    },
    async resolveTimeOff(input) {
      return scheduleRequestMutationResultSchema.parse(
        await rpc("resolve_schedule_time_off_request_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_request_id: input.requestId,
          target_expected_revision: input.decision.expected_revision,
          target_action: input.decision.action,
          target_note: input.decision.note,
          target_segment_decisions: input.decision.segment_decisions,
        }),
      );
    },
    async resolveShiftChange(input) {
      return scheduleRequestMutationResultSchema.parse(
        await rpc("resolve_schedule_shift_change_request_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_request_id: input.requestId,
          target_expected_revision: input.decision.expected_revision,
          target_action: input.decision.action,
          target_note: input.decision.note,
        }),
      );
    },
  };
}
