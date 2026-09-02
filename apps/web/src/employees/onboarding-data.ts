import {
  employeeAvailabilityInputSchema,
  employeeOnboardingManagerSchema,
  employeeOnboardingProfileSchema,
  employeeOnboardingSchema,
  type EmployeeAvailabilityInput,
  type EmployeeOnboarding,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingProfile,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:9999";

export async function getMyOnboarding(): Promise<EmployeeOnboarding> {
  return employeeOnboardingSchema.parse(await api("/v1/me/onboarding"));
}

export async function saveMyOnboardingProfile(
  profile: EmployeeOnboardingProfile,
  revision: number,
): Promise<number> {
  const body = await api("/v1/me/onboarding/profile", {
    method: "PATCH",
    body: JSON.stringify({
      profile: employeeOnboardingProfileSchema.parse(profile),
      revision,
    }),
  });
  return revisionFrom(body);
}

export async function saveMySsn(
  ssn: string,
  revision: number,
): Promise<number> {
  const body = await api("/v1/me/onboarding/ssn", {
    method: "PUT",
    body: JSON.stringify({ ssn, revision }),
  });
  return revisionFrom(body);
}

export async function saveMyAvailability(
  availability: EmployeeAvailabilityInput,
  revision: number,
): Promise<number> {
  const body = await api("/v1/me/onboarding/availability", {
    method: "PUT",
    body: JSON.stringify({
      availability: employeeAvailabilityInputSchema.parse(availability),
      revision,
    }),
  });
  return revisionFrom(body);
}

export async function uploadMyDocument(
  requirementId: string,
  file: File,
  expiryDate: string | null,
  revision: number,
): Promise<number> {
  if (!supabaseClient)
    throw new Error("Private document storage is not configured");
  const prepared = (await api(
    `/v1/me/onboarding/documents/${requirementId}/upload-url`,
    {
      method: "POST",
      body: JSON.stringify({ filename: file.name, sizeBytes: file.size }),
    },
  )) as { path: string; token: string };
  const upload = await supabaseClient.storage
    .from("employee-onboarding")
    .uploadToSignedUrl(prepared.path, prepared.token, file, {
      contentType: file.type,
      upsert: false,
    });
  if (upload.error) throw new Error(upload.error.message);
  const confirmed = await api(
    `/v1/me/onboarding/documents/${requirementId}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        path: prepared.path,
        filename: file.name,
        sizeBytes: file.size,
        expiryDate,
        revision,
      }),
    },
  );
  return revisionFrom(confirmed);
}

export async function acknowledgeMyRequirement(
  requirementId: string,
  typedName: string,
  contentDigest: string,
  revision: number,
): Promise<number> {
  const body = await api(
    `/v1/me/onboarding/acknowledgements/${requirementId}/sign`,
    {
      method: "POST",
      body: JSON.stringify({
        typedName,
        contentDigest,
        idempotencyKey: crypto.randomUUID(),
        revision,
      }),
    },
  );
  return revisionFrom(body);
}

export async function submitMyOnboarding(revision: number): Promise<number> {
  return revisionFrom(
    await api("/v1/me/onboarding/submit", {
      method: "POST",
      body: JSON.stringify({ revision }),
    }),
  );
}

export async function getEmployeeOnboardingReview(
  workspaceId: string,
  employeeId: string,
): Promise<EmployeeOnboardingManager> {
  return employeeOnboardingManagerSchema.parse(
    await api(
      `/v1/workspaces/${workspaceId}/employees/${employeeId}/onboarding`,
    ),
  );
}

export async function reviewEmployeeOnboarding(
  workspaceId: string,
  employeeId: string,
  input: {
    action: "accept_requirement" | "reject_requirement" | "activate";
    requirementId: string | null;
    reason: string;
    revision: number;
  },
): Promise<number> {
  return revisionFrom(
    await api(
      `/v1/workspaces/${workspaceId}/employees/${employeeId}/onboarding/review`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  );
}

export async function getEmployeeDocumentDownload(
  workspaceId: string,
  employeeId: string,
  requirementId: string,
): Promise<string> {
  const body = (await api(
    `/v1/workspaces/${workspaceId}/employees/${employeeId}/onboarding/documents/${requirementId}/download`,
  )) as { url?: unknown };
  if (typeof body.url !== "string")
    throw new Error("Document download is unavailable");
  return body.url;
}

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!supabaseClient)
    throw new Error("Authenticated onboarding is not configured");
  const session = await supabaseClient.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("A current session is required");
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Onboarding request failed");
  return body;
}

function revisionFrom(body: unknown): number {
  const value = Number((body as { revision?: unknown }).revision);
  if (!Number.isSafeInteger(value))
    throw new Error("Invalid onboarding revision");
  return value;
}
