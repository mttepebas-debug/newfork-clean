import type { AuthzAction } from "@newfork/shared";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { can } from "./can";
import { NoAccessRoute } from "../shell/NoAccessState";

/**
 * A route the authorization core opens (`can()`, context.actions), not a
 * permission key or a role name. Somebody it does not open sees the no-access
 * card in its place (Mert 2026-10-14: "kart çıksın").
 */
export function ActionRoute({
  children,
  action,
}: {
  readonly children: ReactNode;
  readonly action: AuthzAction;
}) {
  const { context } = useAuth();
  if (!can(context, action)) return <NoAccessRoute />;
  return children;
}
