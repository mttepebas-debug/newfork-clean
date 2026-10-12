import type {
  ActiveWorkspaceContext,
  Permission,
  WorkspaceRole,
} from "@newfork/shared";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { appLandingPath } from "./resolveLanding";

/**
 * Does their role list this permission key. Old: a route asks the core
 * (`can()`, ActionRoute); this stays only where the core has no matching
 * action yet (BL-176).
 */
export function holdsPermission(
  context: ActiveWorkspaceContext,
  permission: Permission,
): boolean {
  return context.permissions.includes(permission);
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
    !anyOf.some((permission) => holdsPermission(context, permission))
  ) {
    return <Navigate to={appLandingPath(context)} replace />;
  }
  return children;
}
