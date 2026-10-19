import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { hasEmployeeAccess, hasManagementAccess } from "../auth/access";
import { employeeDocumentsPath, managementDocumentsPath, ownDocumentsPath } from "./own-documents";

/**
 * Account → Documents is gone (MY-DOCUMENTS): its old address, still in
 * notifications and links, opens one's own documents in the interface that is
 * theirs, with the same query (workspace, kind, requirement).
 */
export function OwnDocumentsRedirect() {
  const { context } = useAuth();
  const { search } = useLocation();
  if (!context) return null;
  return <Navigate to={`${ownDocumentsPath(context.membership)}${search}`} replace />;
}

/**
 * One's own documents in the employee interface (Documents) or management's
 * (My documents). Which interface is a matter of the membership's accesses,
 * not of the core's answers: a person whose papers are overdue has the rest of
 * the workspace shut (DocumentAccessRoute) and must still reach this page. The
 * API answers for the documents themselves; somebody at the other interface's
 * address goes to their own.
 */
export function OwnDocumentsRoute({
  view,
  children,
}: {
  readonly view: "employee" | "management";
  readonly children: ReactNode;
}) {
  const { context } = useAuth();
  const { search } = useLocation();
  if (!context) return null;
  const theirs =
    view === "employee" ? hasEmployeeAccess(context.membership) : hasManagementAccess(context.membership);
  if (!theirs)
    return (
      <Navigate to={`${view === "employee" ? managementDocumentsPath : employeeDocumentsPath}${search}`} replace />
    );
  return children;
}
