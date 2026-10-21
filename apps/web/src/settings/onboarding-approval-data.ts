import { onboardingApprovalSettingsSchema, type OnboardingApprovalSettings } from "@newfork/shared";
import { apiRequest, supabaseClient } from "../lib/supabase";

// Settings > General, "New people wait for approval" (KATILIM-ONAY, S-231), through the API; the
// database decides who may change it and lets in whoever was waiting only for approval when it goes off.

export const onboardingApprovalKey = (workspaceId: string) => ["onboarding-approval", workspaceId] as const;

function client() {
  if (!supabaseClient) throw new Error("Onboarding settings are not configured");
  return supabaseClient;
}

const url = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId)}/settings/onboarding-approval`;

export async function loadOnboardingApproval(workspaceId: string): Promise<OnboardingApprovalSettings> {
  return onboardingApprovalSettingsSchema.parse(await apiRequest(client(), url(workspaceId)));
}

export async function saveOnboardingApproval(
  workspaceId: string,
  finalApprovalRequired: boolean,
): Promise<OnboardingApprovalSettings> {
  return onboardingApprovalSettingsSchema.parse(
    await apiRequest(client(), url(workspaceId), {
      method: "PUT",
      body: JSON.stringify({ final_approval_required: finalApprovalRequired }),
    }),
  );
}
