import {
  assignmentRefusalsWithoutExclude,
  employeeInputSchema,
  hasTurkishOnlyLetters,
  managementAndOwnerRefusals,
  type EmployeeInput,
} from "@newfork/shared";

export function employeeCreateReadiness(
  draft: EmployeeInput,
  {
    scheduled = true,
  }: {
    /**
     * Whether the record can be scheduled (ROL-CIFT 2.2). Somebody who only
     * manages never is: their record shows no "Exclude from schedule", so what
     * holds Save offers only Remote.
     */
    readonly scheduled?: boolean;
  } = {},
) {
  // The US letter rule (BL-503) holds Next too, not only Save.
  const namesReady =
    Boolean(draft.first_name.trim() && draft.last_name.trim()) &&
    ![draft.first_name, draft.middle_name ?? "", draft.last_name].some(hasTurkishOnlyLetters);
  const assignmentsOptional = Boolean(
    draft.is_remote || draft.is_excluded_from_schedule || draft.is_owner_record,
  );
  const parsed = employeeInputSchema.safeParse(draft);
  return {
    namesReady,
    assignmentsOptional,
    employeeReady: parsed.success,
    // What holds Save on a location or job, in the words the API uses (BL-218).
    assignmentBlocker: offered(
      parsed.error?.issues.find(
        (issue) => issue.path[0] === "location_ids" || issue.path[0] === "job_ids",
      )?.message ?? null,
      scheduled,
    ),
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

/** The sentence a record can act on: without "Exclude from schedule" where the record has none. */
function offered(sentence: string | null, scheduled: boolean): string | null {
  if (scheduled || sentence === null) return sentence;
  const key = (Object.keys(assignmentRefusalsWithoutExclude) as (keyof typeof assignmentRefusalsWithoutExclude)[])
    .find((hint) => managementAndOwnerRefusals[hint] === sentence);
  return key ? assignmentRefusalsWithoutExclude[key] : sentence;
}
