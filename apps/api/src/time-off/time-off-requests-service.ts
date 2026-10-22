import {
  myTimeOffSchema,
  myTimeOffShiftsSchema,
  timeOffDeciderViewSchema,
  timeOffImpactSchema,
  timeOffRequestsPageSchema,
  timeOffRequestViewSchema,
  type MyTimeOff,
  type MyTimeOffShifts,
  type MyTimeOffShiftsQuery,
  type TimeOffAnswerInput,
  type TimeOffAskInput,
  type TimeOffCancellationAnswerInput,
  type TimeOffCancellationAskInput,
  type TimeOffDeciderView,
  type TimeOffImpact,
  type TimeOffRequestsPage,
  type TimeOffRequestsQuery,
  type TimeOffRequestView,
  type TimeOffTakeBackInput,
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
  /** D3: the requests this person may answer, one page. */
  list(input: Actor & { readonly query: TimeOffRequestsQuery }): Promise<TimeOffRequestsPage>;
  /** D3: what approving would open. */
  impact(input: Actor & { readonly requestId: string }): Promise<TimeOffImpact>;
  /** D3: the answer. */
  answer(input: Actor & { readonly requestId: string; readonly answer: TimeOffAnswerInput }): Promise<TimeOffDeciderView>;
  /** D3: the employee form's shifts in the days asked. */
  myShifts(input: Actor & { readonly query: MyTimeOffShiftsQuery }): Promise<MyTimeOffShifts>;
  /** D4: the employee asks to cancel approved time off; the time off comes back carrying it. */
  askCancellation(
    input: Actor & { readonly requestId: string; readonly request: TimeOffCancellationAskInput },
  ): Promise<TimeOffRequestView>;
  /** D4: the answer to a cancellation (answer_time_off_service on a 'cancel' row, no print). */
  answerCancellation(
    input: Actor & { readonly requestId: string; readonly answer: TimeOffCancellationAnswerInput },
  ): Promise<TimeOffDeciderView>;
  /** D4: approved time off taken back, with a note. */
  takeBack(input: Actor & { readonly requestId: string; readonly takeBack: TimeOffTakeBackInput }): Promise<TimeOffDeciderView>;
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
    async list(input) {
      const q = input.query;
      return timeOffRequestsPageSchema.parse(
        await call("time_off_requests_service", input, {
          target_view: q.view ?? "all",
          target_location_id: q.location_id ?? null,
          target_search: q.search ?? "",
          target_sort: q.sort ?? "needs_decision",
          target_page: q.page ?? 1,
          target_page_size: q.page_size ?? 50,
          target_request_id: q.request_id ?? null,
        }),
      );
    },
    async impact(input) {
      return timeOffImpactSchema.parse(await call("time_off_impact_service", input, { target_request_id: input.requestId }));
    },
    async answer(input) {
      const a = input.answer;
      return timeOffDeciderViewSchema.parse(
        await call("answer_time_off_service", input, {
          target_request_id: input.requestId,
          verdict: a.verdict,
          note: a.note,
          expected_revision: a.expected_revision,
          expected_impact: a.expected_impact,
        }),
      );
    },
    async askCancellation(input) {
      return timeOffRequestViewSchema.parse(
        await call("ask_time_off_cancellation_service", input, {
          target_request_id: input.requestId,
          asked_note: input.request.note,
          expected_revision: input.request.expected_revision,
          request_key: input.request.client_key,
        }),
      );
    },
    async answerCancellation(input) {
      const a = input.answer;
      return timeOffDeciderViewSchema.parse(
        await call("answer_time_off_service", input, {
          target_request_id: input.requestId,
          verdict: a.verdict,
          note: a.note,
          expected_revision: a.expected_revision,
          expected_impact: null,
        }),
      );
    },
    async takeBack(input) {
      return timeOffDeciderViewSchema.parse(
        await call("take_back_time_off_service", input, {
          target_request_id: input.requestId,
          note: input.takeBack.note,
          expected_revision: input.takeBack.expected_revision,
        }),
      );
    },
    async myShifts(input) {
      const q = input.query;
      return myTimeOffShiftsSchema.parse(
        await call("my_time_off_shifts_service", input, {
          first_day: q.start,
          last_day: q.end,
          from_clock: q.from ?? null,
          to_clock: q.to ?? null,
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
