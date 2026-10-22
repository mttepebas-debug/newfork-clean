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
  type TimeOffDeciderView,
  type TimeOffImpact,
  type TimeOffRequestsPage,
  type TimeOffRequestsQuery,
  type TimeOffRequestView,
} from "@newfork/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { apiRequest, supabaseClient } from "../lib/supabase";

// The employee's own time off in the new table (time off rebuild D2), read and written through the API; the
// database decides every rule and answers a refusal with its reason.

export const myTimeOffKey = (workspaceId: string) => ["time-off-requests", workspaceId, "mine"] as const;

function client() {
  if (!supabaseClient) throw new Error("Time off is not configured");
  return supabaseClient;
}

const base = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}/time-off-requests`;

export async function loadMyTimeOff(workspaceId: string): Promise<MyTimeOff> {
  return myTimeOffSchema.parse(await apiRequest(client(), `${base(workspaceId)}/mine`));
}

export async function askTimeOff(workspaceId: string, input: TimeOffAskInput): Promise<TimeOffRequestView> {
  return timeOffRequestViewSchema.parse(
    await apiRequest(client(), base(workspaceId), { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function withdrawTimeOff(
  workspaceId: string,
  requestId: string,
  expectedRevision: number,
): Promise<TimeOffRequestView> {
  return timeOffRequestViewSchema.parse(
    await apiRequest(client(), `${base(workspaceId)}/${encodeURIComponent(requestId)}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: expectedRevision }),
    }),
  );
}

export function useMyTimeOff(workspaceId: string) {
  return useQuery({ queryKey: myTimeOffKey(workspaceId), queryFn: () => loadMyTimeOff(workspaceId) });
}

export function useAskTimeOff(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TimeOffAskInput) => askTimeOff(workspaceId, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: myTimeOffKey(workspaceId) }),
  });
}

export function useWithdrawTimeOff(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Pick<TimeOffRequestView, "id" | "revision">) =>
      withdrawTimeOff(workspaceId, request.id, request.revision),
    onSettled: () => queryClient.invalidateQueries({ queryKey: myTimeOffKey(workspaceId) }),
  });
}

// Time off rebuild D3: who answers reads the list and what approving would open, and answers; the employee's
// form reads the shifts an approval would open. Every key starts with "time-off-requests" and the workspace.

export const timeOffToAnswerKey = (workspaceId: string, query: TimeOffRequestsQuery) =>
  ["time-off-requests", workspaceId, "to-answer", query] as const;
export const timeOffImpactKey = (workspaceId: string, requestId: string) => ["time-off-requests", workspaceId, "impact", requestId] as const;
export const myTimeOffShiftsKey = (workspaceId: string, query: MyTimeOffShiftsQuery) =>
  ["time-off-requests", workspaceId, "my-shifts", query] as const;

function search(values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export async function loadTimeOffToAnswer(workspaceId: string, query: TimeOffRequestsQuery): Promise<TimeOffRequestsPage> {
  return timeOffRequestsPageSchema.parse(
    await apiRequest(client(), `${base(workspaceId)}${search({ ...query })}`),
  );
}

export async function loadTimeOffImpact(workspaceId: string, requestId: string): Promise<TimeOffImpact> {
  return timeOffImpactSchema.parse(await apiRequest(client(), `${base(workspaceId)}/${encodeURIComponent(requestId)}/impact`));
}

export async function answerTimeOff(workspaceId: string, requestId: string, answer: TimeOffAnswerInput): Promise<TimeOffDeciderView> {
  return timeOffDeciderViewSchema.parse(
    await apiRequest(client(), `${base(workspaceId)}/${encodeURIComponent(requestId)}/answer`, {
      method: "POST",
      body: JSON.stringify(answer),
    }),
  );
}

export async function loadMyTimeOffShifts(workspaceId: string, query: MyTimeOffShiftsQuery): Promise<MyTimeOffShifts> {
  return myTimeOffShiftsSchema.parse(await apiRequest(client(), `${base(workspaceId)}/my-shifts${search({ ...query })}`));
}

export function useTimeOffToAnswer(workspaceId: string, query: TimeOffRequestsQuery, enabled = true) {
  return useQuery({
    queryKey: timeOffToAnswerKey(workspaceId, query),
    queryFn: () => loadTimeOffToAnswer(workspaceId, query),
    enabled: enabled && Boolean(workspaceId),
    // A new page or filter keeps the rows on screen until its answer comes.
    placeholderData: keepPreviousData,
  });
}

export function useTimeOffImpact(workspaceId: string, requestId: string | null) {
  return useQuery({
    queryKey: timeOffImpactKey(workspaceId, requestId ?? ""),
    queryFn: () => loadTimeOffImpact(workspaceId, requestId!),
    enabled: Boolean(workspaceId && requestId),
    // Every opening asks again: an answer given on an old picture is refused anyway.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useAnswerTimeOff(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, answer }: { requestId: string; answer: TimeOffAnswerInput }) =>
      answerTimeOff(workspaceId, requestId, answer),
    // Every time off list, and what shows shifts: an approval opens some.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["time-off-requests", workspaceId] }),
        refreshExchangeSurfaces(queryClient, workspaceId),
      ]),
  });
}

export function useMyTimeOffShifts(workspaceId: string, query: MyTimeOffShiftsQuery | null) {
  return useQuery({
    queryKey: myTimeOffShiftsKey(workspaceId, query ?? { start: "", end: "" }),
    queryFn: () => loadMyTimeOffShifts(workspaceId, query!),
    enabled: Boolean(workspaceId && query),
    placeholderData: keepPreviousData,
  });
}
