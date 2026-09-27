import { requestFailure } from "../lib/request-error";
import {
  scheduleRequestMutationResultSchema,
  scheduleRequestsReadModelSchema,
  type TimeOffDecisionInput,
} from "@newfork/shared/schedule";
import { getTabWorkspaceId, supabaseClient } from "../lib/supabase";
import { timeOffAssignmentPreviewSchema, type TimeOffAssignmentPreviewInput } from "@newfork/shared";

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
