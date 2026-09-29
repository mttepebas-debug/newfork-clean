import { employeeInputSchema, type EmployeeInput } from "@newfork/shared";
import type { EmployeeJobOption } from "./employee-data";

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
  jobs: readonly EmployeeJobOption[],
): boolean {
  const management = new Set(jobs.filter((job) => job.management).map((job) => job.id));
  return jobIds.length > 0 && jobIds.every((id) => management.has(id));
}
