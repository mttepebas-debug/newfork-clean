import type { Permission, WorkspaceRole } from "@newfork/shared";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { appLandingPath } from "./routeDestinations";

export const settingsEntryPermissions = [
  "settings.general.read",
  "settings.locations.read",
  "settings.jobs.read",
  "settings.shift_catalog.read",
  "settings.schedule_rules.read",
  "schedule.conflict_rules.manage",
  "roles.read",
  "documents.read",
  "employee_documents.read",
  "signature_templates.read",
  "notifications.settings.read",
  "notifications.settings.write",
  "kiosk.device.enroll.location",
  "kiosk.device.read.location",
  "kiosk.device.revoke.location",
  "kiosk.pin.reset.location",
  "kiosk.audit.read.location",
] as const satisfies readonly Permission[];

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
