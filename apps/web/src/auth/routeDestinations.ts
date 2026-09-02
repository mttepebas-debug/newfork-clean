import type { ActiveWorkspaceContext, Permission } from "@newfork/shared";

export function appLandingPath(
  context: ActiveWorkspaceContext | null,
): string {
  if (!context) return "/account/workspaces";
  if (context.membership.role === "employee") return "/app/employee-hub";
  if (hasPermission(context.permissions, "workspace.read"))
    return "/app/workspace";
  if (hasPermission(context.permissions, "schedule.read")) return "/app/schedule";
  return "/account/workspaces";
}

function hasPermission(
  permissions: readonly Permission[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}
