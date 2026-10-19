import type {
  ActiveWorkspaceContext,
  Permission,
} from "@newfork/shared";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { NoAccessRoute } from "../shell/NoAccessState";
import { appLandingPath } from "./resolveLanding";
import { hasManagementAccess } from "./access";

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
  management = false,
}: {
  readonly children: ReactNode;
  readonly anyOf: readonly Permission[];
  /** Only for a management access (Manager, Admin or Owner; ROL-CIFT). */
  readonly management?: boolean;
}) {
  const { context } = useAuth();
  if (!context) return <Navigate to={appLandingPath(context)} replace />;
  // A refused address shows the no-access card in place (Mert 2026-10-14).
  if (
    (management && !hasManagementAccess(context.membership)) ||
    !anyOf.some((permission) => holdsPermission(context, permission))
  ) {
    return <NoAccessRoute />;
  }
  return children;
}
