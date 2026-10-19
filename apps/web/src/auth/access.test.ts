import { accessRank } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { hasEmployeeAccess, hasManagementAccess, membershipClass } from "./access";

// ROL-CIFT 1.5: a membership's two accesses. The screens behave as before: a
// management access opens the management interface, the employee access the
// employee one.
describe("membership access", () => {
  const managerOnly = { access: { employee: false, management: "manager" as const } };
  const employeeOnly = { access: { employee: true, management: null } };
  const both = { access: { employee: true, management: "admin" as const } };

  it("tells the employee access from a management access", () => {
    expect(hasEmployeeAccess(managerOnly)).toBe(false);
    expect(hasManagementAccess(managerOnly)).toBe(true);
    expect(hasEmployeeAccess(employeeOnly)).toBe(true);
    expect(hasManagementAccess(employeeOnly)).toBe(false);
    expect(hasEmployeeAccess(both)).toBe(true);
    expect(hasManagementAccess(both)).toBe(true);
  });

  it("shows the management class, else employee, and ranks the same way", () => {
    expect(membershipClass(employeeOnly)).toBe("employee");
    expect(membershipClass(both)).toBe("admin");
    expect(accessRank({ employee: true, management: null })).toBe(1);
  });
});
