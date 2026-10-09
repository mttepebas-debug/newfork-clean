import { Navigate, useLocation } from "react-router";
import { lazy } from "react";
import { useAuth } from "../auth/AuthContext";
import { ActionRoute } from "../auth/ActionRoute";
import { can } from "../auth/can";
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
    (!can(context, "settings.documents.read") && can(context, "documents.read"));
  if (employeeLink)
    return (
      <Navigate
        replace
        to={`/app/employees/documents${location.search}${location.hash}`}
      />
    );
  return (
    <ActionRoute action="settings.documents.read">
      <DocumentsSettingsPage />
    </ActionRoute>
  );
}
