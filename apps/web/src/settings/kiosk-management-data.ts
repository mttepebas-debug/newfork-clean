import {
  kioskDeviceLabelInputSchema,
  kioskDeviceSchema,
  kioskEnrollmentSchema,
  kioskManagementSchema,
  kioskPinResetResultSchema,
  type KioskDeviceLabelInput,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient) throw new Error("Kiosk management is not configured");
  const token = (await supabaseClient.auth.getSession()).data.session
    ?.access_token;
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${API_URL}/v1/workspaces/${workspaceId}/kiosk${path}`,
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
        : "Kiosk management request failed",
    );
  return body;
}

export async function getKioskManagement(workspaceId: string) {
  return kioskManagementSchema.parse(await request(workspaceId, "/management"));
}

export async function createKioskEnrollment(
  workspaceId: string,
  input: { location_id: string; label: string },
) {
  return kioskEnrollmentSchema.parse(
    await request(workspaceId, "/enrollments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function updateKioskDeviceLabel(
  workspaceId: string,
  deviceId: string,
  input: KioskDeviceLabelInput,
) {
  return kioskDeviceSchema.parse(
    await request(workspaceId, `/devices/${deviceId}`, {
      method: "PATCH",
      body: JSON.stringify(kioskDeviceLabelInputSchema.parse(input)),
    }),
  );
}

export async function revokeKioskDevice(workspaceId: string, deviceId: string) {
  await request(workspaceId, `/devices/${deviceId}`, { method: "DELETE" });
}

export async function createKioskReenrollment(
  workspaceId: string,
  deviceId: string,
) {
  return kioskEnrollmentSchema.parse(
    await request(workspaceId, `/devices/${deviceId}/re-enrollment`, {
      method: "POST",
    }),
  );
}

export async function resetEmployeeKioskPin(
  workspaceId: string,
  employeeId: string,
  locationId: string,
  pin: string,
) {
  return kioskPinResetResultSchema.parse(
    await request(workspaceId, `/employees/${employeeId}/pin`, {
      method: "PUT",
      body: JSON.stringify({ location_id: locationId, pin }),
    }),
  );
}
