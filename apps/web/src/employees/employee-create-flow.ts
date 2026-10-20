import {
  employeeInputSchema,
  hasTurkishOnlyLetters,
  type EmployeeInput,
} from "@newfork/shared";

export function employeeCreateReadiness(draft: EmployeeInput) {
  // The US letter rule (BL-503) holds Next too, not only Save.
  const namesReady =
    Boolean(draft.first_name.trim() && draft.last_name.trim()) &&
    ![draft.first_name, draft.middle_name ?? "", draft.last_name].some(hasTurkishOnlyLetters);
  // Remote and Exclude from schedule never lift the location and job rule (DAVET-ERISIM).
  const assignmentsOptional = Boolean(draft.is_owner_record);
  const parsed = employeeInputSchema.safeParse(draft);
  return {
    namesReady,
    assignmentsOptional,
    employeeReady: parsed.success,
    // What holds Save on a location or job, in the words the API uses (BL-218).
    assignmentBlocker:
      parsed.error?.issues.find(
        (issue) => issue.path[0] === "location_ids" || issue.path[0] === "job_ids",
      )?.message ?? null,
    emailPresent: Boolean(draft.invitation_email.trim()),
    emailReady:
      employeeInputSchema.safeParse({
        ...draft,
        first_name: "A",
        last_name: "B",
        // Only the email is asked here: the owner's exemption leaves the assignments out.
        is_owner_record: true,
      }).success && Boolean(draft.invitation_email.trim()),
  };
}

/**
 * The primary job a picker falls back to: the first picked job that is not
 * the Owner job. Any job can be primary, a Management job too; only the Owner
 * job is never marked (EMP-001 S2).
 */
export function firstJobExceptOwner(
  jobIds: readonly string[],
  ownerJobId: string | null | undefined,
): string | null {
  return jobIds.find((id) => id !== ownerJobId) ?? null;
}
