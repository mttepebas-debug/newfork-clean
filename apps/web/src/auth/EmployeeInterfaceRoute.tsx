import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { can } from "./can";
import { hasEmployeeAccess, hasManagementAccess } from "./access";
import { appLandingPath } from "./resolveLanding";
import { NoAccessRoute } from "../shell/NoAccessState";

/**
 * The employee interface (Employee Hub), opened by the core's answer
 * (`employee_hub.read`). Somebody who only manages has none: an old link takes
 * them to their landing page, never a no-access card (ROL-CIFT 6.2, design
 * §4.1). Anybody else the core holds out sees the card.
 */
export function EmployeeInterfaceRoute({ children }: { readonly children: ReactNode }) {
  const { context } = useAuth();
  if (can(context, "employee_hub.read")) return children;
  if (context && hasManagementAccess(context.membership) && !hasEmployeeAccess(context.membership))
    return <Navigate to={appLandingPath(context)} replace />;
  return <NoAccessRoute />;
}
