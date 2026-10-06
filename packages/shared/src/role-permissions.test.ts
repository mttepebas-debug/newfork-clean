import { describe, expect, it } from "vitest";
import {
  permissionGroupsForRole,
  personalRolePermissions,
  toggleRolePermissions,
} from "./role-permissions";
import { permissionsForRole, workspaceRoleInputSchema } from "./index";
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
    const groups = permissionGroupsForRole("employee");
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
