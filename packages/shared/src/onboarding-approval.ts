import { z } from "zod";

/**
 * Settings > General, "New people wait for approval" (KATILIM-ONAY, S-231): what
 * get_onboarding_approval_service and set_onboarding_approval_service answer.
 * On, somebody who joins finishes onboarding and then waits for a manager's
 * approval; off, they are in when they finish.
 */
export const onboardingApprovalSettingsSchema = z.object({
  final_approval_required: z.boolean(),
});
export type OnboardingApprovalSettings = z.infer<typeof onboardingApprovalSettingsSchema>;

/** A change says on or off, nothing else. */
export const onboardingApprovalSettingsInputSchema = onboardingApprovalSettingsSchema.strict();
export type OnboardingApprovalSettingsInput = z.infer<typeof onboardingApprovalSettingsInputSchema>;
