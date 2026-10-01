import { RequestError, requestFailure } from "../lib/request-error";
import {
  scheduleRequestMutationResultSchema,
  scheduleRequestsReadModelSchema,
  type TimeOffDecisionInput,
} from "@newfork/shared/schedule";
import { apiRequest, getTabWorkspaceId, supabaseClient } from "../lib/supabase";
import {
  timeOffAssignmentPreviewSchema,
  timeOffRevokeResultSchema,
  timeOffShortenResultSchema,
  timeOffSubmitInputSchema,
  timeOffSubmitResultSchema,
  timeOffVerdictResultSchema,
  type TimeOffAssignmentPreviewInput,
  type TimeOffCancellationRequestInput,
  type TimeOffRevokeInput,
  type TimeOffShortenInput,
  type TimeOffSubmitInput,
  type TimeOffVerdictInput,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function request(
  _workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient)
    throw new Error("Schedule request storage is not configured");
  const token = (await supabaseClient.auth.getSession()).data.session
    ?.access_token;
  if (!token) throw new Error("A current session is required");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/schedule/requests${path}`,
    {
      ...init,
      headers,
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw requestFailure(body, response.status, "Schedule request operation failed");
  return body;
}

export async function getScheduleRequests(
  workspaceId: string,
  filters: {
    timeOffQueue: "needs_review" | "closed";
    locationId: string;
    search: string;
    timeOffCursor?: string;
  },
) {
  const query = new URLSearchParams({
    time_off_queue: filters.timeOffQueue,
    search: filters.search,
  });
  if (filters.locationId) query.set("location_id", filters.locationId);
  if (filters.timeOffCursor)
    query.set("time_off_cursor", filters.timeOffCursor);
  return scheduleRequestsReadModelSchema.parse(
    await request(workspaceId, `?${query}`),
  );
}

export async function markTimeOffViewed(
  workspaceId: string,
  requestId: string,
) {
  return scheduleRequestMutationResultSchema.parse(
    await request(workspaceId, `/time-off/${requestId}/viewed`, {
      method: "POST",
    }),
  );
}

export async function decideTimeOff(
  workspaceId: string,
  requestId: string,
  decision: TimeOffDecisionInput,
) {
  return scheduleRequestMutationResultSchema.parse(
    await request(workspaceId, `/time-off/${requestId}/decision`, {
      method: "POST",
      body: JSON.stringify(decision),
    }),
  );
}

export async function previewTimeOffAssignment(workspaceId: string, requestId: string, decision: TimeOffAssignmentPreviewInput) {
  return timeOffAssignmentPreviewSchema.parse(await request(workspaceId, `/time-off/${requestId}/assignment-preview`, {
    method: "POST", body: JSON.stringify(decision),
  }));
}

/** BL-127: a manager gives back hours of approved time off; the core decides who may. */
export async function shortenTimeOff(workspaceId: string, requestId: string, change: TimeOffShortenInput) {
  if (!supabaseClient) throw new Error("Schedule request storage is not configured");
  return timeOffShortenResultSchema.parse(await apiRequest(supabaseClient,
    `/v1/workspaces/${workspaceId}/time-off/${requestId}/shorten`, { method: "POST", body: JSON.stringify(change) }));
}

// FB-6.3: time off asked for, voted on and revoked. Each endpoint asks the
// authorization core; a 409 means the screen is stale (closed, past its
// deadline, or the shifts it affects changed): refetch and show it again.
export const timeOffKeys = {
  /** Every Requests > Time off page; the page adds its filters after these two. */
  requests: (workspaceId: string) => ["schedule-requests", workspaceId] as const,
  /** Every Employee Hub read of this workspace. */
  employeeHub: (workspaceId: string) => ["employee-hub", workspaceId] as const,
};

function timeOffApi(workspaceId: string, path: string, body: unknown) {
  if (!supabaseClient) throw new Error("Time off storage is not configured");
  return apiRequest(supabaseClient, `/v1/workspaces/${workspaceId}/time-off${path}`, { method: "POST", body: JSON.stringify(body) });
}

export async function submitTimeOff(workspaceId: string, request: TimeOffSubmitInput) {
  return timeOffSubmitResultSchema.parse(await timeOffApi(workspaceId, "", timeOffSubmitInputSchema.parse(request)));
}
export async function requestTimeOffCancellation(workspaceId: string, requestId: string, cancellation: TimeOffCancellationRequestInput) {
  return timeOffSubmitResultSchema.parse(await timeOffApi(workspaceId, `/${requestId}/cancellation`, cancellation));
}
export async function voteOnTimeOff(workspaceId: string, requestId: string, verdict: TimeOffVerdictInput) {
  return timeOffVerdictResultSchema.parse(await timeOffApi(workspaceId, `/${requestId}/verdict`, verdict));
}
export async function revokeTimeOff(workspaceId: string, requestId: string, revoke: TimeOffRevokeInput) {
  return timeOffRevokeResultSchema.parse(await timeOffApi(workspaceId, `/${requestId}/revoke`, revoke));
}

/** The screen acted on an old picture of the request: refetch, then ask again. */
export function isStaleTimeOff(error: unknown): boolean {
  return error instanceof RequestError && error.status === 409;
}

function useTimeOffMutation<Variables, Result>(workspaceId: string, run: (variables: Variables) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    // Stale or not, both lists show the request as it is now.
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: timeOffKeys.requests(workspaceId) });
      await client.invalidateQueries({ queryKey: timeOffKeys.employeeHub(workspaceId) });
    },
  });
}

/** Requests > Time off, with the filters the page keys on. */
export function useScheduleRequests(
  workspaceId: string | undefined,
  filters: { timeOffQueue: "needs_review" | "closed"; locationId: string; search: string; timeOffCursor?: string },
) {
  return useQuery({
    queryKey: [...timeOffKeys.requests(workspaceId ?? ""), filters.timeOffQueue, filters.locationId, filters.search, filters.timeOffCursor],
    queryFn: () => getScheduleRequests(workspaceId!, filters),
    enabled: Boolean(workspaceId),
  });
}
export function useSubmitTimeOff(workspaceId: string) {
  return useTimeOffMutation(workspaceId, (request: TimeOffSubmitInput) => submitTimeOff(workspaceId, request));
}
export function useRequestTimeOffCancellation(workspaceId: string) {
  return useTimeOffMutation(workspaceId, ({ requestId, cancellation }: { requestId: string; cancellation: TimeOffCancellationRequestInput }) =>
    requestTimeOffCancellation(workspaceId, requestId, cancellation));
}
export function useVoteOnTimeOff(workspaceId: string) {
  return useTimeOffMutation(workspaceId, ({ requestId, verdict }: { requestId: string; verdict: TimeOffVerdictInput }) =>
    voteOnTimeOff(workspaceId, requestId, verdict));
}
export function useRevokeTimeOff(workspaceId: string) {
  return useTimeOffMutation(workspaceId, ({ requestId, revoke }: { requestId: string; revoke: TimeOffRevokeInput }) =>
    revokeTimeOff(workspaceId, requestId, revoke));
}
