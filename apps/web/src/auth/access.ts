import { accessClass, type WorkspaceAccess, type WorkspaceRole } from "@newfork/shared";

// A membership's two accesses (ROL-CIFT): the employee access and a management
// access (Manager, Admin or Owner). The server decides what either may do; the
// web only reflects it.

type WithAccess = { readonly access: WorkspaceAccess };

/** A management access: the management interface is theirs. */
export function hasManagementAccess(membership: WithAccess): boolean {
  return membership.access.management !== null;
}

/** The employee access: the employee interface is theirs. */
export function hasEmployeeAccess(membership: WithAccess): boolean {
  return membership.access.employee;
}

/** The one class a screen shows: the management access's, else employee. */
export function membershipClass(membership: WithAccess): WorkspaceRole {
  return accessClass(membership.access);
}
