import type {
  ActiveWorkspaceContext,
  Permission,
  WorkspaceRole,
} from "@newfork/shared";

export const organizationSwitcherPath = "/organization-switcher";

export function workspaceLandingPathForRole(role: WorkspaceRole): string {
  return role === "employee" ? "/app/employee-hub" : "/app/workspace";
}

export function appLandingPath(
  context: ActiveWorkspaceContext | null,
): string {
  if (!context) return organizationSwitcherPath;
  if (context.membership.role === "employee")
    return workspaceLandingPathForRole(context.membership.role);
  if (hasPermission(context.permissions, "workspace.read"))
    return workspaceLandingPathForRole(context.membership.role);
  if (hasPermission(context.permissions, "schedule.read")) return "/app/schedule";
  return organizationSwitcherPath;
}

function hasPermission(
  permissions: readonly Permission[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}
