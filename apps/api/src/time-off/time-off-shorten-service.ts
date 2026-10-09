import { createClient } from "@supabase/supabase-js";
import {
  timeOffShortenResultSchema,
  type TimeOffShortenInput,
  type TimeOffShortenResult,
} from "@newfork/shared";
import { rpcFailure } from "../http-error";

export interface TimeOffShortenService {
  shorten(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly requestId: string;
    readonly change: TimeOffShortenInput;
  }): Promise<TimeOffShortenResult>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; hint?: string | null; details?: string | null } | null;
  }>;
}

export function createTimeOffShortenService(options: {
  url: string;
  serviceRoleKey: string;
}): TimeOffShortenService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  return timeOffShortenService(client);
}

/** shorten_time_off_service decides who may (time_off.decide) and does it. */
export function timeOffShortenService(client: RpcClient): TimeOffShortenService {
  return {
    async shorten({ actorUserId, workspaceId, requestId, change }) {
      const { data, error } = await client.rpc("shorten_time_off_service", {
        actor: actorUserId,
        w: workspaceId,
        rid: requestId,
        expected_revision: change.expected_revision,
        periods: change.periods,
        note: change.note,
        operation_id: change.operation_id,
      });
      if (error) throw rpcFailure(error);
      return timeOffShortenResultSchema.parse(data);
    },
  };
}
