import {
  employeeInputSchema,
  type EmployeeInput,
  type WorkspaceRole,
} from "@newfork/shared";

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

export function canInviteWithRole(actor: WorkspaceRole, target: WorkspaceRole) {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "admin";
  return actor === "manager" && target === "employee";
}
