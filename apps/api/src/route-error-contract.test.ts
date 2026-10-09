import { authzActionKeys, permissionSchema, type ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { buildApp, type BuildAppOptions } from "./app";
import { HttpError, rpcFailure } from "./http-error";

// BL-134, BL-223: a route answers a service's refusal the way the global
// error handler does, whichever module it lives in: the status the database
// chose, the machine key beside it, and the request id. No module decides the
// status from the wording of the message.
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const id = "98020000-0000-4000-8000-000000000001";

const owner = {
  userId,
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
    userId,
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [...permissionSchema.options],
  actions: [...authzActionKeys],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

/** A service whose every method, however deep, fails with `error`. */
function failing(error: unknown): never {
  const fail: object = new Proxy(() => undefined, {
    get: (_target, key) => (key === "then" ? undefined : fail),
    apply: () => Promise.reject(error),
  });
  return fail as never;
}

function appFailingWith(error: unknown) {
  const service = failing(error);
  const options: BuildAppOptions = {
    contextResolver: { resolve: async () => owner },
    communicationService: service,
    employeeHubService: service,
    employeeDirectoryService: service,
    notificationSettingsService: service,
    scheduleRequestsService: service,
    documentTypesService: service,
    organizationSettingsService: service,
    rolesService: service,
    signatureSettingsService: service,
    workspaceAccountService: service,
    onboardingService: service,
  };
  return buildApp(options);
}

const w = `/v1/workspaces/${workspaceId}`;
const requests: ReadonlyArray<readonly [string, "GET" | "DELETE", string]> = [
  ["communications", "GET", `${w}/communications/announcements`],
  ["employee hub", "GET", `${w}/employee-hub?from=2026-09-28&to=2026-10-04`],
  ["employee directory", "GET", `${w}/employees/${id}`],
  ["notification settings", "GET", `${w}/notification-settings`],
  ["schedule requests", "GET", `${w}/schedule/requests`],
  ["document types", "GET", `${w}/document-types/target-options`],
  ["jobs management", "GET", `${w}/organization/job-counts`],
  ["organization settings", "GET", `${w}/scheduling-settings`],
  ["roles", "DELETE", `${w}/roles/${id}`],
  ["signature settings", "GET", `${w}/signature-templates/target-options`],
  ["workspace account", "GET", "/v1/account/workspaces"],
  ["employee onboarding", "GET", "/v1/me/onboarding"],
];

describe.each(requests)("%s route", (_name, method, url) => {
  const send = (error: unknown) =>
    appFailingWith(error).inject({ method, url, headers: { authorization: "Bearer token" } });

  it("answers a non-member with 404 and authz.not_member", async () => {
    const response = await send(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" }));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member", requestId: expect.any(String) });
  });

  it("keeps the reason and detail of a 403", async () => {
    const response = await send(
      rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.out_of_scope", details: "schedule.read" }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "Not allowed", reason: "authz.out_of_scope", detail: "schedule.read" });
  });

  it("takes the status from the error, not from its wording", async () => {
    const response = await send(new HttpError("Access denied while not found", 409));
    expect(response.statusCode).toBe(409);
  });

  it("keeps an untyped failure's message off the screen", async () => {
    const response = await send(new Error("permission denied for table employees"));
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("employees");
  });
});
