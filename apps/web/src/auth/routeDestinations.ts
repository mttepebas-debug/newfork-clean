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

/** Where "Not now" leads: the single organization, or the choice between several. */
export function deferredLandingPath(
  context: ActiveWorkspaceContext | null,
  workspaces: readonly WorkspaceSummary[],
): string | null {
  const ready = readyWorkspaces(workspaces);
  if (ready.length === 0) return null;
  // The switcher also activates, so anything but "already in the only one" goes there.
  if (ready.length === 1 && context && context.workspace.id === ready[0]!.id)
    return appLandingPath(context);
  return organizationSwitcherPath;
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
