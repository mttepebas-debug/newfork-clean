import type {
  ActiveWorkspaceContext,
  AuthzAction,
  Permission,
  WorkspaceRole,
} from "@newfork/shared";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { can } from "./can";
import { appLandingPath } from "./resolveLanding";

const settingsEntryPermissions = [
  "settings.general.read",
  "settings.locations.read",
  "settings.jobs.read",
  "settings.shift_catalog.read",
  "settings.schedule_rules.read",
  "schedule.conflict_rules.manage",
  "roles.read",
  "notifications.settings.read",
  "notifications.settings.write",
] as const satisfies readonly Permission[];
/** Document settings open Settings by the core's answer (FB-6.6). */
const settingsEntryActions = [
  "settings.documents.read",
  "documents.read",
  "settings.signature_templates.read",
] as const satisfies readonly AuthzAction[];

/** May they enter Settings at all: any Settings page open to them opens it. */
export function canEnterSettings(
  context: ActiveWorkspaceContext | null | undefined,
): context is ActiveWorkspaceContext {
  if (!context) return false;
  return (
    settingsEntryPermissions.some((permission) =>
      context.permissions.includes(permission),
    ) || settingsEntryActions.some((action) => can(context, action))
  );
}

export function PermissionRoute({
  children,
  anyOf,
  roles,
}: {
  readonly children: ReactNode;
  readonly anyOf: readonly Permission[];
  readonly roles?: readonly WorkspaceRole[];
}) {
  const { context } = useAuth();
  if (
    !context ||
    (roles && !roles.includes(context.membership.role)) ||
    !anyOf.some((permission) => context.permissions.includes(permission))
  ) {
    return <Navigate to={appLandingPath(context)} replace />;
  }
  return children;
}
