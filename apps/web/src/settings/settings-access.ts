import type {
  ActiveWorkspaceContext,
  AuthzAction,
  Permission,
} from "@newfork/shared";
import { can } from "../auth/can";
import { holdsPermission } from "../auth/PermissionRoute";

/**
 * What opens a Settings page: the authorization core's action (`can()`,
 * context.actions). A permission key only where the core has no action for the
 * page yet, or its action reaches fewer people than the key does today (BL-176):
 * - General and Schedule rules: no read action in app_private.authz_actions.
 * - Locations: settings.locations.read is a set action (per location); only
 *   owners and admins hold its key, no manager role may (Mert 2026-10-12,
 *   BL-176), so the key is the page's gate.
 */
type SettingsGate =
  | { readonly action: AuthzAction }
  | { readonly permission: Permission };

export const settingsPageGates = {
  general: [{ permission: "settings.general.read" }],
  locations: [{ permission: "settings.locations.read" }],
  jobs: [{ action: "settings.jobs.read" }],
  // The notification core's own owner/admin rule (BILDIRIM-07).
  notifications: [{ action: "settings.organization.write" }],
  scheduling: [{ permission: "settings.schedule_rules.read" }],
  conflicts: [{ action: "settings.conflict_rules.write" }],
  shiftCatalog: [{ action: "settings.shift_catalog.read" }],
  roles: [{ action: "settings.roles.read" }],
  documents: [{ action: "settings.documents.read" }],
  acknowledgements: [{ action: "settings.signature_templates.read" }],
} as const satisfies Record<string, readonly SettingsGate[]>;

export type SettingsPage = keyof typeof settingsPageGates;

/** May they open this Settings page. The API still decides what it shows. */
export function canOpenSettingsPage(
  context: ActiveWorkspaceContext | null | undefined,
  page: SettingsPage,
): boolean {
  if (!context) return false;
  const gates: readonly SettingsGate[] = settingsPageGates[page];
  return gates.some((gate) =>
    "action" in gate
      ? can(context, gate.action)
      : holdsPermission(context, gate.permission),
  );
}

const settingsPages = Object.keys(settingsPageGates) as SettingsPage[];

/** Is any Settings page open to them: the menu shows Settings (BL-680). */
export function canOpenAnySettingsPage(
  context: ActiveWorkspaceContext | null | undefined,
): boolean {
  return settingsPages.some((page) => canOpenSettingsPage(context, page));
}

/**
 * May they enter Settings at all: any Settings page open to them opens it, and
 * so does reading employee documents, whose old Settings links pass through.
 */
export function canEnterSettings(
  context: ActiveWorkspaceContext | null | undefined,
): context is ActiveWorkspaceContext {
  if (!context) return false;
  return canOpenAnySettingsPage(context) || can(context, "documents.read");
}

/** Where /app/settings opens: the first page of these open to them. */
const settingsHomeOrder = [
  ["general", "/app/settings/general"],
  ["locations", "/app/settings/locations"],
  ["jobs", "/app/settings/jobs"],
  ["shiftCatalog", "/app/settings/scheduling/shift-types"],
  ["conflicts", "/app/settings/scheduling/conflicts"],
  ["scheduling", "/app/settings/scheduling"],
  ["notifications", "/app/settings/notifications"],
  ["roles", "/app/settings/roles"],
  ["documents", "/app/settings/documents"],
] as const satisfies readonly (readonly [SettingsPage, string])[];

export function settingsHomePath(
  context: ActiveWorkspaceContext | null | undefined,
): string {
  const first = settingsHomeOrder.find(([page]) =>
    canOpenSettingsPage(context, page),
  );
  return first ? first[1] : "/app/schedule";
}
