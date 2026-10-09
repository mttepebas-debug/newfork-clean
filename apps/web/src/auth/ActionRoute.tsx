import type { AuthzAction } from "@newfork/shared";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { can } from "./can";
import { appLandingPath } from "./resolveLanding";

/**
 * A route the authorization core opens (`can()`, context.actions), not a
 * permission key or a role name. Somebody it does not open lands where they
 * belong.
 */
export function ActionRoute({
  children,
  action,
}: {
  readonly children: ReactNode;
  readonly action: AuthzAction;
}) {
  const { context } = useAuth();
  if (!can(context, action)) return <Navigate to={appLandingPath(context)} replace />;
  return children;
}
