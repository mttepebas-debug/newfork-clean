import {
  kioskActionStateSchema,
  kioskCaptureResultSchema,
  kioskDirectorySchema,
  kioskEnrollmentExchangeSchema,
  kioskVerificationResponseSchema,
  type KioskCaptureInput,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";

export class KioskRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}/v1/kiosk${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Kiosk request failed";
    throw new KioskRequestError(message, response.status);
  }
  return body;
}

export async function getKioskDirectory() {
  return kioskDirectorySchema.parse(await request(""));
}

export async function exchangeKioskEnrollment(code: string) {
  const result = kioskEnrollmentExchangeSchema.parse(
    await request("/enrollments/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  );
  if (supabaseClient) {
    const { error } = await supabaseClient.auth.signOut({ scope: "local" });
    if (error) throw new Error("Browser user session could not be closed");
  }
  return result;
}

export async function verifyKioskPin(employeeId: string, pin: string) {
  return kioskVerificationResponseSchema.parse(
    await request("/verify", {
      method: "POST",
      body: JSON.stringify({ employee_id: employeeId, pin }),
    }),
  );
}

export async function getKioskActionState() {
  return kioskActionStateSchema.parse(await request("/action"));
}

export async function captureKioskAction(input: KioskCaptureInput) {
  return kioskCaptureResultSchema.parse(
    await request("/actions", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function cancelKioskAction() {
  await request("/action/cancel", { method: "POST" });
}
