import {
  applyTimeAmendmentResultSchema,
  managerManualTimeEntryResultSchema,
  managerTimeEntriesReadModelSchema,
  timeCorrectionMutationResultSchema,
  approveTimeReviewWindowResultSchema,
  type ManagerManualTimeEntryInput,
  type ManagerTimeAmendmentInput,
  type TimeCorrectionDecisionInput,
  type ApproveTimeReviewWindowInput,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient)
    throw new Error("Time Entries storage is not configured");
  const token = (await supabaseClient.auth.getSession()).data.session
    ?.access_token;
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/v1/workspaces/${workspaceId}/time-entries${path}`,
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
        : "Time Entries operation failed",
    );
  return body;
}

export async function getManagerTimeEntries(
  workspaceId: string,
  from: string,
  to: string,
) {
  return managerTimeEntriesReadModelSchema.parse(
    await request(workspaceId, `?${new URLSearchParams({ from, to })}`),
  );
}

export async function createManagerManualTimeEntry(
  workspaceId: string,
  input: ManagerManualTimeEntryInput,
  idempotencyKey: string,
) {
  return managerManualTimeEntryResultSchema.parse(
    await request(workspaceId, "/manual", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }),
  );
}

export async function amendManagerTimeEntry(
  workspaceId: string,
  sessionId: string,
  input: ManagerTimeAmendmentInput,
  idempotencyKey: string,
) {
  return applyTimeAmendmentResultSchema.parse(
    await request(workspaceId, `/${sessionId}`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }),
  );
}

export async function decideTimeCorrection(
  workspaceId: string,
  correctionId: string,
  input: TimeCorrectionDecisionInput,
  idempotencyKey: string,
) {
  return timeCorrectionMutationResultSchema.parse(
    await request(workspaceId, `/corrections/${correctionId}/decision`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }),
  );
}

export async function approveTimeReviewWindow(
  workspaceId: string,
  input: ApproveTimeReviewWindowInput,
  idempotencyKey: string,
) {
  return approveTimeReviewWindowResultSchema.parse(
    await request(workspaceId, "/review-windows", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }),
  );
}
