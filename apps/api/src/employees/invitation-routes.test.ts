import { HttpError, rpcFailure } from "../http-error.js";
import type { EmployeeInvitationService } from "./invitation-service.js";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";

/**
 * The invitation endpoints used to answer 409 with whatever sentence Postgres
 * raised, so a caller could not tell "not yours" from "gone" from "already in",
 * and the screen branched on English. These pin the status and the word.
 */
function serviceThrowing(error: unknown): EmployeeInvitationService {
  const fail = async (): Promise<never> => {
    throw error;
  };
  return {
    preview: fail,
    link: fail,
    prepare: fail,
    updateAccess: fail,
    retry: fail,
    revoke: fail,
    accept: fail,
    listPending: fail,
    acceptPending: fail,
    declinePending: fail,
  };
}

function appWith(service: EmployeeInvitationService) {
  // Sign-in is configured, and recognizes nobody.
  return buildApp({
    contextResolver: { resolve: async () => null },
    invitationService: service,
  });
}

const token = "a".repeat(64);

describe("invitation endpoints", () => {
  it("answers 401 when nobody is signed in", async () => {
    const response = await appWith(serviceThrowing(new Error("unused"))).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      payload: { token },
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 403 when the invitation belongs to a different address", async () => {
    const response = await appWith(
      serviceThrowing(
        new HttpError("invitation email does not match authenticated account", 403, {
          pgCode: "42501",
        }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("invitation_email_mismatch");
    // The server's own sentence never reaches the caller.
    expect(response.json().error).not.toContain("does not match");
  });

  it.each([
    ["POST", "/v1/invitations/accept", { token }],
    ["POST", "/v1/invitations/1131ca31-392f-4ea0-bdc2-e1235e1496b1/accept", undefined],
    ["POST", "/v1/invitations/1131ca31-392f-4ea0-bdc2-e1235e1496b1/decline", undefined],
  ] as const)(
    "answers 403 email_unconfirmed when the account has not confirmed its email (%s %s)",
    async (method, url, payload) => {
      // The RPC's own error, through the same helper the service uses: the
      // hint has to survive the trip to tell this apart from "not yours".
      const response = await appWith(
        serviceThrowing(
          rpcFailure({
            message: "the account email address is not confirmed",
            code: "42501",
            hint: "authz.not_active",
          }),
        ),
      ).inject({
        method,
        url,
        headers: { authorization: "Bearer employee-token" },
        ...(payload ? { payload } : {}),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Confirm your email address to answer this invitation",
        code: "email_unconfirmed",
      });
    },
  );

  it("still answers invitation_email_mismatch for a hint-less 42501 on decline", async () => {
    const response = await appWith(
      serviceThrowing(
        rpcFailure({ message: "invitation is for another account", code: "42501" }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/1131ca31-392f-4ea0-bdc2-e1235e1496b1/decline",
      headers: { authorization: "Bearer employee-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("invitation_email_mismatch");
  });

  it("answers 404 when no open invitation carries the token", async () => {
    const response = await appWith(
      serviceThrowing(
        new HttpError("active invitation not found", 404, { pgCode: "P0002" }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("invitation_not_found");
  });

  it("answers 409 when the account is already a member", async () => {
    const response = await appWith(
      serviceThrowing(
        new HttpError("workspace membership already exists", 409, {
          pgCode: "23505",
        }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("already_member");
  });

  // G11: a failure that is not the invitation's (a crash, an expired
  // session) used to come back as 409 "could not be answered".
  it.each(["/v1/invitations/accept", "/v1/invitations/pending"])(
    "answers a server failure on %s with 500 and nothing of it",
    async (url) => {
      const response = await appWith(
        serviceThrowing(new Error("connect ECONNREFUSED 10.0.0.4:5432")),
      ).inject({
        method: url.endsWith("pending") ? "GET" : "POST",
        url,
        headers: { authorization: "Bearer employee-token" },
        ...(url.endsWith("pending") ? {} : { payload: { token } }),
      });

      expect(response.statusCode).toBe(500);
      expect(response.payload).not.toContain("ECONNREFUSED");
    },
  );

  it("answers an expired session with 401, not 409", async () => {
    const response = await appWith(
      serviceThrowing(new HttpError("Valid authenticated account required", 401)),
    ).inject({
      method: "GET",
      url: "/v1/invitations/pending",
      headers: { authorization: "Bearer expired-token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 401 for an admin link request with no credentials", async () => {
    const response = await appWith(serviceThrowing(new Error("unused"))).inject({
      method: "GET",
      url: "/v1/workspaces/1131ca31-392f-4ea0-bdc2-e1235e1496b1/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations/link",
    });

    expect(response.statusCode).toBe(401);
  });

  it("never takes the token in the address, where request logs keep it (BL-279)", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => null,
    }).inject({ method: "GET", url: `/v1/invitations/preview?token=${token}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).not.toBe("invitation_not_found");
  });

  it("answers 404 for a token no invitation carries", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => null,
    }).inject({ method: "POST", url: "/v1/invitations/preview", payload: { token } });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("invitation_not_found");
  });

  // FB-6.2 .7b (BL-414): whether somebody may invite is the core's
  // (employee.invite, can_invite_with_role); the routes keep no permission of
  // their own. A manager with no employee_access.manage reaches the database,
  // and its "no" comes back with its reason.
  describe("workspace invitation routes ask the core", () => {
    const workspaceId = "1131ca31-392f-4ea0-bdc2-e1235e1496b1";
    const employeeId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
    const managerId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
    const manager: ActiveWorkspaceContext = {
      userId: managerId,
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
        userId: managerId,
        workspaceId,
        access: { employee: false, management: "manager" },
        status: "active",
      },
      permissions: ["workspace.read", "employees.read", "employees.manage"],
      actions: ["employee.invite"],
      onboarding: { status: "complete", currentStep: 4 },
      documentAccess: { restricted: false },
      locationScope: { allLocations: false, locationIds: [] },
    };
    const base = `/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations`;
    const access = {
      employee_role_id: "92000000-0000-4000-8000-000000000001",
      management_role_id: "92000000-0000-4000-8000-000000000002",
      managed_location_ids: ["92000000-0000-4000-8000-000000000003"],
    };
    const routes = [
      ["send", "prepare", "POST", base, { email: "pat@example.test", access }],
      ["access change", "updateAccess", "PATCH", base, { access }],
      ["retry", "retry", "POST", `${base}/retry`, undefined],
      ["revoke", "revoke", "DELETE", base, undefined],
      ["link", "link", "GET", `${base}/link`, undefined],
    ] as const;

    it.each(routes)("hands the %s to the database without the access permission", async (_name, method, verb, url, payload) => {
      const called = vi.fn(async () => ({ id: employeeId, expiresAt: "2026-10-07T00:00:00.000Z", url: "x" }));
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        invitationService: { ...serviceThrowing(new Error("unused")), [method]: called },
      });
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer manager-token" }, payload });
      expect(response.statusCode, response.body).toBeLessThan(300);
      expect(called).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: managerId, workspaceId, employeeId }));
      await app.close();
    });

    it.each(routes)("answers the core's rank refusal on the %s with 403 and its reason", async (_name, _method, verb, url, payload) => {
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        invitationService: serviceThrowing(
          rpcFailure({ code: "42501", message: "Not allowed", hint: "authz.rank", details: "employee.invite" }),
        ),
      });
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer manager-token" }, payload });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.rank", detail: "employee.invite" });
      await app.close();
    });

    it.each(routes)("answers somebody who is not a member on the %s with 404 authz.not_member", async (_name, _method, verb, url, payload) => {
      const app = appWith(serviceThrowing(new Error("unused")));
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer stranger-token" }, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      await app.close();
    });

    // DAVET-ERISIM: an open invitation's access changes with PATCH; the actor
    // comes from the token, never from the body.
    it("answers 204 on an access change and hands the service the token's actor and the body's access", async () => {
      const updateAccess = vi.fn(async () => undefined);
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        invitationService: { ...serviceThrowing(new Error("unused")), updateAccess },
      });
      const response = await app.inject({
        method: "PATCH",
        url: base,
        headers: { authorization: "Bearer manager-token" },
        payload: {
          access,
          actorUserId: "11111111-1111-4111-8111-111111111111",
          actor_user_id: "11111111-1111-4111-8111-111111111111",
        },
      });
      expect(response.statusCode, response.body).toBe(204);
      expect(updateAccess).toHaveBeenCalledWith({ actorUserId: managerId, workspaceId, employeeId, access });
      await app.close();
    });

    it("answers 404 authz.not_member on an access change before the service is asked", async () => {
      const updateAccess = vi.fn(async () => undefined);
      const app = buildApp({
        contextResolver: { resolve: async () => null },
        invitationService: { ...serviceThrowing(new Error("unused")), updateAccess },
      });
      const response = await app.inject({ method: "PATCH", url: base, headers: { authorization: "Bearer stranger-token" }, payload: { access } });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(updateAccess).not.toHaveBeenCalled();
      await app.close();
    });

    it.each([
      ["no body", undefined],
      ["no access", {}],
      ["a role that is not an id", { access: { ...access, employee_role_id: "owner" } }],
      ["locations that are not a list", { access: { ...access, managed_location_ids: "all" } }],
      ["locations that are not ids", { access: { ...access, managed_location_ids: ["nowhere"] } }],
      ["a missing management role", { access: { employee_role_id: null, managed_location_ids: [] } }],
    ] as const)("answers 400 on an access change with %s, and asks nobody", async (_name, payload) => {
      const updateAccess = vi.fn(async () => undefined);
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        invitationService: { ...serviceThrowing(new Error("unused")), updateAccess },
      });
      const response = await app.inject({ method: "PATCH", url: base, headers: { authorization: "Bearer manager-token" }, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "Valid invitation access required" });
      expect(updateAccess).not.toHaveBeenCalled();
      await app.close();
    });

    it("answers 400 on a send without its access", async () => {
      const prepare = vi.fn(async () => ({ id: employeeId, expiresAt: "2026-10-07T00:00:00.000Z" }));
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        invitationService: { ...serviceThrowing(new Error("unused")), prepare },
      });
      const response = await app.inject({ method: "POST", url: base, headers: { authorization: "Bearer manager-token" }, payload: { email: "pat@example.test" } });
      expect(response.statusCode).toBe(400);
      expect(prepare).not.toHaveBeenCalled();
      await app.close();
    });

    it("never hands the database's own sentence to the caller", async () => {
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        invitationService: serviceThrowing(new Error('duplicate key value violates unique constraint "employee_invitations_pkey"')),
      });
      const response = await app.inject({ method: "POST", url: base, headers: { authorization: "Bearer manager-token" }, payload: { email: "pat@example.test", access } });
      expect(response.statusCode).toBe(500);
      expect(response.payload).not.toContain("duplicate key");
      await app.close();
    });
  });

  it("answers 200 and names the state of an invitation that is not open", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => ({
        state: "revoked" as const,
        workspaceName: "Meyhouse",
        emailHint: "em***@example.test",
        expiresAt: "2026-08-24T12:00:00.000Z",
      }),
    }).inject({ method: "POST", url: "/v1/invitations/preview", payload: { token } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: "revoked",
      workspaceName: "Meyhouse",
      emailHint: "em***@example.test",
    });
  });
});
