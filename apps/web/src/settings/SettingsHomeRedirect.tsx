import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

export default function SettingsHomeRedirect() {
  const permissions = new Set(useAuth().context?.permissions ?? []);
  const destination = permissions.has("settings.general.read")
    ? "/app/settings/general"
    : permissions.has("settings.locations.read")
      ? "/app/settings/locations"
      : permissions.has("settings.jobs.read")
        ? "/app/settings/jobs"
        : permissions.has("settings.shift_catalog.read")
          ? "/app/settings/scheduling/shift-types"
          : permissions.has("schedule.conflict_rules.manage")
            ? "/app/settings/scheduling/conflicts"
          : permissions.has("settings.schedule_rules.read")
            ? "/app/settings/scheduling"
            : permissions.has("notifications.settings.read") ||
                permissions.has("notifications.settings.write")
              ? "/app/settings/notifications"
              : permissions.has("roles.read")
                ? "/app/settings/roles"
                : permissions.has("documents.read")
                  ? "/app/settings/documents"
                  : "/app/schedule";
  return <Navigate to={destination} replace />;
}
