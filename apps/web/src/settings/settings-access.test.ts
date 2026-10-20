import { readFileSync } from "node:fs";
import {
  expected,
  permissionsForRole,
  type ActiveWorkspaceContext,
  type AuthzAction,
  type Permission,
  type WorkspaceRole,
} from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  canEnterSettings,
  canOpenAnySettingsPage,
  canOpenSettingsPage,
  settingsHomePath,
  type SettingsPage,
} from "./settings-access";

/*
 * BL-176: the Settings gates moved from raw permission keys to the
 * authorization core's actions. Nobody's access may widen or narrow. Each
 * person the database lets exist is built below; the gates before the move
 * (copied from origin/main a205e2a6) and after it must open the same pages.
 */

const homeLocation = "a1f0c3d2-5b6e-4f70-8a91-0b2c3d4e5f60";

/** The permissions the Settings gates ever read. */
const settingsPermissions = [
  "settings.general.read",
  "settings.locations.read",
  "settings.jobs.read",
  "settings.shift_catalog.read",
  "settings.schedule_rules.read",
  "schedule.conflict_rules.manage",
  "roles.read",
  "documents.read",
  "employee_documents.read",
] as const satisfies readonly Permission[];
type SettingsPermission = (typeof settingsPermissions)[number];

/**
 * Not grantable to a manager-class role: GA-2, migrations
 * 20261008133054_organization_settings_stay_with_owner_and_admin and
 * 20261012044500_locations_settings_stay_with_owner_and_admin
 * (custom_grantable = false, save_workspace_role_service refuses them).
 */
const ownerAndAdminOnly: readonly SettingsPermission[] = [
  "schedule.conflict_rules.manage",
  "roles.read",
  "settings.locations.read",
];

interface Persona {
  readonly role: WorkspaceRole;
  readonly permissions: readonly SettingsPermission[];
  /** Where they work; a Remote manager works nowhere. */
  readonly locationIds: readonly string[];
}

function subsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>(
    (all, item) => all.flatMap((set) => [set, [...set, item]]),
    [[]],
  );
}

/**
 * Everybody the database lets exist, as far as these gates can tell apart:
 * - the owner holds every permission (role_default_permissions; the owner role
 *   cannot be edited, app_private.can_edit_role);
 * - an admin role holds any of them;
 * - a manager role holds the grantable ones, with or without a location;
 * - an employee role holds none of them (none is employee_eligible).
 */
function personas(): Persona[] {
  const managerGrantable = settingsPermissions.filter(
    (permission) => !ownerAndAdminOnly.includes(permission),
  );
  return [
    { role: "owner", permissions: settingsPermissions, locationIds: [homeLocation] },
    ...subsets(settingsPermissions)
      .map((permissions): Persona => ({ role: "admin", permissions, locationIds: [] })),
    ...subsets(managerGrantable).flatMap((permissions): Persona[] => [
      { role: "manager", permissions, locationIds: [homeLocation] },
      { role: "manager", permissions, locationIds: [] },
    ]),
    { role: "employee", permissions: [], locationIds: [homeLocation] },
  ];
}

/**
 * The core's answer for one action, as app_private.actor_actions works it out
 * for an active member of an open workspace (an earlier gate,
 * DocumentAccessRoute, already sends a member held back by a document away).
 * Rows: app_private.authz_actions; reach: authz_scope_rules, model M2.
 */
function coreAllows(persona: Persona, action: AuthzAction): boolean {
  const actor = {
    workspaceId: "w",
    role: persona.role,
    status: "active" as const,
    locationIds: persona.locationIds,
    // The owner holds every permission (authz_check).
    permissions:
      persona.role === "owner" ? settingsPermissions : persona.permissions,
  };
  // actor_actions tries the whole organization, the first place they manage,
  // and some live location of the workspace.
  const placesTried = [
    "organization" as const,
    ...(persona.role === "manager" ? persona.locationIds.slice(0, 1) : []).map(
      (id) => [id],
    ),
    [homeLocation],
  ];
  switch (action) {
    // org, read: a manager reaches the organization.
    case "settings.jobs.read":
    case "settings.shift_catalog.read":
    case "settings.roles.read":
    case "settings.documents.read":
    case "settings.signature_templates.read":
    // org, write: a manager reaches nowhere.
    case "settings.conflict_rules.write":
    // set, read: a manager where they work.
    case "settings.locations.read":
      return placesTried.some((locations) => expected(actor, action, { locations }));
    // person, read (employee documents): owner and admin anywhere, a manager
    // where they work.
    case "documents.read":
      if (persona.role === "employee") return false;
      if (!actor.permissions.includes("employee_documents.read")) return false;
      return persona.role !== "manager" || persona.locationIds.length > 0;
    default:
      throw new Error(`No core model for ${action}`);
  }
}

const modelledActions = [
  "settings.jobs.read",
  "settings.shift_catalog.read",
  "settings.roles.read",
  "settings.documents.read",
  "settings.signature_templates.read",
  "settings.conflict_rules.write",
  "settings.locations.read",
  "documents.read",
] as const satisfies readonly AuthzAction[];

function contextOf(persona: Persona): ActiveWorkspaceContext {
  return {
    userId: "6b1e2c3d-4f50-4617-8a29-3b4c5d6e7f80",
    workspace: {
      id: "w",
      name: "Harbor Grill",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "7c2f3d4e-5a61-4728-9b3a-4c5d6e7f8091",
      userId: "6b1e2c3d-4f50-4617-8a29-3b4c5d6e7f80",
      workspaceId: "w",
      access: persona.role === "employee" ? { employee: true, management: null } : { employee: false, management: persona.role },
      status: "active",
    },
    // The role's grants as resolve_workspace_context_service lists them.
    permissions:
      persona.role === "owner" ? [...settingsPermissions] : [...persona.permissions],
    actions: modelledActions.filter((action) => coreAllows(persona, action)),
    onboarding: { status: "complete", currentStep: 4 },
    documentAccess: { restricted: false },
    locationScope: {
      allLocations: persona.role !== "manager",
      locationIds: [...persona.locationIds],
    },
  };
}

/*
 * The gates before the move, copied from origin/main a205e2a6, less the
 * Notifications page: BILDIRIM-02 took it out (KARARLAR S-123), so a role
 * holding only the notification keys opens no Settings page any more.
 */

/**
 * The pages that moved. Notifications came back later as a new page on the
 * notification core's owner/admin rule (BILDIRIM-11); it has its own test below.
 */
type MovedPage = Exclude<SettingsPage, "notifications">;

/** App.tsx: each Settings route's guard. */
const before = {
  general: { anyOf: ["settings.general.read"] },
  locations: { anyOf: ["settings.locations.read"] },
  jobs: { anyOf: ["settings.jobs.read"] },
  scheduling: { anyOf: ["settings.schedule_rules.read"] },
  conflicts: { anyOf: ["schedule.conflict_rules.manage"] },
  shiftCatalog: { anyOf: ["settings.shift_catalog.read"] },
  roles: { anyOf: ["roles.read"] },
  // These two already asked the core (ActionRoute).
  documents: { action: "settings.documents.read" },
  acknowledgements: { action: "settings.signature_templates.read" },
} as const satisfies Record<
  MovedPage,
  { readonly anyOf: readonly Permission[] } | { readonly action: AuthzAction }
>;

function routeOpenedBefore(context: ActiveWorkspaceContext, page: MovedPage) {
  const gate = before[page];
  return "anyOf" in gate
    ? gate.anyOf.some((permission) => context.permissions.includes(permission))
    : context.actions.includes(gate.action);
}

/** SettingsLayout: each rail link's permissions. */
const railBefore: Record<MovedPage, readonly Permission[]> = {
  general: ["settings.general.read"],
  locations: ["settings.locations.read"],
  jobs: ["settings.jobs.read"],
  scheduling: ["settings.schedule_rules.read"],
  conflicts: ["schedule.conflict_rules.manage"],
  shiftCatalog: ["settings.shift_catalog.read"],
  roles: ["roles.read"],
  documents: ["documents.read"],
  acknowledgements: ["documents.read"],
};

/** PermissionRoute.tsx canEnterSettings. */
function enteredSettingsBefore(context: ActiveWorkspaceContext) {
  return (
    [
      "settings.general.read",
      "settings.locations.read",
      "settings.jobs.read",
      "settings.shift_catalog.read",
      "settings.schedule_rules.read",
      "schedule.conflict_rules.manage",
      "roles.read",
    ].some((permission) => context.permissions.includes(permission as Permission)) ||
    ["settings.documents.read", "documents.read", "settings.signature_templates.read"].some(
      (action) => context.actions.includes(action as AuthzAction),
    )
  );
}

/** SettingsHomeRedirect. */
function homeBefore(context: ActiveWorkspaceContext) {
  const permissions = new Set(context.permissions);
  return permissions.has("settings.general.read")
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
              : permissions.has("roles.read")
                ? "/app/settings/roles"
                : permissions.has("documents.read")
                  ? "/app/settings/documents"
                  : "/app/schedule";
}

const pages = Object.keys(before) as MovedPage[];
const everybody = personas();

function describePersona(persona: Persona) {
  return `${persona.role} [${persona.permissions.join(", ")}] at ${persona.locationIds.length} location(s)`;
}

describe("Settings gates ask the core and open what the keys opened (BL-176)", () => {
  it("builds every kind of person the database allows", () => {
    // 1 owner + 512 admin roles + 2 × 64 manager roles + 1 employee (the notification
    // settings permissions went with the old notification system, BILDIRIM-06).
    expect(everybody).toHaveLength(1 + 512 + 128 + 1);
  });

  it.each(pages)("opens the %s route for exactly the same people", (page) => {
    const differ = everybody.filter((persona) => {
      const context = contextOf(persona);
      return routeOpenedBefore(context, page) !== canOpenSettingsPage(context, page);
    });
    expect(differ.map(describePersona)).toEqual([]);
  });

  it.each(pages)("shows the %s link in the Settings rail to exactly the same people", (page) => {
    const differ = everybody.filter((persona) => {
      const context = contextOf(persona);
      const shownBefore = railBefore[page].some((permission) =>
        context.permissions.includes(permission),
      );
      return shownBefore !== canOpenSettingsPage(context, page);
    });
    expect(differ.map(describePersona)).toEqual([]);
  });

  it("lets exactly the same people enter Settings", () => {
    const differ = everybody.filter((persona) => {
      const context = contextOf(persona);
      return enteredSettingsBefore(context) !== canEnterSettings(context);
    });
    expect(differ.map(describePersona)).toEqual([]);
  });

  it("opens Settings on the same page for everybody", () => {
    const differ = everybody.filter((persona) => {
      const context = contextOf(persona);
      return homeBefore(context) !== settingsHomePath(context);
    });
    expect(differ.map(describePersona)).toEqual([]);
  });

  it("opens nothing without a workspace", () => {
    expect(canEnterSettings(null)).toBe(false);
    expect(pages.filter((page) => canOpenSettingsPage(null, page))).toEqual([]);
    expect(settingsHomePath(null)).toBe("/app/schedule");
  });

  it("asks the core, not the role's list, where the core has the action", () => {
    // An admin whose role lists every key but whom the core answers for none.
    const context = {
      ...contextOf({ role: "admin", permissions: settingsPermissions, locationIds: [] }),
      actions: [],
    };
    expect(pages.filter((page) => canOpenSettingsPage(context, page))).toEqual([
      "general",
      "locations",
      "scheduling",
    ]);
  });

  it("sends somebody away from a closed workspace's Settings pages the core answers for", () => {
    // A closed workspace: the core answers for nothing (workspace_open is
    // false), the role still lists its keys. Before, these pages opened and
    // every API call on them was refused; now they land at home. The only
    // change, and a narrowing where nothing worked.
    const context = {
      ...contextOf({ role: "admin", permissions: settingsPermissions, locationIds: [] }),
      actions: [],
    };
    expect(pages.filter((page) => routeOpenedBefore(context, page) !== canOpenSettingsPage(context, page))).toEqual([
      "jobs",
      "conflicts",
      "shiftCatalog",
      "roles",
    ]);
  });

  it("opens Notifications to whoever the core lets change organization settings, and only them (BILDIRIM-11)", () => {
    // settings.organization.write: owner and admin (GA-2), the same rule the
    // database asks in its notification settings services.
    for (const persona of everybody) {
      const context = contextOf(persona);
      expect(canOpenSettingsPage(context, "notifications")).toBe(false);
      const allowed = { ...context, actions: [...context.actions, "settings.organization.write" as const] };
      expect(canOpenSettingsPage(allowed, "notifications")).toBe(true);
      expect(canEnterSettings(allowed)).toBe(true);
    }
    expect(canOpenSettingsPage(null, "notifications")).toBe(false);
  });

  it("opens Locations to owners and admins only: no manager role may hold its key (Mert 2026-10-12, BL-176)", () => {
    const managerWithEveryRead = contextOf({
      role: "manager",
      permissions: settingsPermissions.filter((permission) => !ownerAndAdminOnly.includes(permission)),
      locationIds: [homeLocation],
    });
    expect(canOpenSettingsPage(managerWithEveryRead, "locations")).toBe(false);
    const remoteAdmin = contextOf({ role: "admin", permissions: ["settings.locations.read"], locationIds: [] });
    expect(canOpenSettingsPage(remoteAdmin, "locations")).toBe(true);
  });

  it("opens the catalog, read only, to the built-in manager, and the menu shows Settings (BL-680, K14 S1)", () => {
    const builtInManager = contextOf({
      role: "manager",
      permissions: settingsPermissions.filter((permission) =>
        permissionsForRole("manager").includes(permission),
      ),
      locationIds: [homeLocation],
    });
    expect(pages.filter((page) => canOpenSettingsPage(builtInManager, page))).toEqual([
      "jobs",
      "scheduling",
      "shiftCatalog",
      "documents",
      "acknowledgements",
    ]);
    expect(canOpenAnySettingsPage(builtInManager)).toBe(true);
    expect(settingsHomePath(builtInManager)).toBe("/app/settings/jobs");
  });

  it("shows Settings in the menu to whoever opens one of its pages, and only them", () => {
    const differ = everybody.filter((persona) => {
      const context = contextOf(persona);
      return canOpenAnySettingsPage(context) !== pages.some((page) => canOpenSettingsPage(context, page));
    });
    expect(differ.map(describePersona)).toEqual([]);
    expect(canOpenAnySettingsPage(contextOf({ role: "employee", permissions: [], locationIds: [homeLocation] }))).toBe(false);
  });
});

describe("App.tsx Settings routes", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const settingsBlock = app.slice(
    app.indexOf('<Route path="settings" element={<SettingsLayout />}>'),
    app.indexOf('path="support"'),
  );

  it("guards every Settings page with its gate from settings-access", () => {
    const guarded = [
      ...settingsBlock.matchAll(
        /path="([^"]+)"\s+element=\{\s*<SettingsPageRoute page="([^"]+)">/g,
      ),
    ].map(([, path, page]) => [path, page]);
    expect(guarded).toEqual([
      ["general", "general"],
      ["locations", "locations"],
      ["jobs", "jobs"],
      ["notifications", "notifications"],
      ["scheduling", "scheduling"],
      ["scheduling/conflicts", "conflicts"],
      ["scheduling/shift-types", "shiftCatalog"],
      ["scheduling/shift-labels", "shiftCatalog"],
      ["roles", "roles"],
      ["roles/:roleId", "roles"],
      ["acknowledgements", "acknowledgements"],
    ]);
  });

  it("leaves no permission-key or route-local guard inside Settings", () => {
    expect(settingsBlock).not.toContain("PermissionRoute");
    expect(settingsBlock).not.toContain("ActionRoute");
  });
});
