import type { ActiveWorkspaceContext, AuthzAction } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { scheduleGates } from "./scheduleGates";

function contextWith(actions: AuthzAction[]): ActiveWorkspaceContext {
  const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
  return {
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspace: {
      id: workspaceId,
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspaceId,
      role: "manager",
      status: "active",
      allLocations: false,
    },
    // Every key the Schedule screen used to ask about: it must no longer matter.
    permissions: [
      "schedule.read",
      "schedule.manage",
      "schedule.publish",
      "schedule.export",
      "schedule.templates.manage",
      "workspace.manage",
      "settings.general.manage",
      "settings.locations.manage",
    ],
    actions,
    onboarding: { status: "complete", currentStep: 4 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: false, locationIds: [] },
  };
}

describe("scheduleGates", () => {
  it("opens each Schedule action only when the core lists it", () => {
    expect(
      scheduleGates(
        contextWith([
          "schedule.read",
          "schedule.edit",
          "schedule.publish",
          "schedule.export",
          "schedule.templates",
          "settings.organization.write",
          "settings.locations.write",
        ]),
      ),
    ).toEqual({
      edit: true,
      publish: true,
      export: true,
      templates: true,
      manageLogo: true,
      manageLocations: true,
    });
  });

  it("opens nothing on permission keys alone (a manager with no location has no actions)", () => {
    expect(scheduleGates(contextWith(["schedule.read"]))).toEqual({
      edit: false,
      publish: false,
      export: false,
      templates: false,
      manageLogo: false,
      manageLocations: false,
    });
    expect(scheduleGates(null).edit).toBe(false);
  });
});
