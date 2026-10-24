import { createHmac } from "node:crypto";
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
    access: { employee: false, management: "owner" },
    status: "active",
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
    documentTypesService: service,
    organizationSettingsService: service,
    rolesService: service,
    signatureSettingsService: service,
    notificationSettingsService: service,
    onboardingApprovalService: service,
    workspaceAccountService: service,
    onboardingService: service,
    notificationsService: service,
    lineupService: service,
    avatarService: service,
    invitationService: service,
    timeOffRequestsService: service,
  };
  return buildApp(options);
}

const w = `/v1/workspaces/${workspaceId}`;
const requests: ReadonlyArray<readonly [string, "GET" | "DELETE", string]> = [
  ["communications", "GET", `${w}/communications/announcements`],
  ["employee hub", "GET", `${w}/employee-hub?from=2026-09-28&to=2026-10-04`],
  ["employee directory", "GET", `${w}/employees/${id}`],
  ["document types", "GET", `${w}/document-types/target-options`],
  ["jobs management", "GET", `${w}/organization/job-counts`],
  ["organization settings", "GET", `${w}/scheduling-settings`],
  ["roles", "DELETE", `${w}/roles/${id}`],
  ["signature settings", "GET", `${w}/signature-templates/target-options`],
  ["notification preferences", "GET", `${w}/notification-preferences`],
  ["notification settings", "GET", `${w}/settings/notifications`],
  ["onboarding approval", "GET", `${w}/settings/onboarding-approval`],
  ["notifications", "GET", `${w}/notifications`],
  ["workspace account", "GET", "/v1/account/workspaces"],
  ["employee onboarding", "GET", "/v1/me/onboarding"],
  ["employee onboarding phone", "GET", "/v1/me/onboarding/phone-in-use?phone=4155550100"],
  ["lineup", "GET", `${w}/my-lineups/2028-09-11`],
  ["lineup day", "GET", `${w}/lineups/2028-09-11`],
  ["own avatar", "GET", `${w}/me/avatar`],
  ["own avatar removal", "DELETE", `${w}/me/avatar`],
  ["last avatar", "GET", `${w}/me/last-avatar`],
  ["time off requests", "GET", `${w}/time-off-requests/mine`],
  ["time off to answer", "GET", `${w}/time-off-requests`],
  ["time off impact", "GET", `${w}/time-off-requests/98020000-0000-4000-8000-000000000001/impact`],
  ["time off shifts", "GET", `${w}/time-off-requests/my-shifts?start=2028-09-11&end=2028-09-12`],
  ["whom one may enter time off for", "GET", `${w}/time-off-requests/entries/people`],
  ["what entering time off would open", "GET", `${w}/time-off-requests/entries/impact?employee_id=${id}&start=2028-09-11&end=2028-09-12`],
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

// DAVET-ERISIM: the invitation access change carries a body, so it sits beside the table.
describe("invitation access route", () => {
  const send = (error: unknown) =>
    appFailingWith(error).inject({
      method: "PATCH",
      url: `${w}/employees/${id}/invitations`,
      headers: { authorization: "Bearer token" },
      payload: { access: { employee_role_id: null, management_role_id: null, managed_location_ids: [] } },
    });

  it("answers a non-member with 404 and authz.not_member", async () => {
    const response = await send(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" }));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member", requestId: expect.any(String) });
  });

  it("keeps the reason and detail of a 403", async () => {
    const response = await send(
      rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.rank", details: "employee.invite" }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "Not allowed", reason: "authz.rank", detail: "employee.invite" });
  });

  it("takes the status from the error, not from its wording", async () => {
    expect((await send(new HttpError("Access denied while not found", 409))).statusCode).toBe(409);
  });

  it("keeps an untyped failure's message off the screen", async () => {
    const response = await send(new Error("permission denied for table employee_invitations"));
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("employee_invitations");
  });
});

// S-251: marking read rows unread again carries a body too.
describe("notifications unread route", () => {
  const send = (error: unknown) =>
    appFailingWith(error).inject({
      method: "POST",
      url: `${w}/notifications/unread`,
      headers: { authorization: "Bearer token" },
      payload: { ids: [id] },
    });

  it("answers a non-member with 404 and authz.not_member", async () => {
    const response = await send(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" }));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member", requestId: expect.any(String) });
  });

  it("keeps the reason and detail of a 403", async () => {
    const response = await send(
      rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_active", details: "notifications.read_own" }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "Not allowed", reason: "authz.not_active", detail: "notifications.read_own" });
  });

  it("takes the status from the error, not from its wording", async () => {
    expect((await send(new HttpError("Access denied while not found", 409))).statusCode).toBe(409);
  });

  it("keeps an untyped failure's message off the screen", async () => {
    const response = await send(new Error("permission denied for table person_notifications"));
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("person_notifications");
  });
});

// BILDIRIM-14: the email channel's two doors with no signed-in person answer a failure the same way:
// a 500 with the request id, and nothing of what failed.
describe("notification email routes", () => {
  const hidden = new Error("permission denied for table notification_deliveries");
  const webhookBytes = Buffer.from("route-contract-webhook-secret-bytes");
  const app = () =>
    buildApp({
      notificationDispatch: {
        dispatcher: { run: () => Promise.reject(hidden), heartbeat: () => Promise.reject(hidden) },
        cronSecret: "s",
      },
      notificationEmail: {
        webhookSecret: `whsec_${webhookBytes.toString("base64")}`,
        events: { apply: () => Promise.reject(hidden) },
      },
    });

  it("the cron route keeps an untyped failure's message off the screen", async () => {
    const response = await app().inject({ method: "POST", url: "/internal/cron/notification-dispatch", headers: { authorization: "Bearer s" } });
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("notification_deliveries");
    expect(response.json()).toMatchObject({ requestId: expect.any(String) });
  });

  it("the webhook keeps an untyped failure's message off the screen", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_1", to: ["a@x.test"] } });
    const ts = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", webhookBytes).update(`m.${ts}.${body}`).digest("base64");
    const response = await app().inject({
      method: "POST",
      url: "/webhooks/resend",
      payload: body,
      headers: { "content-type": "application/json", "svix-id": "m", "svix-timestamp": String(ts), "svix-signature": `v1,${signature}` },
    });
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("notification_deliveries");
    expect(response.json()).toMatchObject({ requestId: expect.any(String) });
  });
});
