import type {
  ActiveWorkspaceContext,
  Permission,
  WorkspaceRole,
  WorkspaceSummary,
} from "@newfork/shared";

export const organizationSwitcherPath = "/organization-switcher";
export const accountLandingPath = "/invitations/pending";
export const noOrganizationPath = "/no-organization";

/**
 * Organizations the account can actually work in. A workspace whose setup is
 * unfinished is not one of them: it is an open item the account still has to
 * decide about.
 */
export function readyWorkspaces(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary[] {
  return workspaces.filter(
    (workspace) =>
      workspace.status === "active" &&
      workspace.onboarding.status === "complete",
  );
}

/** Setups the account started and never finished, employee and employer alike. */
export function unfinishedWorkspaces(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary[] {
  return workspaces.filter(
    (workspace) =>
      workspace.status === "pending" ||
      (workspace.status === "active" &&
        workspace.onboarding.status !== "complete"),
  );
}

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
