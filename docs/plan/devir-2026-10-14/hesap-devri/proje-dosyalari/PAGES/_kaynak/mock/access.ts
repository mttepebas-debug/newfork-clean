// What the signed-in person may do: the role's permission keys, a Shift Lead's
// custom set, or the scenario's own (a narrower custom role).
import * as shared from "@newfork/shared";
import type { Permission } from "@newfork/shared";
import { currentScenario } from "../pages";
import { viewerClass, viewerIdentity } from "./viewer";

/** Shift Lead (Settings > Roles): covers the floor when no manager is in. */
export const SHIFT_LEAD_PERMISSIONS = ([
  "workspace.read", "schedule.read", "schedule.manage", "employees.read", "availability.read",
  "schedule.time_off_requests.read", "schedule.shift_change_requests.read", "schedule.shift_change_requests.manage",
  "announcements.read", "notifications.read", "notifications.read_own", "notifications.preferences.write_own",
] satisfies Permission[]).sort();

export function viewerPermissions(): readonly string[] {
  const own = currentScenario()?.perms;
  if (own) return own;
  if (viewerIdentity === "custom") return SHIFT_LEAD_PERMISSIONS;
  return shared.permissionsForRole(viewerClass) as readonly string[];
}
