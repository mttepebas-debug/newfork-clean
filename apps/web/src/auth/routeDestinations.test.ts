import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import {
  appLandingPath,
  organizationSwitcherPath,
  workspaceLandingPathForRole,
} from "./routeDestinations";

const baseContext: ActiveWorkspaceContext = {
  userId: "88888888-8888-4888-8888-888888888888",
  workspace: {
    id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "99999999-9999-4999-8999-999999999999",
    userId: "88888888-8888-4888-8888-888888888888",
    workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    role: "manager",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read", "schedule.read"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
};

describe("appLandingPath", () => {
  it("lands managers with workspace access on Workspace", () => {
    expect(appLandingPath(baseContext)).toBe("/app/workspace");
  });

  it("falls back to Schedule when workspace access is unavailable", () => {
    expect(
      appLandingPath({
        ...baseContext,
        permissions: ["schedule.read"],
      }),
    ).toBe("/app/schedule");
  });

  it("lands employees on Employee Hub", () => {
    expect(
      appLandingPath({
        ...baseContext,
        membership: { ...baseContext.membership, role: "employee" },
        permissions: ["time.read.own"],
      }),
    ).toBe("/app/employee-hub");
  });

  it("sends missing app access to the organization switcher without looping through /app", () => {
    expect(
      appLandingPath({
        ...baseContext,
        permissions: [],
      }),
    ).toBe(organizationSwitcherPath);
  });

  it("sends missing workspace context to the organization switcher", () => {
    expect(appLandingPath(null)).toBe(organizationSwitcherPath);
  });

  it("maps roles to their shell landing surfaces", () => {
    expect(workspaceLandingPathForRole("owner")).toBe("/app/workspace");
    expect(workspaceLandingPathForRole("admin")).toBe("/app/workspace");
    expect(workspaceLandingPathForRole("manager")).toBe("/app/workspace");
    expect(workspaceLandingPathForRole("employee")).toBe("/app/employee-hub");
  });
});
