import {
  shiftAvailabilityAssessmentSchema,
  type ScheduleShiftMutationInput,
  weeklyPreferenceReadSchema,
  weeklyTeamReadSchema,
  weeklyCommitmentPreviewSchema,
  weeklyPreferenceMutationSchema,
  type WeeklyPreferenceSave,
  weeklyPreferenceSettingsReadSchema,
  type WeeklyPreferenceSettingsSave,
} from "@newfork/shared";
import {
  getApiAccessToken,
  getTabWorkspaceId,
  newforkApiUrl,
  supabaseClient,
} from "../lib/supabase";

async function request(
  workspace: string,
  path: string,
  init: RequestInit = {},
  onboarding = false,
) {
  if (!supabaseClient)
    throw new Error("Availability storage is not configured");
  const headers = new Headers(init.headers);
  headers.set(
    "Authorization",
    `Bearer ${await getApiAccessToken(supabaseClient)}`,
  );
  const selectedWorkspace = getTabWorkspaceId();
  if (selectedWorkspace)
    headers.set("X-Newfork-Workspace-Id", selectedWorkspace);
  if (init.body) headers.set("Content-Type", "application/json");
  // Onboarding belongs to one workspace; its paths carry no other query.
  const url = onboarding
    ? `/v1/me/onboarding/availability-lifecycle${path}?workspaceId=${encodeURIComponent(workspace)}`
    : `/v1/workspaces/${workspace}/availability${path}`;
  const response = await fetch(`${newforkApiUrl}${url}`, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw Object.assign(new Error(
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "Availability could not be updated",
    ), { status: response.status });
  return body;
}
export async function loadWeeklyPreferenceSettings(workspace: string) {
  return weeklyPreferenceSettingsReadSchema.parse(await request(workspace, "/weekly/settings"));
}
export async function saveWeeklyPreferenceSettings(workspace: string, command: WeeklyPreferenceSettingsSave, key: string) {
  return weeklyPreferenceSettingsReadSchema.parse(await request(workspace, "/weekly/settings", {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(command),
  }));
}
export async function loadShiftAvailability(
  workspace: string,
  shift: ScheduleShiftMutationInput,
  shiftId?: string,
  sessionId?: string,
) {
  return shiftAvailabilityAssessmentSchema.parse(
    await request(workspace, "/shift-assessment", {
      method: "POST",
      body: JSON.stringify({ shift, shift_id: shiftId, session_id: sessionId }),
    }),
  );
}
export async function loadWeeklyPreferences(workspace: string, employee?: string, onboarding = false) {
  const query = employee && !onboarding ? `?${new URLSearchParams({ employee_id: employee })}` : "";
  return weeklyPreferenceReadSchema.parse(await request(workspace, `/weekly${query}`, {}, onboarding));
}
export async function loadWeeklyTeam(workspace: string) {
  return weeklyTeamReadSchema.parse(await request(workspace, "/weekly/team"));
}
export async function previewWeeklyPreferences(workspace: string, command: WeeklyPreferenceSave, onboarding = false) {
  return weeklyCommitmentPreviewSchema.parse(await request(workspace, "/weekly/preview", { method: "POST", body: JSON.stringify(command) }, onboarding));
}
export async function saveWeeklyPreferences(workspace: string, command: WeeklyPreferenceSave, key: string, onboarding = false) {
  return weeklyPreferenceMutationSchema.parse(await request(workspace, "/weekly", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(command) }, onboarding));
}
