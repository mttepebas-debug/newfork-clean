import {
  employeeHubMutationResultSchema,
  employeeHubReadModelSchema,
  employeeTimeTrackingReadModelSchema,
  captureTimeEventResultSchema,
  timeCorrectionMutationResultSchema,
  type EmployeeHubAvailabilityInput,
  type EmployeeRequestActionInput,
  type EmployeeShiftRequestInput,
  type EmployeeTimeOffInput,
  type EmployeeTimeCaptureInput,
  type EmployeeTimeCorrectionInput,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient)
    throw new Error("Employee Hub storage is not configured");
  const token = (await supabaseClient.auth.getSession()).data.session
    ?.access_token;
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000"}/v1/workspaces/${workspaceId}/employee-hub${path}`,
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
        : "Employee Hub operation failed",
    );
  return body;
}

export async function getEmployeeHub(
  workspaceId: string,
  from: string,
  to: string,
) {
  return employeeHubReadModelSchema.parse(
    await request(workspaceId, `?${new URLSearchParams({ from, to })}`),
  );
}
export async function saveEmployeeAvailability(
  workspaceId: string,
  input: EmployeeHubAvailabilityInput,
) {
  return employeeHubMutationResultSchema.parse(
    await request(workspaceId, "/availability", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  );
}
export async function submitEmployeeTimeOff(
  workspaceId: string,
  input: EmployeeTimeOffInput,
) {
  return employeeHubMutationResultSchema.parse(
    await request(workspaceId, "/time-off", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
export async function submitEmployeeShiftRequest(
  workspaceId: string,
  input: EmployeeShiftRequestInput,
) {
  return employeeHubMutationResultSchema.parse(
    await request(workspaceId, "/shift-requests", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
export async function actOnEmployeeRequest(
  workspaceId: string,
  input: EmployeeRequestActionInput,
) {
  return employeeHubMutationResultSchema.parse(
    await request(workspaceId, "/request-action", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function getEmployeeTimeTracking(workspaceId: string) {
  return employeeTimeTrackingReadModelSchema.parse(
    await request(workspaceId, "/time-tracking"),
  );
}

export async function captureEmployeeTimeEvent(
  workspaceId: string,
  input: EmployeeTimeCaptureInput,
  idempotencyKey: string,
) {
  return captureTimeEventResultSchema.parse(
    await request(workspaceId, "/time-tracking/events", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }),
  );
}

export async function requestEmployeeTimeCorrection(
  workspaceId: string,
  input: EmployeeTimeCorrectionInput,
  idempotencyKey: string,
) {
  return timeCorrectionMutationResultSchema.parse(
    await request(workspaceId, "/time-tracking/corrections", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    }),
  );
}
