import {
  scheduleRequestMutationResultSchema,
  scheduleRequestsReadModelSchema,
  type ShiftChangeDecisionInput,
  type TimeOffDecisionInput,
} from "@newfork/shared/schedule";
import { supabaseClient } from "../lib/supabase";

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
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/schedule/requests${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Schedule request operation failed",
    );
  return body;
}

export async function getScheduleRequests(
  workspaceId: string,
  filters: {
    timeOffQueue: "needs_review" | "closed";
    shiftQueue: "needs_review" | "history";
    locationId: string;
    search: string;
    timeOffCursor?: string;
    shiftCursor?: string;
  },
) {
  const query = new URLSearchParams({
    time_off_queue: filters.timeOffQueue,
    shift_queue: filters.shiftQueue,
    search: filters.search,
  });
  if (filters.locationId) query.set("location_id", filters.locationId);
  if (filters.timeOffCursor)
    query.set("time_off_cursor", filters.timeOffCursor);
  if (filters.shiftCursor) query.set("shift_cursor", filters.shiftCursor);
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

export async function decideShiftChange(
  workspaceId: string,
  requestId: string,
  decision: ShiftChangeDecisionInput,
) {
  return scheduleRequestMutationResultSchema.parse(
    await request(workspaceId, `/shift-changes/${requestId}/decision`, {
      method: "POST",
      body: JSON.stringify(decision),
    }),
  );
}
