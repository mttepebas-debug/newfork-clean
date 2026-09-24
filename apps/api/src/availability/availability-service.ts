import { createClient } from "@supabase/supabase-js";
import { createUserVerifier } from "../auth/verify-user.js";
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
import { z } from "zod";

export function createAvailabilityService(options: {
  url: string;
  serviceRoleKey: string;
}) {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verifyUser = createUserVerifier(client);
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  }
  async function onboardingIdentity(token: string, workspaceId?: string) {
    const user = await verifyUser(token);
    if (!user)
      throw Object.assign(
        new Error("Sign in to review onboarding availability"),
        { code: "42501" },
      );
    const context = z
      .object({
        workspace_id: z.string().uuid(),
        employee_id: z.string().uuid(),
        revision: z.number().int(),
      })
      .parse(
        await rpc("get_employee_onboarding_service", {
          target_user_id: user.id,
          ...(workspaceId ? { target_workspace_id: workspaceId } : {}),
        }),
      );
    return { actor: user.id, ...context };
  }
  async function weeklyOnboardingIdentity(token: string, command?: WeeklyPreferenceSave, workspaceId?: string) {
    const identity = await onboardingIdentity(token, workspaceId);
    if (command && (command.employee_id !== identity.employee_id || command.source !== "employee"))
      throw Object.assign(new Error("Only your own onboarding preferences can be changed"), { code: "42501" });
    return identity;
  }
  return {
    async readWeeklyTeam(actor: string, workspace: string) {
      return weeklyTeamReadSchema.parse(await rpc("weekly_team_read_service", { actor, w: workspace }));
    },
    async readWeeklySettings(actor: string, workspace: string) {
      return weeklyPreferenceSettingsReadSchema.parse(await rpc("weekly_preference_settings_read_service", { actor, w: workspace }));
    },
    async saveWeeklySettings(actor: string, workspace: string, command: WeeklyPreferenceSettingsSave, key: string) {
      return weeklyPreferenceSettingsReadSchema.parse(await rpc("weekly_preference_settings_save_service", { actor, w: workspace, command, request_key: key }));
    },
    async readWeekly(actor: string, workspace: string, employee?: string) {
      return weeklyPreferenceReadSchema.parse(await rpc("weekly_preferences_read_service", { actor, w: workspace, emp: employee ?? null }));
    },
    async previewWeekly(actor: string, workspace: string, command: WeeklyPreferenceSave) {
      return weeklyCommitmentPreviewSchema.parse(await rpc("weekly_preferences_preview_service", { actor, w: workspace, command }));
    },
    async saveWeekly(actor: string, workspace: string, command: WeeklyPreferenceSave, key: string) {
      return weeklyPreferenceMutationSchema.parse(await rpc("weekly_preferences_save_service", { actor, w: workspace, command, request_key: key }));
    },
    async onboardingReadWeekly(token: string, workspaceId?: string) {
      const identity = await weeklyOnboardingIdentity(token, undefined, workspaceId);
      return weeklyPreferenceReadSchema.parse(await rpc("weekly_preferences_read_service", { actor: identity.actor, w: identity.workspace_id, emp: identity.employee_id }));
    },
    async onboardingPreviewWeekly(token: string, command: WeeklyPreferenceSave, workspaceId?: string) {
      const identity = await weeklyOnboardingIdentity(token, command, workspaceId);
      return weeklyCommitmentPreviewSchema.parse(await rpc("weekly_preferences_preview_service", { actor: identity.actor, w: identity.workspace_id, command }));
    },
    async onboardingSaveWeekly(token: string, command: WeeklyPreferenceSave, key: string, workspaceId?: string) {
      const identity = await weeklyOnboardingIdentity(token, command, workspaceId);
      return weeklyPreferenceMutationSchema.parse(await rpc("weekly_preferences_save_service", { actor: identity.actor, w: identity.workspace_id, command, request_key: key }));
    },
    async assessShift(
      actor: string,
      workspace: string,
      shift: ScheduleShiftMutationInput,
      shiftId?: string,
      sessionId?: string,
    ) {
      return shiftAvailabilityAssessmentSchema.parse(
        await rpc("assess_schedule_shift_service", {
          actor,
          w: workspace,
          shift,
          target_shift_id: shiftId ?? null,
          target_session_id: sessionId ?? null,
        }),
      );
    },
  };
}
export type AvailabilityService = ReturnType<typeof createAvailabilityService>;
