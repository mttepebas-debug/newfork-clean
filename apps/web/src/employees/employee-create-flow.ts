import { employeeInputSchema, type EmployeeInput } from "@newfork/shared";

export function employeeCreateReadiness(draft: EmployeeInput) {
  const namesReady = Boolean(draft.first_name.trim() && draft.last_name.trim());
  const assignmentsOptional = Boolean(
    draft.is_remote || draft.is_excluded_from_schedule || draft.is_owner_record,
  );
  const parsed = employeeInputSchema.safeParse(draft);
  return {
    namesReady,
    assignmentsOptional,
    employeeReady: parsed.success,
    emailPresent: Boolean(draft.invitation_email.trim()),
    emailReady:
      employeeInputSchema.safeParse({
        ...draft,
        first_name: "A",
        last_name: "B",
        is_remote: true,
      }).success && Boolean(draft.invitation_email.trim()),
  };
}

/**
 * Every picked job is under Management (BL-218 .3b), so the record names no
 * primary job; sets `only_management_jobs` before the form is checked.
 */
export function onlyManagementJobs(
  jobIds: readonly string[],
  management: ReadonlySet<string>,
): boolean {
  return jobIds.length > 0 && jobIds.every((id) => management.has(id));
}

/**
 * The primary job a picker falls back to: the first picked job outside
 * Management, which is primary by its department and never marked (BL-218).
 */
export function firstJobOutsideManagement(
  jobIds: readonly string[],
  management: ReadonlySet<string>,
): string | null {
  return jobIds.find((id) => !management.has(id)) ?? null;
}
