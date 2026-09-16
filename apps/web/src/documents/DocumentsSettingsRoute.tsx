import { Navigate, useLocation } from "react-router";
import { lazy } from "react";
import { useAuth } from "../auth/AuthContext";
import { PermissionRoute } from "../auth/PermissionRoute";
const DocumentsSettingsPage = lazy(
  () => import("../settings/DocumentsSettingsPage"),
);

/** Legacy employee deep links retain their complete search/hash at the new route. */
export function DocumentsSettingsRoute() {
  const location = useLocation();
  const { context } = useAuth();
  const search = new URLSearchParams(location.search);
  const employeeLink =
    search.has("requirement") ||
    ["employees", "employee-documents"].includes(search.get("view") ?? "") ||
    (!context?.permissions.includes("documents.read") &&
      context?.permissions.includes("employee_documents.read"));
  if (employeeLink)
    return (
      <Navigate
        replace
        to={`/app/employees/documents${location.search}${location.hash}`}
      />
    );
  return (
    <PermissionRoute anyOf={["documents.read"]}>
      <DocumentsSettingsPage />
    </PermissionRoute>
  );
}
