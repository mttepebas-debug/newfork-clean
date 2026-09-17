import {
  employeeOnboardingManagerSchema,
  employeeOnboardingProfileSchema,
  employeeOnboardingSchema,
  type EmployeeOnboarding,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingProfile,
} from "@newfork/shared";
import { apiRequest, supabaseClient } from "../lib/supabase";

export async function getMyOnboarding(
  workspaceId: string,
): Promise<EmployeeOnboarding> {
  return employeeOnboardingSchema.parse(await api(mePath(workspaceId, "")));
}

export async function saveMyOnboardingProfile(
  workspaceId: string,
  profile: EmployeeOnboardingProfile,
  revision: number,
): Promise<number> {
  const body = await api(mePath(workspaceId, "/profile"), {
    method: "PATCH",
    body: JSON.stringify({
      profile: employeeOnboardingProfileSchema.parse(profile),
      revision,
    }),
  });
  return revisionFrom(body);
}

export async function uploadMyDocument(
  workspaceId: string,
  requirementId: string,
  file: File,
  expiryDate: string | null,
  revision: number,
): Promise<number> {
  if (!supabaseClient)
    throw new Error("Private document storage is not configured");
  const prepared = (await api(
    mePath(workspaceId, `/documents/${requirementId}/upload-url`),
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
    mePath(workspaceId, `/documents/${requirementId}/confirm`),
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
  workspaceId: string,
  requirementId: string,
  typedName: string,
  contentDigest: string,
  revision: number,
): Promise<number> {
  const body = await api(
    mePath(workspaceId, `/acknowledgements/${requirementId}/sign`),
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

export async function submitMyOnboarding(
  workspaceId: string,
  revision: number,
): Promise<number> {
  return revisionFrom(
    await api(mePath(workspaceId, "/submit"), {
      method: "POST",
      body: JSON.stringify({ revision }),
    }),
  );
}

export async function resetMyOnboarding(
  workspaceId: string,
  revision: number,
): Promise<number> {
  return revisionFrom(
    await api(mePath(workspaceId, "/reset"), {
      method: "POST",
      body: JSON.stringify({ revision }),
    }),
  );
}

export async function leaveMyOnboarding(
  workspaceId: string,
  revision: number,
): Promise<void> {
  await api(mePath(workspaceId, "/leave"), {
    method: "POST",
    body: JSON.stringify({ revision }),
  });
}

export async function getEmployeeOnboardingReview(
  workspaceId: string,
  employeeId: string,
): Promise<EmployeeOnboardingManager | null> {
  return employeeOnboardingManagerSchema.nullable().parse(
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

// Onboarding belongs to one workspace; every "me" call names it.
function mePath(workspaceId: string, path: string): string {
  return `/v1/me/onboarding${path}?workspaceId=${encodeURIComponent(workspaceId)}`;
}

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!supabaseClient)
    throw new Error("Authenticated onboarding is not configured");
  try {
    return await apiRequest(supabaseClient, path, init);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Onboarding request failed");
  }
}

function revisionFrom(body: unknown): number {
  const value = Number((body as { revision?: unknown }).revision);
  if (!Number.isSafeInteger(value))
    throw new Error("Invalid onboarding revision");
  return value;
}
