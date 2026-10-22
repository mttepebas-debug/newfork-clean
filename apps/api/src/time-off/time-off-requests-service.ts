import {
  myTimeOffSchema,
  timeOffRequestViewSchema,
  type MyTimeOff,
  type TimeOffAskInput,
  type TimeOffRequestView,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { rpcFailure } from "../http-error";

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

export interface TimeOffRequestsService {
  mine(input: Actor): Promise<MyTimeOff>;
  ask(input: Actor & { readonly request: TimeOffAskInput }): Promise<TimeOffRequestView>;
  withdraw(input: Actor & { readonly requestId: string; readonly expectedRevision: number }): Promise<TimeOffRequestView>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string; hint?: string | null } | null }>;
}

// Time off rebuild D2 (KARARLAR S-239): the new table's three employee doors. Each asks the core itself
// (time_off.request_own; the list employee_hub.read) and answers every refusal with a reason.
export function createTimeOffRequestsService(options: { url: string; serviceRoleKey: string }): TimeOffRequestsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;

  async function call(name: string, input: Actor, extra: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc(name, {
      actor_user_id: input.actorUserId,
      target_workspace_id: input.workspaceId,
      ...extra,
    });
    if (error) throw rpcFailure(error);
    return data;
  }

  return {
    async mine(input) {
      return myTimeOffSchema.parse(await call("my_time_off_service", input));
    },
    async ask(input) {
      const r = input.request;
      return timeOffRequestViewSchema.parse(
        await call("ask_time_off_service", input, {
          asked_kind: r.kind_of_leave,
          first_day: r.start_date,
          last_day: r.end_date,
          asked_all_day: r.all_day,
          from_clock: r.all_day ? null : r.start_time,
          to_clock: r.all_day ? null : r.end_time,
          asked_note: r.note,
          expected_timezone: r.expected_timezone,
          request_key: r.client_key,
        }),
      );
    },
    async withdraw(input) {
      return timeOffRequestViewSchema.parse(
        await call("withdraw_time_off_service", input, {
          target_request_id: input.requestId,
          expected_revision: input.expectedRevision,
        }),
      );
    },
  };
}

export function createTimeOffRequestsServiceFromEnvironment(): TimeOffRequestsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createTimeOffRequestsService({ url, serviceRoleKey }) : null;
}
