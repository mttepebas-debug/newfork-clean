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
 * Does their role list this permission key. Legacy: a new gate asks the core
 * (`can()`, ActionRoute). Only PermissionRoute and settings-access.ts call
 * this, where the core has no matching action yet (BL-176); a new caller is a
 * new raw-key gate (CLAUDE.md §3.A.1).
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
