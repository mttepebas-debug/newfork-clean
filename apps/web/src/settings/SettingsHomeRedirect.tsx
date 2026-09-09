import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

export default function SettingsHomeRedirect() {
  const permissions = new Set(useAuth().context?.permissions ?? []);
  const destination = permissions.has("workspace.manage")
    ? "/app/settings/general"
    : permissions.has("notifications.settings.read") ||
        permissions.has("notifications.settings.write")
      ? "/app/settings/notifications"
    : permissions.has("roles.read")
      ? "/app/settings/roles"
      : permissions.has("documents.read")
        ? "/app/settings/documents"
        : permissions.has("signature_templates.read")
          ? "/app/settings/acknowledgements"
          : (
                [
                  "kiosk.device.enroll.location",
                  "kiosk.device.read.location",
                  "kiosk.device.revoke.location",
                  "kiosk.pin.reset.location",
                  "kiosk.audit.read.location",
                ] as const
              ).some((permission) => permissions.has(permission))
            ? "/app/settings/kiosk"
            : "/app/schedule";
  return <Navigate to={destination} replace />;
}
