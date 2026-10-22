import {
  myTimeOffSchema,
  timeOffRequestViewSchema,
  type MyTimeOff,
  type TimeOffAskInput,
  type TimeOffRequestView,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
