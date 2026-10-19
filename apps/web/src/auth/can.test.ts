import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { can } from "./can";

const K = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function context(overrides: Partial<ActiveWorkspaceContext> = {}): ActiveWorkspaceContext {
  const userId = "33333333-3333-4333-8333-333333333333";
  const workspaceId = "44444444-4444-4444-8444-444444444444";
  return {
    userId,
    workspace: { id: workspaceId, name: "Mey" } as ActiveWorkspaceContext["workspace"],
    membership: {
      id: "55555555-5555-4555-8555-555555555555",
      userId,
      workspaceId,
      access: { employee: false, management: "manager" },
      status: "active",
    },
    documentAccess: { restricted: false },
    permissions: ["schedule.read", "schedule.manage", "schedule.publish"],
    actions: ["schedule.edit", "schedule.publish", "schedule.read"],
    onboarding: { status: "complete", currentStep: 4 },
    locationScope: { allLocations: false, locationIds: [K] },
    ...overrides,
  };
}

describe("can", () => {
  it("says no without a context", () => {
    expect(can(null, "schedule.edit")).toBe(false);
    expect(can(undefined, "schedule.publish", { locations: [K] })).toBe(false);
  });

  it("answers an action anywhere in the workspace from the core's own list", () => {
    expect(can(context(), "schedule.edit")).toBe(true);
    expect(can(context(), "settings.locations.write")).toBe(false);
    // The list decides, not the permission keys.
    expect(can(context({ actions: [] }), "schedule.edit")).toBe(false);
  });

  it("answers for one location with the matrix rules", () => {
    expect(can(context(), "schedule.publish", { locations: [K] })).toBe(true);
    expect(can(context(), "schedule.publish", { locations: [B] })).toBe(false);
    // A blank location is never everywhere, not even for the owner.
    const owner = context({
      membership: { ...context().membership, access: { employee: false, management: "owner" } },
      locationScope: { allLocations: true, locationIds: [] },
    });
    expect(can(owner, "schedule.publish", { locations: [B] })).toBe(true);
    expect(can(owner, "schedule.publish", { locations: [] })).toBe(false);
  });

  it("gives a manager marked all-locations no reach beyond the list", () => {
    const wide = context({ locationScope: { allLocations: true, locationIds: [] } });
    expect(can(wide, "schedule.publish", { locations: [K] })).toBe(false);
  });

  it("holds back somebody with a required document missing", () => {
    const blocked = context({ documentAccess: { restricted: true } });
    expect(can(blocked, "schedule.publish", { locations: [K] })).toBe(false);
  });

  it("says no to a person action asked without its person", () => {
    const admin = context({
      membership: { ...context().membership, access: { employee: false, management: "admin" } },
      permissions: ["employees.manage"],
    });
    // @ts-expect-error a person action must name its person
    expect(can(admin, "employee.save", { locations: [K] })).toBe(false);
    expect(
      can(admin, "employee.save", { locations: [K], person: { role: "employee", isSelf: false } }),
    ).toBe(true);
  });

  it("refuses a permission the role lacks", () => {
    const lead = context({ permissions: ["schedule.read", "schedule.manage"] });
    expect(can(lead, "schedule.publish", { locations: [K] })).toBe(false);
  });
});
