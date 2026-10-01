import {
  scheduleRequestsReadModelSchema,
  type ScheduleRequestsReadModel,
} from "@newfork/shared/schedule";
import { createClient } from "@supabase/supabase-js";
import { rpcFailure } from "../http-error";

export interface ScheduleRequestsService {
  get(input: {
    actorUserId: string;
    workspaceId: string;
    timeOffQueue: "needs_review" | "closed";
    locationId: string | null;
    search: string;
    timeOffCursor: string | null;
    limit: number;
  }): Promise<ScheduleRequestsReadModel>;
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
    if (error) throw rpcFailure(error);
    return data;
  }
  return {
    async get(input) {
      return scheduleRequestsReadModelSchema.parse(
        await rpc("get_schedule_requests_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_time_off_queue: input.timeOffQueue,
          target_location_id: input.locationId,
          target_search: input.search,
          target_time_off_cursor: input.timeOffCursor,
          target_limit: input.limit,
        }),
      );
    },
  };
}
