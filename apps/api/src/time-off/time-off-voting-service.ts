import { createClient } from "@supabase/supabase-js";
import {
  timeOffRevokeResultSchema,
  timeOffSubmitResultSchema,
  timeOffVerdictResultSchema,
  type TimeOffCancellationRequestInput,
  type TimeOffRevokeInput,
  type TimeOffRevokeResult,
  type TimeOffSubmitInput,
  type TimeOffSubmitResult,
  type TimeOffVerdictInput,
  type TimeOffVerdictResult,
} from "@newfork/shared";
import { HttpError, rpcFailure } from "../http-error";

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

export interface TimeOffVotingService {
  submit(input: Actor & { readonly request: TimeOffSubmitInput }): Promise<TimeOffSubmitResult>;
  requestCancellation(input: Actor & { readonly requestId: string; readonly cancellation: TimeOffCancellationRequestInput }): Promise<TimeOffSubmitResult>;
  decide(input: Actor & { readonly requestId: string; readonly verdict: TimeOffVerdictInput }): Promise<TimeOffVerdictResult>;
  revoke(input: Actor & { readonly requestId: string; readonly revoke: TimeOffRevokeInput }): Promise<TimeOffRevokeResult>;
}

type RpcError = { message: string; code?: string; hint?: string | null; details?: string | null };
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export function createTimeOffVotingService(options: { url: string; serviceRoleKey: string }): TimeOffVotingService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  return timeOffVotingService(client);
}

/**
 * The FB-6.3 time-off services: each asks the authorization core itself, so
 * the routes have no gate. 23514 here is a request already in the way (an
 * overlapping request, a cancellation already waiting): a conflict, 409.
 */
export function timeOffVotingService(client: RpcClient): TimeOffVotingService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (!error) return data;
    const failure = rpcFailure(error);
    if (error.code !== "23514") throw failure;
    throw new HttpError(failure.message, 409, { pgCode: failure.pgCode, reason: failure.reason, detail: failure.detail, cause: error });
  }
  return {
    async submit({ actorUserId, workspaceId, request }) {
      return timeOffSubmitResultSchema.parse(await rpc("submit_time_off_service", {
        actor: actorUserId, w: workspaceId, periods: request.periods, reason: request.reason,
        expected_timezone: request.expected_timezone, operation_id: request.operation_id,
      }));
    },
    async requestCancellation({ actorUserId, workspaceId, requestId, cancellation }) {
      return timeOffSubmitResultSchema.parse(await rpc("request_time_off_cancellation_service", {
        actor: actorUserId, w: workspaceId, parent_id: requestId, expected_revision: cancellation.expected_revision,
        periods: cancellation.periods, reason: cancellation.reason, operation_id: cancellation.operation_id,
      }));
    },
    async decide({ actorUserId, workspaceId, requestId, verdict }) {
      return timeOffVerdictResultSchema.parse(await rpc("decide_time_off_service", {
        actor: actorUserId, w: workspaceId, rid: requestId, verdict: verdict.verdict, note: verdict.note,
        expected_impact: verdict.expected_impact,
      }));
    },
    async revoke({ actorUserId, workspaceId, requestId, revoke }) {
      return timeOffRevokeResultSchema.parse(await rpc("revoke_time_off_service", {
        actor: actorUserId, w: workspaceId, rid: requestId, expected_revision: revoke.expected_revision, reason: revoke.reason,
      }));
    },
  };
}
