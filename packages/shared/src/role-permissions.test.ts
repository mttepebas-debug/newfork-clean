import { describe, expect, it } from "vitest";
import {
  permissionGroupsForRole,
  personalRolePermissions,
  toggleRolePermissions,
} from "./role-permissions";
import {
  type Permission,
  type PermissionDefinition,
  permissionSchema,
  permissionsForRole,
  workspaceRoleInputSchema,
} from "./index";

// The database's permissions.custom_grantable = false (GUVENLIK-A GA-2).
const ownerAndAdminOnly: readonly Permission[] = [
  "documents.manage",
  "notifications.broadcast.approve",
  "notifications.delivery_audit.read",
  "notifications.dlq.replay",
  "notifications.settings.write",
  "notifications.test_send",
  "roles.manage",
  "roles.read",
  "schedule.conflict_rules.manage",
  "settings.general.manage",
  "settings.jobs.manage",
  "settings.locations.manage",
  "settings.schedule_rules.manage",
  "settings.shift_catalog.manage",
  "workspace.manage",
];
const catalog: PermissionDefinition[] = permissionSchema.options.map((key) => ({
  key,
  label: key,
  category: "Test",
  description: "Test",
  custom_grantable: !ownerAndAdminOnly.includes(key),
  sort_order: 0,
}));
const offered = (groups: ReturnType<typeof permissionGroupsForRole>) =>
  groups.flatMap((group) =>
    group.areas.flatMap((area) => [...area.read, ...area.edit]),
  );

describe("what Settings > Roles offers each kind of role (GUVENLIK-A GA-2)", () => {
  it("a manager role gets the organization reads, nothing the database keeps for owner and admin", () => {
    const groups = permissionGroupsForRole("manager", catalog);
    const keys = offered(groups);
    for (const key of ownerAndAdminOnly) expect(keys).not.toContain(key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "settings.general.read",
        "settings.locations.read",
        "settings.jobs.read",
        "settings.shift_catalog.read",
        "settings.schedule_rules.read",
        "documents.read",
        "notifications.settings.read",
        "employee_access.read",
      ]),
    );
    const areas = groups.flatMap((group) => group.areas);
    expect(areas.find((area) => area.id === "locations")?.edit).toEqual([]);
    expect(areas.map((area) => area.id)).not.toContain("conflict-rules");
    expect(areas.map((area) => area.id)).not.toContain("roles");
  });
  it("a manager role is not offered an Edit that needs one of them (Invitations & access needs roles.read)", () => {
    const keys = offered(permissionGroupsForRole("manager", catalog));
    expect(keys).not.toContain("employee_access.manage");
  });
  it("a permission the catalog does not list is not offered to a manager role, nor what depends on it", () => {
    const keys = offered(
      permissionGroupsForRole(
        "manager",
        catalog.filter((definition) => definition.key !== "schedule.manage"),
      ),
    );
    expect(keys).not.toContain("schedule.manage");
    expect(keys).not.toContain("schedule.publish");
    expect(keys).toContain("schedule.read");
  });
  it("owner and admin roles keep every organization Edit", () => {
    for (const accessClass of ["owner", "admin"] as const) {
      const keys = offered(permissionGroupsForRole(accessClass, catalog));
      expect(keys).toEqual(
        expect.arrayContaining([
          "settings.general.manage",
          "settings.locations.manage",
          "schedule.conflict_rules.manage",
          "notifications.settings.write",
          "roles.manage",
          "employee_access.manage",
        ]),
      );
    }
  });
});

describe("role editor permission contract", () => {
  it("bulk Edit enables prerequisite reads and Read removal clears dependent writes", () => {
    const edit = toggleRolePermissions(
      personalRolePermissions,
      ["schedule.publish", "schedule.templates.manage", "availability.manage"],
      true,
    );
    expect(edit).toEqual(
      expect.arrayContaining([
        "schedule.read",
        "schedule.manage",
        "schedule.templates.read",
        "availability.read",
        "employees.read",
      ]),
    );
    const reduced = toggleRolePermissions(edit, ["schedule.read"], false);
    expect(reduced).not.toEqual(expect.arrayContaining(["schedule.publish"]));
    expect(reduced).not.toContain("schedule.templates.manage");
    expect(reduced).toContain("availability.manage");
  });
  it("operational Edit does not grant access, private information or documents", () => {
    const grants = toggleRolePermissions(
      personalRolePermissions,
      ["employees.manage", "employees.archive", "employee_onboarding.review"],
      true,
    );
    for (const key of [
      "employee_access.manage",
      "employees.private.read",
      "employee_documents.read",
    ])
      expect(grants).not.toContain(key);
  });
  it("shows only employee experience controls for employee roles", () => {
    const groups = permissionGroupsForRole("employee", catalog);
    expect(groups.map((group) => group.label)).toEqual(["Personal access"]);
    expect(
      workspaceRoleInputSchema.safeParse({
        name: "Bad employee",
        access_class: "employee",
        description: "",
        permission_keys: [...personalRolePermissions, "employees.read"],
      }).success,
    ).toBe(false);
  });
  it("built-in Manager remains saveable without expanding out-of-scope time audit grants", () => {
    expect(
      workspaceRoleInputSchema.safeParse({
        name: "Manager",
        access_class: "manager",
        description: "",
        permission_keys: permissionsForRole("manager"),
      }).success,
    ).toBe(true);
  });
  it("copy edits do not mutate source grants", () => {
    const source = [...permissionsForRole("manager")];
    const copy = toggleRolePermissions(
      source,
      ["settings.general.manage"],
      true,
    );
    expect(copy).toContain("settings.general.read");
    expect(source).not.toContain("settings.general.manage");
  });
});
