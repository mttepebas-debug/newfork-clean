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

/** TEL-2: whether another person of the workspace has this number; never who. */
export async function isMyOnboardingPhoneInUse(
  workspaceId: string,
  phone: string,
): Promise<boolean> {
  const body = await api(
    `${mePath(workspaceId, "/phone-in-use")}&phone=${encodeURIComponent(phone)}`,
  );
  return (body as { inUse?: unknown }).inUse === true;
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
